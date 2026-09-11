#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyRules, globsOf, matchesAny, overrideFor, validateSpec } from "./lib/pi-delta-rules.mjs";
import { isBinary, readUpstreamTree, upstreamVersion } from "./lib/upstream-vendor.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VENDORED = ["skills", "agents", "docs"];

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const upstreamDir = resolve(arg("--upstream", "/tmp/upstream-plugins"));
const outDir = resolve(arg("--out", ROOT));
const specPath = resolve(arg("--spec", join(ROOT, "scripts", "pi-deltas.json")));
const checkOnly = process.argv.includes("--check-only");

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const problems = validateSpec(spec);
if (problems.length > 0) {
  console.error("pi-deltas.json is invalid:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(2);
}
if (!existsSync(join(upstreamDir, ".git"))) {
  console.error(`upstream checkout missing at ${upstreamDir}`);
  console.error("clone it first:  git clone --depth 400 https://github.com/cursor/plugins.git /tmp/upstream-plugins");
  process.exit(2);
}

const version = upstreamVersion(upstreamDir, spec.upstream.ref);
if (spec.upstream.version !== version) {
  console.error(`pi-deltas.json pins ${spec.upstream.version} but ${spec.upstream.ref} is ${version}`);
  process.exit(2);
}

const upstream = readUpstreamTree(upstreamDir, spec.upstream.ref, VENDORED);
const excludeGlobs = globsOf(spec, "exclude");
const addGlobs = globsOf(spec, "add");

const serialized = new Map();
for (const [path, content] of upstream) {
  if (matchesAny(excludeGlobs, path)) continue;
  if (overrideFor(spec, path)) continue;
  serialized.set(path, isBinary(content) ? content : applyRules(content.toString("utf8"), path, spec.rules).content);
}

const preserved = new Set();
for (const subtree of VENDORED) {
  const dir = join(outDir, subtree);
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const path = relative(outDir, file);
    if (matchesAny(addGlobs, path)) preserved.add(path);
  }
}

const undeclared = [];
for (const subtree of VENDORED) {
  const dir = join(outDir, subtree);
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const path = relative(outDir, file);
    if (serialized.has(path) || preserved.has(path)) continue;
    if (upstream.has(path) && overrideFor(spec, path)) continue;
    undeclared.push(path);
  }
}
const toDelete = undeclared.filter((path) => upstream.has(path) || matchesAny(excludeGlobs, path));
const orphaned = undeclared.filter((path) => !toDelete.includes(path));

if (!checkOnly) {
  for (const path of toDelete) rmSync(join(outDir, path));
}

const pending = [...serialized.entries()];
const changed = [];
for (const [path, content] of pending) {
  const target = join(outDir, path);
  const before = existsSync(target) ? readFileSync(target) : null;
  const same = before !== null && (typeof content === "string" ? before.toString("utf8") === content : before.equals(content));
  if (same) continue;
  changed.push(path);
  if (checkOnly) continue;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

console.log(`upstream ${version} @ ${spec.upstream.ref.slice(0, 12)}`);
console.log(`  vendored files: ${serialized.size}`);
console.log(`  ours-only preserved: ${preserved.size}`);
console.log(`  removed (upstream dropped them): ${toDelete.length}`);
console.log(`  written: ${changed.length}`);
if (changed.length > 0) for (const path of changed) console.log(`  ${checkOnly ? "would write" : "wrote"} ${path}`);
if (toDelete.length > 0) for (const path of toDelete) console.log(`  ${checkOnly ? "would remove" : "removed"} ${path}`);
if (orphaned.length > 0) {
  console.log("\nORPHANED (ours only, undeclared; left in place, declare an add rule or delete):");
  for (const path of orphaned) console.log(`  ${path}`);
}

const verify = spawnSync(process.execPath, [join(ROOT, "scripts", "verify-sync.mjs"), "--upstream", upstreamDir, "--spec", specPath, "--root", outDir], {
  stdio: "inherit",
});
const scanner = spawnSync(process.execPath, [join(ROOT, "scripts", "check-pi-isms.mjs"), outDir], { stdio: "inherit" });
process.exit((verify.status ?? 1) || (scanner.status ?? 1) || (orphaned.length > 0 ? 1 : 0));
