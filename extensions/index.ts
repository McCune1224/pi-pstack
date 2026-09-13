import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONFIG_DIR_NAME,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { analyzeSkillBudget, readSkillSources } from "./skill-budget.ts";
import {
  POTETO_COMPACT_INSTRUCTIONS,
  loadConversationHelpers,
  runPotetoCompaction,
} from "./compaction.ts";
import {
  type DoctorCheck,
  checkAgentFrontmatter,
  checkModelMap,
  renderReport,
} from "./doctor.ts";
import {
  guardAdvice,
  guardLevel,
  isStronger,
  meterLine,
  type GuardLevel,
} from "./context-guard.ts";
import {
  BUDGETS,
  MODE_ENTRY_TYPE,
  POTETO_DIRECTIVE,
  ROLE_KEYS,
  availableModels,
  applyBudget,
  buildTier,
  lastModeEnabled,
  loadSettings,
  parseArgs,
  parseModelId,
  resolvedMapping,
  saveSettings,
  settingsPath,
  summaryText,
  budgetLabel,
  type BudgetKey,
  type ModeEntry,
  type ModelMap,
  type ModelSpec,
  type RoleKey,
  type Scope,
} from "./settings.ts";

const SKILLS_DIR = join(import.meta.dirname, "..", "skills");
const AGENTS_DIR = join(import.meta.dirname, "..", "agents");
const DELTAS_PATH = join(import.meta.dirname, "..", "scripts", "pi-deltas.json");

const PACKAGE_AGENTS = ["poteto-agent.md", "comment-sicko.md"];

const PLAYBOOK_COMPLETIONS: Array<{ value: string; label: string }> = (() => {
  try {
    return readdirSync(join(SKILLS_DIR, "poteto-mode", "playbooks"))
      .filter((file) => file.endsWith(".md"))
      .map((file) => ({ value: file.replace(/\.md$/, ""), label: file.replace(/\.md$/, "") }));
  } catch {
    return [];
  }
})();

const SETUP_COMPLETIONS = [
  "-l",
  "--local",
  "local",
  "inherit",
  "all-inherit",
  "light",
  "custom",
  "unlimited",
  "large",
  "medium",
  "small",
  "default",
  "scout",
  "worker",
  "reviewer",
  "oracle",
  "poteto-agent",
  "comment-sicko",
];

const PSTACK_SKILLS = new Set([
  "poteto-mode",
  "how",
  "why",
  "architect",
  "arena",
  "swarm",
  "interrogate",
  "reflect",
  "tdd",
  "unslop",
  "no-comments",
  "technical-writing",
  "bro",
  "teach",
  "automate-me",
  "recall",
  "blast-radius",
  "figure-it-out",
  "show-me-your-work",
  "create-verification-skill",
  "maintain-verification-skill",
  "typescript-best-practices",
  "setup-pstack",
  "deslop",
  "control-cli",
  "control-ui",
  "create-skill",
]);

function completions(prefix: string) {
  const items = SETUP_COMPLETIONS.map((value) => ({ value, label: value }));
  const filtered = items.filter((item) => item.value.startsWith(prefix));
  return filtered.length > 0 ? filtered : null;
}

const COMPANIONS = [
  {
    tool: "subagent",
    pkg: "npm:pi-subagents",
    required: true,
    why: "registers the subagent tool, reads this package's agents/, and backs every routed skill",
  },
  {
    tool: "todo",
    pkg: "npm:@juicesharp/rpiv-todo",
    required: false,
    why: "the playbooks open a todo list through it",
  },
  {
    tool: "ask_user_question",
    pkg: "npm:@juicesharp/rpiv-ask-user-question",
    required: false,
    why: "the skills name it when a decision needs the user",
  },
];

function pstackSkillNames(commands: Array<{ name: string; source: string }>): string[] {
  return commands
    .filter((command) => command.source === "skill")
    .map((command) => command.name.replace(/^skill:/, "").replace(/:\d+$/, ""))
    .filter((name) => PSTACK_SKILLS.has(name) || name.startsWith("principle-"))
    .sort();
}

function effectiveModelMap(cwd: string): { map: ModelMap; scope: Scope | "none"; path: string } {
  const userPath = settingsPath(cwd, "user", CONFIG_DIR_NAME);
  const projectPath = settingsPath(cwd, "project", CONFIG_DIR_NAME);
  const projectMap = loadSettings(projectPath);
  if (Object.keys(projectMap).length > 0) {
    return { map: projectMap, scope: "project", path: projectPath };
  }
  const userMap = loadSettings(userPath);
  return {
    map: userMap,
    scope: Object.keys(userMap).length > 0 ? "user" : "none",
    path: userPath,
  };
}

