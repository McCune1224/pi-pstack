/**
 * /pstack-doctor: one command that checks the install the way a colleague
 * would, offline. Pure validators live here; index.ts gathers the inputs.
 */

import type { ModelMap, ThinkingLevel } from "./settings.ts";

export const PI_THINKING_LEVELS: readonly string[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  detail: string;
}

/** "inherit" is always valid. Anything else must look like provider/id. */
export function checkModelValue(value: string): string | null {
  if (value === "inherit") return null;
  if (!value.includes("/") || /\s/.test(value)) {
    return `model "${value}" is neither inherit nor provider/id`;
  }
  return null;
}

export function checkThinkingValue(value: string): string | null {
  return PI_THINKING_LEVELS.includes(value) ? null : `thinking "${value}" is not a Pi level (${PI_THINKING_LEVELS.join(", ")})`;
}

/** Returns one human line per problem found in the map. */
export function checkModelMap(map: ModelMap, knownRoles: readonly string[]): string[] {
  const problems: string[] = [];
  if (map.defaultModel) {
    const problem = checkModelValue(map.defaultModel);
    if (problem) problems.push(`defaultModel: ${problem}`);
  }
  if (map.defaultThinking) {
    const problem = checkThinkingValue(map.defaultThinking);
    if (problem) problems.push(`defaultThinking: ${problem}`);
  }
  for (const [role, spec] of Object.entries(map.agentOverrides ?? {})) {
    if (!knownRoles.includes(role)) {
      problems.push(
        `agentOverrides.${role}: unknown role (known: ${knownRoles.join(", ")}) - a typo here silently does nothing`,
      );
      continue;
    }
    if (spec?.model) {
      const problem = checkModelValue(spec.model);
      if (problem) problems.push(`agentOverrides.${role}.model: ${problem}`);
    }
    if (spec?.thinking) {
      const problem = checkThinkingValue(spec.thinking);
      if (problem) problems.push(`agentOverrides.${role}.thinking: ${problem}`);
    }
    for (const fallback of spec?.fallbackModels ?? []) {
      const problem = checkModelValue(fallback);
      if (problem) problems.push(`agentOverrides.${role}.fallbackModels: ${problem}`);
    }
  }
  return problems;
}

/**
 * Minimal frontmatter check for a package agent file. Returns one line per
 * problem. pi-subagents reads name and description from this block.
 */
export function checkAgentFrontmatter(fileName: string, content: string): string[] {
  const problems: string[] = [];
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)?.[1];
  if (!frontmatter) {
    problems.push(`${fileName}: no frontmatter block; pi-subagents cannot register it`);
    return problems;
  }
  for (const field of ["name", "description"]) {
    if (!new RegExp(`^${field}:`, "m").test(frontmatter)) {
      problems.push(`${fileName}: frontmatter is missing "${field}"`);
    }
  }
  return problems;
}

export function renderReport(checks: readonly DoctorCheck[]): string {
  const mark = { ok: "ok  ", warn: "warn", fail: "FAIL" } as const;
  const lines = checks.map((check) => `${mark[check.status]}  ${check.name}: ${check.detail}`);
  const warnings = checks.filter((check) => check.status !== "ok").length;
  lines.push(
    warnings === 0
      ? "pstack doctor: clean. Nothing to fix."
      : `pstack doctor: ${warnings} finding${warnings === 1 ? "" : "s"}.`,
  );
  return lines.join("\n");
}
