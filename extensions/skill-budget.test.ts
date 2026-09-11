import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  analyzeSkillBudget,
  promptBlockEntry,
  readSkillSources,
  type SkillSource,
} from "./skill-budget.ts";

const REPO_SKILLS = join(import.meta.dirname, "..", "skills");

const FIXTURES: SkillSource[] = [
  {
    path: "/pkg/skills/demo/SKILL.md",
    content: [
      "---",
      "name: demo",
      'description: "Says \\"hello\\" to <the> world."',
      "disable-model-invocation: false",
      "---",
      "",
      "# Demo",
    ].join("\n"),
  },
  {
    path: "/pkg/skills/hidden/SKILL.md",
    content: [
      "---",
      "name: hidden",
      "description: Filtered out of the prompt.",
      "disable-model-invocation: true",
      "---",
    ].join("\n"),
  },
  {
    path: "/pkg/skills/quoted/SKILL.md",
    content: [
      "---",
      "name: quoted",
      "description: Not a boolean.",
      'disable-model-invocation: "true"',
      "---",
    ].join("\n"),
  },
  {
    path: "/pkg/skills/noName/SKILL.md",
    content: ["---", "description: Name comes from the directory.", "---"].join("\n"),
  },
];

test("promptBlockEntry writes Pi's available_skills entry", () => {
  assert.equal(
    promptBlockEntry("demo", 'Says "hello" to <the> world.', "/pkg/skills/demo/SKILL.md"),
    [
      "  <skill>",
      "    <name>demo</name>",
      "    <description>Says &quot;hello&quot; to &lt;the&gt; world.</description>",
      "    <location>/pkg/skills/demo/SKILL.md</location>",
      "  </skill>",
    ].join("\n"),
  );
});

test("analyzeSkillBudget prices only the skills Pi exposes to the model", () => {
  const budget = analyzeSkillBudget(FIXTURES);
  assert.deepEqual(budget.skills, [
    { name: "demo", modelInvocable: true, characters: 169 },
    { name: "hidden", modelInvocable: false, characters: 156 },
    { name: "quoted", modelInvocable: true, characters: 143 },
    { name: "noName", modelInvocable: true, characters: 159 },
  ]);
  assert.deepEqual(
    {
      total: budget.total,
      modelInvocable: budget.modelInvocable,
      filtered: budget.filtered,
      characters: budget.characters,
      estimatedTokens: budget.estimatedTokens,
    },
    { total: 4, modelInvocable: 3, filtered: 1, characters: 473, estimatedTokens: 118 },
  );
});

test("analyzeSkillBudget reports this repo's real skills directory", () => {
  const budget = analyzeSkillBudget(readSkillSources(REPO_SKILLS));
  const dirs = readdirSync(REPO_SKILLS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const name of dirs) {
    assert.ok(existsSync(join(REPO_SKILLS, name, "SKILL.md")), `${name}/SKILL.md is missing`);
  }
  assert.deepEqual(
    budget.skills.map((skill) => skill.name).sort(),
    [...dirs].sort(),
    "every skill directory must be priced, and nothing outside them",
  );
  assert.deepEqual(
    { total: budget.total, modelInvocable: budget.modelInvocable, filtered: budget.filtered },
    { total: 50, modelInvocable: 5, filtered: 45 },
    "the exposure counts changed; a sync that changes a disable-model-invocation flag lands here",
  );
  assert.deepEqual(
    budget.skills.filter((skill) => skill.modelInvocable).map((skill) => skill.name),
    ["control-cli", "control-ui", "create-skill", "deslop", "setup-pstack"],
    "the set of skills Pi offers changed; this usually means upstream changed a disable-model-invocation flag, so update the README exposure claim and docs/compare.md together with this test",
  );
  assert.equal(budget.modelInvocable + budget.filtered, dirs.length);
});