function modelChoices(ctx: ExtensionCommandContext, currentValue: string) {
  return availableModels(ctx.modelRegistry.getAvailable()).map((choice) =>
    choice.id === currentValue ? `${choice.label}  [current]` : choice.label,
  );
}

async function announceAndReload(
  ctx: ExtensionCommandContext,
  path: string,
  map: ModelMap,
  scope: Scope,
): Promise<void> {
  ctx.ui.notify(
    `${summaryText(map, scope, [])}\nsettings: ${path}\nRun /reload to apply. Check /subagents-models after reload.`,
    "info",
  );
  if (ctx.hasUI && (await ctx.ui.confirm("Reload now?", "Applies the new model map immediately."))) {
    await ctx.reload();
  }
}

async function pstackSetupHandler(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const parsed = parseArgs(args);
  let scope: Scope | undefined = parsed.scope;
  if (!scope) {
    const label = ctx.hasUI
      ? await ctx.ui.select("Where to save the pstack model map?", [
          "User (~/.pi/agent/settings.json) - recommended",
          "Project (.pi/settings.json) - team shared",
        ])
      : "user";
    if (!label) return;
    scope = label.startsWith("Project") ? "project" : "user";
  }
  const path = settingsPath(ctx.cwd, scope, CONFIG_DIR_NAME);
  const current = loadSettings(path);

  // Fast paths (-l, a tier, or a bare role) skip the budget question, mirroring
  // upstream's budget-first flow only when the run is fully interactive.
  const hasFastPath = parsed.tier !== undefined || parsed.role !== undefined;
  let budget: BudgetKey | undefined = parsed.budget;
  if (!budget && ctx.hasUI && !hasFastPath) {
    const pick = await ctx.ui.select(
      `Reasoning budget for roles without their own level - now ${budgetLabel(current)}`,
      Object.entries(BUDGETS).map(([key, spec]) => `${key} - ${spec.blurb}`),
    );
    if (!pick) return;
    budget = pick.split(" ")[0] as BudgetKey;
  }
  const withBudget = (map: ModelMap): ModelMap => (budget ? applyBudget(map, budget) : map);

  if (parsed.role) {
    const currentValue =
      parsed.role === "default"
        ? current.defaultModel ?? "inherit"
        : current.agentOverrides?.[parsed.role]?.model ?? current.defaultModel ?? "inherit";
    const pick = await ctx.ui.select(
      `Choose model for '${parsed.role}' - now ${currentValue}`,
      modelChoices(ctx, currentValue),
    );
    if (!pick) return;
    const id = parseModelId(pick);
    const map: ModelMap = { ...current };
    if (parsed.role === "default") {
      map.defaultModel = id;
    } else {
      map.agentOverrides = {
        ...(current.agentOverrides ?? {}),
        [parsed.role]: { ...current.agentOverrides?.[parsed.role], model: id },
      };
    }
    saveSettings(path, withBudget(map));
    await announceAndReload(ctx, path, withBudget(map), scope);
    return;
  }

  let tier = parsed.tier;
  if (!tier && ctx.hasUI) {
    ctx.ui.notify(summaryText(current, "none", []), "info");
    const pick = await ctx.ui.select("Pick a tier", [
      "All inherit (cheapest) - every role uses the parent model (Recommended)",
      "Light tier (scout low thinking, every model still inherits the parent)",
      "Custom per role",
    ]);
    if (!pick) return;
    tier = pick.startsWith("Light") ? "light" : pick.startsWith("Custom") ? "custom" : "all-inherit";
  }
  tier ??= "all-inherit";

  let map: ModelMap;
  if (tier === "custom") {
    const choices = availableModels(ctx.modelRegistry.getAvailable());
    const overrides: Record<string, ModelSpec> = { ...(current.agentOverrides ?? {}) };
    let defaultModel = current.defaultModel ?? "inherit";
    for (const role of ROLE_KEYS) {
      const selected = role === "default" ? defaultModel : overrides[role]?.model ?? defaultModel;
      const pick = await ctx.ui.select(
        `${role} - now ${selected}`,
        choices.map((choice) => (choice.id === selected ? `${choice.label}  [current]` : choice.label)),
      );
      if (!pick) continue;
      const id = parseModelId(pick);
      if (role === "default") {
        defaultModel = id;
      } else {
        overrides[role] = { ...(overrides[role] ?? {}), model: id };
      }
    }
    map = { defaultModel, agentOverrides: overrides };
    if (!map) return;
  } else {
    map = buildTier(tier);
  }
  map = withBudget(map);
  saveSettings(path, map);
  await announceAndReload(ctx, path, map, scope);
}

