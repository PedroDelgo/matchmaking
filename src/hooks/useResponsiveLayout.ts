import { useWindowDimensions } from "react-native";
import { tokens } from "../theme/tokens";
export function useResponsiveLayout() {
  const { width, fontScale } = useWindowDimensions();
  // Large accessibility text retains the more spacious single-column layout.
  const compact = width < tokens.breakpoints.compact;
  const desktop = width >= tokens.breakpoints.desktop && fontScale < 1.6;
  const tablet = width >= tokens.breakpoints.tablet && fontScale < 1.6;
  return {
    width,
    compact,
    desktop,
    tablet,
    columns: tablet ? 2 : 1,
    padding: desktop ? tokens.spacing.page : tokens.spacing.md,
  };
}
