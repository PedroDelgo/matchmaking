import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { cancelAnimation } from "react-native-reanimated";
import { ChampionScreen } from "../../src/screens/ChampionScreen";
import { LobbyScreen } from "../../src/screens/LobbyScreen";
import { useReducedMotion } from "../../src/hooks/useReducedMotion";
import { useAppStore } from "../../src/store/useAppStore";
import { shareText } from "../../src/utils/share";
import { tournamentFixture } from "../fixtures/tournaments";

jest.mock("../../src/hooks/useReducedMotion", () => {
  const useReducedMotion = jest.fn(() => true);
  return {
    useReducedMotion,
    useMotionPreference: () => ({ ready: true, reduced: useReducedMotion() }),
  };
});
jest.mock("../../src/utils/share", () => ({ shareText: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useReducedMotion).mockReturnValue(true);
  useAppStore.setState({
    tournaments: [],
    profile: { id: "me", nickname: "Pedro" },
    hydrated: true,
    storageError: null,
  });
});

afterEach(() => jest.useRealTimers());

test("compartilhamento bloqueia acionamentos simultâneos e limpa o fallback na tentativa seguinte", async () => {
  const t = tournamentFixture("completed");
  useAppStore.setState({ tournaments: [t] });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: t.id });
  let complete!: (value: "shared") => void;
  jest
    .mocked(shareText)
    .mockImplementationOnce(
      () => new Promise((resolve) => (complete = resolve)),
    );
  const ui = await render(<ChampionScreen />);
  const press = ui.getByRole("button", { name: "Compartilhar conquista" }).props
    .onClick;
  // Both calls reach the same handler before React can disable the surface.
  await act(() => {
    void press();
    void press();
  });
  expect(shareText).toHaveBeenCalledTimes(1);
  expect(
    ui.getByRole("button", { name: "Compartilhar conquista" }),
  ).toBeDisabled();
  await act(() => complete("shared"));
  expect(ui.getByText("Compartilhamento aberto.")).toBeTruthy();

  jest.mocked(shareText).mockRejectedValueOnce(new Error("unsupported"));
  await fireEvent.press(
    ui.getByRole("button", { name: "Compartilhar conquista" }),
  );
  expect(
    ui.getByText("Selecione o texto abaixo para copiar e compartilhar."),
  ).toBeTruthy();
  expect(ui.getByText(/venceu .* no Matchmaking!/)).toBeTruthy();

  jest.mocked(shareText).mockResolvedValueOnce("copied");
  await fireEvent.press(
    ui.getByRole("button", { name: "Compartilhar conquista" }),
  );
  expect(ui.queryByText(/venceu .* no Matchmaking!/)).toBeNull();
  expect(
    ui.getByText("Texto copiado. Cole onde quiser compartilhar."),
  ).toBeTruthy();
});

test("celebração termina e cancela partículas, enquanto movimento reduzido mantém o campeão sem confetes", async () => {
  jest.useFakeTimers();
  const t = tournamentFixture("completed");
  useAppStore.setState({ tournaments: [t] });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: t.id });
  jest.mocked(useReducedMotion).mockReturnValue(false);
  const ui = await render(<ChampionScreen />);
  expect(
    ui.getByTestId("champion-confetti", { includeHiddenElements: true }),
  ).toBeTruthy();
  await act(() => jest.advanceTimersByTime(5000));
  expect(
    ui.queryByTestId("champion-confetti", { includeHiddenElements: true }),
  ).toBeNull();
  // All 24 particles cancel both values; trophy/reveal also cancel their own.
  expect(jest.mocked(cancelAnimation).mock.calls.length).toBeGreaterThanOrEqual(
    48,
  );
  expect(ui.getByText("Campeão!")).toBeTruthy();

  jest.mocked(useReducedMotion).mockReturnValue(true);
  await ui.rerender(<ChampionScreen />);
  expect(
    ui.queryByTestId("champion-confetti", { includeHiddenElements: true }),
  ).toBeNull();
  expect(
    ui.getByRole("button", { name: "Ver todos os resultados" }),
  ).toBeEnabled();
});

test("voltar do sorteio preserva a ordem e navega uma única vez mesmo com o timeout pendente", async () => {
  jest.useFakeTimers();
  const t = tournamentFixture("draft");
  useAppStore.setState({ tournaments: [t] });
  useAppStore.getState().fillExamples(t.id);
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: t.id });
  jest.mocked(useReducedMotion).mockReturnValue(false);
  const ui = await render(<LobbyScreen />);
  await fireEvent.press(ui.getByRole("button", { name: "Sortear confrontos" }));
  const order = [...useAppStore.getState().tournaments[0].drawOrder];
  const modal = ui.container.queryAll(
    (node) => node.type === "Modal" && node.props.visible,
  )[0];
  expect(modal).toBeTruthy();
  await act(() => {
    modal.props.onRequestClose();
    modal.props.onRequestClose();
  });
  await act(() => jest.advanceTimersByTime(5000));
  expect(router.replace).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith(`/tournament/${t.id}/bracket`);
  expect(useAppStore.getState().tournaments[0].drawOrder).toEqual(order);
});

test("sair da sala durante a revelação cancela a navegação temporizada", async () => {
  jest.useFakeTimers();
  const t = tournamentFixture("draft");
  useAppStore.setState({ tournaments: [t] });
  useAppStore.getState().fillExamples(t.id);
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: t.id });
  jest.mocked(useReducedMotion).mockReturnValue(false);
  const ui = await render(<LobbyScreen />);
  await fireEvent.press(ui.getByRole("button", { name: "Sortear confrontos" }));
  await ui.unmount();
  await act(() => jest.advanceTimersByTime(5000));
  expect(router.replace).not.toHaveBeenCalled();
  expect(useAppStore.getState().tournaments[0].status).toBe("active");
});
