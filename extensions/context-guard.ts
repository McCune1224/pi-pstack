/**
 * Context guard for Poteto Mode.
 *
 * Pi meters context usage; the harness can act on it in a way no skill file
 * can. This module holds the pure decision logic: map a usage percentage to a
 * guard level, and say what to do about it. The wiring lives in index.ts.
 *
 * The thresholds back the guard-the-context-window principle: finish the
 * current step, capture the decision state, then free context deliberately
 * instead of letting the automatic cut take the tail of the run.
 */

export interface ContextUsageLike {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
}

export type GuardLevel = "ok" | "watch" | "warn" | "compact";

/** Percent-of-context-window thresholds, ascending. */
export const GUARD_THRESHOLDS = {
  watch: 70,
  warn: 85,
  compact: 92,
} as const;

const LEVEL_ORDER: Record<GuardLevel, number> = { ok: 0, watch: 1, warn: 2, compact: 3 };

export function guardLevel(percent: number | null | undefined): GuardLevel {
  if (percent === null || percent === undefined || Number.isNaN(percent)) return "ok";
  if (percent >= GUARD_THRESHOLDS.compact) return "compact";
  if (percent >= GUARD_THRESHOLDS.warn) return "warn";
  if (percent >= GUARD_THRESHOLDS.watch) return "watch";
  return "ok";
}

export function isStronger(a: GuardLevel, b: GuardLevel): boolean {
  return LEVEL_ORDER[a] > LEVEL_ORDER[b];
}

export function formatPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined || Number.isNaN(percent)) return "?";
  return `${Math.round(percent)}%`;
}

const ADVICE: Record<Exclude<GuardLevel, "ok">, string> = {
  watch:
    "Context is filling up. Finish the current step, then hand long output to a file and point at it instead of pasting it back.",
  warn:
    "Context is high. Capture the decision state now: the active playbook, the step it is on, and what has been verified. Then run /compact, or accept the compaction offer.",
  compact:
    "Context is nearly full. Pi is about to compact on its own and the cut point is not yours to choose. Run /compact now to keep the playbook and evidence state intact.",
};

export function guardAdvice(level: GuardLevel, percent: number | null | undefined): string {
  if (level === "ok") return "";
  return `pstack context guard: ${formatPercent(percent)} of the context window. ${ADVICE[level]}`;
}

/** One HUD line for the poteto-mode widget. */
export function meterLine(usage: ContextUsageLike | undefined, budget: string): string {
  const percent = usage?.percent ?? null;
  return `context: ${formatPercent(percent)} of ${Math.round((usage?.contextWindow ?? 0) / 1000)}k | budget: ${budget}`;
}
