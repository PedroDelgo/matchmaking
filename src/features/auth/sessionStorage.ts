import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  createChunkedSessionStorage,
  type SessionKeyValueStorage,
} from "./chunkedStorage";

const listeners = new Set<(message: string) => void>();
export function onSessionStorageError(listener: (message: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const nativeStorage = createChunkedSessionStorage({
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
});

const browserStorage: SessionKeyValueStorage = {
  getItem: async (key) =>
    typeof window === "undefined" ? null : window.localStorage.getItem(key),
  setItem: async (key, value) => {
    if (typeof window === "undefined")
      throw new Error("Armazenamento indisponível.");
    window.localStorage.setItem(key, value);
  },
  removeItem: async (key) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  },
};

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    const message =
      "Não foi possível acessar o armazenamento da sessão. Seus campeonatos locais continuam disponíveis.";
    listeners.forEach((listener) => listener(message));
    throw new Error(message);
  }
}

const platformStorage = Platform.OS === "web" ? browserStorage : nativeStorage;
export const sessionStorage: SessionKeyValueStorage = {
  getItem: (key) => guarded(() => platformStorage.getItem(key)),
  setItem: (key, value) => guarded(() => platformStorage.setItem(key, value)),
  removeItem: (key) => guarded(() => platformStorage.removeItem(key)),
};
