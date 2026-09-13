import assert from "node:assert/strict";
import { test } from "node:test";
import {
  POTETO_COMPACT_INSTRUCTIONS,
  SUMMARY_SYSTEM_FRAME,
  buildSummaryPrompt,
  loadConversationHelpers,
  runPotetoCompaction,
} from "./compaction.ts";

const PREPARATION = {
  firstKeptEntryId: "entry-9",
  messagesToSummarize: [{ role: "user", content: "fix the webhook" }],
  turnPrefixMessages: [],
  tokensBefore: 148_000,
  previousSummary: undefined,
};

test("buildSummaryPrompt demands the poteto sections and keeps the conversation inline", () => {
  const prompt = buildSummaryPrompt("<raw transcript>");
  for (const section of [
    "## Playbook and position",
    "## Decision ledger",
    "## Verified and unverified",
    "## Files and artifacts",
    "## Next actions",
    "## Open questions",
  ]) {
    assert.ok(prompt.includes(section), section);
  }
  assert.ok(prompt.includes("<conversation><raw transcript></conversation>"));
});

test("buildSummaryPrompt folds in custom instructions and the previous summary", () => {
  const prompt = buildSummaryPrompt("t", {
    customInstructions: "focus on the retry path",
    previousSummary: "earlier run fixed the parser",
  });
  assert.ok(prompt.includes("focus on the retry path"));
  assert.ok(prompt.includes("<previous_summary>earlier run fixed the parser</previous_summary>"));
});

test("runPotetoCompaction returns the compaction Pi expects", async () => {
  const seen: { model: unknown; context: unknown; options: unknown }[] = [];
  const result = await runPotetoCompaction(PREPARATION, undefined, new AbortController().signal, {
    model: { provider: "test", id: "parent-model" },
    complete: async (model, context, options) => {
      seen.push({ model, context, options });
      return {
        content: [{ type: "text", text: "## Playbook and position\nbug-fix, step 4" }],
        usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
      };
    },
    serialize: (messages) => `serialized:${messages.length}`,
  });
  assert.ok(result);
  assert.equal(result.summary, "## Playbook and position\nbug-fix, step 4");
  assert.equal(result.firstKeptEntryId, "entry-9");
  assert.equal(result.tokensBefore, 148_000);
  const call = seen[0];
  assert.equal((call.context as { systemPrompt: string }).systemPrompt, SUMMARY_SYSTEM_FRAME);
  assert.deepEqual(
    (call.options as { maxTokens: number; cacheRetention: string }).maxTokens !== undefined,
    true,
  );
  const text = (call.context as { messages: Array<{ content: Array<{ text: string }> }> }).messages[0]
    .content[0].text;
  assert.ok(text.includes("serialized:1"));
});

test("runPotetoCompaction falls back to default on empty summary, error, and missing model", async () => {
  const notes: string[] = [];
  const notify = (message: string) => notes.push(message);
  const empty = await runPotetoCompaction(PREPARATION, undefined, new AbortController().signal, {
    model: { provider: "test", id: "m" },
    complete: async () => ({ content: [{ type: "text", text: "   " }] }),
    serialize: () => "s",
    notify,
  });
  assert.equal(empty, undefined);
  assert.equal(notes.length, 1);

  const failed = await runPotetoCompaction(PREPARATION, undefined, new AbortController().signal, {
    model: { provider: "test", id: "m" },
    complete: async () => {
      throw new Error("provider down");
    },
    serialize: () => "s",
    notify,
  });
  assert.equal(failed, undefined);
  assert.ok(notes[1].includes("provider down"), notes[1]);

  const noModel = await runPotetoCompaction(PREPARATION, undefined, new AbortController().signal, {
    model: undefined,
    complete: async () => {
      throw new Error("must not be called");
    },
    serialize: () => "s",
  });
  assert.equal(noModel, undefined);
});

test("runPotetoCompaction honors an aborted signal without a fallback notify", async () => {
  const controller = new AbortController();
  controller.abort();
  const notes: string[] = [];
  const result = await runPotetoCompaction(PREPARATION, undefined, controller.signal, {
    model: { provider: "test", id: "m" },
    complete: async () => {
      throw new Error("aborted");
    },
    serialize: () => "s",
    notify: (message) => notes.push(message),
  });
  assert.equal(result, undefined);
  assert.equal(notes.length, 0, "a user abort is not a failure worth reporting");
});

test("POTETO_COMPACT_INSTRUCTIONS covers the run state a compaction must keep", () => {
  for (const needle of ["playbook", "decision ledger", "verified", "next actions"]) {
    assert.ok(POTETO_COMPACT_INSTRUCTIONS.includes(needle), needle);
  }
});

test("loadConversationHelpers resolves in a dev checkout and degrades gracefully", async () => {
  const helpers = await loadConversationHelpers();
  if (helpers) {
    const text = helpers.serialize([{ role: "user", content: "hello" }]);
    assert.ok(typeof text === "string" && text.length > 0);
  }
});
