# S67 — attacher un behavior à la capture (CONSOMME S76's Expand)

## Done-criteria (verbatim) → status
- property: expansion attachée byte-identique à S76 (une seule fonction) — **GREEN**
- rendue comme ChangeSet proposé (DRAFT) — **GREEN**
- expansion = fonction pure, jamais LLM, jamais dupliquée — **GREEN**

## Where it lives
- Go engine: `back/runtime/behaviorcapture/behaviorcapture.go` — `AttachBehaviorAtCapture(ideaRef, Attachment, parentPhase) (Proposal,error)`.
  - CONSUMES the ONE `behavior.Expand` (S76, `back/kernel/behavior`) — no 2nd impl. Wraps the Expansion VERBATIM as the spec_delta Body of a DRAFT `changeset.Open` (S20). WroteKernel always false; ChangeSet stays DRAFT. `Library()=behavior.Catalogue()`; `ProposalID` via records.Hash/Canonicalize (S02).
- Mirrors (Go): `_fixture_test.go` (owner-scoping at capture + refusals), `_property_test.go` (rapid: byte-identical to S76, DRAFT, determinism, the wall), `_bdd_test.go` + `tests/runtime/behavior-capture.feature` (Godog).
- MCP: `back/mcp/behavior-capture/main.go` — tools `behavior_library`, `behavior_attach_at_capture` (pure; no apply). `main_test.go` green.
- Front twin: `front/web/lib/behavior.ts` is a THIN consumer of the existing CE04 TS expander (`lib/compound.ts:expand` + `BEHAVIOR_CATALOGUE`) — adds ONLY the content-addressed `expansionId` (byte-identical to Go's behavior.expansionID). `lib/behavior-capture.ts` consumes it. Mirrors `lib/behavior.test.ts` (golden hashes vs Go) + `lib/behavior-capture.test.ts` (vitest+fast-check) — 17/17.
- Route `/behavior-capture` (page+actions+BehaviorCapturePanel), action-capable (attach control). Nav entry in Build group beside /goal-piloting. e2e `tests/e2e/behavior-capture.spec.ts` 5/5.
- i18n parity 3690/3690 (fr/en `behaviorCapture` + `nav.behaviorCapture`).
- Docs: two « Pour moi » pages `steps/concept|internals/s67-behavior-capture.mdx`, registered docs.json, mint validate + broken-links clean, pushed steph-frtech/docs main (38b4d35..844227b).

## KEY DECISION — deduplication (the "jamais dupliquée" law)
A SECOND TS expander would have been a duplication scar: CE04 (`lib/compound.ts`) already ships a TS twin `expand` + catalogue (its Expansion carries `pieceCount`, NO `expansionId`/content-address). S67's `lib/behavior.ts` was rewritten to **import CE04's `expand`/`BEHAVIOR_CATALOGUE`** and add ONLY content-addressing — so there is ONE TS catalogue/expander (CE04), S67 a thin consumer. CE04 untouched (its 25 tests still green). Golden expansionIds (Order): ownable=5b504145…, soft-deletable=b398af5c…, auditable=69c1d35a….

## Wall
Both planes pure computation returning DRAFT proposals; grep finds no INSERT/UPDATE/SQL/kernel writes in S67 source (only false positives: `timestamptz` attr name, `.update()` on hash).

## VERIFIER PASS (2026-06-08) — 1 correction
- Verified GREEN: Go test -count=1 behaviorcapture+mcp ok; vet/build clean; property test pins EXACT done-criteria (reflect.DeepEqual(p.Expansion, behavior.Expand(a)) + equal ExpansionID = single-function/byte-identical; DRAFT changeset; determinism; WroteKernel=false=wall). Golden expansionIds RE-DERIVED from Go (ownable=5b504145…, soft-deletable=b398af5c…, auditable=69c1d35a…) MATCH lib/behavior.test.ts golden constants AND the e2e expansion-id assertion = byte-identity proven cross-plane. Dedup confirmed: lib/behavior.ts imports CE04 expand+BEHAVIOR_CATALOGUE, NO 2nd catalogue. MCP no SQL/no apply tool. vitest 17/17, CE04 25/25 untouched. tsc clean. e2e 5/5 live :3000. i18n 3690/3690. mint validate+broken-links clean, docs.json:203-204, pushed 844227b 0/0.
- CORRECTION (biome, RECURRING): behavior-capture.test.ts had unused `type Kind` import + two `result!` non-null assertions (noNonNullAssertion). Executor claimed "biome clean" but these were live warnings on a NEW test file. FIX: dropped Kind import; replaced `result!` with `if (result===null) throw` guard. biome clean after, vitest 7/7 still green. (Same scar as S21 cosmetic-biome.)

## OpenQuestion (non-blocking)
- Linear MCP not authenticated (OAuth needed) — S67 issue not moved to In Progress/Done via MCP. Per CLAUDE.md §11 best-effort, noted here, does not block.
- The front content-address relies on a `NIL_GROUPS` table re-deriving Go's nil-slice→null marshalling (soft-deletable/auditable relations + auditable policies are nil in Go). Pinned by the golden-hash mirror; if S76's catalogue nil-ness changes, the mirror goes red (intended).
