import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type RoleKey =
  | "default"
  | "scout"
  | "worker"
  | "reviewer"
  | "oracle"
  | "poteto-agent"
  | "comment-sicko";

export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "inherit";

export interface ModelSpec {
  model?: string;
  thinking?: ThinkingLevel;
  fallbackModels?: string[];
}

export interface ModelMap {
  defaultModel?: string;
  defaultThinking?: ThinkingLevel;
  agentOverrides?: Record<string, ModelSpec>;
}

export type Tier = "all-inherit" | "light" | "custom";
export type Scope = "user" | "project";

export const ROLE_KEYS: RoleKey[] = [
  "default",
  "scout",
  "worker",
  "reviewer",
  "oracle",
  "poteto-agent",
  "comment-sicko",
];

export const INHERIT_LABEL = "inherit (parent model - cheapest, recommended)";

export interface ParsedArgs {
  scope: Scope | undefined;
  tier?: Tier;
  role?: RoleKey;
}

const ROLE_SET = new Set<string>(ROLE_KEYS);

export function parseArgs(raw: string): ParsedArgs {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const out: ParsedArgs = { scope: undefined, tier: undefined, role: undefined };
  for (const token of tokens) {
    if (token === "-l" || token === "--local" || token === "local") {
      out.scope = "project";
    } else if (token === "inherit" || token === "all-inherit") {
      out.tier = "all-inherit";
    } else if (token === "light") {
      out.tier = "light";
    } else if (token === "custom") {
      out.tier = "custom";
    } else if (ROLE_SET.has(token)) {
      out.role = token as RoleKey;
    }
  }
  return out;
}

export function settingsPath(cwd: string, scope: Scope, configDirName: string): string {
  return scope === "user"
    ? join(homedir(), configDirName, "agent", "settings.json")
    : join(cwd, configDirName, "settings.json");
}

function readJsonObject(path: string): Record<string, unknown> {
  try {
    if (!existsSync(path)) return {};
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function loadSettings(path: string): ModelMap {
  const subagents = readJsonObject(path).subagents;
  if (typeof subagents !== "object" || subagents === null) return {};
  const sub = subagents as Record<string, unknown>;
  const map: ModelMap = {};
  if (typeof sub.defaultModel === "string") map.defaultModel = sub.defaultModel;
  if (typeof sub.defaultThinking === "string") {
    map.defaultThinking = sub.defaultThinking as ThinkingLevel;
  }
  if (typeof sub.agentOverrides === "object" && sub.agentOverrides !== null) {
    map.agentOverrides = sub.agentOverrides as Record<string, ModelSpec>;
  }
  return map;
}

export function saveSettings(path: string, map: ModelMap): void {
  const existing = readJsonObject(path);
  const subagents =
    typeof existing.subagents === "object" && existing.subagents !== null
      ? (existing.subagents as Record<string, unknown>)
      : {};
  existing.subagents = { ...subagents, ...map };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(existing, null, 2) + "\n");
}

export interface RegistryModelLike {
  provider: string;
  id: string;
  contextWindow?: number;
}

export function availableModels(
  registryModels: Array<RegistryModelLike>,
): Array<{ id: string; label: string }> {
  const out = [{ id: "inherit", label: INHERIT_LABEL }];
  const seen = new Set<string>(["inherit"]);
  for (const model of registryModels) {
    if (out.length >= 80) break;
    const id = `${model.provider}/${model.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: model.contextWindow ? `${id} (${Math.round(model.contextWindow / 1000)}k)` : id,
    });
  }
  return out;
}

export function parseModelId(label: string): string {
  if (label.startsWith("inherit")) return "inherit";
  return label.split(" ")[0];
}

export function buildTier(tier: "all-inherit" | "light"): ModelMap {
  if (tier === "all-inherit") {
    return {
      defaultModel: "inherit",
      agentOverrides: {
        scout: { model: "inherit" },
        worker: { model: "inherit" },
        reviewer: { model: "inherit" },
        oracle: { model: "inherit" },
      },
    };
  }
  return {
    defaultModel: "opencode-go/hy3",
    defaultThinking: "high",
    agentOverrides: {
      scout: { model: "inherit", thinking: "low" },
      worker: { model: "inherit" },
      reviewer: { model: "inherit" },
      oracle: { model: "inherit", fallbackModels: ["opencode-go/deepseek-v4-flash"] },
      "poteto-agent": { model: "inherit", thinking: "high" },
      "comment-sicko": { model: "inherit", thinking: "high" },
    },
  };
}

export interface ResolvedRole {
  role: RoleKey;
  model: string;
  extra?: string;
}

export function resolvedMapping(map: ModelMap, allKeys: RoleKey[]): ResolvedRole[] {
  const fallback = map.defaultModel ?? "inherit";
  const out: ResolvedRole[] = [];
  for (const role of allKeys) {
    const spec = map.agentOverrides?.[role];
    const extraBits: string[] = [];
    if (spec?.thinking) extraBits.push(`thinking:${spec.thinking}`);
    if (spec?.fallbackModels?.length) extraBits.push(`fallback:${spec.fallbackModels.join("+")}`);
    const model = role === "default" ? fallback : spec?.model ?? fallback;
    out.push({
      role,
      model,
      extra: extraBits.length ? extraBits.join(" ") : undefined,
    });
  }
  return out;
}

export function summaryText(
  map: ModelMap,
  scope: Scope | "none",
  loadedPstackSkills: string[],
): string {
  const scopeName = scope === "project" ? "project" : scope === "user" ? "user" : "none saved";
  const lines = [`pstack models (${scopeName}):`];
  for (const role of resolvedMapping(map, ROLE_KEYS)) {
    lines.push(
      `  ${role.role} -> ${role.model}${role.extra ? ` (${role.extra})` : ""}`,
    );
  }
  if (loadedPstackSkills.length > 0) {
    lines.push(`pstack skills loaded: ${loadedPstackSkills.length}`);
    lines.push(`  ${loadedPstackSkills.join(", ")}`);
  }
  return lines.join("\n");
}