---
name: linear
description: AIDOS's single work tracker is Linear. Use this skill to create/update issues, file ADRs as tracked decisions, and keep KRD step progress (S00, S01, …) in sync with reality — always in the AIDOS Linear project. Triggers on "create a ticket / issue", "file this ADR", "where am I on the steps", "update Sxx", "put it in Linear", "triage", or any tracker request. MCP-first via the official Linear server.
---

# Linear — the AIDOS tracker

Linear is the **single source of work-tracking truth** for AIDOS (distinct from the Postgres *kernel* truth-store, which holds product truth — see the wall). Everything that is a unit of work — a **KRD step**, an **ADR**, or a **ticket** (feature/bug/refactor/spike) — is tracked here.

> **The project.** Workspace `aidos-linear`, project **AIDOS** → `https://linear.app/aidos-linear/project/aidos-2a9085453be8/overview` (project id `aidos-2a9085453be8`). **Every issue MUST attach to this project.** Coordinates, the full step↔issue map, the ADR list, the label set and the templates live in [reference/aidos-linear.md](./reference/aidos-linear.md) — read it before creating or syncing.

## Tooling — MCP-first

Use the **official Linear MCP server** `linear-server` (configured in `.mcp.json` → `https://mcp.linear.app/mcp`). Its tools appear as `mcp__linear-server__*`:

| Need | Tool (official server) |
|---|---|
| Create an issue | `create_issue` (always pass `projectId` for AIDOS) |
| Update status / fields | `update_issue` |
| Read / search issues | `get_issue`, `list_issues`, `list_my_issues` |
| Comment | `create_comment` |
| Projects / initiatives | `list_projects`, `get_project`, `update_project`, `create_project` |
| Workspace metadata | `list_teams`, `list_issue_statuses`, `list_issue_labels`, `list_users` |

> **First use needs OAuth.** The Linear MCP authenticates via browser the first time (like the other remote MCPs in `claude mcp list`). If a call returns "not authenticated" / "unauthorized", tell the user to authenticate the `linear-server` MCP in their Claude Code session (`claude` → approve), then retry. Do **not** report "MCP unavailable" as a hard blocker without trying — and never invent issue ids or pretend a write succeeded.

There is **no** API-key / npm-SDK path in AIDOS (no `@linear/sdk`, no varlock). The MCP is the only door; the GraphQL API is a manual fallback only if the MCP lacks an operation.

## The three things AIDOS tracks

1. **KRD steps** — one issue per step, titled `Sxx · <name>` (e.g. `S01 · Magasin de contenu`). Labels: `step` + the subsystem (`runtime`/`kernel`/`mirror`/`archive`/`workbench`). **Status mirrors reality**: `Backlog` (not started) → `Todo` (next) → `In Progress` (being built) → `In Review` (verifying) → `Done` (green ∧ verified). The Acceptance Criteria **are the step's done-criteria** (the red set). The step-executor moves the issue to `In Progress` at the start of a step and `Done` at green; the step-verifier flips it back if verification fails. See the map in the reference.
2. **ADRs** — one issue per decision, titled `ADR 000N · <title>`, labels `adr` + `documentation`, set `Done` once the ADR is accepted. Body = Context / Decision / Consequences; link the `docs/adr/000N-*.md` file and its Mintlify page. `/grill-with-docs` files/updates this issue whenever it lands an ADR.
3. **Tickets** — features, bugs, refactors, spikes surfaced by `/to-issues`, `/triage`, `/qa`, `/request-refactor-plan`, `/to-prd`. Use the issue template and the label taxonomy.

## Issue template (required body)

Default to the full six sections (collapse only on an explicit "quick/brief" request). For KRD work, read AC and Verification through the KRD lens.

```markdown
## Context
<What is changing and why. Link the step, prior issues, ADRs, or the spec.>

## Problem
<What is missing/broken today. Name the file, package, mirror, or schema.>

## Proposal
<High-level approach. For a step: the capability and where it lives.>

## Acceptance Criteria
- [ ] <Concrete, testable outcome — for a step, this is a done-criterion / red-set item>
- [ ] <…>

## Verification
<How the AC is checked. For a step: the mirror run — Godog / rapid / Playwright / Testcontainers — plus "prior green intact ∧ no monster".>

## Out of Scope
- <Deferred / forward-dependency (OpenQuestion), or what a follow-up covers>
```

Floor: non-empty, ≥2 real AC items. Depth is the target, not the floor.

## Labels (taxonomy — reuse, don't proliferate)

- **Type — exactly one:** `feature`, `bug`, `refactor`, `chore`, `spike`, plus AIDOS kinds `step`, `adr`.
- **Domain — 1–2:** AIDOS subsystems `runtime`, `kernel`, `mirror`, `archive`, `workbench`; or technical `backend` (Go), `frontend` (Next), `database` (Postgres), `mcp`, `cli`, `documentation`, `security`, `testing`, `infrastructure`.
- **Scope — 0–2:** `blocked`, `tech-debt`, `breaking-change`, `needs-split`.

Check `list_issue_labels` first; create a missing label (`create_issue_label`) only if the taxonomy truly lacks it.

## Hierarchy & discipline

**Issue → Project (AIDOS) → Initiative.** Never leave an issue unattached to the AIDOS project (it won't show on the board). Prefer creating an issue in the right project from the start over moving it later. Before creating, `list_issues` (or search) to avoid duplicates — update the existing issue instead.

## Honesty

The Linear tracker reflects reality: never set a step `Done` unless its mirror is green and verified (CLAUDE.md §8 — done is computed). A forward-dependency is an `Out of Scope` / OpenQuestion line, not a silent omission. This skill records work; it never writes product truth (the wall stands).
