---
name: s64-capture-idea
description: S64 « Capturez votre idée » — project-scoped human-provenance idea capture into the live per-project ideas inbox (app-builder EPIC 4); verified green
metadata:
  type: project
---

S64 = the project-scoped HUMAN capture door: free-text intention + provenance, SCOPED to active project (S54 project_id COLUMN, never identity), persisted as draft `ideas` record (NO mirror), visible in THAT project's live inbox ONLY (cross-project isolation). Replaces global /ideas fixture (S27 was read-only). DONE-CRIT (Godog capture→draft persisted, visible in live panel, with user provenance) MET directly.

**Why PASS, zero corrections:**
- Backend `go test ./mcp/idea-intake/ -count=1` GREEN 7.252s (Testcontainers ran real pg16 — capture_scoped_bdd_test.go applies records+ideas+projects+project_scope migrations, seeds proj-alpha/proj-beta, 3 scenarios incl wall scenario: aidos_agent SET ROLE → INSERT kernel.truth → permission denied). Reproducibility mirror capture_scoped_property_test.go 4 rapid (scope≠identity same sketch→same id across projects, determinism 100×, provenance preserved, never freezes status=draft). go build/vet/gofmt clean.
- Store.InsertScoped/ListScoped+ScopedIdea; legacy Insert/List DELEGATE to scoped path (no fork). project_id SCOPE column, id stays records.Hash of sketch. ON CONFLICT DO NOTHING append-only.
- main.go capture handler: ideas.Capture (pure) → InsertScoped(projectID); list → ListScoped. Determinism-first: no LLM, content-addr is the authority.
- Front lib/capture-idea.ts BYTE-IDENTICAL twin (canonicalSketch {intent,proposes,provenance:{detail,source}} sorted, sha256hex). CapturedIdea type has NO version/NO mirror field (unrepresentable). vitest 5/5. tsc clean. biome clean (6 files).
- Wall: actions.ts writes ideas schema DIRECTLY via Server Action (below-line staging, agent has INSERT on ideas.idea per S27) — NEVER kernel/mirrors/fitness (grep confirmed). project from S57 cookie (activeProjectContext), never a form field.
- UI /capture-idea action-capable: capture-form/intent/proposes/who/submit + per-project inbox (no-mirror-marker + provenance per card). e2e tests/e2e/capture-idea.spec.ts 5 tests (renders, inbox per-project human-provenance, capture executes, empty refused, active-project scope surfaced). Demo fallback when DB unreachable.
- i18n parity 3560==3560, captureIdea namespace complete (title/subtitle/eyebrow/intro/tutorial/statusName/working/whoLabel/messages.*). nav entry WorkbenchHeader:83.
- Docs: concept+internals s64-capture-idea.mdx, internals has 3 layers (## Implémentation / ## Méta / ## Méta-méta), docs.json:197-198, mint validate PASS, committed 7ed6622, pushed (## main...origin/main, 0 ahead).

**OpenQuestions (by-design forward-deps, NOT residual):** (1) canonical write door = idea-intake MCP idea_capture fronted by S58 passerelle; Workbench writes ideas schema directly (same below-line shape gateway dispatches), reconcile at S59 cutover — documented in actions.ts. (2) EL16 emit-ideas lands in same ideas.idea table via same ideas.Capture door — shared schema, no extra wiring. (3) Linear MCP unauthenticated (OAuth) — S64 issue not moved programmatically. (4) Mintlify virtualized index reindex lag (shows s60-s63 not yet s64) — pushed, async deploy lag not failure.

verified-green ZERO corrections.
