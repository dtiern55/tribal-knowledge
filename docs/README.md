# Technical documentation

This directory is an implementation and operations map, not a second product
specification. For gameplay intent and current product decisions, follow the
source-of-truth order in [`../AGENTS.md`](../AGENTS.md).

- [`schema.md`](schema.md) — current database entities, relationships, RLS, and how to regenerate a schema dump.
- [`scoring.md`](scoring.md) — how raw episode facts and player decisions become live standings.
- [`operations.md`](operations.md) — the command index for setup, imports, weekly scoring, bots, migrations, and deployment.

Repository architecture, development commands, and deployment invariants remain
in [`../CLAUDE.md`](../CLAUDE.md). Focused product briefs remain under
[`../design/`](../design/).
