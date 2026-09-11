# pi-pstack

pstack for Pi, with the parts a skill set cannot give you on its own: an install-time setup wizard, a status command that tells you what actually resolved, sticky Poteto Mode that survives a reload, and an upstream port you can prove is current.

**What this is for.** You want Poteto's engineering discipline, the write-less-higher-quality workflow built from playbooks and principles, running on Pi. A pile of SKILL.md files gets you half of it. The other half is the wiring: which model each delegated role runs on, whether the mode is on right now, what Pi loaded, and whether the port still matches upstream. That wiring is an extension, and it ships here.

## What you get

**A mode that picks the workflow for you.** `/poteto-mode <task>` matches your request to one of 23 playbooks (bug fix, feature, perf, hillclimb, shipping, orchestrate, and more), opens a todo list with that playbook's steps copied in verbatim, and routes to the other skills as each step fires. It is sticky: turn it on once and follow-up turns keep the rigor until you say stop.

**An extension nobody else's port ships.** `/pstack-setup` is an interactive wizard with three tiers and a per-role picker. `/pstack-status` prints the parent session model, the resolved model for every role, which settings file won, and the real system-prompt cost of the skills Pi exposes. `/bro` restates the last reply in plain language. A startup check names any missing companion package and its install command.

**A port that declares itself.** Every difference from upstream is written down as data in `scripts/pi-deltas.json` and checked by `npm run verify:sync`. You can see exactly what we changed and why, and a stale rule fails the build instead of rotting quietly. Nothing drifts.

**50 skills.** 23 workflow skills adapted from upstream, 23 first-principle leaves, and 4 Pi-only additions: `control-cli`, `control-ui`, `create-skill`, and `deslop`.

## Install

