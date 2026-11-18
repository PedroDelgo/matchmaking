import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import {
  Button,
  Field,
  InteractiveCard,
  LoadingState,
  Text,
} from "../../src/components/ui";
import { FontContext, fallbackFont } from "../../src/theme/FontContext";

test("seleção e loading preservam semântica e impedem ação durante envio", async () => {
  const press = jest.fn();
  const ui = await render(
    <Button
      label="Enviar"
      loading
      accessibilityState={{ selected: true }}
      onPress={press}
    />,
  );
  const button = ui.getByRole("button", { name: "Enviar" });
  expect(button).toBeDisabled();
  expect(button.props.accessibilityState).toMatchObject({
    busy: true,
    selected: true,
  });
  await fireEvent.press(button);
  expect(press).not.toHaveBeenCalled();
  await ui.rerender(<Button label="Enviar" onPress={press} />);
  await fireEvent.press(ui.getByRole("button", { name: "Enviar" }));
  expect(press).toHaveBeenCalledTimes(1);
});
test("campo mantém callbacks, associa erro e permite editar", async () => {
  const focus = jest.fn(),
    blur = jest.fn(),
    change = jest.fn();
  const ui = await render(
    <Field
      label="Apelido"
      value="Ana"
      error="Digite seu apelido."
      onFocus={focus}
      onBlur={blur}
      onChangeText={change}
    />,
  );
  const field = ui.getByLabelText("Apelido");
  await fireEvent(field, "focus");
  await fireEvent(field, "blur");
  await fireEvent.changeText(field, "Bia");
  expect(focus).toHaveBeenCalled();
  expect(blur).toHaveBeenCalled();
  expect(change).toHaveBeenCalledWith("Bia");
  expect(field.props["aria-invalid"]).toBe(true);
  expect(ui.getByRole("alert").props.nativeID).toBe(
    field.props["aria-describedby"],
  );
});
test("card selecionável informa seleção e executa ação", async () => {
  const press = jest.fn();
  const ui = await render(
    <InteractiveCard selected accessibilityLabel="Mata-mata" onPress={press}>
      <Text>Mata-mata</Text>
    </InteractiveCard>,
  );
  const card = ui.getByRole("button", { name: "Mata-mata" });
  expect(card.props.accessibilityState).toMatchObject({ selected: true });
  await fireEvent.press(card);
  expect(press).toHaveBeenCalledTimes(1);
});
test("fonte de sistema funciona como fallback e loading possui label", async () => {
  const ui = await render(
    <FontContext.Provider value={false}>
      <Text variant="display">Bora competir?</Text>
      <LoadingState label="Abrindo campeonatos" />
    </FontContext.Provider>,
  );
  expect(
    StyleSheet.flatten(ui.getByText("Bora competir?").props.style).fontFamily,
  ).toBe(fallbackFont);
  expect(
    ui.getByRole("progressbar", { name: "Abrindo campeonatos" }).props
      .accessibilityState,
  ).toMatchObject({ busy: true });
});
