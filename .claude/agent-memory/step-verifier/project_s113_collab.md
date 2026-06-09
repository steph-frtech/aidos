---
name: project-s113-collab
description: S113 collaboration substrate + per-project adoption ladder — verifier notes, reused symbols, sensors, verdict
metadata:
  type: project
---

S113 = collaboration substrate (back/runtime/collab) PURE COMPOSITION write-NOTHING.

**Why:** social plane of a project — identified provenance on every act, comments on idea/mirror/changeset, append-only feed, real-time presence (canvas) with optimistic edit-lock, per-project AdoptionStage ladder surfaced in product.

**How to apply (what was verified):**
- COMPOSES S62 membership.Authorize(:196) for authority gate + S47 adoption.Plan(:222) for the ladder (ADR 0007 reuse, cannot diverge from proven truths). Reused symbols verified-exist: membership OpRead/OpAdminister/Role.IsValid/CodeNotAMember; adoption AdoptionPlan/Current/Next/NextGaps/AllSatisfied/Gap{Missing,Reason}/Grants/Stages/Requires.
- Authorize: unidentified→UNIDENTIFIED_ACTOR (provenance-never-placeholder), then delegate to S62; invite/approve need OpAdminister so a member without authority CAN NEVER approve (the Godog crit). CanApprove = named S110 gate.
- Comment/Invite/Record content-addressed via records.Hash(canonical body), author=actor.Identity NEVER placeholder. Canvas Join (ADDS presence, dedup by identity, pure no-mutation) + ClaimLock (refuses if held by another — never silent steal) + ReleaseLock. StageFor/CanAdvance computed from NextGaps ("done is computed").
- 4 done-criteria PINNED: Godog collab.feature (6 scen/25 steps: viewer/editor ROLE_FORBIDDEN, owner allowed, non-member NOT_A_MEMBER, comment stamped real author, unidentified refused) + fixture (two-users-no-overwrite, concurrent-lock-no-clobber, ladder-advances-only-at-gate, per-project current+next) + property (6 rapid props).
- **Property test elevated -rapid.checks=3000 GREEN, NOT flaky** (my recurring scar checked — clean). NOTE: `go test -rapid.checks=N ./pkg/` from back/ dir mis-parses (treats `.` as pkg "no Go files" FAIL); run from package dir `cd pkg && go test -rapid.checks=N .`
- WALL CLEAN: grep INSERT/UPDATE/Exec/db/sql/pgx in collab.go+main.go → none (only TargetMirror enum/comments). MCP 6 PURE pass-through tools (authorize/comment/invite/feed/presence/stage), no truth-write. approve only AUTHORIZES, truth-write stays S110/S20 propose→ChangeSet.
- Sensors: gofmt CLEAN, vet clean, go test collab+mcp green, broad `go build ./...` exit0, prior-green deps (membership/adoption/records) intact.
- TS twin lib/collab.ts reuses lib/membership.authorize, vitest 12/12, tsc clean, biome 4-files clean.
- UI /collab action-capable: approve/comment/invite/join/claim/release/advance all bound to ops + executable (uses plain useState+onClick not useActionState — acceptable, controls bound+executable). Design tokens, wall-respected. nav WorkbenchHeader:34 href=/collab. i18n fr4975==en4975 EXACT, collab ns 46==46. Playwright 7/7 GREEN live:3000 route-200.
- Docs: concept+internals s113-collab-adoption.mdx, internals 3-layer Implémentation/Méta/Méta-méta, docs.json:293-294, mint validate PASS, HEAD ebc460f == origin/main == ls-remote refs/heads/main (pushed confirmed).
- OQ by-design non-blocking: Linear-unauth (MEMORY note OAuth needed); live websocket/SSE transport + gateway-propagated identity (S58/S61) replace cockpit actor field later; collab below-the-line Postgres persistence back-fills later; mintlify reindex lag.

**Verdict: PASSED, ZERO corrections needed.**