Requires Pi 0.84 or newer. Install [`pi-subagents`](https://www.npmjs.com/package/pi-subagents) alongside it. It registers the `subagent` tool that every routed workflow uses, and the plugin warns at startup when it is absent.

```bash
pi install npm:@mccune1224/pi-pstack
# or from the repository
pi install git:github.com/McCune1224/pi-pstack
# or from a local checkout
pi install /path/to/pi-pstack
```

Then run `/reload`.

## Get started

Two steps.

1. Run `/pstack-setup`. Pick a scope and a tier, or assign a model per role. Everything defaults to `inherit`, which runs delegated agents on your parent model at no extra cost.
2. Run `/poteto-mode <task>` whenever the task needs rigor. The mode stays on for the session and the footer shows `pstack: poteto mode`.

New to this? The [guide](docs/guide/README.md) walks through a first task from setup to verification.

## Commands

| Command | What it does |
|---|---|
| `/poteto-mode` | Enable sticky Poteto Mode and optionally run a task. `/poteto-mode <task>` matches a playbook and routes the work. `/poteto-mode` alone just enables the mode. `/poteto-mode off` disables it. The choice persists across reloads and shows a footer status while on. |
| `/pstack-setup` | Model configuration wizard. Picks the scope, applies a tier, or assigns a model per role. Writes only the `subagents.*` keys in Pi settings. Fast paths: `-l` for project scope, `inherit`, `light`, or `custom` to skip the tier picker, and a bare role name such as `scout` to change one role. |
| `/pstack-status` | One screen: parent session model, effective model per role, which settings file wins, which pstack skills loaded, and what the model-visible skills cost in system-prompt tokens. |
| `/bro` | Restates the last assistant reply in plain human language. |

No tools are registered. Skills carry the workflow. The extension only wires what a skill cannot reach: the model registry, the settings files, the session, and the TUI.

## Sticky Poteto Mode

Poteto Mode is the entry point, and it is sticky. Once enabled it stays on for the session, so follow-ups keep the rigor without re-invoking it.

- `/poteto-mode <task>` enables the mode and routes that task through the playbook matcher.
- `/poteto-mode` with no task enables the mode only.
- `/poteto-mode off` disables it. `disable` and `stop` also work.
- Invoking `/skill:poteto-mode` directly enables the mode too.

The choice persists across sessions through a session entry, and the footer shows `pstack: poteto mode` while it is on. Every turn gets a short directive pointing at the `poteto-mode` skill as the single source of truth, so the rules are never duplicated in the extension.

## Model configuration

Pi resolves a delegate's model in this order, first match wins:

1. A `model` on the `subagent` call itself
2. `model:` in the agent's frontmatter
3. `~/.pi/agent/settings.json` to `subagents.agentOverrides.<name>.model`
4. `subagents.defaultModel`
5. The parent session model

`/pstack-setup` writes keys 3 and 4, plus the thinking levels a tier sets. With nothing set, every role inherits your parent model, which costs nothing extra and is the recommended starting point. Set an explicit model only when you want a tier.

Because the map lives in Pi's own settings, it is not private to this package. Anything else that reads `subagents.*` sees the same choices, and you can edit the file by hand. The project scope in `.pi/settings.json` wins over the user scope when both exist.

## Skills

All 50 ship and load together. Pi filters 45 of them out of the model's system prompt for free, because they carry `disable-model-invocation: true`. The 5 Pi does expose, `control-cli`, `control-ui`, `create-skill`, `deslop`, and `setup-pstack`, cost roughly 371 system-prompt tokens in total. `/pstack-status` prints the live number for your install.

The workflow skills run the mode: `how` and `why` for understanding, `architect` and `arena` for design, `swarm` for parallel checks, `interrogate` for adversarial review, `unslop`, `deslop`, and `no-comments` for clean output, and 23 first-principle leaves that ground every decision. Delegation happens through your own subagents, so one chat stays in control while the work fans out.

Two agents ship under the pstack names upstream uses:

- `poteto-agent` runs the mode end to end. It reads `poteto-mode` in full, including the inline principles index, before doing any work.
- `comment-sicko` is the read-only comment reviewer, invoked through `/no-comments`.

Both inherit your parent model by default. Configure them per role with `/pstack-setup`.

## Keeping the port current

The port is machine-checked, not hand-maintained.

```bash
git clone --depth 400 https://github.com/cursor/plugins.git /tmp/upstream-plugins
npm run sync:upstream      # vendor upstream at the pinned ref and apply the declared Pi deltas
npm run verify:sync        # classify every file and fail on anything unexplained
npm run check:piisms       # fail if Cursor-only content would ship
```

`scripts/pi-deltas.json` is the artifact to read. It declares each Pi adaptation as data: a literal or regex substitution, a whole-file override with a baselined upstream hash, an exclusion such as Cursor's Grok Bot UI skill, or a file we add such as `control-cli`.

`npm run verify:sync` classifies every vendored file as verbatim upstream, a rule-explained delta, a baselined override, a declared exclude, a declared add, or unexplained. It exits non-zero on any unexplained file, and it also fails when a rule matches nothing. That second failure is the important one. A stale rule means upstream moved the text the rule targeted, so the adaptation needs revisiting instead of silently disappearing. Run it to see the current split, which is a few dozen rule-explained deltas and three baselined overrides across a tree that is otherwise verbatim upstream.

Three files stay ours and are baselined against the upstream hash, so an upstream edit fails the check until someone merges it by hand: `skills/poteto-mode/SKILL.md`, `skills/setup-pstack/SKILL.md`, and `docs/guide/01-setup.md`.

## How this compares to the other pstack ports

Short version: we ship more of the workflow, a better setup and status surface, and a port you can audit. The [full comparison](docs/compare.md) covers the details and the places a competing port does something we deliberately do not.

## Companions

pi-pstack loads on its own. Three Pi packages back specific surfaces, and only the first is required.

| Package | Why |
|---|---|
| `npm:pi-subagents` | Required. Registers the `subagent` tool, reads this package's `agents/`, and backs every routed workflow. Without it, delegation has no backend. |
| `npm:@juicesharp/rpiv-todo` | Recommended. The playbooks open a todo list through the `todo` tool. |
| `npm:@juicesharp/rpiv-ask-user-question` | Recommended. Skills reach you through the `ask_user_question` tool. |

## Not shipped

Two upstream pieces cannot work on Pi because they are bound to Cursor's runtime:

- `make-bot-ui` drives Cursor's Grok Bot webhook panels through `api2.cursor.sh`. The Pi answer to the same job is `control-ui`, which drives the UI locally.
- The `benny` automation pack registers through Cursor's automation runtime, which Pi does not have.

Both are declared as excludes in `scripts/pi-deltas.json` with that reason attached.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Skills do not appear | Run `/reload` after install. `/pstack-status` lists the loaded pstack skills and should show 50. |
| Model changes do not apply | `/pstack-setup` writes settings and Pi re-reads them per turn. `/pstack-status` shows what resolved and which file won. |
| Startup warning about a missing companion | `pi install <package>` for each name in the warning, then `/reload`. |
| `/poteto-mode` does not engage | Run `/skill:poteto-mode <task>` directly. A user-scope skill with the same name shadows the package one, so remove it from `~/.pi/agent/skills/`. |
| `verify:sync` reports a stale rule | Upstream moved the text that rule targeted. Read the file, update the rule or retire it, then re-run. |
| `verify:sync` reports an override is stale | Upstream edited a file we own. Merge its changes into our copy, then run `node scripts/verify-sync.mjs --accept-overrides` and commit both. |
| Everything broke after an upgrade | Pin a version with `pi install git:github.com/McCune1224/pi-pstack@<tag>`. `git log` shows each release. |

## Development

```bash
npm ci
npm run typecheck        # strict tsc over extensions/
npm test                 # unit tests for the extension logic and the rule engine
npm run verify:sync      # port parity against the pinned upstream ref
npm run check:piisms     # exit 1 if Cursor-shaped content would ship
```

Verify against a real Pi surface before releasing. `pi -e . -p "Say ok"` must load clean, and `/pstack-status` in a TUI session must show the 50 skills and the resolved model map.

## License

MIT. The skillset is adapted from poteto's [pstack](https://github.com/cursor/plugins/tree/main/pstack) (MIT, Lauren Tan). The Pi extension, the sync lever, and the four Pi-only skills are this package's own.
