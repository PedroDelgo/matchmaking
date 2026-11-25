import React from "react";
import { render, fireEvent, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { HomeScreen } from "../../src/screens/HomeScreen";
import { TournamentsScreen } from "../../src/screens/TournamentsScreen";
import { ProfileScreen } from "../../src/screens/ProfileScreen";
import { useAppStore, emptyDraft } from "../../src/store/useAppStore";
import { tournamentFixture } from "../fixtures/tournaments";

beforeEach(() =>
  useAppStore.setState({
    tournaments: [],
    profile: { id: "me", nickname: "Pedro" },
    draft: { ...emptyDraft },
    hydrated: true,
    storageError: null,
  }),
);
test("Home vazia abre a criação e encaminha código para o ingresso real", async () => {
  const ui = await render(<HomeScreen />);
  expect(ui.getByText("Seu primeiro campeonato começa aqui.")).toBeTruthy();
  await fireEvent.press(ui.getByRole("button", { name: "Criar campeonato" }));
  expect(router.push).toHaveBeenCalledWith("/tournament/create");
  await fireEvent.press(ui.getByRole("button", { name: "Entrar com código" }));
  expect(router.push).toHaveBeenLastCalledWith("/invite");
});
test("Home exibe estados, progresso e destinos dos dados locais", async () => {
  const tournaments = [
    tournamentFixture("draft"),
    tournamentFixture("active"),
    tournamentFixture("completed"),
  ];
  useAppStore.setState({ tournaments });
  const ui = await render(<HomeScreen />);
  for (const t of tournaments) {
    await fireEvent.press(ui.getByRole("button", { name: `Abrir ${t.name}` }));
    expect(router.push).toHaveBeenLastCalledWith(`/tournament/${t.id}`);
  }
  expect(ui.getByText("Em preparação")).toBeTruthy();
  expect(
    within(ui.getByRole("button", { name: "Abrir Liga dos amigos" })).getByText(
      "Em andamento",
    ),
  ).toBeTruthy();
  expect(ui.getByText("Concluído")).toBeTruthy();
  expect(ui.getByText("Campeão: Ana")).toBeTruthy();
  expect(
    ui
      .getAllByRole("progressbar", { name: "Progresso do campeonato" })
      .map((p) => p.props.accessibilityValue.now),
  ).toEqual([0, 100]);
  await fireEvent.press(ui.getByRole("button", { name: "Ver todos" }));
  expect(router.navigate).toHaveBeenCalledWith("/tournaments");
});
test("busca e filtros isolam estados reais e limpam resultado vazio", async () => {
  useAppStore.setState({
    tournaments: [
      tournamentFixture("draft"),
      tournamentFixture("active"),
      tournamentFixture("completed"),
    ],
  });
  const ui = await render(<TournamentsScreen />);
  await fireEvent.press(ui.getByRole("button", { name: "Concluídos" }));
  expect(
    ui.getByRole("button", { name: "Abrir Desafio da praça" }),
  ).toBeTruthy();
  expect(ui.queryByRole("button", { name: "Abrir Copa de sábado" })).toBeNull();
  expect(
    ui.getByRole("button", { name: "Concluídos" }).props.accessibilityState
      .selected,
  ).toBe(true);
  await fireEvent.changeText(
    ui.getByLabelText("Buscar campeonato"),
    "inexistente",
  );
  expect(ui.getByText("Nenhum campeonato por aqui.")).toBeTruthy();
  await fireEvent.press(ui.getByRole("button", { name: "Limpar filtros" }));
  expect(
    ui.getAllByRole("button", { name: /Abrir (Copa|Liga|Desafio)/ }),
  ).toHaveLength(3);
});
test("perfil valida apelido e conserva identificador e estatísticas associadas", async () => {
  useAppStore.setState({ tournaments: [tournamentFixture("completed")] });
  const ui = await render(<ProfileScreen />);
  expect(
    ui.getByText("2 partidas disputadas · 100% de aproveitamento"),
  ).toBeTruthy();
  await fireEvent.changeText(ui.getByLabelText("Seu apelido"), " ");
  await fireEvent.press(ui.getByRole("button", { name: "Salvar perfil" }));
  expect(ui.getByText("Digite seu apelido.")).toBeTruthy();
  await fireEvent.changeText(ui.getByLabelText("Seu apelido"), "Pedrão");
  await fireEvent.press(ui.getByRole("button", { name: "Salvar perfil" }));
  expect(useAppStore.getState().profile).toEqual({
    id: "me",
    nickname: "Pedrão",
  });
  expect(ui.getByText("Apelido atualizado.")).toBeTruthy();
  expect(ui.getByText("Sobre sua arena")).toBeTruthy();
});
