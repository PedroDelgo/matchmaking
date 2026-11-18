import React from "react";
import { act, fireEvent, render, within } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { MatchReveal } from "../../src/components/MatchReveal";
import { LobbyScreen } from "../../src/screens/LobbyScreen";
import { useMotionPreference } from "../../src/hooks/useReducedMotion";
import { useAppStore } from "../../src/store/useAppStore";
import {
  addParticipant,
  createTournament,
  startTournament,
} from "../../src/features/tournaments/engine/tournament";
import type { TournamentCapacity } from "../../src/features/tournaments/domain/types";
import { getDrawSequence, motion } from "../../src/theme/motion";

jest.mock("../../src/hooks/useReducedMotion", () => ({
  useMotionPreference: jest.fn(() => ({ ready: true, reduced: false })),
  useReducedMotion: jest.fn(() => false),
}));

const realStart = useAppStore.getState().start;
function fullRoom(capacity: TournamentCapacity) {
  let t = createTournament(
    { name: `Copa ${capacity}`, modality: "Futebol", capacity },
    `draw-${capacity}`,
  );
  for (let index = 0; index < capacity; index++)
    t = addParticipant(t, `Jogador ${index + 1}`);
  return t;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest
    .mocked(useMotionPreference)
    .mockReturnValue({ ready: true, reduced: false });
  useAppStore.setState({
    tournaments: [],
    profile: { id: "me", nickname: "Pedro" },
    hydrated: true,
    storageError: null,
    start: realStart,
  });
});
afterEach(() => {
  useAppStore.setState({ start: realStart });
  jest.useRealTimers();
});

test.each([4, 8, 16] as const)(
  "sorteio de %i executa uma vez e pular preserva os confrontos já persistidos",
  async (capacity) => {
    const tournament = fullRoom(capacity);
    const start = jest.fn(realStart);
    useAppStore.setState({ tournaments: [tournament], start });
    jest.mocked(useLocalSearchParams).mockReturnValue({ id: tournament.id });
    const ui = await render(<LobbyScreen />);
    const press = ui.getByRole("button", { name: "Sortear confrontos" }).props
      .onClick;
    await act(() => {
      press();
      press();
    });
    const saved = useAppStore.getState().tournaments[0];
    const order = [...saved.drawOrder];
    const matches = saved.matches.map((match) => ({ ...match }));
    expect(start).toHaveBeenCalledTimes(1);
    expect(new Set(order).size).toBe(capacity);
    await fireEvent.press(ui.getByRole("button", { name: "Pular animação" }));
    await act(() => jest.advanceTimersByTime(10000));
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(
      `/tournament/${tournament.id}/bracket`,
    );
    expect(useAppStore.getState().tournaments[0].drawOrder).toEqual(order);
    expect(useAppStore.getState().tournaments[0].matches).toEqual(matches);
  },
);

test("as fases apresentam os pares reais e encerrar, pular e voltar competem por uma única conclusão", async () => {
  const tournament = startTournament(fullRoom(8), () => 0.999);
  const complete = jest.fn();
  const ui = await render(
    <MatchReveal
      tournament={tournament}
      reduced={false}
      onComplete={complete}
    />,
  );
  expect(ui.getByText("OS CONFRONTOS ESTÃO CHEGANDO")).toBeTruthy();
  expect(ui.queryByTestId("match-reveal-pairs")).toBeNull();
  await act(() => jest.advanceTimersByTime(motion.draw.preparing));
  expect(ui.getByText("TODO MUNDO NO JOGO.")).toBeTruthy();
  await act(() => jest.advanceTimersByTime(motion.draw.shuffling));
  const pair = within(ui.getByTestId("revealed-match-0"));
  const firstMatch = tournament.matches[0];
  expect(
    pair.getByText(
      tournament.participants.find((p) => p.id === firstMatch.participant1Id)!
        .displayName,
    ),
  ).toBeTruthy();
  expect(
    pair.getByText(
      tournament.participants.find((p) => p.id === firstMatch.participant2Id)!
        .displayName,
    ),
  ).toBeTruthy();
  const modal = ui.container.queryAll(
    (node) => node.type === "Modal" && node.props.visible,
  )[0];
  const skip = ui.getByRole("button", { name: "Pular animação" }).props.onClick;
  await act(() => {
    skip();
    modal.props.onRequestClose();
    skip();
  });
  await act(() => jest.advanceTimersByTime(10000));
  expect(complete).toHaveBeenCalledTimes(1);
});

