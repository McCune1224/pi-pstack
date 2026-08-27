#!/usr/bin/env node
// Cross-platform re-vendor of the upstream pstack tree (no bash required).
// Copies skills/agents/docs/LICENSE, drops Cursor-bound pieces (grokbot,
// the benny automation pack), then runs the Pi-isms scanner.
import { rmSync, cpSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM = process.argv[2] ?? "/tmp/plugins/pstack";

if (!existsSync(join(UPSTREAM, "skills"))) {
  console.error(`upstream not found: ${UPSTREAM} (pass the path to a cursor/plugins checkout)`);
  process.exit(1);
}

for (const dir of ["skills", "agents", "docs"]) {
  rmSync(join(ROOT, dir), { recursive: true, force: true });
  cpSync(join(UPSTREAM, dir), join(ROOT, dir), { recursive: true });
}
cpSync(join(UPSTREAM, "LICENSE"), join(ROOT, "LICENSE"));

// grokbot's webhook panels and the benny automation pack cannot run on Pi.
rmSync(join(ROOT, "skills", "grokbot"), { recursive: true, force: true });
rmSync(join(ROOT, "automations"), { recursive: true, force: true });

console.log(`vendored from ${UPSTREAM}`);
const result = spawnSync(process.execPath, [join(ROOT, "scripts", "check-pi-isms.mjs"), ROOT], {
  stdio: "inherit",
});
console.log("review the scanner output above; re-apply the Pi deltas, then commit.");
process.exit(result.status ?? 0);