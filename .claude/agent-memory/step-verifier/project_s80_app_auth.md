---
name: s80-app-auth
description: S80 verification — `app-auth` behavior-macro (auth & rôles de l'app ÉMISE) verified green, zero corrections
metadata:
  type: project
---

S80 = the `app-auth` behavior-macro: the auth+role-authz subsystem of the EMITTED app (the app the USER builds — its OWN User/Role/Session entities, login/logout operations, role-authz DENY policy band), distinct from AIDOS' own users (E3). Maps the AuthorityGraph of the emitted app's RUNTIME, never the AIDOS approvers.

**Why a dedicated macro (not a fork of S76 behavior.Expand):** S76 Expand attaches a single piece-set to ONE entity; app-auth is a MULTI-ENTITY subsystem (3 entities + 2 ops + 3 policies). §24.6 single-function law forbids two expansions of the SAME macro, not one Expand per macro. So `ExpandAppAuth` is its own authoritative pure function — legit, not a violation.

**Done-criteria — both GREEN:**
- PROPERTY (appauth_property_test.go, rapid): same target ⇒ byte-identical Subsystem+ExpansionID; complete auth shape always present (User/Role/Session+login/logout+authz-login/logout/manageRoles); every policy OPERATION/DENY; WroteKernel=false; CheckAccess pure monotone gate (rank≥min).
- FIXTURE (appauth_fixture_test.go): viewer→logout DENIED (required=editor), editor→logout ALLOWED, admin→manageRoles ALLOWED, editor→manageRoles DENIED; unknown role/op = typed error never guessed-allow; attach previews (WroteKernel=false) + lands via changeset.Apply(SpecHasMirror)→APPLIED scoped app-auth@shop-app, MirrorDelta!=nil.

**Cross-lang byte-identity INDEPENDENTLY verified:** I ran Go ExpandAppAuth("shop-app").ExpansionID = `2a2bcf9120cdd797d9aca93527f5a5606786bf64ebc0dd73059a54da452f94a4` — BYTE-IDENTICAL to the report's TS claim and lib test pin. TS canonicalEncode (sort-keys recursive, snake_case min_role to match Go json tag) == records.Canonicalize/Hash.

**NOTE — manageRoles asymmetry (by design, not a bug):** manageRoles is in `authzBand` (a protected op + policy authz-manageRoles) but NOT in `declaredOperations()` (only login/logout). Correct: it's a policy-protected op the macro guards, not an op the macro ADDS. Property test only requires login/logout in Operations; CompleteAuthShape requires pol:authz-manageRoles. Consistent.

**Sensors all green:** go test+vet+gofmt clean (gofmt -l empty), go build ./... clean; MCP back/mcp/app-auth 3 PURE tools (expand/check_access/attach) no-SQL no-clock(ts=arg) wall-clean, main_test ok; vitest lib/app-auth.test.ts 8/8; tsc clean for app-auth (only pre-existing tsc err = lib/behavior-capture.test.ts S67 `Cannot find name Kind` — NOT S80, RECURRING noise); biome 5 files clean; e2e tests/e2e/app-auth.spec.ts 4 tests all testids present in panel (role-select/operation-select/check-submit/target-input/attach-submit/check-result[data-allowed]/attach-result), h1 title="Behavior-macro app-auth" matches regex, attach-result renders "app-auth@shop-app · APPLIED" + ent:User/op:login/authz-logout; nav:141 wired; i18n 4017==4017 appAuth namespace fr==en parity (19 keys).

**Wall:** front actions.ts WRITE-NOTHING (check=read-only sim, attach previews+lands changeset VALUE via propose→approve); MCP attach lands via changeset.Apply (value computation) never direct kernel write; WroteKernel always false. wall-grep CLEAN (only hits = doc comment + Buffer.from hashing).

**Docs:** 3-layer internals (Implémentation:9 / Méta:54 / Méta-méta:64), concept+internals registered docs.json:229-230, mint validate PASS, pushed steph-frtech/docs main e804889 0-ahead 0-behind. Forward-dep S81 templates rendered as PLAIN TEXT not a link (no broken-link).

**OpenQuestions (by-design forward-deps, NOT residual):** Linear MCP unauthenticated (only OAuth-start tool) — S80 step issue could not be programmatically set Done (consistent project memory note); kernel freeze of expanded subsystem = aidos CLI downstream gated by AuthorityGraph (= the wall); S81 templates not-yet-built.

verified-green ZERO corrections.
