import { useCallback, useEffect, useRef, useState } from "react";
import type { SequenceStep } from "../theme/motion";

export type SequenceEnd = "completed" | "skipped" | "cancelled";

/** Presentation only: this hook never draws participants or changes a result. */
export function useCompetitionSequence({
  runKey,
  active = true,
  steps,
  reduced,
  ready = true,
  onComplete,
}: {
  runKey: string;
  active?: boolean;
  steps: readonly SequenceStep[];
  reduced: boolean;
  ready?: boolean;
  onComplete?: (reason: SequenceEnd) => void;
}) {
  const [phase, setPhase] = useState("idle");
  const run = useRef({ key: runKey, ended: false });
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  const completion = useRef(onComplete);
  useEffect(() => {
    completion.current = onComplete;
  }, [onComplete]);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  const finish = useCallback(
    (reason: SequenceEnd) => {
      if (!mounted.current || run.current.ended) return;
      run.current.ended = true;
      clear();
      setPhase(reason);
      completion.current?.(reason);
    },
    [clear],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clear();
    };
  }, [clear]);
  useEffect(() => {
    clear();
    const ticket = ++generation.current;
    const current = () =>
      mounted.current && generation.current === ticket && !run.current.ended;
    const stop = () => {
      generation.current += 1;
      clear();
    };
    if (run.current.key !== runKey) {
      run.current = { key: runKey, ended: false };
    }
    if (run.current.ended) return;
    if (!active || !ready) {
      return;
    }
    if (reduced || !steps.length) {
      timer.current = setTimeout(() => {
        if (current()) finish("completed");
      }, 0);
      return stop;
    }
    const advance = (index: number) => {
      if (!current()) return;
      const step = steps[index];
      if (!step) {
        finish("completed");
        return;
      }
      setPhase(step.phase);
      timer.current = setTimeout(
        () => advance(index + 1),
        Math.max(0, step.duration),
      );
    };
    advance(0);
    return stop;
  }, [runKey, active, ready, reduced, steps, clear, finish]);

  const skip = useCallback(() => finish("skipped"), [finish]);
  const cancel = useCallback(() => finish("cancelled"), [finish]);
  return { phase: !active || !ready ? "idle" : phase, skip, cancel };
}
