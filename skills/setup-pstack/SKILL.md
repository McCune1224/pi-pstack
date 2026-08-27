---
name: setup-pstack
description: Configure which models pstack uses per role for Pi. Detects your available Pi models and writes Pi settings that override skill defaults. Use for /setup-pstack, "configure pstack models", or changing pstack's model choices.
---

# Setup pstack (Pi)

This skill writes Pi's native model config, so delegated agents stay on cheap models you already have.

## Pi model config path

Pi resolves models in this order:
1. Per-run `subagent({model:"..."})` override
2. Agent frontmatter `model:`
3. `~/.pi/agent/settings.json` -> `subagents.agentOverrides.<name>.model`
4. `subagents.defaultModel`
5. Parent session `defaultModel` (`opencode-go/hy3` for you)

All pstack roles default to `inherit` (parent model). That keeps cost on `hy3`. Only set an explicit model when you want a tier.

Pi has these config scopes:
- User: `~/.pi/agent/settings.json` -> `subagents.*`
- Project: `.pi/settings.json` -> `subagents.*` (project wins)

## Steps

### 1. Detect available models

Source is `pi --list-models` / `ctx.modelRegistry`. For this host the cheap pool is `opencode-go/hy3`, `opencode-go/deepseek-v4-flash`, `opencode-go/inherit`, `opencode-go/gpt-5.6-luna`, plus `openrouter/*` and `openai-codex/*` if you want to burn subs. Prefer AskQuestion with detected slugs + `inherit`.

If you cannot detect, ask user to paste slugs. Never write a slug you have not confirmed via registry. `inherit` (alias `auto` / `inherit-parent`) is always valid and means run on parent model.

### 2. Load current state

Read `~/.pi/agent/settings.json` and `.pi/settings.json` if present. Extract `subagents.defaultModel`, `subagents.agentOverrides`, `subagents.defaultThinking`. If absent, treat as `inherit`.

### 3. Map and confirm (TUI)

Show every pstack role mapped to Pi agent names:

| pstack role | Pi agent/override key |
|---|---|
| feature, refactoring, bug-fix, perf, hillclimb | `worker` |
| how explorer, why investigators, swarm workers | `scout` |
| how explainer, why synthesizer, judgment/prose, hardest | `oracle` |
| how critics, arena runners/cross-judge, architect runners, interrogate reviewers | `reviewer` (fan-out) + `oracle` |

Instead of 15 separate lines, Pi condenses to 4-5 overrides. Offer detected models + `inherit` as options via `ctx.ui.select` / `ask_user_question`. For panel roles (critics/runners) the value is a list - in Pi that means multiple `subagent` calls; keep list length small to limit cost.

Prefer `inherit` for cost. The extension `/pstack-setup` command does this via a TUI picker.

### 4. Validate

Every real slug must be in registry. `inherit` always passes. If not available, ask again. A bad slug breaks delegation.

### 5. Write the rule

Write Pi settings, not Cursor rules. Update `~/.pi/agent/settings.json` (or `.pi/settings.json` with `-l` flag):

```json
{
  "subagents": {
    "defaultModel": "opencode-go/hy3",
    "defaultThinking": "high",
    "agentOverrides": {
      "scout": {"model": "inherit", "thinking": "low"},
      "worker": {"model": "inherit"},
      "reviewer": {"model": "inherit"},
      "oracle": {"model": "inherit", "fallbackModels": ["opencode-go/deepseek-v4-flash"]}
    }
  }
}
```



For explicit tier (cheapest -> still cheap):
- `scout`: `opencode-go/hy3` low
- `worker`/`reviewer`: `inherit`
- `oracle`: `opencode-go/deepseek-v4-flash` or `inherit` + fallback

### 6. Confirm

Tell user settings were written and require `/reload` or restart to apply. Mention `pi-subagents` picks up overrides after reload. Run `/subagents-models` to verify live mapping. Re-running this skill updates it.

### 7. Offer verification skill (optional)

Same as upstream: if project lacks a `verify-*` skill, offer `/create-verification-skill` once.

## Also available as slash command

Run `/pstack-setup` in Pi TUI. It does steps 1-6 via interactive pickers without loading this skill text. This SKILL.md is the manual fallback.
