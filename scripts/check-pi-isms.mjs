#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = process.argv[2] ? resolve(process.argv[2]) : process.cwd();

const COUPLING = [
  "grok-4\\.6",
  "claude-fable",
  "gpt-5\\.6-sol",
  "claude-opus",
  "api2\\.cursor\\.sh",
  "AskQuestion",
  "subagent_type",
  "Task\\(model",
  "pstack-models\\.mdc",
  "/add-plugin",
  "cursor-team-kit",
  "Cursor's",
  "Cursor cloud",
  "Cursor environment",
  "Cursor restart",
  "Cursor dashboard",
  "\\.cursor/",
  "cloud agent",
  "cloud root",
  "cloud VM",
  "cloud-sleeper",
  'environment: "cloud"',
  "agent-transcripts",
  "(?<![a-z-])/loop(?![a-z-])",
  "pstack/skills/",
];

const PAT = new RegExp(COUPLING.join("|"), "i");

const ALLOWED = [
  {
    prefix: "skills/poteto-mode/scripts/watch-pr/",
    why: "Detects Cursor's bugbot review comments on GitHub, which is a real GitHub app and still worth gating on.",
  },
  {
    prefix: "docs/compare.md",
    why: "This file exists to name what differs from upstream and from the other Pi port, so it has to name the things it excludes.",
  },
];

function allowed(path) {
  return ALLOWED.some((entry) => path.startsWith(entry.prefix));
}

const DOC_PAT = /pi note|has no|does not|do not route|instead|never require|not a pstack skill|do NOT write/i;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const action = [];
const documented = [];
const skipped = [];
const emDashes = [];
const brokenLinks = [];

for (const base of ["skills", "agents", "docs"]) {
  const dir = join(root, base);
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    if (!/\.(md|ts|sh|mjs|js)$/.test(file)) continue;
    const rel = file.replace(`${root}/`, "");
    const source = readFileSync(file, "utf8");
    if (file.endsWith(".md")) {
      for (const match of source.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1].split("#")[0];
        if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || allowed(rel)) continue;
        if (!/[./]/.test(target)) continue;
        if (!existsSync(resolve(dirname(file), target))) brokenLinks.push({ file: rel, line: 0, text: target });
      }
    }
    source.split("\n").forEach((line, index) => {
      if (/\u2014/.test(line) && !allowed(rel)) {
        emDashes.push({ file: rel, line: index + 1, text: line.trim().slice(0, 150) });
      }
      if (!PAT.test(line)) return;
      const hit = { file: rel, line: index + 1, text: line.trim().slice(0, 150) };
      if (allowed(rel)) skipped.push(hit);
      else if (DOC_PAT.test(line)) documented.push(hit);
      else action.push(hit);
    });
  }
}

for (const hit of action) console.log(`ACTION ${hit.file}:${hit.line}: ${hit.text}`);
for (const hit of skipped) console.log(`allowed ${hit.file}:${hit.line}: ${hit.text}`);
for (const hit of emDashes) console.log(`EM-DASH ${hit.file}:${hit.line}: ${hit.text}`);
for (const hit of brokenLinks) console.log(`LINK ${hit.file}: ${hit.text}`);

console.log(`\n${action.length} Cursor-coupling, ${emDashes.length} long-dash character, ${brokenLinks.length} broken relative link, ${documented.length} documented as a Pi note, ${skipped.length} allowlisted.`);
if (action.length === 0 && emDashes.length === 0 && brokenLinks.length === 0) {
  console.log("clean: no unexplained Cursor coupling, no long-dash characters, and every relative link resolves.");
  process.exit(0);
}
process.exit(1);
