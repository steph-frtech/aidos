---
name: s61-auth-sessions
description: S61 verification — OAuth/OIDC + sessions + accounts.users content-addressed + two-layer enforced identity; all done-criteria met, verified-green zero corrections
metadata:
  type: project
---

# S61 · auth + sessions + accounts + two-layer identity (app-builder EPIC 3)

**Why:** First auth step — resolves a caller to ONE identity that propagates to BOTH walls (gateway scope layer 1 + Postgres RLS GUC app.identity layer 2). Auth lives OUTSIDE the Kernel (`accounts` is its own below-the-line zone, never kernel/mirrors/fitness).

**How to apply:** S61 is verified-green, ZERO corrections needed. All three done-criteria proven:
- DONE-CRIT 1 (Godog login→session→scoped): `TestAccountsLoginSessionScopedBDD` on LIVE Testcontainers Postgres (5.1s) — verified accounts.users row opens session, app.identity+app.project key RLS, agent reads exactly its 1 idea.
- DONE-CRIT 2 (property UNAUTHENTICATED no data): `authn.Authenticate` refuses anonymous principal UNAUTHENTICATED for EVERY disposition upstream of routing (`AuthenticatedRoute` returns Tool=nil before lookup). rapid props 5 (anon-always-refused, resolved-always-auth, determinism, NewUser-content-addressed, GUCs-fail-closed) + fixture `TestFixture_AuthGate_TwoLayer` 5 cases.
- DONE-CRIT 3 (fixture valid-identity no-RLS-row reads nothing): `TestAuthValidIdentityNoRLSRowReadsNothing` on LIVE Postgres — valid gateway identity scoped to proj-B (no row) reads ZERO. RLS predicate `app.in_active_scope` requires BOTH app.project AND app.identity non-empty (AND on lines 63-67) = two INDEPENDENT layers.

**Core (back/runtime/authn):** `Authenticate` pure gate layer 0; `NewUser` content-addressed via records.Hash (idempotent, Go↔TS twin); `Principal.GUCs` → app.identity. `authgate.go AuthenticatedRoute` propagates VERIFIED identity (overrides client-forged scope.Identity, never trusts request body). authn is a LEAF (gateway imports authn, never reverse — Disposition re-declared not imported to avoid cycle).

**Migration accounts_baseline.sql:** accounts schema (users id/email/identity_provider content-addressed + version==id CHECK; sessions) below wall; GRANTs below-line soft-delete only (REVOKE DELETE/TRUNCATE); wall RE-ASSERTED (REVOKE on kernel.truth/mirrors.mirror). FK to projects intentionally OMITTED (RLS not FK is scope enforcer).

**Determinism-first:** all 4 ops (Authenticate, NewUser, AuthenticatedRoute, GUCs) PURE authoritative, each rapid+fast-check reproducibility mirror. ZERO LLM (grep: only doc-comments asserting absence). JWT signature verify = gated irreducible exception delegated to Verifier seam (Auth.js/OIDC), resolved Principal re-traverses IsAnonymous downstream — correct gated exception, not agent-doing-function-work.

**Front:** lib/authn.ts + lib/auth-gate.ts byte-faithful twins; /auth panel action-capable (signIn→session-card, attemptUnauthenticated→REAL UNAUTHENTICATED toast), themed ADR0010 (design tokens no hardcoded zinc/hex) bilingual ADR0011. WALL: actions.ts writes NO truth (pure projections over twins), TRUTH_WRITE_TOOLS literal=control option-list for the REFUSED-call demo not a write.

**Sensors:** gofmt clean, vet clean, full `go build ./...` rc=0, authn+gateway tests pass, 2 Docker Postgres tests green (5.1s). Front tsc rc=0, full vitest 1011/1011 (94 files, +12 new), i18n parity 3441==3441 zero-diff (auth ns 54 keys). e2e tests/e2e/auth.spec.ts 5/5 (login→session, unauth truth-write refused, 2nd endpoint refused, blank-subject refused, nav exposes /auth).

**Docs:** concept+internals s61-auth-sessions.mdx, registered docs.json lines 189-190, internals 3 layers (Implémentation L13/Méta L56/Méta-méta L66), mint validate PASSED, pushed steph-frtech/docs main HEAD==origin d5c9a0b clean tree. Code committed 248cdca.

**SCAR (pre-existing, NOT S61):** WorkbenchHeader.tsx:292 biome `suppressions/unused` warning on nav-backdrop useKeyWithClickEvents = from commit 295112e (2026-06-03), confirmed via git blame + HEAD~1; S61 only added nav entry `{ href: "/auth", k: "auth" }` (line 32), shifting it 291→292. See established WorkbenchHeader scar across S54-S60.

**SCAR (already fixed by executor):** first Docker run hit unique-constraint in seed loop (proj-A/proj-B both slug="s" name="n"); current file uses distinct `%q,p` per project — fixed before commit, observed via auto-memory note.

**OpenQuestions (by-design forward-deps, non-blocking):**
1. Linear MCP unauthenticated (only authenticate tool available) — issue status not updated; needs OAuth+restart.
2. Real Auth.js/OIDC flow + gateway JWT verification + HTTP server per-request SET LOCAL app.identity = runtime wiring owned by live gateway/server build; S61 delivers deterministic core + composition seam + accounts schema + live-Postgres two-layer proof. Panel uses twin authenticate() so executable offline.
3. session expiry/revocation enforcement + per-project membership identity-match = S62 (RLS baseline names it). S61's requirement: app.identity PRESENT+propagated (proven).

**Verdict: PASSED, zero corrections.**
