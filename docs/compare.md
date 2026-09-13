# How this port compares

Two things get compared here. Upstream `cursor/plugins`' pstack, which is the source we vendor, and `@zenspc/pi-pstack`, the other Pi port on npm.

Every number below is reproducible. The commands are at the end.

## Versions compared

| Thing | Version | Ref |
|---|---|---|
| Upstream pstack | 0.15.2 | `5bf2b1544db739998121a306340631963c2ff3de` |
| This port | 0.2.0 | working tree |
| `@zenspc/pi-pstack` | 0.6.0 | published 2026-09-09 |

The version this port was vendored from before this change was upstream 0.14.4. That is an eight-release gap, and the reason it existed is worth stating because it is the problem the port now solves.

The old `sync-upstream.mjs` wiped the vendored tree and asked a human to re-apply every Pi adaptation by hand. The adaptations were never written down, so each sync threw them away. Nobody wants to redo that work, so the port sat still. The fix was to record the adaptations as data instead of as tribal knowledge.

## What upstream changed after the 0.15.2 pin

Upstream added two commits after the ref this port was pinned to, without a version bump. Both are covered as of this release.

| Upstream change | What this port did |
|---|---|
| bug-fix, perf-issue, and hillclimb code-delegate defaults moved to `grok-4.6-fast-xhigh` (#365) | Adopted by the sync lever and then erased by it. The `pi-model-defaults` rule rewrites every pinned slug to `inherit`, so the three playbooks came out byte-identical and needed no new rule. This is the port working as designed: upstream retunes its model panel, and Pi readers keep the parent-model default. |
| `/setup-pstack` asks for a reasoning budget first: unlimited, large, medium, or small, mapped onto the effort ladder and recorded in the rule (#366) | Ported natively. `/pstack-setup` asks the same four budgets and writes Pi's own `subagents.defaultThinking` (`large` is `xhigh`, `medium` is `high`, `small` is `medium`, `unlimited` clears the key), so a role with an explicit level keeps it. The recorded budget reads back off the settings, not out of a private file. |

## What upstream changed between 0.14.4 and 0.15.2

| Upstream change | What this port did |
|---|---|
| Density and mannered-prose pass across every skill | Adopted. This is the bulk of the diff, 98 files. |
| Two new principle leaves, `principle-attack-the-premise` and `principle-test-behavior-not-implementation` | Adopted, and both added to the mode's principle index. |
| Critique mode removed from the `how` skill, with `references/critic-prompt.md` and `references/critique-rubric.md` deleted and the callers in `architect` and the investigation playbook updated | Adopted. The two reference files were deleted here too. |
| Model invocation disabled for `how`, `why`, `unslop`, `typescript-best-practices`, and `make-bot-ui` | Adopted. Pi now hides those four from the model's prompt list, so they are reached by name through `/poteto-mode` or directly with `/skill:<name>`. See the measurement below for why this makes the other port's skill-stripping feature even smaller than it looked. |
| A rule that every claim carries its evidence or its label | Adopted into the reply contract. |
| Operator-neutral pronouns in the autopilot and multi-phase playbooks | Adopted. Ours also drops the "lands herself" phrasing. |
| Forge-neutral shipping that reaches GitHub or Origin instead of requiring Graphite | Adopted. A reader without Graphite is no longer blocked. |
| Semicolons, em dashes, and connector colons replaced with periods and commas across the skill prose | Adopted. |
| A plugin logo and the Cursor marketplace asset | Skipped. It is a marketplace asset for Cursor's plugin directory. |
| `make-bot-ui` moved to the skills root and registered | Excluded. It drives Cursor's Grok Bot webhook through `api2.cursor.sh`, which Pi cannot reach. `control-ui` covers the same job locally. |
| Cursor model slugs reintroduced as role defaults | Rewritten. Every pinned slug becomes `inherit`, because Pi runs a delegate on the parent session model unless you assign one. |

One upstream change we deliberately did not take. Upstream 0.15.2 replaced the mode skill's opening non-negotiable with a weaker citation rule and dropped the instruction to make reading the Principles the first todo. Upstream's own guide flow diagram still shows that step. This port keeps the stronger instruction, and `skills/poteto-mode/SKILL.md` is declared as an override with a baselined hash so an upstream edit to that file fails the check instead of silently reverting us.

## Capabilities against `@zenspc/pi-pstack` 0.6.0

| Capability | This port | `@zenspc/pi-pstack` 0.6.0 |
|---|---|---|
| Upstream content | 50 skills, current to 0.15.2 | 47 skills, current to the 0.15.x line |
| Workflow skills the model sees | 5 of 50, because this port keeps upstream's `disable-model-invocation` flags | 4 of 47, because the port deletes those flags and strips the skills at runtime instead |
| Setup | `/pstack-setup` interactive wizard. Budget picker, scope picker, three tiers, per-role picker, and argument fast paths (`-l`, `inherit`, `light`, `custom`, a budget word, a bare role name) | `/setup-pstack` writes a JSON file. No picker, no budget |
| Where role models live | Pi's own `subagents.*` keys in `settings.json`, shared with the rest of Pi and hand-editable | A private `~/.pi/agent/pstack/models.json` that nothing else reads |
| Reasoning budget | Four budgets written to `subagents.defaultThinking`, read back on re-runs, per-role levels win | None |
| Status surface | `/pstack-status` prints the parent session model, the resolved model for every role, the settings file that won, the loaded skill inventory, and the system-prompt token cost of the model-visible skills | `/pstack status` reports whether pstack is on or off |
| Sticky mode | Persisted as a session entry, survives a reload, shows a footer status, and shows a HUD line below the editor while on | A session entry and a footer status |
| Context guard | Metered every turn while the mode is on: advice at 70 and 85 percent, one-key compaction at 92, live meter in the HUD | None |
| Compaction | While the mode is on, compaction summaries are shaped around the playbook, decision ledger, and verification state, falling back to Pi's default on any failure | Pi's default compaction |
| Install diagnostics | `/pstack-doctor` validates settings, flags unknown roles, checks agent frontmatter, counts playbooks, names missing companions, reports the pin | None |
| Plain-language restate | `/bro` is a command | `bro` is a skill only |
| Missing-dependency check | At startup, names each missing companion package, what it provides, and the install command | None |
| Pi-only skills | `control-cli`, `control-ui`, `create-skill` have no counterpart in the other port | Absent |
| Port drift control | `scripts/pi-deltas.json` declares every adaptation, `npm run verify:sync` classifies every vendored file and fails on anything unexplained, and a rule that stops matching is itself a failure | None. A re-vendor is a manual diff |
| Prompt-cost transparency | Measured and printed by `/pstack-status` | Strips skills without reporting the number |
| Skill visibility toggle | None. Follows upstream's static `disable-model-invocation` flags, which hide 45 of 50 skills | `/pstack on|off` toggles skill visibility at runtime |
| Role model resolution | Recomputed from the settings chain on every status call, so `inherit` always shows what it currently means | Reads its own config file |
| Tests | 44 committed tests over the extension logic and the sync rule engine | `check-plan` tests plus watch-pr tests |

We are behind in exactly one respect that matters to a stranger: release cadence. The other port has shipped six releases since 2026-08-22 and this one is at 0.2.0.

## The one place the other port does more, and what we did instead

`@zenspc/pi-pstack` ships `/pstack on|off`, a runtime toggle that adds and removes pstack's skills from the model's prompt list. It is a real convenience and it is the single thing that port has which this one does not.

It exists because of a design difference, not a missing capability. Upstream 0.15.2 marks `how`, `why`, `unslop`, and `typescript-best-practices` with `disable-model-invocation: true`, and Pi honours it by leaving them out of the prompt. This port keeps upstream's flags. The other port deletes those flags from its copy and gives the user a runtime toggle instead, so the default state is the same on both and the toggle is the addition.

We measured both sides before deciding whether to grow our own equivalent.

```
total skills: 50
hidden by Pi from upstream's flags: 45
offered to the model: 5, control-cli, control-ui, create-skill, deslop, setup-pstack
their four toggleable skills, how, why, unslop, typescript-best-practices: about 373 tokens
the five this port leaves offered: about 402 tokens
all nine together: about 776 tokens
```

The two designs land in the same place by default. Their toggle can hide about 373 tokens; this port already hides those same 373 tokens because upstream asked Pi to. What separates them is the mechanism and the reporting.

A static frontmatter flag costs no extension state, survives an upgrade, and works in any Pi session including one where this extension failed to load. A runtime toggle needs mode state, a command, and a way to re-apply the strip on every turn. We kept the flag, and we spent the equivalent effort on telling you the number instead. `/pstack-status` prints the live cost, and undoing a flag is documented in the README as one deleted line plus `/reload`.

If you want the toggle specifically, the other port has one and this one does not. That is an honest difference rather than a gap we are hiding, and the measurement above is why we did not build the same thing.

## Related projects

Three Pi ports of pstack exist. This one is a third, named `@mccune1224/pi-pstack` to stay distinct.

The extension code here was written for this package. A line-level comparison of `extensions/index.ts` against `@zenspc/pi-pstack`'s `extensions/pstack/index.ts` finds 19 identical non-trivial lines out of 276, all of them Pi API boilerplate such as the `session_start` registration. There is no shared implementation to attribute.

The skills are a different matter. They are adapted from upstream pstack, which is MIT and copyright Lauren Tan. That attribution is in the LICENSE and at the end of the README. If you are looking for the other Pi ports, they are [`@zenspc/pi-pstack`](https://github.com/zenspc/pi-extensions/tree/master/packages/pi-pstack) and [`pi-pstack`](https://www.npmjs.com/package/pi-pstack).

## How to reproduce

```bash
git clone --depth 400 https://github.com/cursor/plugins.git /tmp/upstream-plugins
npm run verify:sync        # per-file classification, exits non-zero on anything unexplained
npm run check:piisms       # exits non-zero on any Cursor-only reference
npm test                   # extension logic and sync rule engine

# count what Pi exposes to the model and what it costs
node -e '
const { readdirSync, readFileSync } = require("node:fs");
for (const name of readdirSync("skills").sort()) {
  const src = readFileSync(`skills/${name}/SKILL.md`, "utf8");
  const fm = (src.match(/^---\n([\s\S]*?)\n---/) || [])[1] || "";
  if (!/disable-model-invocation:\s*true/.test(fm)) console.log(name);
}'

# compare skill inventories with the other port
npm pack @zenspc/pi-pstack && tar xzf zenspc-pi-pstack-*.tgz
diff <(ls skills) <(ls package/skills)
```
