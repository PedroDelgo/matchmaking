import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { router, usePathname } from "expo-router";
import { AppNavigation } from "../../src/components/Shell";
jest.unmock("../../src/components/Shell");

test.each([
  ["/", "Início"],
  ["/tournaments", "Torneios"],
  ["/tournament/cup/lobby", "Torneios"],
  ["/match/game", "Torneios"],
  ["/profile", "Perfil"],
])("navegação identifica destino de %s", async (path, label) => {
  jest.mocked(usePathname).mockReturnValue(path);
  const ui = await render(<AppNavigation placement="bottom" />);
  for (const tab of ui.getAllByRole("tab"))
    expect(tab.props.accessibilityState.selected).toBe(
      tab.props.accessibilityLabel === label,
    );
});
test("três destinos navegam pelas rotas reais, sem ações decorativas", async () => {
  const ui = await render(<AppNavigation placement="header" />);
  for (const [name, href] of [
    ["Início", "/"],
    ["Torneios", "/tournaments"],
    ["Perfil", "/profile"],
  ]) {
    await fireEvent.press(ui.getByRole("tab", { name }));
    expect(router.navigate).toHaveBeenLastCalledWith(href);
  }
});
