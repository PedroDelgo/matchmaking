import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
export function useReducedMotion() {
  // Conservative until the platform preference has resolved.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setReduced(v);
      })
      .catch(() => {});
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      mounted = false;
      listener.remove();
    };
  }, []);
  return reduced;
}
