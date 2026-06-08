---
name: project-s79-behavior-library
description: S79 verification — user-facing project-scoped behavior LIBRARY (7 pure gestures) ON TOP of S76 expander; attach previews owner-scoping + lands via approved ChangeSet
metadata:
  type: project
---

S79 « Librairie behaviors user-facing » (app-builder EPIC 7, KRD §24.6) — project-scoped behavior Library layer ON TOP of S76 (record.go/behavior.go), NO fork of expansion.

**What it is:** `back/kernel/behavior/library.go` — `Library{ProjectID, Entries map[recordID]LibEntry}` value (no DB), seven PURE total gestures: Browse (canonical catalogue-rank→owner→version→id order, soft-deleted hidden), Search (DETERMINISTIC rg-like case-folded substring over kind+owner+sorted-tags+locale-labels, NEVER LLM, empty=browse), Tag (re-keys content-addressed → new id), Publish (monotone), SoftDelete (hidden never destroyed), Comment (append-only, `at` is arg), PreviewAttach + LandAttach.

**Done-crit (fixture):** `TestLibrary_AttachOwnerScoping_PreviewsScopedAndLandsViaApprovedChangeSet` — attach owner-scoping to Order: PreviewAttach calls the ONE S76 `Propose`→`Expand` (single-function law), asserts previewed policy owner-scoping Scope=OPERATION/Effect=DENY + two fixtures (owner-only-mutation-allowed, non-owner-mutation-denied), WroteKernel=false (wall); LandAttach drives `changeset.Apply(prop.ChangeSet, approvedAt, changeset.SpecHasMirror)` → Status=APPLIED, AppliedAt==approvedAt, SpecDelta.Target="behavior-expansion@Order", MirrorDelta!=nil. Assertions backed faithfully by Expand table (behavior.go:167-174 Ownable emits exactly these) — not hand-faked.

**Wall:** preview WroteKernel=false; landing = changeset.Apply gated by SpecHasMirror (incomplete→BlockReason, never kernel write). Front actions.ts (searchAction/attachAction) and MCP back/mcp/behaviors (7 pure tools, no SQL/kernel) write NOTHING — return values only.

**Verification GREEN, ZERO corrections:** go test behavior+mcp/behaviors cached-ok, gofmt -l clean, go vet clean, go build ./... clean; library_property_test.go rapid (search-deterministic/subset-of-browse/tag-then-search/softdelete-hides); vitest lib/behaviors.test.ts 10/10, biome 5 files clean; e2e tests/e2e/behaviors.spec.ts all testids present (attach-button on Submit component prop testId= not raw data-testid — grep raw attrs alone MISSES it); nav:140 /behaviors wired; i18n 114==114 behaviors keys FR+EN; docs concept+internals (3-layer Implémentation:9/Méta:47/Méta-méta:57) docs.json:227-228 mint validate PASS pushed origin/main ce99759 0/0 ahead.

**OQ by-design (not residual):** persisted behaviors-library plane w/ S55 RLS = later step (here in-memory project-scoped value); Linear MCP unauth.
