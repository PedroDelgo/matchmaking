import React, { type ReactNode } from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";
import { ChampionScreen } from "../../src/screens/ChampionScreen";
import { LobbyScreen } from "../../src/screens/LobbyScreen";
import { MatchScreen } from "../../src/screens/MatchScreen";
import { PageHeading, SectionTitle, EmptyState } from "../../src/components/ui";
import { useAppStore } from "../../src/store/useAppStore";
import { shareText } from "../../src/utils/share";
import { tournamentFixture } from "../fixtures/tournaments";

jest.unmock("../../src/components/Shell");
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("../../src/hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));
jest.mock("../../src/utils/share", () => ({ shareText: jest.fn() }));

// Native renderers discard empty strings, while RN Web warns about them.
// Inspect the View inputs too, including children inside transparent fragments.
function expectNoRawText(ui: Awaited<ReturnType<typeof render>>) {
  function check(children: ReactNode) {
    for (const child of React.Children.toArray(children)) {
      expect(typeof child).not.toBe("string");
      expect(typeof child).not.toBe("number");
      if (
        React.isValidElement<{ children?: ReactNode }>(child) &&
        child.type === React.Fragment
      )
        check(child.props.children);
    }
  }
  for (const view of ui.container.queryAll((node) => node.type === "View"))
    check(view.props.children);
}

beforeEach(() => {
  useAppStore.setState({
    tournaments: [],
    profile: { id: "me", nickname: "Pedro" },
    hydrated: true,
    storageError: null,
  });
});

test("campeão não entrega texto solto ao View antes ou após cancelar compartilhamento", async () => {
  const t = tournamentFixture("completed");
  useAppStore.setState({ tournaments: [t] });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: t.id });
  const ui = await render(<ChampionScreen />);
  expect(ui.getByText("Campeão!")).toBeTruthy();
  expectNoRawText(ui);

  jest.mocked(shareText).mockResolvedValueOnce("copied");
  await fireEvent.press(
    ui.getByRole("button", { name: "Compartilhar conquista" }),
  );
  expect(
    ui.getByText("Texto copiado. Cole onde quiser compartilhar."),
  ).toBeTruthy();
  expectNoRawText(ui);

  jest.mocked(shareText).mockResolvedValueOnce("cancelled");
  await fireEvent.press(
    ui.getByRole("button", { name: "Compartilhar conquista" }),
  );
  expect(
    ui.queryByText("Texto copiado. Cole onde quiser compartilhar."),
  ).toBeNull();
  expectNoRawText(ui);
});

test("sala sem apelido e partida sem erro não produzem texto fora de Text", async () => {
  const draft = tournamentFixture("draft"),
    active = tournamentFixture("active");
  useAppStore.setState({ tournaments: [draft, active] });
  jest.mocked(useLocalSearchParams).mockReturnValue({ id: draft.id });
  const ui = await render(<LobbyScreen />);
  expectNoRawText(ui);
  await fireEvent.changeText(ui.getByLabelText("Nome ou apelido"), "Ana");
  await fireEvent.press(ui.getByRole("button", { name: "Adicionar" }));
  expectNoRawText(ui);

  jest.mocked(useLocalSearchParams).mockReturnValue({
    id: active.matches[0].id,
    tournamentId: active.id,
  });
  await ui.rerender(<MatchScreen />);
  expectNoRawText(ui);
});

test("textos opcionais vazios nos cabeçalhos e estado vazio são omitidos", async () => {
  const ui = await render(
    <>
      <PageHeading title="Torneios" eyebrow="" description="" />
      <SectionTitle title="Meus campeonatos" subtitle="" action="" />
      <EmptyState
        title="Sem torneios"
        description="Crie um torneio."
        actionLabel=""
      />
    </>,
  );
  expectNoRawText(ui);
});
