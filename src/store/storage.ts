import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { StateStorage } from "zustand/middleware";

// Browser APIs are resolved only when called on the client, never during rendering.
export const localStorageAdapter: StateStorage = {
  getItem: async (name) => {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(name);
    }
    return AsyncStorage.getItem(name);
  },
  setItem: async (name, value) => {
    if (Platform.OS === "web") {
      if (typeof window === "undefined")
        throw new Error("Armazenamento indisponível.");
      window.localStorage.setItem(name, value);
      return;
    }
    await AsyncStorage.setItem(name, value);
  },
  removeItem: async (name) => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.localStorage.removeItem(name);
      return;
    }
    await AsyncStorage.removeItem(name);
  },
};
