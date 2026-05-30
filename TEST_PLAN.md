# TEST_PLAN.md — AIDOS parallel scenario plan (run by `/test-suite`)

> **What this is.** The flat, parallel-safe list of **critical-flow scenarios** that `/test-suite`
> fans out. It is the *acceptance face* of the system, not the build order — `PLAN.md` (sequential,
> via `/long-run`) owns the order; this file owns the **proofs that each shipped tooth still bites**.
> Every scenario maps to **one critical AIDOS Workbench flow** (a `front/web/app/<route>/` panel + its
> `tests/e2e/<flow>.spec.ts`) **or one key backend law** (a Godog/rapid/fixture mirror run by `go test`).

## How `/test-suite` executes this file (`.claude/workflows/test-suite.js`)

- It parses every `## scenario-<n>` block below into `{ id, objectif, commande, attendu }`.
- It **fans out one `test-runner` per scenario, in parallel** — scenarios are independent by construction
  (each seeds and tears down its own fixture / clean phase; none depends on another's side effects).
  If two scenarios would race on shared state, they are **not** two scenarios — fold them into one.
- It **gates on failures**: any `test-runner` whose `attendu` is not met fails the suite. The gate is the
  AND of every scenario (a green suite = all green); one red scenario reddens the whole run.
- Each `test-runner` may return **suggestions** (a flaky selector to stabilize, a missing data-testid,
  a budget to tune). `/test-suite` collects them and passes them to **`suggestion-compat-checker`**,
  which decides whether a suggestion is **compatible** with the wall and the frozen stack (§2/§3 of
  `CLAUDE.md`) before it is ever surfaced — a suggestion that would weaken a guardrail is dropped, never
  applied. No suggestion edits truth; at most it files an idea.
- **The judge is the mirror, not the runner** (`CLAUDE.md` §8): `attendu` is a deterministic PASS
  criterion, never "the agent says it looks done".

### Convention per scenario

- **Objectif** — the one behaviour this flow proves (the ubiquitous language of its step doc).
- **Commande** — the exact, copy-pasteable command the `test-runner` runs (front e2e via
  `npm run test:e2e -- tests/e2e/<flow>.spec.ts`; backend laws via `go test ./<pkg>/...`).
- **Attendu** — the PASS criterion. Anything else is a fail and gates the suite.

> Front commands assume `playwright.config.ts`'s `webServer` block boots `npm run dev -w @aidos/web`
> on `http://localhost:3000` (no manual server). Backend commands run from `back/` (the Go module);
> laws touching real Postgres use **Testcontainers** (no external DB to provision).

---

## scenario-1 — The wall blocks an agent kernel write (`/wall`)

**Flow:** `front/web/app/wall/` · backing step `docs/plan/S04-the-wall.md` · hook `back/hooks/pretooluse`.

- **Objectif.** Prove the wall fires: an `agent`-role write targeting the `kernel` (or `mirrors`/`fitness`)
  schema is **denied** with `BlockReason.code = AGENT_WRITE_ABOVE_WATERLINE` and a non-empty `how_to_fix`
  (the only door: idea → mirror → /goal); a write **below** the waterline passes through. The `/wall`
  panel renders the waterline and the live feed of block events.
- **Commande (front flow):**
  ```bash
  npm run test:e2e -- tests/e2e/wall.spec.ts
  ```
- **Commande (backend law — the hook + classifier):**
  ```bash
  go test ./hooks/pretooluse/...
  ```
- **Attendu.** Both green. Front: the `/wall` panel shows the simulated kernel write as **DENIED** with
  the visible `AGENT_WRITE_ABOVE_WATERLINE` code and a how-to-fix path, and a below-waterline write as
  **ALLOWED**. Backend: the Godog feature *"The wall denies agent writes above the waterline"* passes —
  verdict `deny` on a `kernel` target, verdict `allow` below — and the **fault-injection** case (flip the
  target below the waterline) stays green. No agent-role write ever reaches a truth table.

---

## scenario-2 — `no_truth_without_mirror`: a monster blocks Stop (`/completeness`)

**Flow:** `front/web/app/completeness/` · backing step `docs/plan/S12-completeness-monstre.md` · hook
`back/hooks/stop` · logic `back/kernel/mirror/completeness`.

- **Objectif.** Prove the completeness law is non-bypassable: a spec layer **without** a living mirror
  (`no_truth_without_mirror`) — or an orphan mirror (`no_orphan_mirror`) — is a **monster**, and `Stop`
  **blocks** while any monster exists, naming each monster and its reason. An empty monster set passes.
- **Commande (front flow):**
  ```bash
  npm run test:e2e -- tests/e2e/completeness.spec.ts
  ```
- **Commande (backend law — the Stop gate + monster detector):**
  ```bash
  go test ./kernel/mirror/completeness/... ./hooks/stop/...
  ```
- **Attendu.** Both green. Front: the `/completeness` panel shows the current cut as
  **BLOCKED — MONSTER** while a truth lacks its mirror, lists the monster with reason
  `no_truth_without_mirror`, and flips to **COMPLETE** once the mirror is restored. Backend: the mirror
  proves `|monsters| > 0 ⇒ Stop blocks` with a `BlockReason{code: MONSTER|INCOMPLETE}`; the
  **fault-injection** (delete a layer's only mirror → red; re-point a mirror at a vanished `@version` →
  red; restore → pass) holds. No third verdict — block xor pass.

---

## scenario-3 — A red child reddens the parent (red wave) (`/red-wave`)

**Flow:** `front/web/app/red-wave/` · backing step `docs/plan/S22-impact-red-wave.md` · engine
`back/runtime/redwave` · hook `back/hooks/postkernelchange`.

- **Objectif.** Prove impact propagates **upward/outward from the mirror**: a kernel hash bump computes
  the ordered red wave (mirror first, then projections), so changing an **entity** reddens
  `api`/`db`/`types`, and changing a **button** reddens its **view iff the link is load-bearing** (a
  cosmetic-only button change does not). The wave drains into the `RedWorkQueue`.
- **Commande (front flow):**
  ```bash
  npm run test:e2e -- tests/e2e/red-wave.spec.ts
  ```
- **Commande (backend law — the impact engine fixture + property + hook):**
  ```bash
  go test ./runtime/redwave/... ./hooks/postkernelchange/...
  ```
- **Attendu.** Both green. Front: the `/red-wave` panel renders the open `red_work_queue` for a bump,
  items ordered **mirror → api/db/types → operation/action → button**, each coloured red, tied to the bump
  that opened them. Backend: the `state → command → events` fixture confirms an entity bump reddens
  api/db/types and a **load-bearing** button bump reddens its view while a cosmetic one does **not**; the
  `rapid` property holds (`Impact` is deterministic — same inputs, byte-identical ordered wave); the
  `PostKernelChange` **fault-injection** (bump an entity → wave fires and enqueues) is green.

---

## scenario-4 — A ChangeSet revert is append-only (`/changeset`)

**Flow:** `front/web/app/changeset/` · backing step `docs/plan/S20-changeset.md` · logic
`back/archive/changeset` · MCP `back/mcp/changeset` · commit-gate hook under `back/hooks/`.

- **Objectif.** Prove the ChangeSet's append-only, immutable lifecycle: an `APPLIED` ChangeSet is
  **immutable** (no in-place `UPDATE`/`DELETE`), and a revert is a **new inverse ChangeSet** appended to
  the log (`reverts = applied.id`, negated `spec_delta`/`mirror_delta`) — the source stays `APPLIED`.
  States are `DRAFT | APPLIED | REVERTED` only (no `FAILED`); `DRAFT → APPLIED` is refused unless the
  completeness law holds (atomic spec+mirror, no orphan).
- **Commande (front flow):**
  ```bash
  npm run test:e2e -- tests/e2e/changeset.spec.ts
  ```
- **Commande (backend law — the lifecycle fixture + state-machine property + commit-gate):**
  ```bash
  go test ./archive/changeset/... ./hooks/...
  ```
- **Attendu.** Both green. Front: the `/changeset` panel shows the "add order discount" envelope go
  `DRAFT → APPLIED`, then a **Revert** appending a new **inverse** row (the original row unchanged,
  still `APPLIED`; the source stamped `REVERTED` only via its inverse) — the lineage grows, nothing is
  overwritten. Backend: the lifecycle fixture proves immutability of `APPLIED`, the inverse-revert append,
  and the **commit-gate fault-injection** (drop the `mirror_delta` to manufacture an orphan → `APPLIED`
  blocked with a `BlockReason`); the `rapid` state-machine property holds (no transition out of `APPLIED`
  except appending an inverse).

---

## scenario-5 — The checkout demo goes red → green end to end (`/demo-checkout`)

**Flow:** `front/web/app/demo-checkout/` · backing step `docs/plan/S46-demo-checkout.md` · example app
`examples/checkout` · skill `.claude/skills/demo-checkout`.

- **Objectif.** Prove the whole KRD loop carries one real intention from **Idea → Goal → Kernel → Mirror
  → Src → Stable**: the idea *"a customer places an order from their cart"* is intaken, a `/goal` writes
  the red set for `createOrder`, the candidate `Order` entity + `createOrder` operation/control/action
  ASTs enter the kernel **only via an approved ChangeSet** (the door — the agent never side-writes), a
  living Mirror reflects them, the projections emit (Go handler, Postgres DDL, Next cart/checkout view),
  `createOrder` persists an order against real Postgres, and the phase becomes **Stable** — the whole
  chain transitions red → green and the checkout button is clickable.
- **Commande (front flow — the button journey):**
  ```bash
  npm run test:e2e -- tests/e2e/demo-checkout.spec.ts
  ```
- **Commande (backend law — the full-loop Godog journey on real Postgres):**
  ```bash
  go test ./... -run TestCheckoutFullLoop
  ```
- **Attendu.** Both green. Front: on `/demo-checkout` the emitted cart view renders, the checkout button
  is visible/enabled per the control-spec, clicking it dispatches `createOrder`, the order appears, and
  the panel shows **phase = Stable** / **all-green**. Backend: the Godog feature *"an idea for 'place an
  order from the cart' travels the full KRD loop to a green stable slice"* passes — a red set exists after
  the `/goal`, the ASTs enter only through an approved ChangeSet, the Mirror is **live**, projections
  emit, `createOrder` persists an `Order` in Testcontainers Postgres, and the phase is frozen Stable.
  Re-running yields the **same content-addressed ASTs and byte-identical projections** (determinism). No
  invented business rule (no pricing/tax/discount/inventory/payment) — anything beyond "create an order
  from a cart" is an OpenQuestion, not a guessed default.

---

## scenario-6 — No agent-role write reaches a truth table (full suite, defense-in-depth)

**Flow:** cross-cutting backend law (the wall, level 2 — Postgres GRANTs) · backing steps
`docs/plan/S04-the-wall.md` + `docs/plan/S01-postgres-content-store.md` (migrations) · Testcontainers.

- **Objectif.** Prove the **second** wall (independent of the `PreToolUse` hook): with the agent DB role,
  every `INSERT/UPDATE/DELETE/TRUNCATE` against the `kernel`, `mirrors`, and `fitness` schemas is refused
  by Postgres GRANTs; the `aidos` writer role keeps them. Defense in depth — the hook can be bypassed in
  theory, the GRANT cannot.
- **Commande:**
  ```bash
  go test ./migrations/... -run TestWallGrants
  ```
- **Attendu.** Green. Against a real Testcontainers Postgres seeded by the Atlas migrations: the
  agent-role connection is **denied** write on every truth schema (permission error), **allowed**
  `SELECT`; the `aidos`-role connection is allowed write. A regression that re-grants the agent any write
  on a truth schema turns this red and gates the suite.

---

> **Adding a scenario.** A new `## scenario-<n>` earns its place only if it proves a **critical Workbench
> flow** (new `front/web/app/<route>/` panel) or a **key backend law** (a wall, a gate, an invariant) — and
> only if it is **parallel-safe** (self-seeding, self-tearing-down, no shared mutable state with another
> scenario). It must carry **Objectif · Commande · Attendu**, with `Attendu` a deterministic PASS
> criterion. A scenario may **add** a guardrail proof, never **remove** one (`CLAUDE.md` §5 meta-loop rule).
