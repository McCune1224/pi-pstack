import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkAgentFrontmatter,
  checkModelMap,
  checkModelValue,
  checkThinkingValue,
  renderReport,
} from "./doctor.ts";

test("checkModelValue accepts inherit and provider/id shapes only", () => {
  assert.equal(checkModelValue("inherit"), null);
  assert.equal(checkModelValue("opencode-go/hy3"), null);
  assert.ok(checkModelValue("just-a-slug")?.includes("provider/id"));
  assert.ok(checkModelValue("openrouter anthropic/claude")?.includes("provider/id"));
});

test("checkThinkingValue rejects anything off Pi's ladder", () => {
  assert.equal(checkThinkingValue("high"), null);
  assert.equal(checkThinkingValue("xhigh"), null);
  assert.ok(checkThinkingValue("inherit")?.includes("not a Pi level"));
  assert.ok(checkThinkingValue("maximum")?.includes("not a Pi level"));
});

test("checkModelMap flags typos, bad values, and bad fallbacks", () => {
  const problems = checkModelMap(
    {
      defaultModel: "inherit",
      defaultThinking: "medium",
      agentOverrides: {
        scout: { thinking: "low" },
        wroker: { model: "nope" },
        oracle: { model: "a/b", thinking: "max", fallbackModels: ["inherit", "bad fallback"] },
      },
    },
    ["scout", "worker", "reviewer", "oracle"],
  );
  assert.equal(problems.length, 2, problems.join("; "));
  assert.ok(problems.some((line) => line.includes("wroker") && line.includes("unknown role")));
  assert.ok(problems.some((line) => line.includes("fallbackModels") && line.includes("provider/id")));
});

test("checkModelMap passes a healthy map", () => {
  const problems = checkModelMap(
    {
      defaultModel: "inherit",
      defaultThinking: "xhigh",
      agentOverrides: {
        scout: { model: "inherit", thinking: "low" },
        oracle: { model: "a/b", fallbackModels: ["c/d"] },
      },
    },
    ["scout", "oracle"],
  );
  assert.deepEqual(problems, []);
});

test("checkAgentFrontmatter requires a frontmatter block with name and description", () => {
  assert.deepEqual(
    checkAgentFrontmatter("poteto-agent.md", "---\nname: poteto-agent\ndescription: runs the mode\n---\nbody"),
    [],
  );
  assert.equal(
    checkAgentFrontmatter("broken.md", "no frontmatter here").length,
    1,
  );
  const missing = checkAgentFrontmatter("thin.md", "---\nname: thin\n---\nbody");
  assert.equal(missing.length, 1);
  assert.ok(missing[0].includes("description"));
});

test("renderReport summarizes and counts findings", () => {
  const clean = renderReport([
    { name: "settings", status: "ok", detail: "parsed" },
    { name: "agents", status: "ok", detail: "2 registered" },
  ]);
  assert.ok(clean.endsWith("pstack doctor: clean. Nothing to fix."));
  const noisy = renderReport([
    { name: "settings", status: "warn", detail: "unknown role" },
    { name: "pin", status: "fail", detail: "stale" },
  ]);
  assert.ok(noisy.includes("warn  settings"));
  assert.ok(noisy.includes("FAIL  pin"));
  assert.ok(noisy.endsWith("pstack doctor: 2 findings."));
});
