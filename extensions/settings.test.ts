import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  POTETO_DIRECTIVE,
  applyBudget,
  budgetLabel,
  budgetOf,
  buildTier,
  lastModeEnabled,
  loadSettings,
  parseArgs,
  parseModelId,
  resolvedMapping,
  saveSettings,
  summaryText,
  type ModeEntry,
} from "./settings.ts";

test("parseArgs maps scope, tier, and role tokens", () => {
  assert.deepEqual(parseArgs("-l inherit"), { scope: "project", tier: "all-inherit", role: undefined, budget: undefined });
  assert.deepEqual(parseArgs("scout"), { scope: undefined, tier: undefined, role: "scout", budget: undefined });
  assert.deepEqual(parseArgs(""), { scope: undefined, tier: undefined, role: undefined, budget: undefined });
  assert.deepEqual(parseArgs("--local light"), { scope: "project", tier: "light", role: undefined, budget: undefined });
  assert.deepEqual(parseArgs("custom poteto-agent"), { scope: undefined, tier: "custom", role: "poteto-agent", budget: undefined });
  assert.deepEqual(parseArgs("nonsense-token"), { scope: undefined, tier: undefined, role: undefined, budget: undefined });
});

test("parseArgs maps budget tokens, alone and combined", () => {
  assert.equal(parseArgs("small").budget, "small");
  assert.equal(parseArgs("unlimited").budget, "unlimited");
  assert.deepEqual(parseArgs("-l large"), { scope: "project", tier: undefined, role: undefined, budget: "large" });
  assert.equal(parseArgs("medium scout").role, "scout");
  assert.equal(parseArgs("medium scout").budget, "medium");
});

test("applyBudget sets and clears defaultThinking without mutating its input", () => {
  const base = { defaultModel: "inherit", defaultThinking: "high" as const };
  const raised = applyBudget(base, "large");
  assert.equal(raised.defaultThinking, "xhigh");
  assert.equal(base.defaultThinking, "high", "input map is untouched");
  const cleared = applyBudget(base, "unlimited");
  assert.equal(cleared.defaultThinking, undefined);
  assert.ok("defaultThinking" in cleared === false, "unlimited removes the key instead of writing null");
  const lowered = applyBudget({}, "small");
  assert.equal(lowered.defaultThinking, "medium");
});

test("budgetOf reads the recorded budget back off the map", () => {
  assert.equal(budgetOf({}), "unlimited");
  assert.equal(budgetOf({ defaultThinking: "xhigh" }), "large");
  assert.equal(budgetOf({ defaultThinking: "max" }), "large");
  assert.equal(budgetOf({ defaultThinking: "high" }), "medium");
  assert.equal(budgetOf({ defaultThinking: "medium" }), "small");
  assert.equal(budgetOf({ defaultThinking: "low" }), "unlimited", "a hand-written level below the ladder reads as unlimited");
  assert.equal(budgetLabel({ defaultThinking: "high" }), "medium (high reasoning)");
});

test("summaryText names the budget on the header line", () => {
  const text = summaryText(applyBudget(buildTier("all-inherit"), "small"), "user", []);
  assert.ok(text.includes("budget: small"), text);
  assert.ok(text.startsWith("pstack models (user), budget: small"), text);
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
  assert.equal(light.defaultThinking, "high");
  assert.deepEqual(light.agentOverrides, {
    scout: { thinking: "low" },
    oracle: { thinking: "high" },
    "poteto-agent": { thinking: "high" },
    "comment-sicko": { thinking: "high" },
  });
  assert.equal(JSON.stringify(buildTier("light")), JSON.stringify(light));
});

test("light tier writes no model slug other than inherit", () => {
  const json = JSON.stringify(buildTier("light"));
  assert.deepEqual(json.match(/[a-z0-9-]+\/[a-z0-9.-]+/gi), null, "no provider/model slug is pinned");
  assert.ok(json.includes('"defaultModel":"inherit"'), "every role inherits the parent model");
});

test("resolvedMapping falls back default -> inherit and includes extras", () => {
  const light = buildTier("light");
  const mapped = resolvedMapping(light, ["default", "scout", "oracle", "poteto-agent"]);
  assert.deepEqual(mapped, [
    { role: "default", model: "inherit", extra: undefined },
    { role: "scout", model: "inherit", extra: "thinking:low" },
    { role: "oracle", model: "inherit", extra: "thinking:high" },
    { role: "poteto-agent", model: "inherit", extra: "thinking:high" },
  ]);
  const empty = resolvedMapping({}, ["default", "worker"]);
  assert.deepEqual(empty.map((row) => row.model), ["inherit", "inherit"]);
  const handWrittenFallback = resolvedMapping(
    { agentOverrides: { oracle: { model: "inherit", fallbackModels: ["demo/one"] } } },
    ["oracle"],
  );
  assert.deepEqual(handWrittenFallback, [
    { role: "oracle", model: "inherit", extra: "fallback:demo/one" },
  ]);
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