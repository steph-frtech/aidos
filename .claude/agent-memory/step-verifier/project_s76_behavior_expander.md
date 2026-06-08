---
name: project-s76-behavior-expander
description: S76 behavior-RECORD + PROPOSE over the ONE pre-existing Expand — verified green after 1 biome fix
metadata:
  type: project
---

# S76 — behavior-expander (behavior-RECORD + PROPOSE, §24.6 EPIC 7)

S76 adds a RECORD wrapper + Propose over the ALREADY-GREEN single `behavior.Expand` (back/kernel/behavior/behavior.go:210, ONE catalogueExpansion). record.go does NOT fork: Propose runs the ONE Expand, wraps dry-run into a DRAFT changeset.Open (spec_delta behavior-expansion@<entity> + mirror_delta#mirror), NEVER Apply — WroteKernel=false, AppliedAt=nil, StatusDraft. Record = ownable(Owner)/versioned(Version>=1)/taggable(dedupSortTags order-invariant)/localizable(Labels fr required, ADR0011); ValidateRecord typed errors ErrNoOwner/ErrBadVersion/ErrNoFRLabel/ErrUnknownBehavior/ErrRecordKindMismatch; RecordID=records.Canonicalize+Hash(S02).

DONE-CRIT ALL MET: (1) same behavior+entity → identical+idempotent expansion (rapid TestPropose_Deterministic_AlwaysDraft + TestRecordID_Deterministic + fast-check 10); (2) expansion=PROPOSED DRAFT never applied (fixture asserts StatusDraft+AppliedAt==nil+WroteKernel=false+SpecHasMirror gate passes+byte-identity p.Expansion.ExpansionID==direct Expand); (3) authoritative single-source (Propose wraps the ONE Expand, mirror asserts byte-identity; front imports `expand` from lib/compound — no fork).

VERIFY: go test -count=1 kernel/behavior 0.047s GREEN + mcp/behavior-expander; gofmt/vet clean. MCP 4 PURE tools behavior_catalogue/validate_record/expand/propose NO apply NO SQL (wall). Front lib/behavior-expander.ts twin imports ONE expand, vitest 20/20 (incl lib/behavior.test.ts Go-byte-identical hash still green), tsc clean (ONLY pre-existing S67 behavior-capture.test.ts `Cannot find name Kind` — NOT S76), e2e 5 tests all 11 testids present in panel, i18n 3928==3928, nav:139. Docs 3-layer Implémentation/Méta/Méta-méta docs.json:221-222 mint validate PASS pushed cbb4b77 0-ahead. Wall grep across all 4 source files CLEAN.

ONE CORRECTION: removed redundant `expansionId` named import in lib/behavior-expander.ts line 19 (biome warning — it was re-exported verbatim on line 29 `export { expand, expansionId } from "./behavior"`, so the import binding was dead). Biome + vitest re-verified green. RECURRING pattern: a `import { x } from "./y"` followed by `export { x } from "./y"` makes the import binding unused → biome unused-import warning; the re-export already pulls it.

OQ (by-design, non-blocking): recordId is local sha256/canonicalEncode NOT pinned byte-identical to Go records.Hash (front-id-vs-Go-hash, same as prior steps; Go authoritative); apply/freeze = aidos CLI gated by AuthorityGraph S110 (Propose only proposes = wall); Linear MCP unauthenticated (only authenticate surfaced, needs OAuth — §11 best-effort, doesn't block). Verified-green AFTER 1 biome fix.
