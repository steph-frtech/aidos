---
name: s68-shape-editor
description: S68 three-shape mirror authoring surface + draft-level concurrency — verified green, zero corrections
metadata:
  type: project
---

S68 (ROADMAP-app-builder.md:97, AIDOS Mirror) = three-shape mirror authoring panel + draft-level concurrency. NOTE the prompt's Inputs block described S67 (behavior-capture); executor correctly built the ACTUAL S68 objective per roadmap (shape editor) and left S67 untouched — verified against ROADMAP, legitimate.

**Done-crit (all met):** (1) property — DeriveShape deterministic by truth-nature via CLOSED table natureToDerivation (acceptance→gherkin/property/fixture; unknown nature→ErrUnknownNature NEVER guessed); (2) fixture — MergeEdits two concurrent edits MERGE disjoint / LOCK same-field-clash (ErrDraftConflict + EditConflict surfaces BOTH candidates, version NOT advanced) / stale-base→ErrStaleBase, NEVER last-write-wins; (3) determinism — ParseGherkin/ParseProperty/ParseFixture all PURE line-parsers, never LLM, reproducibility property pins same source→same parse.

**Engine** back/runtime/shapeeditor/shapeeditor.go PURE/TOTAL no DB/clock/rng. ProposeMirror→DRAFT changeset.Open(S20 reuse) mirror_delta ONLY (no spec_delta, spec⇒mirror gate vacuous), Liveness=dead born-RED, WroteMirror ALWAYS false. draftID/mirrorID reuse kernrecords.Canonicalize/Hash(S02). REUSES records.Mirror(S06)/changeset(S20) verbatim, no fork, no new ADR.

**Verified:** go test -count=1 GREEN 0.021s, gofmt/vet clean. fixture test covers disjoint-merge/same-field-LOCK-both-candidates/idempotent/stale-base/propose-red-DRAFT-no-write/unparseable-refused. property test 3 props. BDD shape-editor.feature 6 scenarios FR incl THE done-crit (derive deterministic + born-red DRAFT project-scoped + writes-no-truth). MCP back/mcp/shape-editor 4 PURE tools shape_derive/parse/merge/propose — NO apply/write tool (wall). Front twin lib/shape-editor.ts byte-faithful mergeEdits (same stale/disjoint/conflict logic) vitest 12/12, tsc clean. actions.ts action-capable returns VALUES writes-nothing proposes-ChangeSet never-writes-mirror. e2e 5 incl deterministic-derive/red-DRAFT-no-write/LOCK-both-candidates/unparseable-refused 31 testids. nav WorkbenchHeader:131. i18n 3728==3728 PARITY shapeEditor key present. Wall grep CLEAN both planes (no INSERT/UPDATE/pgx/sql).

**Docs:** concept+internals s68-shape-editor.mdx, docs.json:205-206, 3 layers, mint validate PASS, pushed 2792e3d main...origin/main 0-ahead.

**OQ (by-design, NOT residual):** S110 owns truth-write conflict (optimistic-lock on head) — S68 owns ONLY pre-ChangeSet draft-level lock (documented in pkg+feature, correct boundary). Linear MCP unauthenticated (OAuth) — could not flip issue, recommend human auth.

verified-green ZERO corrections.
