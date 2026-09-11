#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyRules, globsOf, hashContent, matchGlob, matchesAny, overrideFor, validateSpec } from "./lib/pi-delta-rules.mjs";
import { isBinary, readUpstreamTree, upstreamVersion } from "./lib/upstream-vendor.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENDORED = ["skills", "agents", "docs"];

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const upstreamDir = resolve(arg("--upstream", "/tmp/upstream-plugins"));
const specPath = resolve(arg("--spec", join(ROOT, "scripts", "pi-deltas.json")));
const treeRoot = resolve(arg("--root", ROOT));
const jsonPath = arg("--json", "");
const acceptOverrides = process.argv.includes("--accept-overrides");

if (!existsSync(join(upstreamDir, ".git"))) {
  console.error(`upstream checkout missing at ${upstreamDir}`);
  console.error("clone it first:  git clone --depth 400 https://github.com/cursor/plugins.git /tmp/upstream-plugins");
  process.exit(2);
}

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const problems = validateSpec(spec);
if (problems.length > 0) {
  console.error("pi-deltas.json is invalid:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(2);
}

const upstream = readUpstreamTree(upstreamDir, spec.upstream.ref, VENDORED);
const version = upstreamVersion(upstreamDir, spec.upstream.ref);

if (acceptOverrides) {
  let updated = 0;
  for (const rule of spec.rules) {
    if (rule.kind !== "override") continue;
    const source = upstream.get(rule.path);
    if (source === undefined) {
      console.error(`override ${rule.id}: ${rule.path} is not present upstream; declare it as an add instead`);
      process.exit(2);
    }
    const next = hashContent(source);    if (next !== rule.basedOn) {
      rule.basedOn = next;
      updated++;
    }
  }
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`re-baselined ${updated} override(s) in ${specPath}`);
  console.log("review that you merged the upstream changes into each override before committing.");
  process.exit(0);
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

const localFiles = new Set();
for (const subtree of VENDORED) {
  const dir = join(treeRoot, subtree);
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) localFiles.add(relative(treeRoot, file));
}

const excludeGlobs = globsOf(spec, "exclude");
const addGlobs = globsOf(spec, "add");
const match = [];
const delta = [];
const overrides = [];
const unexplained = [];
const excluded = [];
const added = [];
const usedRuleIds = new Set();

for (const [path, upstreamContent] of upstream) {
  if (matchesAny(excludeGlobs, path)) {
    excluded.push(path);
    usedRuleIds.add(spec.rules.find((rule) => rule.kind === "exclude" && matchGlob(rule.path, path)).id);
    if (localFiles.has(path)) unexplained.push({ path, reason: "declared exclude but the file is present locally" });
    continue;
  }
  const override = overrideFor(spec, path);
  if (override) {
    usedRuleIds.add(override.id);
    const localPath = join(treeRoot, path);
    if (!existsSync(localPath)) {
      unexplained.push({ path, reason: `override ${override.id} declares this file, but it is missing locally` });
      continue;
    }
    const actual = hashContent(upstreamContent);
    if (actual === override.basedOn) {
      overrides.push({ path, rules: [override.id] });
    } else {
      unexplained.push({
        path,
        reason: `override ${override.id} is stale: upstream content changed since it was baselined. Merge the upstream edits into the local file, then run --accept-overrides.`,
      });
    }
    continue;
  }
  const localPath = join(treeRoot, path);
  if (!existsSync(localPath) || !statSync(localPath).isFile()) {
    unexplained.push({ path, reason: "present upstream, missing locally, not declared as an exclude" });
    continue;
  }
  if (isBinary(upstreamContent)) {
    if (readFileSync(localPath).equals(upstreamContent)) match.push(path);
    else unexplained.push({ path, reason: "binary file differs and rules cannot explain it" });
    continue;
  }
  const upstreamText = upstreamContent.toString("utf8");
  const { content, applied } = applyRules(upstreamText, path, spec.rules);
  for (const id of applied) usedRuleIds.add(id);
  const local = readFileSync(localPath, "utf8");
  if (local === content) {
    if (applied.length > 0) delta.push({ path, rules: applied });
    else match.push(path);
  } else {
    unexplained.push({ path, reason: "local content differs and no rule explains it" });
  }
}

for (const path of localFiles) {
  if (upstream.has(path)) continue;
  const add = spec.rules.find((rule) => rule.kind === "add" && matchGlob(rule.path, path));
  if (add) {
    usedRuleIds.add(add.id);
    added.push(path);
    continue;
  }
  unexplained.push({ path, reason: "present locally, absent upstream, not declared as an add" });
}

const staleRules = spec.rules
  .filter((rule) => rule.kind === "substitute" || rule.kind === "insert")
  .filter((rule) => !usedRuleIds.has(rule.id))
  .map((rule) => rule.id);
const staleStructural = spec.rules
  .filter((rule) => rule.kind === "exclude" || rule.kind === "add" || rule.kind === "override")
  .filter((rule) => !usedRuleIds.has(rule.id))
  .map((rule) => rule.id);

const report = {
  generatedAt: new Date().toISOString(),
  tree: treeRoot,
  upstream: { dir: upstreamDir, ref: spec.upstream.ref, version },
  counts: {
    upstreamFiles: upstream.size,
    match: match.length,
    delta: delta.length,
    override: overrides.length,
    excluded: excluded.length,
    added: added.length,
    unexplained: unexplained.length,
    staleRules: staleRules.length + staleStructural.length,
  },
  delta,
  overrides,
  excluded,
  added,
  unexplained: unexplained.map(({ path, reason }) => ({ path, reason })),
  staleRules: [...staleRules, ...staleStructural],
};

console.log(`upstream ${version} @ ${spec.upstream.ref.slice(0, 12)} (${upstreamDir})`);
console.log(`  match (verbatim upstream): ${match.length}`);
console.log(`  pi-delta (rule-explained): ${delta.length}`);
console.log(`  override (ours, baselined): ${overrides.length}`);
console.log(`  excluded (declared):       ${excluded.length}`);
console.log(`  added (ours only):         ${added.length}`);
console.log(`  unexplained:               ${unexplained.length}`);
console.log(`  stale rules:               ${report.counts.staleRules}`);
if (delta.length > 0) {
  console.log("\nrule-explained deltas:");
  for (const entry of delta) console.log(`  ${entry.path}  <- ${entry.rules.join(", ")}`);
}
if (overrides.length > 0) {
  console.log("\noverrides (ours, baselined against upstream):");
  for (const entry of overrides) console.log(`  ${entry.path}  <- ${entry.rules.join(", ")}`);
}
if (unexplained.length > 0) {
  console.log("\nUNEXPLAINED (declare a rule in scripts/pi-deltas.json, or let the sync vendor it):");
  for (const entry of unexplained) console.log(`  ${entry.path}: ${entry.reason}`);
}
if (report.counts.staleRules > 0) {
  console.log("\nSTALE RULES (upstream moved; retire or retarget these):");
  for (const id of report.staleRules) console.log(`  ${id}`);
}

if (jsonPath) {
  writeFileSync(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nreport: ${resolve(jsonPath)}`);
}

const ok = unexplained.length === 0 && report.counts.staleRules === 0;
console.log(`\n${ok ? "PASS" : "FAIL"} (scripts/verify-sync.mjs)`);
process.exit(ok ? 0 : 1);
