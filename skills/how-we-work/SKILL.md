---
name: how-we-work
description: Legacy compatibility alias for the canonical how-to-work skill. Use how-to-work for new prompts, docs, generated interfaces, and installs.
version: 0.1.0
minEngine: "how-to-work >= 0.3.3 (Node >= 18)"
metadata:
  tags: [workflow, prd, doc, send-it, progress, ledger, legacy-alias]
---

# How We Work

This name is a compatibility alias. The canonical skill is now `how-to-work`.

When invoked through this alias:

1. Load and follow `skills/how-to-work/SKILL.md`.
2. Treat `/how-to-work` and `/how-to` as the preferred invocation names in any new doc, prompt, command shim, or handoff.
3. Do not create new project-local `how-we-work` shims unless maintaining an existing install that already depends on that name.

Why this alias exists: older Codex and Claude installs used `how-we-work` for the workflow doctrine while the engine/package was named `how-to-work`. That split was confusing. `how-to-work` is now the one blessed name for the full workflow; this file keeps old links recoverable without preserving two competing concepts.
