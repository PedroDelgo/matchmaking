import { createContext, useContext } from "react";
// If local fonts fail to load, every shared Text/Input uses the platform font.
export const FontContext = createContext(true);
export const useBrandFonts = () => useContext(FontContext);
