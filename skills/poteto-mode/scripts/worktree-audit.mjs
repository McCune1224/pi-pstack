#!/usr/bin/env node
// Read-only worktree prune audit, cross-platform (Node only).
// Classifies every git worktree by size, merge state, uncommitted work,
// remote/PR state, and the most recent chat that operated in it. Emits a
// table sorted by size with a suggested bucket. Never deletes anything;
// deletion stays a human-gated step in the playbook.
//
// Usage: node worktree-audit.mjs [repo-path]   (defaults to the current repo)
import { statSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const cwd = process.cwd();
function git(args, opts = {}) {
  const result = spawnSync("git", args, { encoding: "utf8", cwd: opts.cwd ?? cwd });
  return { ok: result.status === 0, out: (result.stdout ?? "").trim(), err: (result.stderr ?? "").trim() };
}

let repo = process.argv[2];
if (!repo) repo = git(["rev-parse", "--show-toplevel"]).out;
if (!repo || !existsSync(repo)) {
  process.stderr.write("not in a git repo; pass a repo path\n");
  process.exit(1);
}

const worktrees = [];
let block = null;
for (const line of git(["worktree", "list", "--porcelain"], { cwd: repo }).out.split("\n")) {
  if (line.startsWith("worktree ")) {
    if (block) worktrees.push(block);
    block = { path: line.slice("worktree ".length) };
  } else if (line.startsWith("branch ")) {
    block.branch = line.slice("branch ".length);
  } else if (line === "") {
    if (block) worktrees.push(block);
    block = null;
  }
}
if (block) worktrees.push(block);
const mainWorktree = worktrees[0]?.path;
if (!mainWorktree) {
  process.stderr.write("could not determine the main worktree\n");
  process.exit(1);
}

git(["fetch", "origin", "main", "--quiet"], { cwd: repo });

let prs = [];
{
  const result = spawnSync("gh", ["pr", "list", "--author", "@me", "--state", "all", "--limit", "1000", "--json", "number,state,headRefName"], { encoding: "utf8", cwd: repo });
  if (result.status === 0 && result.stdout) {
    try { prs = JSON.parse(result.stdout); } catch { prs = []; }
  }
}
const prForBranch = new Map(prs.map((pr) => [pr.headRefName, `#${pr.number}/${pr.state}`]));

function subtreeBytes(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const entry = stack.pop();
    const stats = statSync(entry, { throwIfNoEntry: false });
    if (!stats) continue;
    if (stats.isDirectory()) {
      let children;
      try { children = readdirSync(entry); } catch { continue; }
      for (const child of children) stack.push(join(entry, child));
    } else if (stats.isFile()) {
      total += stats.size;
    }
  }
  return total;
}

function formatBytes(bytes) {
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(1)}G`;
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)}M`;
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(0)}K`;
  return `${bytes}B`;
}

// Most recent chat whose transcript operated in this worktree. Match path
// followed by "/" or a quote so glint-482 does not match glint-482-r37.
function lastChat(transcriptsDir, worktreePath) {
  if (!existsSync(transcriptsDir)) return { ts: 0, day: "-" };
  const needle1 = `${worktreePath}/`;
  const needle2 = `${worktreePath}"`;
  let lastTs = 0;
  const stack = [transcriptsDir];
  while (stack.length) {
    const entry = stack.pop();
    const stats = statSync(entry, { throwIfNoEntry: false });
    if (!stats) continue;
    if (stats.isDirectory()) {
      let children;
      try { children = readdirSync(entry); } catch { continue; }
      for (const child of children) stack.push(join(entry, child));
      continue;
    }
    if (stats.size > 16 * 1024 * 1024) continue;
    let text;
    try { text = readFileSync(entry, "utf8"); } catch { continue; }
    if (text.includes(needle1) || text.includes(needle2)) {
      if (stats.mtimeMs > lastTs) lastTs = stats.mtimeMs;
    }
  }
  if (!lastTs) return { ts: 0, day: "-" };
  return { ts: lastTs, day: new Date(lastTs).toISOString().slice(0, 10) };
}

const slug = mainWorktree.replace(/^[\\/]+/, "").replace(/[\\/]+/g, "-");
const transcriptsRoot = join(homedir(), ".pi", "agent", "sessions", slug);
const now = Date.now() / 1000;

const rows = [];
for (const wt of worktrees) {
  if (wt.path === mainWorktree) continue;

  const head = git(["rev-parse", "HEAD"], { cwd: wt.path }).out;
  const headTs = Number(git(["log", "-1", "--format=%ct", "HEAD"], { cwd: wt.path }).out) || 0;
  const age = headTs > 0 ? `${Math.floor((now - headTs) / 86400)}d` : "?";
  const merged = git(["merge-base", "--is-ancestor", head, "origin/main"], { cwd: repo }).ok ? "YES" : "no";

  const porcelain = git(["status", "--porcelain"], { cwd: wt.path }).out.split("\n").filter(Boolean);
  let dirty;
  if (porcelain.length === 0) {
    dirty = "clean";
  } else {
    const tracked = porcelain.filter((line) => !line.startsWith("??"));
    const scratch = porcelain.length - tracked.length;
    dirty = tracked.length > 0 ? `wip:${tracked.length}` : `scratch:${scratch}`;
  }

  const branchRef = git(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: wt.path }).out;
  let remote = "detached";
  if (branchRef) {
    const hasRemote = git(["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branchRef}`], { cwd: wt.path }).ok;
    if (!hasRemote) {
      remote = "no-remote";
    } else if (git(["rev-parse", `origin/${branchRef}`], { cwd: wt.path }).out === head) {
      remote = "pushed";
    } else {
      const ahead = git(["rev-list", "--count", `origin/${branchRef}..HEAD`], { cwd: wt.path }).out;
      remote = `ahead${ahead}`;
    }
  }

  const pr = branchRef ? prForBranch.get(branchRef) ?? "-" : "-";
  const chat = lastChat(transcriptsRoot, wt.path);
  const recent = chat.ts > 0 && (now - chat.ts) / 86400 <= 4;

  let bucket;
  if (dirty.startsWith("wip:")) bucket = "hold-wip";
  else if (pr.includes("OPEN")) bucket = "hold-open-pr";
  else if (recent) bucket = "verify-recent-chat";
  else if (merged === "YES" || pr !== "-") bucket = "safe";
  else bucket = "review";

  rows.push({
    size: subtreeBytes(wt.path),
    age,
    merged,
    dirty,
    remote,
    pr,
    last: chat.day,
    bucket,
    path: wt.path,
  });
}

console.log("SIZE\tAGE\tMERGED\tDIRTY\tREMOTE\tPR\tLAST_CHAT\tBUCKET\tWORKTREE");
for (const row of rows.sort((a, b) => b.size - a.size)) {
  console.log(
    [formatBytes(row.size), row.age, row.merged, row.dirty, row.remote, row.pr, row.last, row.bucket, row.path].join("\t"),
  );
}