#!/usr/bin/env node
// Cross-platform scan for Cursor-only references that break on Pi.
// Exit 0 when clean; exit 1 when operatives remain (documentational Pi notes approved).
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
const PAT = /grok-4\.6|claude-fable|gpt-5\.6-sol|claude-opus|~\/\.cursor|api2\.cursor\.sh|AskQuestion|subagent_type|Task\(model|pstack-models\.mdc|\/add-plugin/;
const DOC_PAT = /pi note|does not use|do NOT write|migrate then ignore|ignore.*mdc/i;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const hits = [];
for (const base of ["skills", "agents", "docs"]) {
  const dir = join(root, base);
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    if (!/\.(md|ts|sh|mjs|js)$/.test(file)) continue;
    if (PAT.test(readFileSync(file, "utf8"))) hits.push(file);
  }
}

if (hits.length === 0) {
  console.log("clean: no Cursor-only references found.");
  process.exit(0);
}

console.log("Cursor-only references found (review before ship):");
for (const file of hits) console.log(`  ${file}`);
console.log("\nmatches that are likely Pi-note documentation:");
let any = false;
for (const file of hits) {
  readFileSync(file, "utf8").split("\n").forEach((line, index) => {
    if (PAT.test(line) && DOC_PAT.test(line)) {
      console.log(`${file}:${index + 1}:${line}`);
      any = true;
    }
  });
}
if (!any) console.log("(none)");
process.exit(1);