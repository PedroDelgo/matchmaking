import { Easing } from "react-native-reanimated";

// Quiet feedback for frequent actions; expressive movement belongs to competition.
export const motion = {
  duration: {
    micro: 160,
    selection: 200,
    transition: 320,
    competition: 700,
    celebration: 4800,
  },
  easing: {
    enter: Easing.out(Easing.cubic),
    exit: Easing.in(Easing.quad),
    standard: Easing.inOut(Easing.cubic),
    impact: Easing.out(Easing.exp),
  },
  spring: {
    snappy: { damping: 22, stiffness: 260, mass: 0.7, overshootClamping: true },
    impact: { damping: 18, stiffness: 220, mass: 0.8, overshootClamping: true },
  },
  distance: { micro: 4, enter: 16, shuffle: 24, confrontation: 48 },
  scale: { pressed: 0.98, selected: 1.025, impact: 0.92 },
  opacity: { hidden: 0, visible: 1, subtle: 0.6 },
  intensity: { quiet: 0.35, competition: 1 },
  draw: {
    preparing: 650,
    shuffling: 750,
    reveal4: 1500,
    reveal8: 1400,
    reveal16: 1800,
    settle: 250,
  },
} as const;

export type SequenceStep = Readonly<{ phase: string; duration: number }>;
const drawSequences = {
  4: buildDraw(motion.draw.reveal4),
  8: buildDraw(motion.draw.reveal8),
  16: buildDraw(motion.draw.reveal16),
};
function buildDraw(reveal: number): readonly SequenceStep[] {
  return [
    { phase: "preparing", duration: motion.draw.preparing },
    { phase: "shuffling", duration: motion.draw.shuffling },
    { phase: "revealing", duration: reveal },
    { phase: "holding", duration: motion.draw.settle },
  ];
}
export const getDrawSequence = (capacity: 4 | 8 | 16) =>
  drawSequences[capacity];
export const championSequence: readonly SequenceStep[] = [
  { phase: "preparing", duration: 600 },
  { phase: "revealing", duration: 600 },
  { phase: "trophy", duration: 600 },
  { phase: "celebrating", duration: 3000 },
];
