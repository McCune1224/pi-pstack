# Changelog

## 0.1.0 (first release)

Initial release of pstack for Pi.

- 48 skills: `poteto-mode` with its 22 playbooks, the workflow skills, the 21 first-principle skills, and the gap-fill ports `deslop`, `control-cli`, `control-ui`, `create-skill`.
- Two package agents: `poteto-agent` and `comment-sicko`.
- Commands: `/poteto-mode` (sticky mode toggle: on/off/task, persists across sessions, footer status), `/pstack-setup` (model wizard with scope, tier, and per-role fast paths), `/pstack-status` (parent model, resolved mapping, loaded skills), `/bro` (plain-language restatement).
- Startup companion check warns when `npm:pi-subagents`, `npm:@juicesharp/rpiv-todo`, or `npm:@juicesharp/rpiv-ask-user-question` is missing.
- Pi-only surface: `inherit` model defaults, Pi settings paths, Pi agents, no Cursor-bound pieces (`grokbot`, `benny` excluded).
- Maintenance levers: `npm run sync:upstream` and `npm run check:piisms` (plain Node, cross-platform).