import { createHash } from "node:crypto";

const GLOB_SPECIAL = /[.+^${}()|[\]\\]/g;

export const RULE_KINDS = new Set(["substitute", "insert", "exclude", "add", "override"]);

export function hashContent(content) {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

export function globToRegExp(glob) {
  const source = glob
    .replace(GLOB_SPECIAL, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*\*/g, "\u0001")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\u0001/g, ".*");
  return new RegExp(`^${source}$`);
}

export function matchGlob(glob, path) {
  return globToRegExp(glob).test(path);
}

export function globsOf(spec, kind) {
  return spec.rules.filter((rule) => rule.kind === kind).map((rule) => rule.path);
}

export function matchesAny(globs, path) {
  return globs.some((glob) => matchGlob(glob, path));
}

const REQUIRED_FIELDS = {
  substitute: ["id", "path", "find", "replace", "reason"],
  insert: ["id", "path", "anchor", "position", "text", "reason"],
  exclude: ["id", "path", "reason"],
  add: ["id", "path", "reason"],
  override: ["id", "path", "basedOn", "reason"],
};

export function validateSpec(spec) {
  const problems = [];
  if (!spec || typeof spec !== "object") return ["spec is not an object"];
  if (typeof spec.upstream?.ref !== "string" || !spec.upstream.ref) {
    problems.push("upstream.ref is required");
  }
  if (!Array.isArray(spec.rules)) return [...problems, "rules must be an array"];
  const seen = new Set();
  spec.rules.forEach((rule, index) => {
    const label = `rules[${index}]${rule?.id ? ` (${rule.id})` : ""}`;
    if (!RULE_KINDS.has(rule?.kind)) {
      problems.push(`${label}: unknown kind ${JSON.stringify(rule?.kind)}`);
      return;
    }
    for (const field of REQUIRED_FIELDS[rule.kind]) {
      if (typeof rule[field] !== "string" || rule[field] === "") {
        problems.push(`${label}: ${field} must be a non-empty string`);
      }
    }
    if (rule.kind === "insert" && !["before", "after"].includes(rule.position)) {
      problems.push(`${label}: position must be "before" or "after"`);
    }
    if (rule.id) {
      if (seen.has(rule.id)) problems.push(`${label}: duplicate id`);
      seen.add(rule.id);
    }
  });
  return problems;
}

function applySubstitute(content, rule) {
  if (rule.regex) {
    const pattern = new RegExp(rule.find, "g");
    return content.replace(pattern, rule.replace);
  }
  return content.includes(rule.find) ? content.replaceAll(rule.find, rule.replace) : content;
}

function applyInsert(content, rule) {
  const pattern = new RegExp(rule.anchor, "m");
  const match = pattern.exec(content);
  if (!match) return content;
  const lineStart = match.index;
  const lineEnd = content.indexOf("\n", lineStart);
  const insertAt = rule.position === "before" || lineEnd === -1
    ? lineStart
    : lineEnd + 1;
  const block = content.endsWith("\n") || insertAt === 0 ? `${rule.text}\n` : rule.text;
  return content.slice(0, insertAt) + block + content.slice(insertAt);
}

export function applyRules(content, path, rules) {
  let out = content;
  const applied = [];
  for (const rule of rules) {
    if (rule.kind !== "substitute" && rule.kind !== "insert") continue;
    if (!matchGlob(rule.path, path)) continue;
    const next = rule.kind === "substitute" ? applySubstitute(out, rule) : applyInsert(out, rule);
    if (next !== out) {
      applied.push(rule.id);
      out = next;
    }
  }
  return { content: out, applied };
}

export function overrideFor(spec, path) {
  return spec.rules.find((rule) => rule.kind === "override" && matchGlob(rule.path, path));
}
