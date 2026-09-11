#!/usr/bin/env node
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const upstream = resolve(process.argv[2] ?? "/tmp/upstream-plugins");

if (!existsSync(join(upstream, ".git"))) {
  console.error(`upstream checkout missing at ${upstream}`);
  console.error("clone it first:  git clone --depth 400 https://github.com/cursor/plugins.git /tmp/upstream-plugins");
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), "pi-pstack-guards-"));
for (const entry of ["skills", "agents", "docs", "scripts"]) {
  cpSync(join(ROOT, entry), join(work, entry), { recursive: true });
}

const specPath = join(work, "scripts", "pi-deltas.json");

function verifySync() {
  const result = spawnSync(
    process.execPath,
    [join(work, "scripts", "verify-sync.mjs"), "--upstream", upstream, "--spec", specPath, "--root", work],
    { encoding: "utf8" },
  );
  return { code: result.status ?? 1, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function readSpec() {
  return JSON.parse(readFileSync(specPath, "utf8"));
}

function writeSpec(spec) {
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
}

function editRule(id, patch) {
  const spec = readSpec();
  const rule = spec.rules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`no rule named ${id} to mutate`);
  Object.assign(rule, patch);
  writeSpec(spec);
}

const guards = [
  {
    name: "a hand edit to a vendored file is caught",
    why: "this is the case that would make the whole check self-certifying if it failed to fail",
    mutate: () => appendFileSync(join(work, "skills", "how", "SKILL.md"), "\nedited by hand\n"),
    expect: (out) => out.includes("skills/how/SKILL.md") && out.includes("FAIL"),
  },
  {
    name: "deleting a rule is caught",
    why: "rules are load-bearing, so removing one has to surface as unexplained content",
    mutate: () => {
      const spec = readSpec();
      spec.rules = spec.rules.filter((rule) => rule.id !== "pi-dir-skills");
      writeSpec(spec);
    },
    expect: (out) => /unexplained:\s+[1-9]/.test(out) && out.includes("FAIL"),
  },
  {
    name: "a rule whose find no longer matches is caught as stale",
    why: "upstream moving the text a rule targets is the failure this port exists to prevent",
    mutate: () => editRule("pi-dir-skills", { find: ".cursor/skills-that-do-not-exist/" }),
    expect: (out) => out.includes("STALE RULES") && out.includes("pi-dir-skills"),
  },
  {
    name: "an override whose upstream baseline moved is caught",
    why: "an override silently reverting our version is the risk that makes overrides safe to use",
    mutate: () => editRule("override-poteto-mode-skill", { basedOn: `sha256:${"0".repeat(64)}` }),
    expect: (out) => out.includes("override-poteto-mode-skill is stale") && out.includes("FAIL"),
  },
  {
    name: "declared excludes stay absent",
    why: "a file we declared out of scope reappearing locally should not pass silently",
    mutate: () => {
      const spec = readSpec();
      const dir = join(work, "skills", "make-bot-ui");
      cpSync(join(work, "skills", "control-ui"), dir, { recursive: true });
      return spec;
    },
    expect: (out) => out.includes("skills/make-bot-ui") && out.includes("FAIL"),
  },
];

const restore = () => {
  for (const entry of ["skills", "agents", "docs", "scripts"]) {
    rmSync(join(work, entry), { recursive: true, force: true });
    cpSync(join(ROOT, entry), join(work, entry), { recursive: true });
  }
};

const baseline = verifySync();
if (baseline.code !== 0) {
  console.error("baseline is not clean, so no guard can be evaluated:");
  console.error(baseline.out.trim().split("\n").slice(-6).join("\n"));
  rmSync(work, { recursive: true, force: true });
  process.exit(2);
}
console.log("baseline clean");

let failed = 0;
for (const guard of guards) {
  guard.mutate();
  const result = verifySync();
  const caught = result.code !== 0 && guard.expect(result.out);
  console.log(`${caught ? "caught " : "MISSED "} ${guard.name}`);
  if (!caught) {
    failed++;
    console.log(`  why it matters: ${guard.why}`);
    console.log(`  exit ${result.code}, output tail:`);
    console.log(result.out.trim().split("\n").slice(-4).map((line) => `    ${line}`).join("\n"));
  }
  restore();
}

const final = verifySync();
const restored = final.code === 0;
console.log(`${restored ? "restored" : "DIRTY  "} tree returns to a clean baseline after the mutations`);

rmSync(work, { recursive: true, force: true });

if (failed > 0 || !restored) {
  console.error(`\nFAIL: ${failed} guard(s) did not catch their mutation`);
  process.exit(1);
}
console.log(`\nPASS: all ${guards.length} guards catch their mutation and the tree is unchanged`);