async function pstackStatusHandler(
  pi: ExtensionAPI,
  _args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const effective = effectiveModelMap(ctx.cwd);
  const budget = analyzeSkillBudget(readSkillSources(SKILLS_DIR));
  const text =
    summaryText(effective.map, effective.scope, pstackSkillNames(pi.getCommands())) +
    `\nsettings: ${effective.path}` +
    `\nprompt cost: ${budget.modelInvocable} of ${budget.total} pstack skills exposed to the model,` +
    ` ${budget.filtered} filtered by disable-model-invocation, ~${budget.estimatedTokens} tokens`;
  const parent =
    ctx.model && typeof ctx.model === "object"
      ? `${(ctx.model as { provider?: string }).provider}/${(ctx.model as { id?: string }).id}`
      : "unknown";
  const full = `parent session model: ${parent}\n${text}`;
  if (ctx.hasUI) {
    ctx.ui.notify(full, "info");
  } else {
    console.log(full);
  }
}

function quoteAssistantText(text: string): string {
  return text.length > 400 ? `${text.slice(0, 400)}...` : text;
}

interface TextBlock {
  type: "text";
  text: string;
}

function isTextBlock(value: unknown): value is TextBlock {
  if (typeof value !== "object" || value === null) return false;
  const block = value as Record<string, unknown>;
  return block.type === "text" && typeof block.text === "string";
}

function textContent(content: unknown): string | undefined {
  if (typeof content === "string") return content.trim() || undefined;
  if (!Array.isArray(content)) return undefined;
  const parts = content.filter(isTextBlock).map((block) => block.text);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function upstreamPin(): { ref: string; version: string } | undefined {
  try {
    const spec = JSON.parse(readFileSync(DELTAS_PATH, "utf8")) as {
      upstream?: { ref?: string; version?: string };
    };
    if (!spec.upstream?.ref || !spec.upstream.version) return undefined;
    return { ref: spec.upstream.ref, version: spec.upstream.version };
  } catch {
    return undefined;
  }
}

function doctorChecks(pi: ExtensionAPI, ctx: ExtensionCommandContext): DoctorCheck[] {
  const checks: DoctorCheck[] = [];

  for (const scope of ["user", "project"] as const) {
    const path = settingsPath(ctx.cwd, scope, CONFIG_DIR_NAME);
    if (!existsSync(path)) {
      checks.push({ name: `settings (${scope})`, status: "ok", detail: `${path} absent, nothing pinned` });
      continue;
    }
    const problems = checkModelMap(loadSettings(path), ROLE_KEYS);
    checks.push({
      name: `settings (${scope})`,
      status: problems.length > 0 ? "warn" : "ok",
      detail: problems.length > 0 ? problems.join("; ") : `${path} parses clean`,
    });
  }

  for (const file of PACKAGE_AGENTS) {
    const path = join(AGENTS_DIR, file);
    try {
      const problems = checkAgentFrontmatter(file, readFileSync(path, "utf8"));
      checks.push({
        name: `agent ${file}`,
        status: problems.length > 0 ? "fail" : "ok",
        detail: problems.length > 0 ? problems.join("; ") : "frontmatter registers with pi-subagents",
      });
    } catch {
      checks.push({ name: `agent ${file}`, status: "fail", detail: `${path} is missing` });
    }
  }

  try {
    const playbooks = readdirSync(join(SKILLS_DIR, "poteto-mode", "playbooks")).filter((f) => f.endsWith(".md"));
    checks.push({
      name: "skills",
      status: existsSync(join(SKILLS_DIR, "poteto-mode", "SKILL.md")) ? "ok" : "fail",
      detail: `poteto-mode present, ${playbooks.length} playbooks vendored under skills/`,
    });
  } catch {
    checks.push({ name: "skills", status: "fail", detail: "skills/poteto-mode is missing" });
  }

  const toolNames = new Set(pi.getAllTools().map((tool) => tool.name));
  for (const companion of COMPANIONS) {
    const present = toolNames.has(companion.tool);
    checks.push({
      name: `companion ${companion.tool}`,
      status: present ? "ok" : companion.required ? "fail" : "warn",
      detail: present ? "registered" : `absent: install ${companion.pkg}`,
    });
  }

  const pin = upstreamPin();
  checks.push({
    name: "upstream pin",
    status: pin ? "ok" : "warn",
    detail: pin
      ? `pstack ${pin.version} at ${pin.ref.slice(0, 12)}; npm run verify:sync proves the port matches`
      : "scripts/pi-deltas.json unreadable",
  });

  const effective = effectiveModelMap(ctx.cwd);
  const parent =
    ctx.model && typeof ctx.model === "object"
      ? `${(ctx.model as { provider?: string }).provider ?? "?"}/${(ctx.model as { id?: string }).id ?? "?"}`
      : "unknown";
  checks.push({
    name: "session",
    status: "ok",
    detail: `parent model ${parent}, map ${effective.scope}, ${budgetLabel(effective.map)}`,
  });

  return checks;
}

async function pstackDoctorHandler(
  pi: ExtensionAPI,
  _args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const report = renderReport(doctorChecks(pi, ctx));
  if (ctx.hasUI) {
    ctx.ui.notify(report, "info");
  } else {
    console.log(report);
  }
}

async function broHandler(
  pi: ExtensionAPI,
  _args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const entries = ctx.sessionManager.getBranch();
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    const text = textContent(entry.message.content);
    if (!text) continue;
    pi.sendUserMessage(
      `Restate your last reply in plain human language, no jargon:\n\n${quoteAssistantText(text)}`,
      ctx.isIdle() ? undefined : { deliverAs: "followUp" },
    );
    return;
  }
  ctx.ui.notify("No assistant reply to restate.", "warning");
}

