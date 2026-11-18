import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { cancelAnimation } from "react-native-reanimated";
import { ChampionScreen } from "../../src/screens/ChampionScreen";
import { useMotionPreference } from "../../src/hooks/useReducedMotion";
import { useAppStore } from "../../src/store/useAppStore";
import { recordResult } from "../../src/features/tournaments/engine/tournament";
import { tournamentFixture } from "../fixtures/tournaments";

jest.mock("../../src/hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
  useMotionPreference: jest.fn(() => ({ ready: true, reduced: false })),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest
    .mocked(useMotionPreference)
    .mockReturnValue({ ready: true, reduced: false });
  useAppStore.setState({
    tournaments: [tournamentFixture("completed")],
    profile: { id: "me", nickname: "Pedro" },
    hydrated: true,
    storageError: null,
  });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: "completed" });
});

afterEach(() => jest.useRealTimers());

test("vitória revela campeão, troféu e final reais em uma sequência finita sem decidir resultados", async () => {
  const initial = useAppStore.getState().tournaments[0];
  const ui = await render(<ChampionScreen />);
  expect(ui.getByText("Resultado confirmado.")).toBeTruthy();
  expect(ui.queryByText("Campeão!")).toBeNull();
  expect(
    ui.getByRole("button", { name: "Compartilhar conquista" }),
  ).toBeEnabled();
  expect(
    ui.getByTestId("champion-confetti", { includeHiddenElements: true }),
  ).toBeTruthy();

  await act(() => jest.advanceTimersByTime(600));
  expect(ui.getByText("Campeão!")).toBeTruthy();
  expect(ui.getAllByText("Ana").length).toBeGreaterThan(0);
  expect(ui.getByText("3 × 1")).toBeTruthy();
  expect(
    ui.queryByTestId("champion-trophy", { includeHiddenElements: true }),
  ).toBeNull();
  await act(() => jest.advanceTimersByTime(600));
  expect(
    ui.getByTestId("champion-trophy", { includeHiddenElements: true }),
  ).toBeTruthy();
  await act(() => jest.advanceTimersByTime(3600));
  expect(
    ui.queryByTestId("champion-confetti", { includeHiddenElements: true }),
  ).toBeNull();
  expect(ui.queryByRole("button", { name: "Pular celebração" })).toBeNull();
  expect(useAppStore.getState().tournaments[0]).toEqual(initial);
});

test("pular encerra partículas e revela tudo imediatamente; rerender não repete a celebração", async () => {
  const ui = await render(<ChampionScreen />);
  await fireEvent.press(ui.getByRole("button", { name: "Pular celebração" }));
  expect(ui.getByText("Campeão!")).toBeTruthy();
  expect(ui.getByText("3 × 1")).toBeTruthy();
  expect(
    ui.queryByTestId("champion-confetti", { includeHiddenElements: true }),
  ).toBeNull();
  expect(jest.mocked(cancelAnimation).mock.calls.length).toBeGreaterThanOrEqual(
    48,
  );
  await ui.rerender(<ChampionScreen />);
  await act(() => jest.advanceTimersByTime(10000));
  expect(ui.queryByRole("button", { name: "Pular celebração" })).toBeNull();
  expect(ui.getByText("Campeão!")).toBeTruthy();
});

test("resultado corrigido substitui campeão e placar sem reaproveitar a revelação antiga", async () => {
  const ui = await render(<ChampionScreen />);
  await fireEvent.press(ui.getByRole("button", { name: "Pular celebração" }));
  const cup = useAppStore.getState().tournaments[0];
  const final = cup.matches.find((match) => match.nextMatchId === null)!;
  const corrected = recordResult(cup, final.id, 1, 5);
  await act(() => useAppStore.setState({ tournaments: [corrected] }));
  expect(ui.getByRole("button", { name: "Pular celebração" })).toBeTruthy();
  expect(ui.queryByText("3 × 1")).toBeNull();
  await fireEvent.press(ui.getByRole("button", { name: "Pular celebração" }));
  expect(ui.getByText("1 × 5")).toBeTruthy();
  const winner = corrected.participants.find(
    (participant) => participant.id === corrected.championId,
  )!;
  expect(ui.getAllByText(winner.displayName).length).toBeGreaterThanOrEqual(2);
  expect(useAppStore.getState().tournaments[0]).toEqual(corrected);
});

test("preferência reduzida exibe resultado e ações imediatamente sem partículas; desempate usa campeão real", async () => {
  jest
    .mocked(useMotionPreference)
    .mockReturnValue({ ready: true, reduced: true });
  const cup = useAppStore.getState().tournaments[0];
  const final = cup.matches.find((match) => match.nextMatchId === null)!;
  const tied = recordResult(cup, final.id, 3, 3, final.participant2Id!);
  useAppStore.setState({ tournaments: [tied] });
  const ui = await render(<ChampionScreen />);
  const winner = tied.participants.find(
    (participant) => participant.id === tied.championId,
  )!;
  expect(
    ui.getByText(`Desempate vencido por ${winner.displayName}.`),
  ).toBeTruthy();
  expect(ui.getByText("3 × 3")).toBeTruthy();
  expect(
    ui.queryByTestId("champion-confetti", { includeHiddenElements: true }),
  ).toBeNull();
  expect(ui.queryByRole("button", { name: "Pular celebração" })).toBeNull();
  await fireEvent.press(
    ui.getByRole("button", { name: "Ver todos os resultados" }),
  );
  expect(router.dismissTo).toHaveBeenCalledWith(
    "/tournament/completed/bracket",
  );
});

test("espera a preferência e cancela timers/animações ao desmontar sem modificar a final", async () => {
  const schedule = jest.spyOn(globalThis, "setTimeout"),
    clear = jest.spyOn(globalThis, "clearTimeout");
  jest
    .mocked(useMotionPreference)
    .mockReturnValue({ ready: false, reduced: true });
  const initial = useAppStore.getState().tournaments[0];
  const ui = await render(<ChampionScreen />);
  expect(
    ui.queryByTestId("champion-confetti", { includeHiddenElements: true }),
  ).toBeNull();
  expect(
    ui.getByRole("button", { name: "Ver todos os resultados" }),
  ).toBeEnabled();
  await act(() => jest.advanceTimersByTime(5000));
  jest
    .mocked(useMotionPreference)
    .mockReturnValue({ ready: true, reduced: false });
  await ui.rerender(<ChampionScreen />);
  expect(ui.getByRole("button", { name: "Pular celebração" })).toBeTruthy();
  const scheduledPhase = schedule.mock.calls.findLastIndex(
    (call) => call[1] === 600,
  );
  const phaseTimer = schedule.mock.results[scheduledPhase].value;
  await ui.unmount();
  expect(clear).toHaveBeenCalledWith(phaseTimer);
  await act(() => jest.advanceTimersByTime(10000));
  expect(jest.mocked(cancelAnimation).mock.calls.length).toBeGreaterThanOrEqual(
    48,
  );
  expect(useAppStore.getState().tournaments[0]).toEqual(initial);
  schedule.mockRestore();
  clear.mockRestore();
});
