import React from "react";
import {
  BackHandler,
  Keyboard,
  Platform,
  type KeyboardEventName,
} from "react-native";
import { act, render, renderHook } from "@testing-library/react-native";
import { CreateScreen } from "../../src/screens/CreateScreen";
import { useKeyboardVisible } from "../../src/hooks/useKeyboardVisible";
import { emptyDraft, useAppStore } from "../../src/store/useAppStore";

afterEach(() => jest.restoreAllMocks());

test.each([
  ["android", "keyboardDidShow", "keyboardDidHide"],
  ["ios", "keyboardWillShow", "keyboardWillHide"],
] as const)(
  "%s acompanha o teclado e remove listeners ao sair",
  async (platform, show, hide) => {
    jest.replaceProperty(Platform, "OS", platform);
    jest.spyOn(Keyboard, "isVisible").mockReturnValue(false);
    const listeners = new Map<KeyboardEventName, () => void>();
    const remove = jest.fn();
    jest
      .spyOn(Keyboard, "addListener")
      .mockImplementation((event, listener) => {
        listeners.set(event, listener as () => void);
        return { remove };
      });
    const ui = await renderHook(useKeyboardVisible);
    expect(ui.result.current).toBe(false);
    await act(() => listeners.get(show)!());
    expect(ui.result.current).toBe(true);
    await act(() => listeners.get(hide)!());
    expect(ui.result.current).toBe(false);
    await ui.unmount();
    expect(remove).toHaveBeenCalledTimes(2);
  },
);

test("web mantém navegação sem subscriptions nativas do teclado", async () => {
  jest.replaceProperty(Platform, "OS", "web");
  const subscribe = jest.spyOn(Keyboard, "addListener");
  const ui = await renderHook(useKeyboardVisible);
  expect(ui.result.current).toBe(false);
  expect(subscribe).not.toHaveBeenCalled();
});

test("voltar Android retorna pelas etapas sem apagar o rascunho e libera a navegação na primeira", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  const remove = jest.fn();
  let back!: () => boolean | null | undefined;
  jest
    .spyOn(BackHandler, "addEventListener")
    .mockImplementation((_event, listener) => {
      back = () => listener({ type: "hardwareBackPress", timeStamp: 1 });
      return { remove };
    });
  const draft = {
    ...emptyDraft,
    name: "Copa Android",
    capacity: 16 as const,
    step: 2,
  };
  useAppStore.setState({
    draft,
    tournaments: [],
    hydrated: true,
    storageError: null,
  });
  const ui = await render(<CreateScreen />);
  await act(() => {
    expect(back()).toBe(true);
  });
  expect(useAppStore.getState().draft).toEqual({ ...draft, step: 1 });
  await act(() => {
    expect(back()).toBe(true);
  });
  expect(useAppStore.getState().draft).toEqual({ ...draft, step: 0 });
  await act(() => {
    expect(back()).toBe(false);
  });
  expect(useAppStore.getState().draft.name).toBe("Copa Android");
  await ui.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
