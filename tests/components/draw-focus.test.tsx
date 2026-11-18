import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import * as ExpoRouter from "expo-router";
import { LobbyScreen } from "../../src/screens/LobbyScreen";
import { useAppStore } from "../../src/store/useAppStore";
import { tournamentFixture } from "../fixtures/tournaments";

jest.mock("expo-router", () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
    navigate: jest.fn(),
    dismissTo: jest.fn(),
  },
  useLocalSearchParams: jest.fn(),
  useFocusEffect: jest.fn(),
}));
jest.mock("../../src/hooks/useReducedMotion", () => ({
  useMotionPreference: () => ({ ready: true, reduced: false }),
  useReducedMotion: () => false,
}));

let blur: () => void = () => {};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  blur = () => {};
  jest.mocked(ExpoRouter.useFocusEffect).mockImplementation((callback) => {
    React.useEffect(() => {
      const cleanup = callback();
      blur = typeof cleanup === "function" ? cleanup : () => {};
      return cleanup;
    }, [callback]);
  });
  const tournament = tournamentFixture("draft", "focus-cup");
  useAppStore.setState({
    tournaments: [tournament],
    profile: { id: "me", nickname: "Pedro" },
    hydrated: true,
    storageError: null,
  });
  useAppStore.getState().fillExamples(tournament.id);
  jest
    .mocked(ExpoRouter.useLocalSearchParams)
    .mockReturnValue({ id: tournament.id });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("sair da sala sem desmontá-la encerra o sorteio visual sem redirecionar ou alterar a ordem salva", async () => {
  const ui = await render(<LobbyScreen />);
  await fireEvent.press(ui.getByRole("button", { name: "Sortear confrontos" }));
  const saved = useAppStore.getState().tournaments[0];
  const modal = ui.container.queryAll(
    (node) => node.type === "Modal" && node.props.visible,
  )[0];
  expect(modal).toBeTruthy();
  // Capture an already-enqueued native close callback as well as the timer.
  const close = modal.props.onRequestClose;
  await act(() => blur());
  expect(
    ui.container.queryAll(
      (node) => node.type === "Modal" && node.props.visible,
    ),
  ).toHaveLength(0);
  await act(() => {
    close();
    jest.advanceTimersByTime(10000);
  });
  expect(ExpoRouter.router.replace).not.toHaveBeenCalled();
  expect(useAppStore.getState().tournaments[0]).toEqual(saved);
  expect(saved.drawOrder).toHaveLength(4);
  expect(saved.status).toBe("active");
  // The screen itself remains mounted, just as it can in the Router stack.
  expect(ui.getByText("A galera da disputa")).toBeTruthy();
});
