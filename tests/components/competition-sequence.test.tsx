import { act, renderHook } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { useCompetitionSequence } from "../../src/hooks/useCompetitionSequence";
import { useMotionPreference } from "../../src/hooks/useReducedMotion";
import { championSequence, getDrawSequence } from "../../src/theme/motion";

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test.each([4, 8, 16] as const)(
  "%i: fases finitas e uma conclusão, mesmo com skip/cancel depois",
  async (capacity) => {
    const onComplete = jest.fn();
    const ui = await renderHook(() =>
      useCompetitionSequence({
        runKey: "draw",
        steps: getDrawSequence(capacity),
        reduced: false,
        onComplete,
      }),
    );
    expect(ui.result.current.phase).toBe("preparing");
    await act(() => jest.advanceTimersByTime(650));
    expect(ui.result.current.phase).toBe("shuffling");
    await act(() => jest.advanceTimersByTime(750));
    expect(ui.result.current.phase).toBe("revealing");
    await act(() => jest.advanceTimersByTime(4000));
    expect(ui.result.current.phase).toBe("completed");
    await act(() => {
      ui.result.current.skip();
      ui.result.current.cancel();
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith("completed");
  },
);

test("skip concorrente com cancel encerra uma vez e rerender não reinicia", async () => {
  const onComplete = jest.fn();
  const ui = await renderHook(
    ({ callback }: { callback: typeof onComplete }) =>
      useCompetitionSequence({
        runKey: "cup",
        steps: championSequence,
        reduced: false,
        onComplete: callback,
      }),
    { initialProps: { callback: onComplete } },
  );
  await act(() => {
    ui.result.current.skip();
    ui.result.current.cancel();
    ui.result.current.skip();
  });
  await ui.rerender({ callback: jest.fn() });
  await act(() => jest.advanceTimersByTime(10000));
  expect(ui.result.current.phase).toBe("skipped");
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test("preferência precisa resolver; redução durante a sequência conclui sem replay", async () => {
  const done = jest.fn();
  const ui = await renderHook(
    ({ ready, reduced }: { ready: boolean; reduced: boolean }) =>
      useCompetitionSequence({
        runKey: "cup",
        steps: championSequence,
        ready,
        reduced,
        onComplete: done,
      }),
    { initialProps: { ready: false, reduced: true } },
  );
  await act(() => jest.advanceTimersByTime(10000));
  expect(done).not.toHaveBeenCalled();
  expect(ui.result.current.phase).toBe("idle");
  await ui.rerender({ ready: true, reduced: false });
  expect(ui.result.current.phase).toBe("preparing");
  await ui.rerender({ ready: true, reduced: true });
  await act(() => jest.advanceTimersByTime(0));
  expect(ui.result.current.phase).toBe("completed");
  await ui.rerender({ ready: true, reduced: false });
  expect(done).toHaveBeenCalledTimes(1);
});

test("desmontar limpa o timer sem chamar conclusão; nova chave aceita resultado corrigido", async () => {
  const done = jest.fn();
  const schedule = jest.spyOn(globalThis, "setTimeout"),
    clear = jest.spyOn(globalThis, "clearTimeout");
  const ui = await renderHook(
    ({ key }: { key: string }) =>
      useCompetitionSequence({
        runKey: key,
        steps: championSequence,
        reduced: false,
        onComplete: done,
      }),
    { initialProps: { key: "old" } },
  );
  await act(() => ui.result.current.cancel());
  expect(done).toHaveBeenLastCalledWith("cancelled");
  await ui.rerender({ key: "corrected" });
  expect(ui.result.current.phase).toBe("preparing");
  const scheduledIndex = schedule.mock.calls.findLastIndex(
    (call) => call[1] === 600,
  );
  const scheduledTimer = schedule.mock.results[scheduledIndex].value;
  await ui.unmount();
  expect(clear).toHaveBeenCalledWith(scheduledTimer);
  await act(() => jest.advanceTimersByTime(10000));
  expect(done).toHaveBeenCalledTimes(1);
});

test("evento de acessibilidade recente prevalece sobre leitura inicial atrasada e listener é removido", async () => {
  let resolve!: (reduced: boolean) => void;
  let changed!: (reduced: boolean) => void;
  const remove = jest.fn();
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation((_event, callback) => {
      changed = callback as (reduced: boolean) => void;
      return { remove };
    });
  const ui = await renderHook(useMotionPreference);
  expect(ui.result.current).toEqual({ ready: false, reduced: true });
  await act(() => changed(true));
  await act(() => resolve(false));
  expect(ui.result.current).toEqual({ ready: true, reduced: true });
  await ui.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});

test("callback já enfileirado de uma chave anterior não avança a nova sequência", async () => {
  const done = jest.fn(),
    schedule = jest.spyOn(globalThis, "setTimeout");
  const ui = await renderHook(
    ({ key }: { key: string }) =>
      useCompetitionSequence({
        runKey: key,
        steps: championSequence,
        reduced: false,
        onComplete: done,
      }),
    { initialProps: { key: "old" } },
  );
  const pending = schedule.mock.calls.findLast(
    (call) => call[1] === 600,
  )![0] as () => void;
  await ui.rerender({ key: "new" });
  await act(() => pending());
  expect(ui.result.current.phase).toBe("preparing");
  expect(done).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(600));
  expect(ui.result.current.phase).toBe("revealing");
});
