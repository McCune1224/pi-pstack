/**
 * Poteto-flavored compaction for Poteto Mode.
 *
 * Pi's default compaction summarizes the conversation generically. When Poteto
 * Mode is on, the run's value lives in specific places: the matched playbook
 * and its step position, the decision ledger with the principles cited, the
 * evidence of what has been verified, and the next actions. This module asks
 * the session model for a summary shaped around those, and falls back to Pi's
 * default compaction for any failure.
 */

import { randomUUID } from "node:crypto";
import type { CompactionResult } from "@earendil-works/pi-coding-agent";

/** Passed to ctx.compact() when the context guard offers a one-key compaction. */
export const POTETO_COMPACT_INSTRUCTIONS =
  "Preserve the pstack run state: the active playbook and its current step, " +
  "the decision ledger with the principle each decision cited, what has been " +
  "verified and how, file paths touched, and the next actions. Drop narration, " +
  "raw tool output, and abandoned branches.";

export const SUMMARY_SYSTEM_FRAME =
  "You are summarizing a coding-agent session so work can continue after the " +
  "oldest messages are dropped. The session ran under Pstack Poteto Mode. " +
  "Be dense and concrete. No narration about the summarization itself.";

export function buildSummaryPrompt(conversationText: string, extra?: {
  previousSummary?: string;
  customInstructions?: string;
}): string {
  const sections = [
    "Summarize the conversation between the <conversation> tags. Structure the summary as markdown with exactly these sections:",
    "",
    "## Playbook and position",
    "The matched playbook, the step the run is on, and the steps completed with their verdicts.",
    "",
    "## Decision ledger",
    "One row per decision: what was decided, the principle cited for it, the evidence behind it.",
    "",
    "## Verified and unverified",
    "What has been proven against the real artifact, with the proof. What is still claimed but unverified.",
    "",
    "## Files and artifacts",
    "Every file touched or produced, with its path and what changed in it.",
    "",
    "## Next actions",
    "The exact next steps, in order, with enough detail to execute them without re-reading the dropped messages.",
    "",
    "## Open questions",
    "Blockers, unanswered questions, and promises made to the operator.",
    "",
    "Keep every file path, command, and measurement exact. Drop small talk, retries that ended in revert, and tool output that a file on disk already holds.",
  ];
  if (extra?.customInstructions) {
    sections.push("", `The operator added this instruction for the summary: ${extra.customInstructions}`);
  }
  if (extra?.previousSummary) {
    sections.push(
      "",
      "An earlier compaction produced this summary. Fold it in: keep what it holds that still matters, and update anything the newer conversation changed.",
      "",
      `<previous_summary>${extra.previousSummary}</previous_summary>`,
    );
  }
  sections.push("", `<conversation>${conversationText}</conversation>`);
  return sections.join("\n");
}

export interface CompactionPreparationLike {
  firstKeptEntryId: string;
  messagesToSummarize: unknown[];
  turnPrefixMessages: unknown[];
  tokensBefore: number;
  previousSummary?: string;
}

interface TextBlockLike {
  type: string;
  text?: unknown;
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as TextBlockLike[])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("\n");
}

/**
 * Runs the poteto compaction. Returns the compaction result Pi expects, or
 * undefined to let Pi run its default compaction. Never throws: every failure
 * path degrades to the default.
 */
export type UsageLike = NonNullable<CompactionResult["usage"]>;

export async function runPotetoCompaction(
  preparation: CompactionPreparationLike,
  customInstructions: string | undefined,
  signal: AbortSignal,
  deps: {
    model: unknown;
    complete: (model: unknown, context: unknown, options: unknown) => Promise<unknown>;
    serialize: (messages: unknown[]) => string;
    notify?: (message: string, level?: "info" | "warning" | "error") => void;
  },
): Promise<{
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  usage?: UsageLike;
} | undefined> {
  if (!deps.model) return undefined;
  try {
    const messages = [...preparation.messagesToSummarize, ...preparation.turnPrefixMessages];
    const conversationText = deps.serialize(messages);
    const prompt = buildSummaryPrompt(conversationText, {
      previousSummary: preparation.previousSummary,
      customInstructions,
    });
    const response = (await deps.complete(
      deps.model,
      {
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }],
            timestamp: Date.now(),
          },
        ],
        systemPrompt: SUMMARY_SYSTEM_FRAME,
      },
      {
        maxTokens: 8192,
        signal,
        cacheRetention: "none",
        sessionId: randomUUID(),
      },
    )) as { content?: unknown; usage?: UsageLike } | undefined;

    const summary = extractText(response?.content).trim();
    if (!summary) {
      deps.notify?.("pstack compaction: empty summary, using Pi's default", "warning");
      return undefined;
    }
    return {
      summary,
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      usage: response?.usage,
    };
  } catch (error) {
    if (signal.aborted) return undefined;
    const message = error instanceof Error ? error.message : String(error);
    deps.notify?.(`pstack compaction failed (${message}); using Pi's default`, "warning");
    return undefined;
  }
}

/**
 * Loads the runtime conversation helpers from the pi-coding-agent install.
 * Returns undefined when they cannot be resolved, which is the signal to fall
 * back to default compaction. Static imports would make the whole extension
 * fail to load on installs where the host package is not resolvable from the
 * package directory.
 */
export async function loadConversationHelpers(): Promise<{
  serialize: (messages: unknown[]) => string;
} | undefined> {
  try {
    const core = (await import("@earendil-works/pi-coding-agent")) as {
      convertToLlm?: (messages: unknown[]) => unknown[];
      serializeConversation?: (messages: unknown[]) => string;
    };
    if (!core.convertToLlm || !core.serializeConversation) return undefined;
    return {
      serialize: (messages: unknown[]) => core.serializeConversation!(core.convertToLlm!(messages)),
    };
  } catch {
    return undefined;
  }
}
