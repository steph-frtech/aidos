---
name: mk03-ingestion-door
description: MK03 wires the MK02 DocConverter port into idea-intake's convert_to_markdown MCP tool — a document → markdown → idea draft (provenance preserved), idempotent re-ingest, the wall held via ideas-only INSERT.
metadata:
  type: project
---

MK03 = the INGESTION DOOR. The MK02 DocConverter port ([[mk02-docconverter]], ADR 0039) is wired as the 8th tool of the idea-intake MCP server (`back/mcp/idea-intake/convert.go`): `converter.ToMarkdown` → `deriveDraft` (pure) → `ideas.Capture` (reuses S01/S02 content-hash id) → `store.Insert`. Returns markdown + the captured idea draft.

**THE WALL holds.** The only "kernel/" import is `kernel/ideas` — that is the `ideas` schema (staging on-ramp, above product BELOW the freeze, explicitly the legal door per §2). NO kernel/mirrors/fitness import or write anywhere on the path. The server carries only the ideas-lifecycle DSN (no kernel GRANT); deliberately NO promote-to-kernel tool (promotion = idea → mirror → /goal). Provenance is CLOSED-set `ProvenanceHuman` (a dropped doc is a human on-ramp), Detail = `"ingested document: <name> (via markitdown frontier)"` verbatim — preserved, never invented.

**Idempotence:** `Store.Insert` gained `ON CONFLICT (id) DO NOTHING` — re-ingesting the same document (same content → same hash id) is a no-op, not a duplicate-key error (append-only). Pinned by the integration mirror's re-ingest assertion (out2.ID == out.ID).

Done-criteria all met: (1) reproducibility mirror RED-first then GREEN — `convert_property_test.go` (rapid, DB-free pure core): TestConvertDeriveIsDeterministic (100×), TestProvenanceIsPreserved, TestStatusIsAlwaysDraft, TestUnsupportedMimeStillCapturesAnIdea (port total → "" md, still a draft), TestDefaultProposesIsProduct, TestFirstHeadingDerivesTitle. (2) integration mirror — `main_test.go` TestConvertToMarkdownCapturesIdeaWithProvenance (Testcontainers Postgres, real ideas Store): fixture HTML → markdown (H1 survived, chrome stripped) → persisted draft, round-trips via idea_status + draft lane of idea_list, re-ingest same id. `go test ./mcp/idea-intake/` ok (4.9s). (3) « Pour moi » pages pushed (4a914b4, HEAD==origin/main), both registered in docs.json (lines 283-284), mint validate success, internals carries the three layers Implémentation·Méta·Méta-méta.

**Front is UNCHANGED from MK02** (IngestionPanel.tsx + lib/markitdown.ts NOT in files_changed) — the action-capable /ingestion panel + deterministic TS twin already previewed the convert→idea-draft pipeline at MK02; MK03's real change is the Go MCP door. e2e tests/e2e/ingestion.spec.ts re-tagged to MK03 semantics, 2/2 on :3000 (convert→idempotent badge; propose→draft-status="draft" + draft-provenance "ingested document"). Note the panel's idempotence "badge" recomputes toMarkdown twice and compares — a UI demo of determinism, not the engine's proof (the rapid mirror is).

**Sensors ALL clean, report accurate** — gofmt/go vet/go test (Go), tsc --noEmit (the MK02 tsc-vs-vitest scar [[feedback_tsc_vs_vitest]] did NOT recur — lib/markitdown.ts already fixed at MK02), biome (4 MK03 files clean), vitest 6/6, all 21 ingestion i18n keys present in BOTH fr+en. No sensor scar this step.

OQ (forward-dep / by-design, non-blocking): (1) Mintlify hosted-index propagation lag — pages pushed + mint-clean but mcp index still shows pre-push state (same lag at MK02). (2) Linear MCP unauthenticated (OAuth+restart) — OQ-MK03-linear. (3) real microsoft/markitdown adapter (PDF/DOCX/OCR/audio) still behind the unchanged DocConverter port; non-HTML mime dispatches to "" (total) — swap-in is a later ADR. Verified-green.
