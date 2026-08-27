---
name: create-skill
description: Author or edit a SKILL.md for an agent skill. Use before writing or modifying any SKILL.md file.
---

# Create skill

Write agent skills the agent can actually follow. This page covers the SKILL.md contract, structure, and prose rules. Follow it before authoring or editing any SKILL.md.

## Frontmatter

SKILL.md starts with YAML frontmatter. Two fields are required.

| Field | Rule |
|---|---|
| `name` | Lowercase letters, numbers, hyphens. 1-64 characters. Prefer a name that matches the parent directory. |
| `description` | What the skill does and when to use it. Be specific. Under 1024 characters. This is the only part the agent sees up front, so make it load-bearing. |

Pi honors two optional fields. `disable-model-invocation: true` hides the skill from the system prompt; only `/skill:name` invokes it. `mode: true` makes the skill a sticky mode that stays on across turns.

## Structure

A skill is a directory with a SKILL.md file. Everything else is freeform.

```
my-skill/
├── SKILL.md
├── scripts/
│   └── run.sh
└── references/
    └── details.md
```

Reference files with relative paths from the skill directory. Load detailed material on demand instead of inlining it. The agent sees only the description until it reads the file.

## Progressive disclosure

The description is always in context. The rest of the SKILL.md loads on demand. Keep the first page load-bearing. Put step-by-step workflows in the SKILL.md body and depth in the references.

## Prose rules

- Write concise Simplified Technical English. Short declarative sentences.
- Imperative mood. Tell the agent what to do.
- Example first, explanation second. A runnable snippet beats a paragraph.
- No AI tells or filler. No "delve", "leverage", "comprehensive".
- No narrating comments in script examples. The assertion or command output is the doc.
- One name per concept. One spelling per concept across the skill.

## Example

~~~markdown
---
name: pdf-merge
description: Merge multiple PDFs in order. Use when the user asks to combine PDF files.
---

# PDF merge

Merge PDFs with the system `pdfunite` tool.

    pdfunite a.pdf b.pdf out.pdf

Verify the output page count matches the sum of the inputs.
~~~

## References

- Agent Skills specification: https://agentskills.io/specification
- Pi skills documentation: docs/skills.md in the pi-coding-agent package