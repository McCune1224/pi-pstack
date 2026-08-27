# pi-pstack

pstack for Pi. Poteto's rigorous engineering workflow as a Pi plugin. Write less code, write better code, and parallelize with confidence.

This package ships everything the upstream [pstack](https://github.com/cursor/plugins/tree/main/pstack) plugin (0.14.4) bundles, adapted to Pi: the skills, the subagents, the guide, and the dormant benny automation pack. It also fills the upstream README's "not shipped here" list, so you do not need cursor-team-kit.

## Install

```bash
pi install /path/to/pi-pstack
# or, after publishing:
# pi install git:github.com/<you>/pi-pstack
```

Then run `/reload`.

## Get started

Two steps.

1. Run `/pstack-setup`. Pick a scope and a tier, or assign a model per role. Everything defaults to `inherit`, which runs delegated agents on your parent model at no extra cost.
2. Type `/poteto-mode <task>` whenever the task needs rigor. The mode matches your task to a playbook and routes to the other skills as the steps fire.

New here? The [guide](docs/guide/README.md) walks through a first task from setup to verification.

## Commands

| Command | What it does |
|---|---|
| `/pstack-setup` | Model configuration wizard. Picks the target scope, applies tiers, or assigns a model per pstack role. Writes only the `subagents.*` keys in Pi settings. Fast paths: `/pstack-setup -l` (project scope), `/pstack-setup inherit` or `light` or `custom` (skip the tier picker), `/pstack-setup scout` (switch one role). |
| `/pstack-status` | One screen: effective model per role, which settings file wins, and which pstack skills are loaded. |
| `/bro` | Restates the last assistant reply in plain human language. |
| `/setup-pstack`, `/pstack-models` | Aliases of `/pstack-setup` for upstream muscle memory. |

No tools or events are registered. Skills carry the workflow; the extension only wires what a skill cannot reach: the model registry, settings files, the session, and the TUI.

## Skills

All 45 upstream skills ship, including `/poteto-mode` and its 22 playbooks, the workflow skills (`how`, `why`, `architect`, `arena`, `swarm`, `interrogate`, `reflect`, `tdd`, `unslop`, `bro`, `technical-writing`, and more), the 21 first-principle skills, and `grokbot/make-bot-ui`. Every skill is Pi-native: model defaults are `inherit`, subagents use Pi agents (`scout`, `worker`, `reviewer`, `oracle`, `poteto-agent`), and config reads Pi settings.

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

`/pstack-setup` writes keys 3 and 4 (and `defaultThinking`, `thinking`, `fallbackModels` where a tier uses them). All roles default to `inherit`, which keeps cost on the parent model. Only set an explicit model when you want a tier.

## Automations

The dormant [benny pack](automations/benny/) ships unregistered, exactly as upstream keeps it. It is not exposed as slash skills. Point Pi at `automations/benny/FOR_AGENTS.md` to set it up in a repository.

## Maintenance

`scripts/sync-upstream.sh` re-vendors the upstream tree and then scans for Cursor-only references (`~/.cursor`, `AskQuestion`, `subagent_type`, `grok-4.6` and friends, `.mdc` paths) so a re-adapted state is a diff you review, not a silent drift. Run it after each upstream pstack release.

## License

MIT. Upstream copyright held by Lauren Tan; this package adapts and extends it for Pi.