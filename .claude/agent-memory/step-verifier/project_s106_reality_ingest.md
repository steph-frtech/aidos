---
name: s106-reality-ingest
description: S106 external-loop ingestion — prod OTel divergence → project-scoped RealityMirror(provenance=incident) → DRAFT idea(template text); reality never writes truth. Verified green zero corrections.
metadata:
  type: project
---

S106 EXTERNAL-LOOP INGESTION (ROADMAP §S106, EPIC12/E12, KRD §53/§67/§117/§1099): the door turning a DEPLOYED emitted app's prod OpenTelemetry DIVERGENCE (read by telemetry-reader S43) into a candidate-truth — PURE deterministic, writes NOTHING.

**Pipeline** `back/runtime/realityingest`: DetectDivergence(numeric comparison TelemetryReport vs MirrorExpectation, error-rate-first-then-latency fixed order, strictly-exceeds=divergence, op-mismatch→nil; content-addr id INCLUDES project_id via records.Canonicalize+Hash so two projects' identical divergences never collapse) → ToRealityMirror(REUSES reality.Observe S43 verbatim — incident shape+taint incident_derived+content-addr, Signal{Operation,Error,Recurrence}, CauseSketch=RenderIdeaText) → RenderIdeaText(DETERMINISTIC TEMPLATE switch over closed DivergenceKind enum, formatRate %.1f%% / formatMs %.0fms fixed-precision byte-stable, NAMES gap verbatim "incomplete by omission", NEVER LLM) → ToDraftIdea(provenance=incident Detail=divergence-id, intent=template text, proposes via REUSED reality.InferProposes else UNSET+OpenQuestion never-guessed §8, WroteKernel=false, ToKernelRefusal=reality.ToKernel ALWAYS REALITY_CANNOT_DECLARE_TRUTH non-nil how_to_fix non-empty). Ingest=full pipeline nil-on-healthy. IngestBatch sorted-by-idea-id. **REUSED symbols verified-exist**: reality.Observe:155 ToKernel:281 InferProposes:212 Incident:78 Signal:60 ObserveInput:102 / ideas.ProvenanceIncident:102 / firewall.TaintIncidentDerived:61.

**Done-criteria (all 3 met, RAN):** (1) fixture — 30%-error createOrder (300/1000) vs 0-tolerance mirror in shop-42 → RealityMirror provenance=incident; (2) property — same divergence → same idea text (template); (3) reality never writes truth — WroteKernel always-false + direct edge always-refused. Fixture 5 scenarios + rapid 3 props (detection determinism / rédaction template determinism+project-scope-sensitivity / wall-always-holds). go test realityingest+mcp green (cached); broad go build ./... OK; prior-green reality/ideas/records intact; gofmt clean; vet clean.

**MCP** `back/mcp/reality-ingest` 3 PURE read-only tools (detect_divergence/ingest_divergence/render_idea_text) all return VALUES wroteKernel=false; wall-grep CLEAN (no INSERT/UPDATE/db.Exec/pgx outside comments). **TS twin** lib/reality-ingest.ts FNV-1a content-addr DISPLAY-ONLY (Go records.Hash authoritative on wire); note TS ingest infers proposes="operation" directly (InferProposes not ported) but Go authoritative + e2e asserts visible behavior — non-blocking. vitest 4/4; tsc clean for S106; biome 6 files clean.

**UI** /reality-ingest action-capable: Submit testid=ingest-divergence + healthy-toggle bound to ingestAction Server Action over pure twin; 13 testids (project-scope/provenance/divergence-{operation,kind,observed,mirror}/idea-text/wall-status/no-divergence); h1 matches /Boucle de réalité|Reality loop/; nav:162 realityIngest; i18n fr4751==en4751 EXACT (flatten+diff sets, zero fr-only/en-only). Playwright 4/4 RAN live:3000 route-200.

**Docs** concept+internals s106-reality-ingest.mdx 3 layers (Implémentation:9/Méta:27/Méta-méta:35) docs.json:279-280 mint validate PASS; HEAD 4406d4c == origin/main (pushed).

**OQ (by-design forward-deps, NOT residual):** Linear MCP unauth (OAuth+restart); Postgres persistence of project-scoped divergence + project_id column = E12 multi-tenant truth-store later step; live-docs index async lag.

**Verdict: PASSED, zero corrections.** PATTERN: REUSE-layer step over S43 reality engine — verify reused symbols exist w/ used sigs + that NEW capability (detection comparison + template projection) has own reproducibility mirrors (rapid + fast-check); content-address INCLUDING project_id is the multi-tenant isolation proof.
