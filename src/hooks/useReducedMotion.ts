import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
export function useMotionPreference() {
  // Conservative until the platform preference has resolved.
  const [preference, setPreference] = useState({ ready: false, reduced: true });
  useEffect(() => {
    let mounted = true;
    let changed = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted && !changed) setPreference({ ready: true, reduced: v });
      })
      .catch(() => {
        if (mounted && !changed) setPreference({ ready: true, reduced: true });
      });
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (reduced) => {
        changed = true;
        if (mounted) setPreference({ ready: true, reduced });
      },
    );
    return () => {
      mounted = false;
      listener.remove();
    };
  }, []);
  return preference;
}
export function useReducedMotion() {
  return useMotionPreference().reduced;
}
