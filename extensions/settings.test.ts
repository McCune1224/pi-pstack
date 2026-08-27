import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  POTETO_DIRECTIVE,
  buildTier,
  lastModeEnabled,
  loadSettings,
  parseArgs,
  parseModelId,
  resolvedMapping,
  saveSettings,
  type ModeEntry,
} from "./settings.ts";

test("parseArgs maps scope, tier, and role tokens", () => {
  assert.deepEqual(parseArgs("-l inherit"), { scope: "project", tier: "all-inherit", role: undefined });
  assert.deepEqual(parseArgs("scout"), { scope: undefined, tier: undefined, role: "scout" });
  assert.deepEqual(parseArgs(""), { scope: undefined, tier: undefined, role: undefined });
  assert.deepEqual(parseArgs("--local light"), { scope: "project", tier: "light", role: undefined });
  assert.deepEqual(parseArgs("custom poteto-agent"), { scope: undefined, tier: "custom", role: "poteto-agent" });
  assert.deepEqual(parseArgs("nonsense-token"), { scope: undefined, tier: undefined, role: undefined });
});

test("parseModelId strips labels to ids", () => {
  assert.equal(parseModelId("inherit (parent model - cheapest, recommended)"), "inherit");
  assert.equal(parseModelId("opencode-go/hy3 (256k)"), "opencode-go/hy3");
  assert.equal(parseModelId("openrouter/anthropic/claude-3.7-sonnet"), "openrouter/anthropic/claude-3.7-sonnet");
});

test("buildTier is pure and idempotent", () => {
  const all = buildTier("all-inherit");
  assert.equal(all.defaultModel, "inherit");
  assert.deepEqual(all.agentOverrides?.oracle, { model: "inherit" });
  assert.equal(JSON.stringify(buildTier("all-inherit")), JSON.stringify(all));

  const light = buildTier("light");
  assert.equal(light.defaultModel, "opencode-go/hy3");
  assert.equal(light.defaultThinking, "high");
  assert.equal(light.agentOverrides?.scout?.thinking, "low");
  assert.deepEqual(light.agentOverrides?.oracle?.fallbackModels, ["opencode-go/deepseek-v4-flash"]);
  assert.equal(light.agentOverrides?.["poteto-agent"]?.thinking, "high");
});

test("resolvedMapping falls back default -> inherit and includes extras", () => {
  const light = buildTier("light");
  const mapped = resolvedMapping(light, ["default", "scout", "oracle", "poteto-agent"]);
  assert.deepEqual(mapped.map((row) => [row.role, row.model]), [
    ["default", "opencode-go/hy3"],
    ["scout", "inherit"],
    ["oracle", "inherit"],
    ["poteto-agent", "inherit"],
  ]);
  assert.ok(mapped.find((row) => row.role === "oracle")?.extra?.includes("fallback:"));
  const empty = resolvedMapping({}, ["default", "worker"]);
  assert.deepEqual(empty.map((row) => row.model), ["inherit", "inherit"]);
});

test("saveSettings merges into existing settings, never clobbers", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-pstack-settings-"));
  const path = join(dir, "settings.json");
  writeFileSync(
    path,
    JSON.stringify({ theme: "dark", defaultProvider: "opencode-go", subagents: { defaultModel: "inherit" } }),
  );
  saveSettings(path, { defaultThinking: "high", agentOverrides: { scout: { model: "inherit" } } });
  const file = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(file.theme, "dark", "unrelated top-level keys survive");
  assert.equal(file.defaultProvider, "opencode-go");
  assert.deepEqual(
    file.subagents,
    {
      defaultModel: "inherit",
      defaultThinking: "high",
      agentOverrides: { scout: { model: "inherit" } },
    },
    "prior subagents keys survive and the new map merges in",
  );
  const loaded = loadSettings(path);
  assert.equal(loaded.defaultModel, "inherit");
  assert.equal(loaded.defaultThinking, "high");
  assert.deepEqual(loaded.agentOverrides, { scout: { model: "inherit" } });
});

test("loadSettings returns {} when the file is missing or malformed", () => {
  assert.deepEqual(loadSettings(join(tmpdir(), "does-not-exist.json")), {});
  const dir = mkdtempSync(join(tmpdir(), "pi-pstack-bad-"));
  const path = join(dir, "settings.json");
  saveSettings(path, { defaultModel: "inherit" });
  assert.equal(loadSettings(path).defaultModel, "inherit");
});

test("lastModeEnabled returns the last pstack-mode entry", () => {
  const entries: ModeEntry[] = [
    { type: "message", customType: undefined, data: undefined },
    { type: "custom", customType: "pstack-mode", data: { enabled: true } },
    { type: "custom", customType: "pstack-mode", data: { enabled: false } },
    { type: "custom", customType: "other", data: { enabled: true } },
  ];
  assert.equal(lastModeEnabled(entries), false);
  assert.equal(lastModeEnabled(entries.slice(0, 2)), true);
  assert.equal(lastModeEnabled([]), false);
});

test("POTETO_DIRECTIVE names the skill as the source of truth", () => {
  assert.ok(POTETO_DIRECTIVE.includes("poteto-mode skill"));
  assert.ok(POTETO_DIRECTIVE.includes("/poteto-mode off"));
});