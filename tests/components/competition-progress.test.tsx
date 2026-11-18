import React from "react";
import * as Native from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { BracketScreen } from "../../src/screens/BracketScreen";
import { MatchScreen } from "../../src/screens/MatchScreen";
import { MatchCard } from "../../src/components/tournament";
import { useAppStore } from "../../src/store/useAppStore";
import { colors } from "../../src/theme/tokens";
import {
  addParticipant,
  createTournament,
  recordResult,
  startTournament,
} from "../../src/features/tournaments/engine/tournament";
import { tournamentFixture } from "../fixtures/tournaments";

jest.mock("../../src/hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({
    tournaments: [],
    profile: { id: "me", nickname: "Pedro" },
    hydrated: true,
    storageError: null,
  });
});
afterEach(() => jest.restoreAllMocks());

function dimensions(width: number) {
  jest.spyOn(Native.Dimensions, "get").mockReturnValue({
    width,
    height: 812,
    scale: 1,
    fontScale: 1,
  });
}

test("rodada mobile preserva a escolha manual e permite reencontrar a disputa após avançar", async () => {
  dimensions(375);
  const t = tournamentFixture("active");
  useAppStore.setState({ tournaments: [t] });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: t.id });
  const ui = await render(<BracketScreen />);
  await fireEvent.press(ui.getByRole("button", { name: t.rounds[0].label }));
  await act(() => {
    useAppStore.getState().score(t.id, t.matches[0].id, 3, 1);
    useAppStore.getState().score(t.id, t.matches[1].id, 3, 1);
  });
  expect(
    ui.getByRole("button", { name: t.rounds[0].label }).props.accessibilityState
      .selected,
  ).toBe(true);
  expect(
    ui.getByRole("button", { name: t.rounds[1].label }).props.accessibilityState
      .selected,
  ).toBe(false);
  const before = JSON.stringify(useAppStore.getState().tournaments);
  await fireEvent.press(
    ui.getByRole("button", { name: "Ir para rodada em disputa" }),
  );
  expect(
    ui.getByRole("button", { name: t.rounds[1].label }).props.accessibilityState
      .selected,
  ).toBe(true);
  expect(ui.getByRole("button", { name: "Partida 1, Final" })).toBeTruthy();
  expect(JSON.stringify(useAppStore.getState().tournaments)).toBe(before);
});

test("árvore conecta IDs reais e remove o destaque dos caminhos invalidados por correção", async () => {
  dimensions(1440);
  let t = createTournament(
    { name: "Copa das conexões", modality: "Futebol", capacity: 8 },
    "edges",
  );
  for (let i = 1; i <= 8; i++) t = addParticipant(t, `Jogador ${i}`);
  t = startTournament(t, () => 0.999);
  for (const match of t.matches) t = recordResult(t, match.id, 3, 1);
  useAppStore.setState({ tournaments: [t] });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: t.id });
  const ui = await render(<BracketScreen />);
  const edges = ui.getAllByTestId(/^bracket-edge-/, {
    includeHiddenElements: true,
  });
  expect(edges).toHaveLength(6);
  for (const match of t.matches.filter((m) => m.nextMatchId)) {
    const edge = ui.getByTestId(
      `bracket-edge-${match.id}-${match.nextMatchId}`,
      { includeHiddenElements: true },
    );
    expect(edge.props.children[0].props.style.backgroundColor).toBe(
      match.winnerId === t.championId ? colors.primary : colors.lineStrong,
    );
  }
  const source = t.matches.find(
    (m) => m.roundIndex === 0 && m.positionIndex === 0,
  )!;
  const ancestor = t.matches.find((m) => m.id === source.nextMatchId)!;
  await act(() => useAppStore.getState().score(t.id, source.id, 0, 4));
  const invalidated = ui.getByTestId(
    `bracket-edge-${ancestor.id}-${ancestor.nextMatchId}`,
    { includeHiddenElements: true },
  );
  expect(invalidated.props.children[0].props.style.backgroundColor).toBe(
    colors.lineStrong,
  );
  expect(useAppStore.getState().tournaments[0].championId).toBeUndefined();
});

test("card de partida mantém foco, vencedor explícito e abre a partida verdadeira", async () => {
  const t = tournamentFixture("completed");
  const m = t.matches[0];
  const ui = await render(<MatchCard match={m} tournament={t} />);
  const card = ui.getByRole("button", { name: "Partida 1, Semifinais" });
  expect(card.props.accessibilityHint).toContain("Vencedor: Ana.");
  await fireEvent(card, "focus", {});
  expect(card).toHaveStyle({ borderColor: colors.primaryDark });
  await fireEvent.press(card);
  expect(router.push).toHaveBeenCalledWith(
    `/match/${m.id}?tournamentId=${t.id}`,
  );
});

test("card compacto mantém nome completo e placar de seis dígitos em áreas separadas", async () => {
  const name = "Alexandre Maximiliano de Souza Rodrigues";
  let t = tournamentFixture("active");
  t = {
    ...t,
    participants: t.participants.map((p, i) =>
      i === 0 ? { ...p, displayName: name } : p,
    ),
  };
  t = recordResult(t, t.matches[0].id, 999999, 1);
  const ui = await render(
    <MatchCard match={t.matches[0]} tournament={t} compact />,
  );
  const card = ui.getByRole("button", { name: "Partida 1, Semifinais" });
  expect(ui.getByText(name)).toBeTruthy();
  expect(ui.getByText("999999")).toBeTruthy();
  expect(ui.getAllByText("Placar")).toHaveLength(2);
  expect(card.props.accessibilityHint).toContain(`Vencedor: ${name}.`);
});

test("grande final apresenta os finalistas reais e mantém confirmação, cancelamento e placar acessíveis", async () => {
  dimensions(320);
  let t = tournamentFixture("active");
  t = recordResult(t, t.matches[0].id, 3, 1);
  t = recordResult(t, t.matches[1].id, 3, 1);
  const final = t.matches.find((m) => m.nextMatchId === null)!;
  useAppStore.setState({ tournaments: [t] });
  jest
    .mocked(useLocalSearchParams)
    .mockReturnValue({ id: final.id, tournamentId: t.id });
  const ui = await render(<MatchScreen />);
  expect(ui.getByText("GRANDE FINAL")).toBeTruthy();
  expect(ui.getByText("Vale o título")).toBeTruthy();
  await fireEvent.changeText(ui.getByLabelText("Placar de Ana"), "2");
  await fireEvent.changeText(ui.getByLabelText("Placar de Caio"), "1");
  await fireEvent.press(
    ui.getByRole("button", { name: "Confirmar resultado" }),
  );
  await fireEvent.press(ui.getByRole("button", { name: "Cancelar" }));
  expect(useAppStore.getState().tournaments[0]).toEqual(t);
  await fireEvent.press(
    ui.getByRole("button", { name: "Confirmar resultado" }),
  );
  await fireEvent.press(ui.getByRole("button", { name: "Salvar resultado" }));
  expect(useAppStore.getState().tournaments[0].championId).toBe(
    final.participant1Id,
  );
  expect(router.replace).toHaveBeenCalledWith(`/tournament/${t.id}/champion`);
});
