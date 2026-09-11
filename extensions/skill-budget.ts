import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface SkillSource {
  path: string;
  content: string;
}

export interface SkillCost {
  name: string;
  modelInvocable: boolean;
  characters: number;
}

export interface SkillBudget {
  total: number;
  modelInvocable: number;
  filtered: number;
  characters: number;
  estimatedTokens: number;
  skills: SkillCost[];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function frontmatter(content: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  return match ? match[1] : "";
}

function frontmatterField(frontmatterText: string, key: string): string | undefined {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(frontmatterText);
  if (!match) return undefined;
  const raw = match[1].trim();
  if (raw.length > 1 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return raw.replace(/[ \t]+#.*$/, "");
}

// Pi filters on a YAML boolean true, so the string "true" stays model-invocable.
function yamlBooleanTrue(frontmatterText: string, key: string): boolean {
  const match = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(frontmatterText);
  if (!match) return false;
  return /^(?:true|True|TRUE)$/.test(match[1].trim().replace(/[ \t]+#.*$/, ""));
}

export function promptBlockEntry(name: string, description: string, location: string): string {
  return [
    "  <skill>",
    `    <name>${escapeXml(name)}</name>`,
    `    <description>${escapeXml(description)}</description>`,
    `    <location>${escapeXml(location)}</location>`,
    "  </skill>",
  ].join("\n");
}

export function readSkillSources(skillsDir: string): SkillSource[] {
  const sources: SkillSource[] = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(skillsDir, entry.name, "SKILL.md");
    if (!existsSync(path)) continue;
    sources.push({ path, content: readFileSync(path, "utf8") });
  }
  return sources;
}

export function analyzeSkillBudget(sources: SkillSource[]): SkillBudget {
  const skills: SkillCost[] = [];
  for (const source of sources) {
    const frontmatterText = frontmatter(source.content);
    const description = frontmatterField(frontmatterText, "description");
    if (!description) continue;
    const name = frontmatterField(frontmatterText, "name") || basename(dirname(source.path));
    skills.push({
      name,
      modelInvocable: !yamlBooleanTrue(frontmatterText, "disable-model-invocation"),
      characters: promptBlockEntry(name, description, source.path).length,
    });
  }
  const exposed = skills.filter((skill) => skill.modelInvocable);
  // Pi pushes each entry into the same lines array, so every entry also pays a newline.
  const characters =
    exposed.reduce((sum, skill) => sum + skill.characters, 0) + Math.max(exposed.length - 1, 0);
  return {
    total: skills.length,
    modelInvocable: exposed.length,
    filtered: skills.length - exposed.length,
    characters,
    estimatedTokens: Math.round(characters / 4),
    skills,
  };
}
