# pi-pstack

Poteto's engineering workflow on the Pi Agent Harness. Fifty skills, two agents, and an extension that wires the workflow into the parts of Pi a skill file cannot reach: settings, sessions, compaction, and the context window.

pstack is Lauren Tan's plugin for Cursor. Two other Pi ports carry the same name. This one differs in kind, not in degree: it is the port that treats Pi as a harness to build on. The skills are the same rigorous core everywhere. What you do with the rest of the machine is what this package is for.

## What only this port ships

**A setup wizard that writes Pi's own settings.** `/pstack-setup` asks for a reasoning budget (unlimited, large, medium, small), then maps six roles onto the models your session can reach. It writes the `subagents.*` keys in `settings.json`, the same keys every other Pi tool reads. Nothing private, nothing parallel, hand-editable.

**A context guard with the principle enforced.** While Poteto Mode is on, the extension meters the context window every turn. At 70 percent it tells you to hand long output to files. At 85 it tells you to capture the decision state. At 92 it offers one-key compaction. The HUD below the editor shows the meter live.

**Compaction that keeps the run.** When Poteto Mode compacts, the summary is shaped around what the run needs to survive: the matched playbook and its step, the decision ledger with the principles cited, what was verified and how, file paths, next actions. Pi's default compaction summarizes a chat. This one resumes a job.

**A doctor.** `/pstack-doctor` validates both settings files, flags role typos that would silently do nothing, checks the package agents' frontmatter, counts the vendored playbooks, names missing companion packages, and reports the upstream pin.

**A port you can prove.** Every adaptation from upstream Cursor pstack is declared as data in `scripts/pi-deltas.json`. `npm run verify:sync` classifies all 100+ vendored files and fails on anything unexplained. A rule that stops matching is itself a failure, and the check is mutation-tested: `npm run verify:guards` injects hand edits, deleted rules, and stale baselines to prove the checker catches them.

## Install

Requires Pi 0.84 or newer. Install [`pi-subagents`](https://www.npmjs.com/package/pi-subagents) alongside it; it registers the `subagent` tool every routed workflow uses, and this package warns at startup when it is absent.

```bash
pi install npm:@mccune1224/pi-pstack
# or from the repository
pi install git:github.com/McCune1224/pi-pstack
```

Then run `/reload`.

## Get started

1. Run `/pstack-setup`. Pick a scope, a budget, and a tier, or assign models per role. Everything defaults to `inherit`: delegated agents run on your parent model, at no extra cost, with no thinking floor. That is the recommended start.
2. Run `/poteto-mode <task>` when the task needs rigor. The mode is sticky. Follow-ups keep the playbook discipline until `/poteto-mode off`, and the footer shows the state while it is on.

New here? The [guide](docs/guide/README.md) walks a first task from install to verified ship.

## Commands

| Command | What it does |
|---|---|
| `/poteto-mode` | Enable sticky Poteto Mode and optionally run a task. `<task>` matches one of 23 playbooks and copies its steps into a todo list verbatim. `off` disables. Tab completes playbook names. The choice survives a reload. |
| `/pstack-setup` | Model configuration. Reasoning budget first, then scope, tier, or a single role. Fast paths: `-l`, `inherit`, `light`, `custom`, a budget word like `small`, or a bare role name like `scout`. |
| `/pstack-status` | Parent session model, resolved model and thinking level per role, the recorded budget, the winning settings file, the loaded skill inventory, and the system-prompt token cost of what the model sees. |
| `/pstack-doctor` | Install diagnostics: settings validity, unknown roles, agent frontmatter, playbook count, companion tools, upstream pin. |
| `/bro` | Restates the last reply in plain human language. |

No tools are registered. Skills carry the workflow; the extension only reaches what skills cannot.

## How it uses the harness

| Pi mechanism | What pstack does with it |
|---|---|
| `subagents.*` settings keys | Role models and thinking levels, user or project scope, shared with the rest of Pi |
| Session entries | Poteto Mode state, so the sticky mode survives reloads and restarts |
| `before_agent_start` | A short mode directive that points at the `poteto-mode` skill, never a duplicated rule |
| Context usage | The guard thresholds and the HUD meter |
| Compaction events | The poteto summary shape, with fallback to Pi's default on any failure |
| Widgets and status | The `pstack: poteto mode` footer and the live roles, budget, and context line |

Because the model map lives in Pi's own settings, it is not private to this package. The project scope in `.pi/settings.json` wins over the user scope when both exist.

## The skills

50 ship and load together: 23 workflow skills, 23 first-principle leaves, and 4 Pi-only additions (`control-cli`, `control-ui`, `create-skill`, `deslop`). Upstream disables model invocation for most of them, so Pi filters 45 out of the system prompt and the mode skill reaches them by name as steps fire; the 5 Pi offers on its own judgment cost about 400 prompt tokens. `/pstack-status` prints the live number for your install.

Two agents ship under the upstream names: `poteto-agent` runs the mode end to end, `comment-sicko` reviews comments through `/no-comments`. Both inherit your parent model until `/pstack-setup` says otherwise.

The [guide](docs/guide/README.md) has a chapter per workflow stage, and [compare.md](docs/compare.md) puts this port next to upstream and the other Pi port with reproducible numbers.

## Keeping the port current

```bash
git clone --depth 400 https://github.com/cursor/plugins.git /tmp/upstream-plugins
npm run sync:upstream      # vendor upstream at the pinned ref and apply the declared deltas
npm run verify:sync        # classify every file, fail on anything unexplained
npm run check:piisms       # fail if Cursor-only content would ship
npm run verify:guards      # mutation-test the checker itself
```

The pin, the two commits it covers, and what each upstream change became here are written up in [compare.md](docs/compare.md).

## Development

```bash
npm test          # node:test over the extension logic, 44 cases
npm run typecheck
```

Extension logic is split into testable units: `settings.ts` (model maps and budgets), `context-guard.ts` (thresholds), `compaction.ts` (the summary contract), `doctor.ts` (validators), `skill-budget.ts` (prompt cost). Tests run on plain node, no build step.

## License

MIT. Upstream pstack is Lauren Tan's work; this port follows upstream and names every place it departs.
