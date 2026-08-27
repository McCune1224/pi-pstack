import { CONFIG_DIR_NAME, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  MODE_ENTRY_TYPE,
  POTETO_DIRECTIVE,
  ROLE_KEYS,
  availableModels,
  buildTier,
  lastModeEnabled,
  loadSettings,
  parseArgs,
  parseModelId,
  saveSettings,
  settingsPath,
  summaryText,
  type ModeEntry,
  type ModelMap,
  type ModelSpec,
  type RoleKey,
  type Scope,
} from "./settings.ts";

const SETUP_COMPLETIONS = [
  "-l",
  "--local",
  "local",
  "inherit",
  "all-inherit",
  "light",
  "custom",
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
  const scopePick =
    parsed.scope ??
    (ctx.hasUI
      ? await ctx.ui.select("Where to save the pstack model map?", [
          "User (~/.pi/agent/settings.json) - recommended",
          "Project (.pi/settings.json) - team shared",
        ])
      : "user");
  if (!scopePick) return;
  const scope: Scope = scopePick.startsWith("Project") ? "project" : "user";
  const path = settingsPath(ctx.cwd, scope, CONFIG_DIR_NAME);
  const current = loadSettings(path);

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
    saveSettings(path, map);
    await announceAndReload(ctx, path, map, scope);
    return;
  }

  let tier = parsed.tier;
  if (!tier && ctx.hasUI) {
    ctx.ui.notify(summaryText(current, "none", []), "info");
    const pick = await ctx.ui.select("Pick a tier", [
      "All inherit (cheapest) - every role uses the parent model (Recommended)",
      "Light tier (scout low, oracle fallback, agents high thinking)",
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
  saveSettings(path, map);
  await announceAndReload(ctx, path, map, scope);
}

async function pstackStatusHandler(
  pi: ExtensionAPI,
  _args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const userPath = settingsPath(ctx.cwd, "user", CONFIG_DIR_NAME);
  const projectPath = settingsPath(ctx.cwd, "project", CONFIG_DIR_NAME);
  const userMap = loadSettings(userPath);
  const projectMap = loadSettings(projectPath);
  const projectWins = Object.keys(projectMap).length > 0;
  const effective = projectWins ? projectMap : userMap;
  const scope = projectWins ? "project" : Object.keys(userMap).length > 0 ? "user" : "none";
  const text =
    summaryText(effective, scope, pstackSkillNames(pi.getCommands())) +
    `\nsettings: ${projectWins ? projectPath : userPath}`;
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

  function sessionEntries(ctx: {
    sessionManager: { getBranch?: () => ModeEntry[]; getEntries: () => ModeEntry[] };
  }): ModeEntry[] {
    return typeof ctx.sessionManager.getBranch === "function"
      ? ctx.sessionManager.getBranch()
      : ctx.sessionManager.getEntries();
  }

  function setModeStatus(ctx: import("@earendil-works/pi-coding-agent").ExtensionContext): void {
    if (ctx.mode !== "tui") return;
    ctx.ui.setStatus("pstack-mode", potetoMode ? "pstack: poteto mode" : undefined);
  }

  function persistMode(enabled: boolean, ctx?: import("@earendil-works/pi-coding-agent").ExtensionContext): void {
    potetoMode = enabled;
    pi.appendEntry(MODE_ENTRY_TYPE, { enabled });
    if (ctx) setModeStatus(ctx);
  }

  pi.on("session_start", async (_event, ctx) => {
    potetoMode = lastModeEnabled(sessionEntries(ctx));
    setModeStatus(ctx);
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

  const setupCommand = {
    description: "Configure pstack subagent models for Pi via TUI pickers (fast paths: -l scope, inherit|light|custom tier, or one role). Writes only the subagents.* keys; default is all-inherit.",
    getArgumentCompletions: completions,
    handler: pstackSetupHandler,
  };
  pi.registerCommand("pstack-setup", setupCommand);
  pi.registerCommand("poteto-mode", {
    description: "Enable or disable sticky Poteto Mode. Usage: /poteto-mode [task] | /poteto-mode off",
    getArgumentCompletions: (prefix: string) => {
      const token = prefix.trim().toLowerCase();
      if (!token || "off".startsWith(token)) return [{ value: "off", label: "off" }];
      return null;
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
  pi.registerCommand("bro", {
    description: "Restate the last assistant reply in plain human language, no jargon.",
    handler: (_args, ctx) => broHandler(pi, _args, ctx),
  });
}