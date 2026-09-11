#!/usr/bin/env node
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

// A reviewer opens this log in a spreadsheet, so a cell beginning with =, +, -, or @
// must not become a formula when it holds generated or user-supplied text.
const clean = (value) => {
  const text = String(value).replace(/[\t\n\r]+/g, " ");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

if (!existsSync(logfile)) writeFileSync(logfile, "ts\tphase\tdecision\twhy\tevidence\tresult\n");
const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
appendFileSync(logfile, `${ts}\t${cells.map(clean).join("\t")}\n`);