test("a sequência termina automaticamente, e rerenderização não a reinicia", async () => {
  const tournament = startTournament(fullRoom(16), () => 0.999);
  const complete = jest.fn();
  const ui = await render(
    <MatchReveal
      tournament={tournament}
      reduced={false}
      onComplete={complete}
    />,
  );
  await act(() => jest.advanceTimersByTime(motion.draw.preparing));
  await ui.rerender(
    <MatchReveal
      tournament={{ ...tournament }}
      reduced={false}
      onComplete={complete}
    />,
  );
  expect(ui.getByText("TODO MUNDO NO JOGO.")).toBeTruthy();
  await act(() => jest.advanceTimersByTime(motion.draw.shuffling));
  expect(ui.getAllByTestId(/^revealed-match-/)).toHaveLength(8);
  for (const step of getDrawSequence(16).slice(2)) {
    await act(() => jest.advanceTimersByTime(step.duration));
    if (step.phase === "revealing") {
      expect(ui.getAllByTestId(/^revealed-match-/)).toHaveLength(8);
      expect(ui.getByRole("button", { name: "Ver chaveamento" })).toBeEnabled();
    }
  }
  expect(complete).toHaveBeenCalledTimes(1);
  await ui.rerender(
    <MatchReveal
      tournament={tournament}
      reduced={false}
      onComplete={complete}
    />,
  );
  await act(() => jest.advanceTimersByTime(10000));
  expect(complete).toHaveBeenCalledTimes(1);
});

test("desmontar durante o embaralhamento limpa a sequência sem navegar nem sortear novamente", async () => {
  const tournament = fullRoom(4);
  const start = jest.fn(realStart);
  useAppStore.setState({ tournaments: [tournament], start });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: tournament.id });
  const ui = await render(<LobbyScreen />);
  await fireEvent.press(ui.getByRole("button", { name: "Sortear confrontos" }));
  await act(() => jest.advanceTimersByTime(motion.draw.preparing));
  const order = [...useAppStore.getState().tournaments[0].drawOrder];
  await ui.unmount();
  await act(() => jest.advanceTimersByTime(10000));
  expect(router.replace).not.toHaveBeenCalled();
  expect(start).toHaveBeenCalledTimes(1);
  expect(useAppStore.getState().tournaments[0].drawOrder).toEqual(order);
});

test("movimento reduzido preserva o resultado e evita o modal mesmo sob acionamento duplicado", async () => {
  jest
    .mocked(useMotionPreference)
    .mockReturnValue({ ready: true, reduced: true });
  const tournament = fullRoom(4);
  const start = jest.fn(realStart);
  useAppStore.setState({ tournaments: [tournament], start });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: tournament.id });
  const ui = await render(<LobbyScreen />);
  const press = ui.getByRole("button", { name: "Sortear confrontos" }).props
    .onClick;
  await act(() => {
    press();
    press();
  });
  expect(start).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledTimes(1);
  expect(ui.queryByTestId("match-reveal")).toBeNull();
  expect(useAppStore.getState().tournaments[0].drawOrder).toHaveLength(4);
});

test("a leitura inicial da preferência aguarda resolução sem pular uma apresentação com movimento permitido", async () => {
  jest
    .mocked(useMotionPreference)
    .mockReturnValue({ ready: false, reduced: true });
  const tournament = fullRoom(4);
  useAppStore.setState({ tournaments: [tournament] });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: tournament.id });
  const ui = await render(<LobbyScreen />);
  await fireEvent.press(ui.getByRole("button", { name: "Sortear confrontos" }));
  await act(() => jest.advanceTimersByTime(10000));
  expect(router.replace).not.toHaveBeenCalled();
  jest
    .mocked(useMotionPreference)
    .mockReturnValue({ ready: true, reduced: false });
  await ui.rerender(<LobbyScreen />);
  expect(ui.getByText("OS CONFRONTOS ESTÃO CHEGANDO")).toBeTruthy();
  await act(() => jest.advanceTimersByTime(motion.draw.preparing));
  expect(ui.getByText("TODO MUNDO NO JOGO.")).toBeTruthy();
});

test("preencher a sala habilita o sorteio sem iniciar automaticamente", async () => {
  const tournament = createTournament(
    { name: "Sala", modality: "Futebol", capacity: 4 },
    "room",
  );
  const start = jest.fn(realStart);
  useAppStore.setState({ tournaments: [tournament], start });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: tournament.id });
  const ui = await render(<LobbyScreen />);
  expect(ui.getByRole("button", { name: "Sortear confrontos" })).toBeDisabled();
  await fireEvent.press(
    ui.getByRole("button", { name: "Preencher com participantes de exemplo" }),
  );
  expect(ui.getByText("Todo mundo confirmado.")).toBeTruthy();
  expect(ui.getByRole("button", { name: "Sortear confrontos" })).toBeEnabled();
  expect(start).not.toHaveBeenCalled();
  expect(useAppStore.getState().tournaments[0].status).toBe("draft");
});
