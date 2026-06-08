---
name: s66-goal-piloting
description: S66 UI-piloted /goal (actor gate S63 + OpenGoal S29 + non-gameable close S29); screen PROPOSES DRAFT ChangeSet never writes Kernel; verified green ZERO corrections
metadata:
  type: project
---

S66 = the UI-PILOTED /goal (app-builder track, KRD §56–§59, §63 ①). A human PORTEUR D'AUTORITÉ (S63 RealActor) opens a goal from a grilled idea; engine PROPOSES a DRAFT ChangeSet (spec+mirror) + computes the LIVE red set; close = the NON-GAMEABLE S29 stop. DONE-CRIT (Godog: close refused unless red→green ∧ prior green intact ∧ mutation≥floor ∧ no monster GOAL_STILL_RED; screen proposes ChangeSet, never writes Kernel) MET.

**REUSE-DONT-REINVENT:** back/runtime/goalpiloting.PilotOpenGoal composes authoritybinding.RequireRealActor (S63 actor gate) + goal.OpenGoal (S29 DRAFT ChangeSet + S22 red-set derivation); PilotCloseGoal DEFERS to goal.CloseBlockReason; CanClose→goal.IsClosed; LiveRedSet→goal.RedSetSorted. NO transition/red-set/close-condition reimplemented. PilotBlock carries refusal code VERBATIM as string from whichever closed enum refused (S63 BlockCode PLACEHOLDER_ACTOR/INSUFFICIENT_AUTHORITY or blockreason.Code IDEA_WITHOUT_MIRROR/NO_RED_SET/GOAL_STILL_RED) — no member coined (§9). All types are aliases not forks. PURE/TOTAL no clock/rng/IO writes-NOTHING.

**Verified PASS (ZERO corrections):**
- go test ./runtime/goalpiloting ./mcp/goal-piloting GREEN gofmt/vet clean; go build ./... clean; prior-green S29 goal + S63 authoritybinding intact. Godog 6 scenarios (incl THE done-crit close-refused-4-conditions + screen-proposes-no-kernel-write); fixture (open/placeholder/mirror-less/already-green); rapid TestCloseIffAllFourConditionsHold (non-gameable ∀) + TestPilotOpenGoalIsDeterministic + TestPlaceholderActorAlwaysRefused + TestPilotedOpenAlwaysProducesADraftAndNonEmptyRedSet.
- MCP back/mcp/goal-piloting 3 pure tools (goal_pilot_open/goal_pilot_close/goal_live_red_set) writes NOTHING (no INSERT/pgx/sql grep-clean). main_test green.
- Front twin lib/goal-piloting.ts reuses lib/authority-binding (requireRealActor) + lib/goal (isClosed/GOAL_STILL_RED). vitest 7/7. MINOR semantic note: Go PilotOpenGoal defers NO_RED_SET to S29 OpenGoal; TS twin checks redSet.length===0 itself + carries IDEA_WITHOUT_MIRROR/NO_RED_SET as local PilotBlock constants (FR prose) rather than calling a TS openGoal — same OBSERVABLE verdict/codes, not byte-identical impl path. NOT a gap: lib/goal has no openGoal twin (S29 front only shipped the close gate), close gate is the shared authoritative one. Acceptable twin.
- Wall: actions.ts Server Actions compute VALUES only (no DB write — grep clean); agent DB role SELECT-only on ideas.goal+changesets (S29/S20 migrations) so screen structurally cannot write truth. propose=DRAFT ChangeSet proposal; close=pure verdict never stamps CLOSED.
- UI /goal-piloting action-capable: Propose + Stop controls bound to engine; nav entry in Build group. e2e tests/e2e/goal-piloting.spec.ts 5/5 GREEN (renders both controls / authority-bearing proposes DRAFT+red-set / placeholder refused / close refused while condition fails / close admitted iff 4 conditions).
- i18n parity 3658==3658, goalPiloting + nav.goalPiloting namespaces present (fr+en).
- Docs concept+internals s66-goal-piloting.mdx; internals 3 layers (Implémentation/Méta/Méta-méta); docs.json:201-202; mint validate PASS; committed 38b4d35 pushed (## main...origin/main 0 ahead).

**OpenQuestions (by-design forward-deps, NOT residual):** (1) Actor gate = S63 RequireRealActor (FIRST authority gate, real human); full AuthorityGraph scope-domain role-floor approval lands S85. (2) Propose does NOT persist goal/ChangeSet (agent SELECT-only on ideas.goal+changesets per S29/S20) — returns DRAFT PROPOSAL for human approval via S20 changeset door + S85 approval gate (this IS the wall / done-crit). (3) Mirrors Postgres persistence = files+executable tests (bootstrap exception). (4) Linear MCP unauthenticated (OAuth) — S66 issue not moved programmatically.

verified-green ZERO corrections.
