---
name: s53-projectscope
description: S53 verification — Project root-scope record (multi-tenant foundation, app-builder EPIC 1, first step after EL track)
metadata:
  type: project
---

S53 — first-rank Kernel concept `project` that SCOPES every truth (multi-tenant root; before S53 the truth-store was one undivided global graph). First step of the app-builder track (S53→S117) after EL00-19.

Done-criteria all met & verified-green:
- **id content-addressé**: pure Project record, id==version==records.Hash(Canonicalize(body)) REUSING S01/S02 scheme (not forked); body discriminator kind="project". Go rapid (TestContentAddressed) + TS fast-check twin. CROSS-PLANE PARITY independently recomputed: Go `project.New("alpha","Alpha Shop","owner-1","2026-06-07T09:00:00Z").ID` == TS pinned id == `7b420a85…310ec` (I ran both).
- **slug unique par owner**: pure Registry (in-mem gate, NewRegistry/CanCreate/Create→ErrDuplicateSlug) + Postgres UNIQUE index `((owner_ref),(slug)) WHERE superseded_by IS NULL AND lifecycle<>'deleted'` (defense in depth, Testcontainers TestSlugUniquePerOwnerInDB). Soft-delete frees slug; archived holds it.
- **deux graphes disjoints (no cross-read)**: `Scope[T Scopable](pid, rows)` pure filter; property proves partition (|A|+|B|==total), no shared tag, only-own-rows. DAG-root-per-project via RootNode REUSING S24 dag.NodeID over content-addr label → distinct roots (projects.dag_root FK to project id, Testcontainers).
- **/projects écrit below-the-line via store**: Server Actions (actions.ts) write ONLY projects schema (INSERT project + dag_root in tx, Supersede append-only for lifecycle, NO SQL DELETE — soft delete only). MCP store.go wall-clean (grep: zero kernel/mirrors/fitness writes).
- **scoping = fonction pure**: TestScopePure (Go) + scope pure (TS).

Lifecycle = closed three {active,archived,deleted}; transitions re-emit a NEW content-addressed row (append-only §9, hard GDPR delete=S116). Migration projects_baseline.sql: GRANT INSERT/SELECT/UPDATE no DELETE/TRUNCATE to aidos_agent, RE-ASSERTS REVOKE on kernel.truth/layer/link + mirrors.mirror (all 4 table names verified to exist → REVOKE won't error). [[s00-pattern]] wall-re-assert pattern.

Sensors: gofmt/vet/build0 clean; go test ./kernel/project ok 9.3s (Testcontainers RAN, Docker present — no -short guard but t.Skipf if Docker absent). TS vitest 8/8, tsc clean (no project errors), biome clean 5 files (NO biome-clean-lie this step — see [[biome-clean-report-lie]] did NOT recur). Full back `go build ./...` GREEN (prior-green intact).

Front: panel action-capable (create/archive/restore/delete each bound to Server Action + data-testid), nav entry `{href:"/projects",k:"projects"}` in WorkbenchHeader, page wires panel + live/demo badge. i18n 3249==3249 ZERO orphans, projects ns both locales. Route 200 :3000. e2e 5/5 (render, two-disjoint-distinct-slugs, create fill+click+result, invalid-slug refused, lifecycle-delete click+result — controls executable not headless; DB-semantics proven by Testcontainers not e2e).

Docs: .aidos-docs/steps/concept/s53-projects.mdx + steps/internals/s53-projects.mdx (3 H2 layers Implémentation·Méta·Méta-méta), 2 docs.json entries, mint validate PASSED, HEAD==origin/main da68593 clean tree.

OpenQuestions (forward-deps, by-design NON-blocking): project_id column on kernel/mirrors/ideas/changesets/dag/brain/context = S54; RLS + project-aware wall = S55; real owner behind owner_ref = S62; hard GDPR delete = S116; reconcile Workbench-direct-write vs project MCP door via HTTP gateway = S58; Linear MCP unauthenticated this session (only authenticate/complete_authentication deferred tools loaded, not issue tools) = OQ per §11.

verified-green ZERO corrections.
