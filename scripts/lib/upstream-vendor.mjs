import { spawnSync } from "node:child_process";

export function git(upstreamDir, args, encoding = "utf8") {
  const result = spawnSync("git", ["-C", upstreamDir, ...args], {
    encoding,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${upstreamDir}: ${result.stderr?.toString().trim() ?? ""}`);
  }
  return result.stdout;
}

export function upstreamVersion(upstreamDir, ref) {
  const raw = git(upstreamDir, ["show", `${ref}:pstack/.cursor-plugin/plugin.json`]);
  return JSON.parse(raw).version;
}

export function isBinary(buffer) {
  return buffer.includes(0);
}

export function readUpstreamTree(upstreamDir, ref, subtrees = ["skills", "agents", "docs"]) {
  const pathspecs = subtrees.map((subtree) => `pstack/${subtree}`);
  const listed = git(upstreamDir, ["ls-tree", "-r", "--name-only", ref, "--", ...pathspecs]);
  const files = new Map();
  for (const line of listed.split("\n")) {
    if (!line) continue;
    files.set(line.replace(/^pstack\//, ""), git(upstreamDir, ["show", `${ref}:${line}`], null));
  }
  return files;
}