export default function (pi: ExtensionAPI): void {
  let potetoMode = false;
  let guardNotified: GuardLevel = "ok";
  let conversationHelpers: Awaited<ReturnType<typeof loadConversationHelpers>> | "unavailable" | undefined;

  function sessionEntries(ctx: {
    sessionManager: { getBranch?: () => ModeEntry[]; getEntries: () => ModeEntry[] };
  }): ModeEntry[] {
    return typeof ctx.sessionManager.getBranch === "function"
      ? ctx.sessionManager.getBranch()
      : ctx.sessionManager.getEntries();
  }

  function widgetLines(ctx: ExtensionContext): string[] {
    const map = effectiveModelMap(ctx.cwd).map;
    const roles = resolvedMapping(map, ROLE_KEYS);
    const inherited = roles.filter((role) => role.model === "inherit").length;
    const summary =
      inherited === roles.length
        ? `${inherited} inherit`
        : `${inherited}/${roles.length} inherit`;
    return [
      `pstack: poteto mode on | roles: ${summary}`,
      meterLine(ctx.getContextUsage(), budgetLabel(map)),
    ];
  }

  function renderModeUi(ctx: ExtensionContext): void {
    if (ctx.mode !== "tui") return;
    ctx.ui.setStatus("pstack-mode", potetoMode ? "pstack: poteto mode" : undefined);
    ctx.ui.setWidget("pstack", potetoMode ? widgetLines(ctx) : undefined, {
      placement: "belowEditor",
    });
  }

  function persistMode(enabled: boolean, ctx?: ExtensionContext): void {
    potetoMode = enabled;
    pi.appendEntry(MODE_ENTRY_TYPE, { enabled });
    if (ctx) renderModeUi(ctx);
  }

  pi.on("session_start", async (_event, ctx) => {
    potetoMode = lastModeEnabled(sessionEntries(ctx));
    renderModeUi(ctx);
    const toolNames = new Set(pi.getAllTools().map((tool) => tool.name));
    const missing = COMPANIONS.filter((companion) => !toolNames.has(companion.tool));
    if (missing.length === 0) return;
    const lines = missing.map(
      (companion) =>
        `${companion.required ? "required" : "recommended"}: ${companion.pkg} (provides ${companion.tool}; ${companion.why})`,
    );
    ctx.ui.notify(`pi-pstack missing companions. ${lines.join(" | ")}`, "warning");
  });

  pi.on("input", (event, ctx) => {
    if (/^\/skill:poteto-mode(?:\s|$)/.test(event.text)) {
      persistMode(true, ctx);
    }
    return { action: "continue" as const };
  });

  pi.on("before_agent_start", (event) => {
    if (!potetoMode) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${POTETO_DIRECTIVE}` };
  });

  // Context guard: meter the context window while the mode is on, warn as it
  // fills, and offer a one-key poteto compaction when it is nearly full.
  pi.on("agent_end", async (_event, ctx) => {
    if (!potetoMode) return;
    renderModeUi(ctx);
    const percent = ctx.getContextUsage()?.percent ?? null;
    const level = guardLevel(percent);
    if (level === "ok") {
      guardNotified = "ok";
      return;
    }
    if (!isStronger(level, guardNotified)) return;
    guardNotified = level;
    const advice = guardAdvice(level, percent);
    if (level === "compact" && ctx.hasUI) {
      const accepted = await ctx.ui.confirm("Context nearly full", `${advice}\n\nCompact now with the poteto summary?`);
      if (accepted) ctx.compact({ customInstructions: POTETO_COMPACT_INSTRUCTIONS });
      return;
    }
    ctx.ui.notify(advice, "warning");
  });

  pi.on("session_compact", (_event, ctx) => {
    guardNotified = "ok";
    renderModeUi(ctx);
  });

  // Poteto compaction: while the mode is on, own the summary shape. Any
  // failure falls back to Pi's default compaction.
  pi.on("session_before_compact", async (event, ctx) => {
    if (!potetoMode) return;
    if (conversationHelpers === undefined) {
      conversationHelpers = (await loadConversationHelpers()) ?? "unavailable";
    }
    if (conversationHelpers === "unavailable") return;
    const helpers = conversationHelpers;
    const result = await runPotetoCompaction(
      event.preparation,
      event.customInstructions,
      event.signal,
      {
        model: ctx.model,
        complete: (model, context, options) =>
          ctx.modelRegistry.complete(
            model as Parameters<typeof ctx.modelRegistry.complete>[0],
            context as Parameters<typeof ctx.modelRegistry.complete>[1],
            options as Parameters<typeof ctx.modelRegistry.complete>[2],
          ),
        serialize: helpers.serialize,
        notify: (message, level) => ctx.ui.notify(message, level ?? "warning"),
      },
    );
    if (!result) return;
    return { compaction: result };
  });

  const setupCommand = {
    description: "Configure pstack subagent models for Pi via TUI pickers (fast paths: -l scope, inherit|light|custom tier, or one role). Writes only the subagents.* keys; default is all-inherit.",
    getArgumentCompletions: completions,
    handler: pstackSetupHandler,
  };
  pi.registerCommand("pstack-setup", setupCommand);
  pi.registerCommand("poteto-mode", {
    description: "Enable or disable sticky Poteto Mode. Usage: /poteto-mode [task or playbook] | /poteto-mode off",
    getArgumentCompletions: (prefix: string) => {
      const token = prefix.trim().toLowerCase();
      if (token.includes(" ")) return null;
      if (!token) return [{ value: "off", label: "off" }, ...PLAYBOOK_COMPLETIONS.slice(0, 20)];
      const items = [
        ...("off".startsWith(token) ? [{ value: "off", label: "off" }] : []),
        ...PLAYBOOK_COMPLETIONS.filter((item) => item.value.startsWith(token)),
      ];
      return items.length > 0 ? items : null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const raw = args.trim();
      const token = raw.split(/\s+/)[0]?.toLowerCase() ?? "";
      if (token === "off" || token === "disable" || token === "stop") {
        persistMode(false, ctx);
        ctx.ui.notify("Poteto Mode off.", "info");
        return;
      }
      persistMode(true, ctx);
      ctx.ui.notify("Poteto Mode on. Stays on until /poteto-mode off.", "info");
      const payload = `/skill:poteto-mode${raw ? ` ${raw}` : ""}`;
      pi.sendUserMessage(payload, ctx.isIdle() ? { expandPromptTemplates: true } : { expandPromptTemplates: true, deliverAs: "followUp" });
    },
  });

  pi.registerCommand("pstack-status", {
    description: "Show the effective pstack model map (resolved through defaults), the winning settings file, and loaded pstack skills.",
    handler: (_args, ctx) => pstackStatusHandler(pi, _args, ctx),
  });
  pi.registerCommand("pstack-doctor", {
    description: "Check the pstack install: settings validity, package agents, vendored playbooks, companion tools, and the upstream pin.",
    handler: (_args, ctx) => pstackDoctorHandler(pi, _args, ctx),
  });
  pi.registerCommand("bro", {
    description: "Restate the last assistant reply in plain human language, no jargon.",
    handler: (_args, ctx) => broHandler(pi, _args, ctx),
  });
}