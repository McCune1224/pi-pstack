# Set up pstack

In this page you install the package, pick which models pstack uses, and run your first task. Setup is one command plus a short conversation.

## Install the package

```bash
pi install npm:@mccune1224/pi-pstack
```

From a checkout, `pi install /path/to/pi-pstack` works the same way. Then run `/reload`, and Pi registers the skills, the agents, and the commands.

Install [`pi-subagents`](https://www.npmjs.com/package/pi-subagents) alongside it. It provides the `subagent` tool that every routed workflow uses. pstack checks at startup and names the missing package when it is absent.

## Pick your models

Run:

```text
/pstack-setup
```

[`/pstack-setup`](../../skills/setup-pstack/SKILL.md) reads the models your session can reach, asks where to save the map, and offers three tiers: all-inherit, light, or a per-role picker. Fast paths skip the questions, so `/pstack-setup -l` writes to the project, `/pstack-setup inherit` takes the cheapest tier, and `/pstack-setup scout` changes one role.

It writes the `subagents.*` keys in Pi settings, which is the same place every other Pi tool reads model choices from:

- User scope: `~/.pi/agent/settings.json`
- Project scope: `.pi/settings.json`, which wins when both exist

Every role defaults to `inherit`, which runs the delegate on your parent session model at no extra cost. That is the recommended setting. Set a role explicitly only when you want a tier, and `/pstack-status` shows the resolved map and names the file that won.

Because pstack uses Pi's own settings, the mapping is not private to this package. Anything else that reads `subagents.*` sees the same choices, and you can edit the file by hand.

## Check what is loaded

Run:

```text
/pstack-status
```

[`/pstack-status`](../../extensions/index.ts) prints the parent session model, the effective model for every role, the settings file that won, and how many pstack skills are loaded. It also reports the system-prompt cost of the skills Pi exposes to the model.

## Accept the verification offer, or don't

At the end of setup, `/pstack-setup` looks for a way to prove app behavior in your project, either a `verify-*` skill or an existing harness. If it finds neither, it offers once to generate one with [`/create-verification-skill`](../../skills/create-verification-skill/SKILL.md).

Say yes and it writes `.pi/skills/verify-<app>/`, a project-local skill that teaches agents to drive your app the way a user does. It proves the skill works once before handing it over. Say no and setup moves on. You can run `/create-verification-skill` yourself any time. [Verify and ship](./06-verify-and-ship.md#create-a-project-verification-skill) covers when it earns its place.

The model map applies from the next turn. Pi re-reads settings per turn, so no reload is needed.

## Run your first task

Pick something real but small, and describe it the way you'd describe it to a colleague:

```text
/poteto-mode add a --json flag to this command. text output stays byte-identical. verify both.
```

Watch the todo list. The first item is always to read the Principles section. The rest are the matched playbook's steps copied in, the Feature playbook for this prompt. If `/poteto-mode` skips a step, the step stays in the list with `skip: <reason>`, so you can see what it chose not to do.

From here you can type normal follow-ups. `/poteto-mode` is sticky. It stays on for the session, the choice persists across reloads, and the footer shows `pstack: poteto mode` while it is on. `/poteto-mode off` turns it back off.

Next: [Route work through `/poteto-mode`](./02-poteto-mode.md).
