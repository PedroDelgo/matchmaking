import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { CreateScreen } from "../../src/screens/CreateScreen";
import { emptyDraft, useAppStore } from "../../src/store/useAppStore";

test("seleção visível acompanha o rascunho ao avançar e voltar pelas etapas", async () => {
  useAppStore.setState({
    draft: { ...emptyDraft },
    tournaments: [],
    hydrated: true,
    storageError: null,
  });
  const ui = await render(<CreateScreen />);
  await fireEvent.changeText(
    ui.getByLabelText("Nome do campeonato"),
    "Copa Arcade",
  );
  await fireEvent.press(ui.getByRole("radio", { name: "Videogame" }));
  expect(
    ui.getByRole("radio", { name: "Videogame" }).props.accessibilityState
      .checked,
  ).toBe(true);
  expect(
    ui.getByRole("radio", { name: "Futebol" }).props.accessibilityState.checked,
  ).toBe(false);
  await fireEvent.press(ui.getByRole("button", { name: "Continuar" }));
  await fireEvent.press(ui.getByRole("button", { name: "16" }));
  await fireEvent.press(ui.getByRole("button", { name: "Continuar" }));
  expect(ui.getByText("Copa Arcade")).toBeTruthy();
  await fireEvent.press(ui.getByRole("button", { name: "Voltar" }));
  expect(
    ui.getByRole("button", { name: "16" }).props.accessibilityState.selected,
  ).toBe(true);
  await fireEvent.press(ui.getByRole("button", { name: "Voltar" }));
  expect(ui.getByLabelText("Nome do campeonato").props.value).toBe(
    "Copa Arcade",
  );
  expect(
    ui.getByRole("radio", { name: "Videogame" }).props.accessibilityState
      .checked,
  ).toBe(true);
  expect(useAppStore.getState().draft).toMatchObject({
    name: "Copa Arcade",
    modality: "Videogame",
    capacity: 16,
    step: 0,
  });
});
