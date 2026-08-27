# pi-pstack

pstack for Pi. Poteto's rigorous engineering workflow as a Pi plugin. Write less code, write better code, and parallelize with confidence.

**What this plugin does.** It is an engineering-workflow system, not another model wrapper. One command, `/poteto-mode`, turns any Pi session into a disciplined engineer: it matches your request to a playbook (bug fix, feature, perf, investigation, shipping, and more), opens a todo list with the playbook's steps, and routes to the right skill as the steps fire. The skills add the rigor: `how` and `why` for understanding, `architect` and `arena` for design, `swarm` for parallel checks, `interrogate` for adversarial review, `unslop`, `deslop`, and `no-comments` for clean output, plus 21 first-principle skills that ground every decision. Delegation happens through your own subagents (`scout`, `worker`, `reviewer`, `oracle`, `poteto-agent`), so one chat stays in control while the work fans out.

This package ships everything the upstream [pstack](https://github.com/cursor/plugins/tree/main/pstack) plugin (0.14.4) bundles, adapted to Pi: the skills, the subagents, and the guide. It also fills the upstream README's "not shipped here" list, so you do not need cursor-team-kit. Two upstream pieces bound to Cursor's own runtime are excluded; "Not shipped" below lists them.

## Install

Requires Pi 0.84 or newer. Install `npm:pi-subagents` alongside for the agents and routed skills; the plugin warns at startup when a companion is missing.

```bash
pi install npm:@mccune1224/pi-pstack        # once published to npm
# or
pi install git:github.com/McCune1224/pi-pstack   # from the repository
# or, from a local checkout:
# pi install /path/to/pi-pstack
```

Then run `/reload`.

## Get started

Two steps.

1. Run `/pstack-setup`. Pick a scope and a tier, or assign a model per role. Everything defaults to `inherit`, which runs delegated agents on your parent model at no extra cost.
2. Type `/poteto-mode <task>` whenever the task needs rigor. The mode matches your task to a playbook and routes to the other skills as the steps fire. It stays on for the session; `/poteto-mode off` turns it back off.

New here? The [guide](docs/guide/README.md) walks through a first task from setup to verification.

## Commands

| Command | What it does |
|---|---|
| `/poteto-mode` | Enables sticky Poteto Mode and runs the task. `/poteto-mode <task>` matches a playbook and routes the work; `/poteto-mode` with no task just enables the mode; `/poteto-mode off` disables it. The choice persists across reloads and shows a footer status while on. |
| `/pstack-setup` | Model configuration wizard. Picks the target scope, applies tiers, or assigns a model per pstack role. Writes only the `subagents.*` keys in Pi settings. Fast paths: `/pstack-setup -l` (project scope), `/pstack-setup inherit` or `light` or `custom` (skip the tier picker), `/pstack-setup scout` (switch one role). |
| `/pstack-status` | One screen: parent session model, effective model per role, which settings file wins, and which pstack skills are loaded. |
| `/bro` | Restates the last assistant reply in plain human language. |

## Poteto Mode

Poteto Mode is the entry point. It is sticky: once enabled it stays on for the session, so follow-ups keep the rigor without re-invoking. The choice persists across sessions through a custom session entry, and a footer status shows `pstack: poteto mode` while it is on.

- `/poteto-mode <task>` enables the mode and routes that task through the playbook matcher.
- `/poteto-mode` with no task enables the mode only.
- `/poteto-mode off` disables it (also accepts `disable` and `stop`).
- Invoking `/skill:poteto-mode` directly enables the mode as well.

While on, every turn gets a short directive pointing at the `poteto-mode` skill as the single source of truth, so the rules are never duplicated in the extension.

No tools are registered. Skills carry the workflow; the extension only wires what a skill cannot reach: the model registry, settings files, the session, and the TUI. One startup event checks that the companions below are installed and warns with the install command when one is missing.

## Skills

All 44 Pi-compatible upstream skills ship, plus the four gap skills in the next section. The full set includes `/poteto-mode` and its 22 playbooks, the workflow skills (`how`, `why`, `architect`, `arena`, `swarm`, `interrogate`, `reflect`, `tdd`, `unslop`, `bro`, `technical-writing`, and more), and the 21 first-principle skills. Every skill is Pi-native: model defaults are `inherit`, subagents use Pi agents (`scout`, `worker`, `reviewer`, `oracle`, `poteto-agent`), and config reads Pi settings.

## Not shipped here, now shipped

Upstream pstack outsources these. This package bundles them.

| Piece | Where it came from | Status |
|---|---|---|
| `deslop` | cursor-team-kit | Ported. De-slops the diff before commit. |
| `control-cli` | cursor-team-kit | Ported. Local harnesses to drive and profile CLIs and TUIs. |
| `control-ui` | cursor-team-kit | Ported. Local browser/CDP harnesses to verify web and Electron UIs. |
| `create-skill` | Cursor builtin | Authored for Pi. Read it before writing or editing any SKILL.md. |
| `/babysit` | Cursor builtin | Resolved by the mode. Pi has no built-in; the `babysit` playbook in `/poteto-mode` owns PR-status requests. |

## Subagents

Two agents ship under the pstack names you already use:

- `poteto-agent` runs the mode end to end. It reads `poteto-mode` in full, including the inline principles index, before doing any work.
- `comment-sicko` is the read-only comment reviewer. Invoke it through `/no-comments`.

Both inherit your parent model by default. Configure them per role with `/pstack-setup`.

## Model configuration

Pi resolves pstack role models in this order:

1. Per-run override in the skill's subagent call
2. Agent frontmatter `model:`
3. `~/.pi/agent/settings.json` → `subagents.agentOverrides.<name>.model`
4. `subagents.defaultModel`
5. Parent session model

With no explicit selection, every role falls back to `inherit`, which follows the parent session model you run Pi with. `/pstack-setup` writes keys 3 and 4 (and `defaultThinking`, `thinking`, `fallbackModels` where a tier uses them). `/pstack-status` shows the parent model and the resolved role mapping, so you always see what `inherit` actually means right now.

Only set an explicit model when you want a tier. The custom tier sets the `default` role for a blanket default, or any specific role for a targeted model.

## Companions

pi-pstack needs no other plugins to load. Three Pi packages back specific surfaces; `subagent`, `todo`, and `ask_user_question` are package tools, not Pi built-ins.

| Package | Why |
|---|---|
| `npm:pi-subagents` | Required for the full set. Registers the `subagent` tool, reads this package's `agents/`, and backs every routed skill (`how`, `why`, `architect`, `arena`, `swarm`, `interrogate`, `reflect`). Without it the two agents and the delegation workflows have no backend. |
| `npm:@juicesharp/rpiv-todo` | Recommended. The playbooks open a todo list through the `todo` tool. |
| `npm:@juicesharp/rpiv-ask-user-question` | Recommended. Skills reach the user through the `ask_user_question` tool. |

At startup the plugin checks for these and tells you the install command when something is missing.

## Not shipped

Two upstream pieces are excluded because they are bound to Cursor's runtime and cannot work on Pi:

- `grokbot/make-bot-ui` drives Cursor's automation webhook panels.
- The dormant `benny` automation pack registers through `.cursor/settings.json` and Cursor automations.

Pi has no automation runtime. If you ever run under one, fetch both from upstream.

## Maintenance

`npm run sync:upstream` re-vendors the upstream tree and then scans for Cursor-only references (`~/.cursor`, `AskQuestion`, `subagent_type`, `grok-4.6` and friends, `/add-plugin`) so a re-adapted state is a diff you review, and nothing Cursor-shaped ships to Pi. Run it after each upstream pstack release. Both tools are plain Node scripts, so they run on any machine that runs Pi.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Skills do not appear | Run `/reload` after install. `/pstack-status` lists the loaded pstack skills and should show 48. |
| Model changes do not apply | `/pstack-setup` writes settings; `/reload` applies them. `/pstack-status` shows what resolved. |
| Startup warning about a missing companion | `pi install <package>` for each name in the warning, then `/reload`. |
| `/poteto-mode` does not engage | Run `/skill:poteto-mode <task>` directly. A user-scope skill with the same name shadows the package one; remove it from `~/.pi/agent/skills/`. |
| Everything broke after an upgrade | The package is a git repo; `git log` shows each release. Reinstall with `pi install git:github.com/McCune1224/pi-pstack@<tag>` to pin a version. |

## Development

```bash
npm ci
npm run typecheck          # strict tsc over extensions/
npm run check:piisms      # exit 1 if Cursor-shaped content ships
```

Verify against a real Pi surface before releasing: `pi -e . -p "Say ok"` must load clean, and `/pstack-status` in a TUI session must show the 48 skills and the resolved model map.

`npm test` runs the committed unit tests over the extension's pure logic (model map parsing, tier builders, settings IO, mode state).

## License

MIT. The skillset is adapted from poteto's [pstack](https://github.com/cursor/plugins/tree/main/pstack) (MIT, Lauren Tan); this package ports and extends it for Pi. The extension patterns are informed by the earlier Pi ports [@zenspc/pi-pstack](https://github.com/zenspc/pi-extensions/tree/master/packages/pi-pstack) and [pi-pstack](https://www.npmjs.com/package/pi-pstack) (both MIT).