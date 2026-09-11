---
name: setup-pstack
description: Configure which models pstack uses per role for Pi. Detects your available Pi models and writes the subagents.* keys in Pi settings. Manual fallback for the /pstack-setup command; use it when the extension picker is unavailable.
---

# Setup pstack

Write the `subagents.*` keys in Pi settings. `/pstack-setup` does the same thing through Pi's TUI pickers. Run this skill when you want the headless path, or when you need a mapping the picker does not offer.

## Where Pi reads a delegate's model

First match wins:

1. `subagent({ model: "..." })` on the call itself
2. `model:` in the agent's frontmatter
3. `subagents.agentOverrides.<agent>.model`
4. `subagents.defaultModel`
5. the parent session model

pstack agents are already run through `pi-subagents`, and their frontmatter carries no model, so step 3 or step 4 decides. Leave both unset and every role runs on the parent model, which costs nothing extra. Set them only when you want a tier.

Two scopes, and project wins:

- User `~/.pi/agent/settings.json`
- Project `.pi/settings.json`

## Steps

### 1. Detect available models

Read the models the session can reach. `ctx.modelRegistry.getAvailable()` inside the extension, or the list `/model` shows, is the dependable source. If you cannot detect any, ask the user to paste the slugs they have access to. Never write a real slug you have not confirmed is available. The value `inherit` is always valid even though it is not a detected slug.

### 2. Load current state

Read `~/.pi/agent/settings.json` and, when the project has one, `.pi/settings.json`. Extract `subagents.defaultModel`, `subagents.defaultThinking`, and `subagents.agentOverrides`. Treat anything absent as `inherit`.

### 3. Map pstack roles onto Pi agents

pstack names 17 roles. Pi has six agents, so several roles share one. Show the mapping, not 17 lines.

| pstack role | Pi agent |
|---|---|
| feature, refactoring | `worker` |
| bug-fix, perf-issue, hillclimb | `oracle` |
| judgment and prose, hardest tasks | `oracle` |
| how explorer, why investigators | `scout` |
| how explainer, why synthesizer | `oracle` |
| reflect tooling | `worker` |
| reflect judgment, divergent, synthesizer | `oracle` |
| arena runners, architect runners, interrogate reviewers | `reviewer` |
| arena cross-judge pool | `oracle` |
| swarm workers | `scout` |
| the playbook orchestrator itself | `poteto-agent` |
| comment review | `comment-sicko` |

Then show every agent with its current model, marking any real slug that is not in the detected set as needing a choice. Offer the detected models plus `inherit`. Prefer a picker over free text.

A role whose value is a list upstream (the arena and architect panels, the interrogate reviewers) becomes repeated `subagent` calls here. The list length sets the fan-out, so keep it small.

### 4. Validate

Every real slug you write must be in the detected set. `inherit` always passes. If a chosen slug is not available, stop and ask again.

### 5. Write the settings

Merge into the target `settings.json` without disturbing other keys. Overwrite the `subagents.*` keys you own so re-runs stay idempotent. Shape:

```json
{
  "subagents": {
    "defaultModel": "inherit",
    "defaultThinking": "high",
    "agentOverrides": {
      "scout": { "model": "inherit", "thinking": "low" },
      "worker": { "model": "inherit" },
      "reviewer": { "model": "inherit" },
      "oracle": { "model": "inherit", "fallbackModels": ["<a cheaper model you have>"] },
      "poteto-agent": { "model": "inherit", "thinking": "high" },
      "comment-sicko": { "model": "inherit", "thinking": "high" }
    }
  }
}
```

`inherit` is the right starting value. It runs every delegate on the parent model at no extra cost, and it is what the all-inherit tier writes.

### 6. Confirm

Tell the user which file changed and that it applies from the next turn. Pi re-reads settings per turn, so no reload is needed. `/pstack-status` shows the resolved map and which file won.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof, a `verify-*` skill or an existing harness. If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, invoke `/create-verification-skill`. On no, move on without pushing.
