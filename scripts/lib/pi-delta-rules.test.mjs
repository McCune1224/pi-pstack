import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRules, globToRegExp, hashContent, matchGlob, overrideFor, validateSpec } from "./pi-delta-rules.mjs";

test("glob matches nested paths for ** and one level for *", () => {
  assert.ok(matchGlob("**/*.md", "skills/how/references/explainer-prompt.md"));
  assert.ok(matchGlob("**/*.md", "top.md"), "**/ also matches zero directories");
  assert.ok(matchGlob("agents/*.md", "agents/poteto-agent.md"));
  assert.ok(!matchGlob("agents/*.md", "agents/nested/poteto-agent.md"));
  assert.ok(matchGlob("**/*", "skills/poteto-mode/scripts/check-plan.mjs"));
  assert.equal(globToRegExp("a*b").test("a/b"), false);
});

test("validateSpec rejects a bad kind, a duplicate id, and a bad insert position", () => {
  const base = { upstream: { ref: "abc" }, rules: [] };
  assert.deepEqual(validateSpec(base), []);

  const unknown = validateSpec({ ...base, rules: [{ kind: "rewrite", id: "x" }] });
  assert.ok(unknown.some((problem) => problem.includes("unknown kind")));

  const duplicate = validateSpec({
    ...base,
    rules: [
      { kind: "add", id: "same", path: "a/**", reason: "r" },
      { kind: "add", id: "same", path: "b/**", reason: "r" },
    ],
  });
  assert.ok(duplicate.some((problem) => problem.includes("duplicate id")));

  const badPosition = validateSpec({
    ...base,
    rules: [{ kind: "insert", id: "i", path: "*", anchor: "^a$", position: "beside", text: "t", reason: "r" }],
  });
  assert.ok(badPosition.some((problem) => problem.includes("position")));

  assert.ok(validateSpec({ rules: [] }).some((problem) => problem.includes("upstream.ref")));
});

test("substitute replaces every literal occurrence and reports which rules fired", () => {
  const rules = [
    { kind: "substitute", id: "swap", path: "**/*.md", find: ".cursor/skills/", replace: ".pi/skills/", reason: "r" },
  ];
  const input = "a .cursor/skills/ b .cursor/skills/ c";
  const { content, applied } = applyRules(input, "skills/x/SKILL.md", rules);
  assert.equal(content, "a .pi/skills/ b .pi/skills/ c");
  assert.deepEqual(applied, ["swap"]);
});

test("a rule whose find is absent reports nothing applied, which is how stale rules surface", () => {
  const rules = [{ kind: "substitute", id: "gone", path: "**/*.md", find: "no such text", replace: "x", reason: "r" }];
  const { content, applied } = applyRules("untouched", "skills/x/SKILL.md", rules);
  assert.equal(content, "untouched");
  assert.deepEqual(applied, []);
});

test("a rule only applies to paths its glob matches", () => {
  const rules = [{ kind: "substitute", id: "scoped", path: "agents/*.md", find: "a", replace: "b", reason: "r" }];
  assert.deepEqual(applyRules("a", "skills/x/SKILL.md", rules).applied, []);
  assert.deepEqual(applyRules("a", "agents/x.md", rules).applied, ["scoped"]);
});

test("insert places text on its own line before or after the anchor line", () => {
  const input = "---\nname: x\ndescription: d\nis_background: true\n---\nbody\n";
  const before = applyRules(input, "agents/x.md", [
    { kind: "insert", id: "front", path: "agents/*.md", anchor: "^is_background: true$", position: "before", text: "thinking: high\ntools: read", reason: "r" },
  ]);
  assert.equal(before.content, "---\nname: x\ndescription: d\nthinking: high\ntools: read\nis_background: true\n---\nbody\n");

  const after = applyRules(input, "agents/x.md", [
    { kind: "insert", id: "desc", path: "agents/*.md", anchor: "^description: ", position: "after", text: "thinking: high", reason: "r" },
  ]);
  assert.equal(after.content, "---\nname: x\ndescription: d\nthinking: high\nis_background: true\n---\nbody\n");
});

test("declaration order decides the winner when two rules could match the same text", () => {
  const shared = "Cursor's built-in `create-skill` skill";
  const specific = { kind: "substitute", id: "specific", path: "**/*.md", find: shared, replace: "the bundled `create-skill` skill", reason: "r" };
  const generic = { kind: "substitute", id: "generic", path: "**/*.md", find: "Cursor's built-in `create-skill`", replace: "the bundled `create-skill` skill", reason: "r" };

  assert.deepEqual(applyRules(shared, "a.md", [specific, generic]).applied, ["specific"]);
  assert.deepEqual(applyRules(shared, "a.md", [generic, specific]).applied, ["generic"]);
});

test("applyRules uses a regex rule when regex is set", () => {
  const rules = [{ kind: "substitute", id: "rx", path: "**/*.md", regex: true, find: "\\(default `[^`]+`\\)", replace: "(default: inherit)", reason: "r" }];
  const { content } = applyRules("- model: x (default `grok-4.6-fast-xhigh`)", "skills/x/SKILL.md", rules);
  assert.equal(content, "- model: x (default: inherit)");
});

test("hashContent is stable and content-sensitive", () => {
  assert.equal(hashContent("a"), hashContent("a"));
  assert.notEqual(hashContent("a"), hashContent("b"));
  assert.match(hashContent("a"), /^sha256:[0-9a-f]{64}$/);
});

test("overrideFor finds the baselined override that owns a path", () => {
  const spec = { rules: [{ kind: "override", id: "ov", path: "skills/poteto-mode/SKILL.md", basedOn: "sha256:x", reason: "r" }] };
  assert.equal(overrideFor(spec, "skills/poteto-mode/SKILL.md").id, "ov");
  assert.equal(overrideFor(spec, "skills/how/SKILL.md"), undefined);
});
