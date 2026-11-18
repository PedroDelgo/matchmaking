import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CreateScreen } from "../../src/screens/CreateScreen";
import { LobbyScreen } from "../../src/screens/LobbyScreen";
import { MatchScreen } from "../../src/screens/MatchScreen";
import { BracketScreen } from "../../src/screens/BracketScreen";
import { useAppStore, emptyDraft } from "../../src/store/useAppStore";
import {
  createTournament,
  addParticipant,
  startTournament,
  recordResult,
} from "../../src/features/tournaments/engine/tournament";

beforeEach(() => {
  useAppStore.setState({
    tournaments: [],
    draft: { ...emptyDraft },
    profile: { id: "me", nickname: "Pedro" },
    hydrated: true,
    storageError: null,
  });
  jest.mocked(useLocalSearchParams).mockReturnValue({});
});
test("valida e cria campeonato em três etapas com seleção de modalidade e capacidade", async () => {
  const ui = await render(<CreateScreen />);
  await fireEvent.press(ui.getByRole("button", { name: "Continuar" }));
  expect(ui.getAllByText("Dê um nome ao campeonato.").length).toBeGreaterThan(
    0,
  );
  await fireEvent.changeText(
    ui.getByLabelText("Nome do campeonato"),
    "Copa da Firma",
  );
  await fireEvent.press(ui.getByRole("radio", { name: "Videogame" }));
  await fireEvent.press(ui.getByRole("button", { name: "Continuar" }));
  await fireEvent.press(ui.getByRole("button", { name: "4" }));
  await fireEvent.press(ui.getByRole("button", { name: "Continuar" }));
  await fireEvent.press(ui.getByRole("button", { name: "Criar campeonato" }));
  await waitFor(() =>
    expect(useAppStore.getState().tournaments[0]).toMatchObject({
      name: "Copa da Firma",
      modality: "Videogame",
      capacity: 4,
      status: "draft",
    }),
  );
  expect(router.replace).toHaveBeenCalledWith(
    expect.stringContaining("/lobby?created=1"),
  );
});
test("sala adiciona participantes, identifica duplicados e bloqueia sorteio incompleto", async () => {
  const t = createTournament(
    { name: "Copa", modality: "Truco", capacity: 4 },
    "cup",
  );
  useAppStore.setState({ tournaments: [t] });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: "cup" });
  const ui = await render(<LobbyScreen />);
  expect(ui.getByRole("button", { name: "Sortear confrontos" })).toBeDisabled();
  await fireEvent.press(ui.getByRole("button", { name: "Adicionar" }));
  expect(ui.getByText("Nome do participante é obrigatório.")).toBeTruthy();
  await fireEvent.changeText(ui.getByLabelText("Nome ou apelido"), "Ana");
  await fireEvent.press(ui.getByRole("button", { name: "Adicionar" }));
  await fireEvent.changeText(ui.getByLabelText("Nome ou apelido"), "Ana");
  expect(ui.getByText(/Esse apelido já está na sala/)).toBeTruthy();
  await fireEvent.press(ui.getByRole("button", { name: "Adicionar" }));
  expect(useAppStore.getState().tournaments[0].participants).toHaveLength(2);
  await fireEvent.press(
    ui.getByRole("button", { name: "Preencher com participantes de exemplo" }),
  );
  expect(ui.getByRole("button", { name: "Sortear confrontos" })).toBeEnabled();
  await fireEvent.press(ui.getByRole("button", { name: "Sortear confrontos" }));
  expect(useAppStore.getState().tournaments[0].matches).toHaveLength(3);
});
function active() {
  let t = createTournament(
    { name: "Copa", modality: "Truco", capacity: 4 },
    "cup",
  );
  for (const name of ["Ana", "Bia", "Caio", "Davi"])
    t = addParticipant(t, name);
  return startTournament(t, () => 0.999);
}
test("registra placar somente após revisão e avança vencedor", async () => {
  const t = active(),
    m = t.matches[0];
  useAppStore.setState({ tournaments: [t] });
  jest
    .mocked(useLocalSearchParams)
    .mockReturnValue({ id: m.id, tournamentId: t.id });
  const ui = await render(<MatchScreen />);
  await fireEvent.changeText(ui.getByLabelText("Placar de Ana"), "3");
  await fireEvent.changeText(ui.getByLabelText("Placar de Bia"), "1");
  await fireEvent.press(
    ui.getByRole("button", { name: "Confirmar resultado" }),
  );
  expect(useAppStore.getState().tournaments[0].matches[0].winnerId).toBeNull();
  await fireEvent.press(ui.getByRole("button", { name: "Salvar resultado" }));
  expect(
    useAppStore.getState().tournaments[0].matches.at(-1)?.participant1Id,
  ).toBe(m.participant1Id);
  expect(ui.getByText("Ana venceu.")).toBeTruthy();
});
test("final determina campeão correto e navega para a celebração", async () => {
  let t = active();
  for (const m of t.matches.slice(0, 2)) t = recordResult(t, m.id, 2, 0);
  const m = t.matches.at(-1)!;
  useAppStore.setState({ tournaments: [t] });
  jest
    .mocked(useLocalSearchParams)
    .mockReturnValue({ id: m.id, tournamentId: t.id });
  const ui = await render(<MatchScreen />);
  await fireEvent.changeText(ui.getByLabelText("Placar de Ana"), "1");
  await fireEvent.changeText(ui.getByLabelText("Placar de Caio"), "2");
  await fireEvent.press(
    ui.getByRole("button", { name: "Confirmar resultado" }),
  );
  await fireEvent.press(ui.getByRole("button", { name: "Salvar resultado" }));
  expect(useAppStore.getState().tournaments[0].championId).toBe(
    m.participant2Id,
  );
  expect(router.replace).toHaveBeenCalledWith("/tournament/cup/champion");
});
test("rodadas mobile permitem navegar sem alterar confrontos", async () => {
  const t = active();
  useAppStore.setState({ tournaments: [t] });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: t.id });
  const ui = await render(<BracketScreen />);
  expect(ui.getAllByText("Registrar placar →")).toHaveLength(2);
  await fireEvent.press(ui.getByRole("button", { name: "Final" }));
  expect(ui.getByText("Aguardando")).toBeTruthy();
  expect(ui.queryByText("Registrar placar →")).toBeNull();
  await fireEvent.press(ui.getByRole("button", { name: "Anterior" }));
  expect(ui.getAllByText("Registrar placar →")).toHaveLength(2);
});
