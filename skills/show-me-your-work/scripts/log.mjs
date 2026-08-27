#!/usr/bin/env node
// Append a well-formed row to a show-me-your-work decision log (TSV), cross-platform.
// Usage: node log.mjs <logfile> <phase> <decision> <why> <evidence> <result>
import { mkdirSync, appendFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
if (args.length !== 6) {
  process.stderr.write("usage: log.mjs <logfile> <phase> <decision> <why> <evidence> <result>\n");
  process.exit(1);
}

const [logfile, ...cells] = args;
const dir = dirname(logfile);
if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });

// Strip tabs/newlines/CR so cells stay on one line, and prefix any cell
// whose first char a spreadsheet would parse as a formula (=, +, -, @)
// with a single quote. The skill expects this log to be read in
// spreadsheets, so attacker-controlled evidence (PR titles, filenames,
// generated text) must not become formula execution when a reviewer
// opens the file.
const clean = (value) => {
  const text = String(value).replace(/[\t\n\r]+/g, " ");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

if (!existsSync(logfile)) writeFileSync(logfile, "ts\tphase\tdecision\twhy\tevidence\tresult\n");
const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
appendFileSync(logfile, `${ts}\t${cells.map(clean).join("\t")}\n`);