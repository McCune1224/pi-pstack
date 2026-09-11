# How this port compares

Two things get compared here. Upstream `cursor/plugins`' pstack, which is the source we vendor, and `@zenspc/pi-pstack`, the other Pi port on npm.

Every number below is reproducible. The commands are at the end.

## Versions compared

| Thing | Version | Ref |
|---|---|---|
| Upstream pstack | 0.15.2 | `f5bdd6826fd0a0d9cbc4347134c3a74a200b9d9d` |
| This port | 0.1.0 | working tree |
| `@zenspc/pi-pstack` | 0.6.0 | published 2026-09-09 |

The version this port was vendored from before this change was upstream 0.14.4. That is an eight-release gap, and the reason it existed is worth stating because it is the problem the port now solves.

The old `sync-upstream.mjs` wiped the vendored tree and asked a human to re-apply every Pi adaptation by hand. The adaptations were never written down, so each sync threw them away. Nobody wants to redo that work, so the port sat still. The fix was to record the adaptations as data instead of as tribal knowledge.

## What upstream changed between 0.14.4 and 0.15.2

| Upstream change | What this port did |
|---|---|
| Density and mannered-prose pass across every skill | Adopted. This is the bulk of the diff, 98 files. |
| Two new principle leaves, `principle-attack-the-premise` and `principle-test-behavior-not-implementation` | Adopted, and both added to the mode's principle index. |
| Critique mode removed from the `how` skill, with `references/critic-prompt.md` and `references/critique-rubric.md` deleted and the callers in `architect` and the investigation playbook updated | Adopted. The two reference files were deleted here too. |
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
| Setup | `/pstack-setup` interactive wizard. Scope picker, three tiers, per-role picker, and argument fast paths (`-l`, `inherit`, `light`, `custom`, a bare role name) | `/setup-pstack` writes a JSON file. No picker |
| Where role models live | Pi's own `subagents.*` keys in `settings.json`, shared with the rest of Pi and hand-editable | A private `~/.pi/agent/pstack/models.json` that nothing else reads |
| Status surface | `/pstack-status` prints the parent session model, the resolved model for every role, the settings file that won, the loaded skill inventory, and the system-prompt token cost of the model-visible skills | `/pstack status` reports whether pstack is on or off |
| Sticky mode | Persisted as a session entry, survives a reload, shows a footer status, and shows a HUD line below the editor while on | A session entry and a footer status |
| Plain-language restate | `/bro` is a command | `bro` is a skill only |
| Missing-dependency check | At startup, names each missing companion package, what it provides, and the install command | None |
| Pi-only skills | `control-cli`, `control-ui`, `create-skill` have no counterpart in the other port | Absent |
| Port drift control | `scripts/pi-deltas.json` declares every adaptation, `npm run verify:sync` classifies every vendored file and fails on anything unexplained, and a rule that stops matching is itself a failure | None. A re-vendor is a manual diff |
| Prompt-cost transparency | Measured and printed by `/pstack-status` | Strips skills from the prompt to save tokens without reporting the number |
| Role model resolution | Recomputed from the settings chain on every status call, so `inherit` always shows what it currently means | Reads its own config file |
| Tests | 18 committed tests over the extension logic and the sync rule engine | `check-plan` tests plus watch-pr tests |

We are behind in exactly one respect that matters to a stranger: release cadence. The other port has shipped six releases since 2026-08-22 and this one is at 0.1.0.

## The one place the other port does more, and why we declined it

`@zenspc/pi-pstack` strips this package's own skills out of the model's system prompt. That is a real prompt-budget feature and it is the single thing it does that we do not.

We measured the saving before deciding, because the number decides whether it earns its place.

```
total skills: 50
filtered by Pi already (disable-model-invocation): 45
exposed to the model: 5
exposed skills: control-cli, control-ui, create-skill, deslop, setup-pstack
estimated system-prompt cost of those 5: about 371 tokens
```

Pi filters 45 of the 50 skills on its own, because upstream marks them `disable-model-invocation: true` and Pi honours it. The remaining 5 cost roughly 371 tokens. Stripping those 5 saves about 0.4 percent of a typical context budget, and it costs the model the ability to reach `control-cli`, `control-ui`, `create-skill`, and `deslop` on its own judgement.

So `/pstack-status` reports the number instead. A user who wants the tokens back can act on a measurement. Hiding four skills to save a number we would not otherwise disclose is the worse trade, and reporting the cost is the more useful feature.

If upstream's filter set shrinks and that number climbs, the decision should be revisited. The number is printed on demand for exactly that reason.

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
