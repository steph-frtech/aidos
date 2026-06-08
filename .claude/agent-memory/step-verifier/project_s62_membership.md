---
name: s62-membership
description: S62 project membership & ownership authority (identity×project×role gradient), the third tenancy layer over S55 RLS + S61 auth
metadata:
  type: project
---

S62 = PROJECT MEMBERSHIP & OWNERSHIP, the THIRD tenancy layer (S55 RLS scope ⇄ S61 auth ⇄ S62 membership), independent reddening.

**Why:** app-builder EPIC 3; S55 RLS keyed only on "identity GUC present", deferring the per-project membership match to S62; S53 owner_ref was a free string, now resolves to a real OWNER membership row.

**How to apply (what passed, ZERO corrections):**
- PURE authority `back/runtime/membership/membership.go`: `Authorize(*Membership,projectID,op)→Decision` TOTAL fail-closed. nil OR invalid-role OR other-project OR empty-projectID ⇒ NOT_A_MEMBER. Role gradient closed lattice owner⊃editor⊃viewer: read=any member, mutate=editor|owner, administer=owner-only. `CanAdminister`=owner-only convenience. `NewMembership` content-addressed via records.Hash (id=SHA256{kind:"project_member",identity,project_id,role}), idempotent, role-change=NEW row append-only.
- DONE-CRIT all met: (1) non-member NOT_A_MEMBER pinned by TestFixture_NonMemberRefusedNotAMember (incl member-of-another-project) + TestProp_MembershipIsPerProject; (2) viewer-cannot-mutate TestFixture_ViewerCannotMutate (read=allow,mutate/administer=ROLE_FORBIDDEN) + TestProp_RoleGradient; (3) invite/remove/role below-the-line server actions actions.ts writing accounts.project_members directly. go test 0.008s GREEN gofmt/vet/build clean.
- migration `project_members_baseline.sql` EXPAND-CONTRACT: NEW accounts.project_members (content-addr PK, role CHECK closed-3, id=version CHECK, UNIQUE active per (identity,project) WHERE revoked_at IS NULL, soft-delete). app.is_member SECURITY DEFINER + CREATE OR REPLACE app.in_active_scope ADDS membership predicate to S55 RLS — STRICTLY tighter (valid non-member reads 0 rows), never widens. GRANT aidos_agent SELECT/INSERT/UPDATE (no DELETE/TRUNCATE=soft-delete), EXECUTE on helpers; WALL re-asserted REVOKE on kernel.truth/mirrors.mirror.
- front `lib/membership.ts` BYTE-IDENTICAL twin: VERIFIED alice/proj-alpha/owner = 5f1ffbf75caf...d210 on BOTH Go and TS (canonical body keys sorted identity,kind,project_id,role to match records.Canonicalize). vitest 8/8. Panel action-capable (invite/role/remove) ui-complete, every admin gated by canAdminister, demo fallback (oz owner/ed editor/vic viewer) so never headless. e2e 5 tests incl vic-viewer-invite→ROLE_FORBIDDEN data-code assert. biome clean, i18n 3472==3472 projectMembers namespace present. title "Adhésions de projet"/"Project members" matches e2e regex. nav entry after /auth (WorkbenchHeader:33).
- docs 3-layer (Implémentation/Méta/Méta-méta) internals + concept, docs.json:193-194, pushed steph-frtech/docs main 4bf29a5 (working-tree concepts/fke.mdx mod UNRELATED to S62).

**OpenQuestions (by-design forward-dep, NON-blocking):** (a) canonical single door = membership MCP (ADR 0009) + gateway-propagated identity (S58/S61); Workbench writes accounts via server action with `actor` field meanwhile (demo cockpit). (b) Testcontainers RLS roundtrip skips when Docker absent. (c) actingMembership demo-fixture fallback if table not yet applied on dev DB. (d) Linear MCP unauthenticated — could not move S62 issue (needs OAuth+restart).

Verified-green, ZERO corrections.
