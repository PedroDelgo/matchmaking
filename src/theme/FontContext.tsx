import { createContext, useContext } from "react";
import { Platform } from "react-native";
export const fallbackFont = Platform.OS === "ios" ? "System" : "sans-serif";
// If local fonts fail to load, every shared Text/Input uses the platform font.
export const FontContext = createContext(true);
export const useBrandFonts = () => useContext(FontContext);
