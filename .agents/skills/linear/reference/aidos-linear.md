# AIDOS ↔ Linear — coordinates, maps, templates

## Project coordinates

| | |
|---|---|
| Workspace | `aidos-linear` |
| Project | **AIDOS** |
| Project id | `aidos-2a9085453be8` |
| Overview URL | https://linear.app/aidos-linear/project/aidos-2a9085453be8/overview |
| MCP server | `linear-server` → `https://mcp.linear.app/mcp` (tools `mcp__linear-server__*`) |

Resolve the live project + team ids at runtime with `list_projects` / `list_teams` (match name `AIDOS`); pass the resolved `projectId` to every `create_issue`.

## Status model

`Backlog` → `Todo` → `In Progress` → `In Review` → `Done` (and `Canceled`). Confirm the exact names with `list_issue_statuses`. A KRD **step** is only `Done` when its red set is green ∧ prior green intact ∧ no monster (CLAUDE.md §8).

## KRD steps ↔ issues

One issue per step, titled `Sxx · <name>`, labelled `step` + subsystem. **Status below reflects reality as of the bootstrap** — re-read git/PLAN.md and update before trusting it.

| Step | Title | Subsystem | Status |
|---|---|---|---|
| S00 | Contrat d'exécution | runtime | **Done** |
| S01 | Magasin de contenu (Postgres + Atlas) | archive | **Done** |
| S02 | KRDCore — records | kernel | **In Progress** |
| S03 | CLI `aidos` | runtime | Backlog |
| S04 | Le mur (wall hook) | runtime | Backlog |
| S05 | CI / cliquet | runtime | Backlog |
| S06 | Schéma mirrors + liveness | mirror | Backlog |
| S07 | Sensors | runtime | Backlog |
| S08 | Expr DSL | kernel | Backlog |
| S09 | Policy DSL | kernel | Backlog |
| S10 | Operation DSL | kernel | Backlog |
| S11 | Control / Action | kernel | Backlog |
| S12 | Complétude / monstre | mirror | Backlog |
| S13 | BlockReason | runtime | Backlog |
| S14 | Truth-typing | kernel | Backlog |
| S15 | Truth-scope | kernel | Backlog |
| S16 | Authority graph | kernel | Backlog |
| S17 | Links (versioned) | kernel | Backlog |
| S18 | Composes / aggregate | kernel | Backlog |
| S19 | Weighted propagation | kernel | Backlog |
| S20 | ChangeSet | archive | Backlog |
| S21 | SemanticDiff | archive | Backlog |
| S22 | Impact / red wave | mirror | Backlog |
| S23 | Phase stable | archive | Backlog |
| S24 | Version DAG | archive | Backlog |
| S25 | Semantic merge | archive | Backlog |
| S26 | Curation / QD | archive | Backlog |
| S27 | Ideas lifecycle | kernel | Backlog |
| S28 | Exploration gestures | runtime | Backlog |
| S29 | Goal engine | runtime | Backlog |
| S30 | Memory firewall | archive | Backlog |
| S31 | Memory (pgvector) | archive | Backlog |
| S32 | ContextGraphDecision | archive | Backlog |
| S33 | Context router | runtime | Backlog |
| S34 | Emitters | runtime | Backlog |
| S35 | Entity source | kernel | Backlog |
| S36 | API projection | runtime | Backlog |
| S37 | DB projection | runtime | Backlog |
| S38 | Web projection | workbench | Backlog |
| S39 | Méta-méta (fitness) | runtime | Backlog |
| S40 | Mutation testing | runtime | Backlog |
| S41 | Kernel debt | archive | Backlog |
| S42 | Evolution sandbox | runtime | Backlog |
| S43 | Reality mirror | mirror | Backlog |
| S44 | Workbench complet | workbench | Backlog |
| S45 | AIDOS compiler | runtime | Backlog |
| S46 | Démo checkout | runtime | Backlog |
| S47 | Adoption / release | runtime | Backlog |

Each step issue's body uses the template; its Acceptance Criteria are copied from the "Done criteria" of `docs/plan/Sxx-*.md`, and Verification names the mirror runner(s). Link the plan doc and both Mintlify pages (`/steps/concept/sNN-*`, `/steps/internals/sNN-*`).

## ADRs ↔ issues

One issue per ADR, titled `ADR 000N · <title>`, labels `adr` + `documentation`, status `Done` once accepted. Body = Context / Decision / Consequences; link `docs/adr/000N-*.md`.

| ADR | Title |
|---|---|
| 0001 | AIDOS is the OS — back engine, front web UI |
| 0002 | Mirror is a plane inside the Kernel |
| 0003 | Frozen stack |
| 0004 | Truth lives in Postgres |
| 0005 | Dynamic workflow execution |
| 0006 | Dolt(gres) for the emitted-app datastore |
| 0007 | Reuse mature libs inside DSL-as-AST |
| 0008 | Memory Layer A vs Layer B |
| 0009 | MCP everywhere + per-step artifact accretion |

New ADRs are filed by `/grill-with-docs` as they land.

## Labels

- **Type (one):** `feature`, `bug`, `refactor`, `chore`, `spike`, `step`, `adr`.
- **Domain (1–2):** `runtime`, `kernel`, `mirror`, `archive`, `workbench`, `backend`, `frontend`, `database`, `mcp`, `cli`, `documentation`, `security`, `testing`, `infrastructure`.
- **Scope (0–2):** `blocked`, `tech-debt`, `breaking-change`, `needs-split`.

## Initial population (one-time, when authenticated)

1. `list_projects` → resolve the AIDOS `projectId`; `list_teams` → `teamId`; `list_issue_statuses`, `list_issue_labels`.
2. Create any missing labels from the taxonomy.
3. Create the 48 step issues (table above) with the right status, and the 9 ADR issues (`Done`).
4. Thereafter: the step-executor/verifier keep step statuses in sync; `/grill-with-docs` keeps ADR issues current; `/to-issues` etc. add tickets — all in the AIDOS project.
