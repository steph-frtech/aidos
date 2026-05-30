---
name: action
description: Author a control-spec (button — visible_when/enabled_when/triggers) and its action-spec (binds control → operation, on_success/on_error) with state/event fixtures. Use whenever a button or UI control's existence/visibility/enabled rule must be pinned as truth, an action must bind a control to an operation, someone says "wire this button to that operation", or the verticale needs to reach down to the button and its action.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# action (KRD gesture)

A KRD gesture: take the button down to the wall. In KRD the **control (button)** and the **action** are first-class **SOURCE** layers, not implementation details (KRD.md §23). Their behaviour is expressed in DSL — never in free code on the spec side — right down to the click. This gesture authors the control-spec, its action-spec, and the **state/event fixtures** that mirror them.

> The wall (CLAUDE.md §2): this gesture never writes the `kernel`/`mirrors`/`fitness` schemas by hand. It drafts the control-spec, the action-spec and their fixture mirrors; promotion to the kernel is `idea → mirror → /goal → human approval`, applied via a changeset MCP under a dedicated role.

## Purpose

Pin "the button exists, with this label, visible-if P, enabled-if Q, and clicking it triggers action A" — and "action A invokes operation O(args), with these success/error effects" — as **falsifiable, versioned truth** the generated UI must satisfy and the ratchet protects:

- a **control-spec** — `view`, `label`, `visible_when`, `enabled_when` (Expr DSL ASTs, no free code), `triggers: action`;
- an **action-spec** — `on` (the event), `invoke: operation ... with {args}`, `on_success`, `on_error` (declared effects), which `binds` the control to an operation;
- a **state fixture** mirroring the control (`given state → button.visible/enabled`) and an **event fixture** mirroring the action (`event → effects`).

## When to use

- The verticale must reach the button: a `view` has a control whose existence/visibility/enabled rule is a *defect if violated*, not just a *change* (KRD.md §23 entry test).
- A button must be wired to an operation: "clicking checkout calls `createOrder`, navigates on success, toasts on error".
- A `control` or `action` SOURCE layer exists with no living mirror (a **monster** — fix by adding the fixture, never by deleting the truth).
- Step loop point 2/9: an N0/N3 step needs its control + action specs and their fixtures before the rendered component is generated.

## Inputs

- The sharpened intention (from `/grill-with-docs`) in **ubiquitous language**.
- The `view`/screen the control lives on (existing view-spec id) — read-only, never invented.
- The **operation** the action will `invoke` (existing operation id + its arg shape) — read-only, never invented.
- The visibility/enabled rules as **Expr DSL** over named roots (`$.cart`, `$.form`, `$.auth.user`, …) — from the human, not guessed.
- `CONTEXT-MAP.md` + the subsystem `CONTEXT.md` for the glossary; KRD.md §23–24, §35 for the exact shapes.

## Outputs

- A **control-spec** draft (AST): `{ view, label, visible_when, enabled_when, triggers }`.
- An **action-spec** draft (AST): `{ on, invoke, on_success, on_error }`, declaring `binds` (action → operation) and reflecting the control's `triggers` (control → action).
- Two **fixture** mirror sources (`test_kind: fixture`, `cert_language: fixture`, `authority: above`):
  - control: `given <state> -> button.visible/enabled == <bool>` (KRD.md §35);
  - action: `given <event> -> effects == [...]` (the success and error branches).
- A failing run captured (the red) — the fixtures fail until the control/action behaviour exists. That red **is** the `/goal`.
- Zero or more **OpenQuestion** records for every gap (unknown view, unknown operation, undefined Expr root, missing arg).

## BDD / mirror required before use

This gesture is itself behaviour, so it follows Mandat A:

- Author the **fixture mirror first** for both control and action; watch it go **red for the right reason** (the control/action behaviour is absent), then let `/tdd` drive the projection (the rendered `onClick`, bindings, states) to green.
- Never write the rendered component (`front/web` handler) before the fixture is red. If you catch yourself writing the projection, stop — the source and its mirror come first.
- **Fault-injection (the mirror of the mirror, §32):** flip `enabled_when`, assert the control fixture goes red; drop an `on_error` effect, assert the action fixture goes red. A fixture that never fires is a dead detector, not a passing test.

## Steps

1. **Name what it sits on.** Confirm the `view` id and the `operation` id (and its arg shape) from the spec/base. Absent or ambiguous → **OpenQuestion**, do not invent.
2. **Draft the control-spec.** `view`, `label`, `visible_when`, `enabled_when` as **Expr DSL** ASTs over named roots, `triggers: action "<name>"`. No free code in the conditions (KRD.md §24.5).
3. **Draft the action-spec.** `on: click("<control>")`, `invoke: operation "<op>" with { …args… }`, `on_success: [...]`, `on_error: [...]`. This declares `binds` (action → operation) and closes the `triggers` link from the control.
4. **Write the control fixture** (`given state → button.visible/enabled`): one row per branch of the Expr conditions — at minimum the false and true cases of `visible_when` and `enabled_when` (KRD.md §35). ≤ 5 rows, one intention.
5. **Write the action fixture** (`event → effects`): the click event, the `on_success` effects, and the `on_error` effects. Same ubiquitous words as the spec.
6. **Materialize and run both fixtures.** Confirm they are **red for the right reason** (absent behaviour, not a typo/compile error).
7. **Record the red as the `/goal`** and hand off: kernel promotion via `idea → mirror → /goal`; projection via `/tdd`.

## Stop conditions

- Both fixtures are **red for the right reason** (they assert the absent control/action behaviour).
- The control `triggers` a real action; the action `binds` a real `operation`; `visible_when`/`enabled_when` are valid Expr ASTs over **known** roots.
- The control fixture covers each Expr branch (visible false/true, enabled false/true); the action fixture covers `on_success` **and** `on_error`.
- No monster introduced; `test_kind: fixture`, `cert_language: fixture`, `liveness` set on each mirror.
- You have written **no** rendered component / handler code.

## Failure modes

- **Behaviour in free code.** Writing the click logic in a handler instead of the action-spec's `invoke`/`on_success`/`on_error`. The behaviour lives in the DSL, the handler is a projection (KRD.md §24).
- **Invented operation or args.** `invoke`-ing an operation that doesn't exist, or guessing its arg shape → monster. OpenQuestion instead.
- **Untyped condition.** Putting a raw expression or free code in `visible_when`/`enabled_when` instead of an Expr AST → not versionable, not a sensor.
- **Half a mirror.** Fixture covers `on_success` but not `on_error`, or `visible_when` but not `enabled_when` — you believe you have symmetry and have a hole (§33).
- **Dangling `triggers`/`binds`.** Control triggers an action that doesn't exist, or action binds nothing → orphan, a monster.
- **Green on first run.** The behaviour already exists or the assertion is empty — not a proof. Tighten or delete.
- **Wall breach.** Writing the spec/mirror straight into `kernel`/`mirrors`. Route through the changeset/idea-intake MCP.

## Related hooks

- `pretooluse` (the wall) — refuses any write to `kernel`/`mirrors`/`fitness`; route the spec + mirror via MCP.
- `stop` (completeness) — blocks finish if the `control` or `action` layer lacks its living fixture, or a mirror is orphaned (§29).
- `posttooluse` (sensors) — must stay green at each diff; the control/action fixtures fire as deterministic sensors.

## Related MCP tools

- **store** — read the `view`, the `operation` (and its arg shape), and the Expr roots the conditions reference (read-only, to confirm what the control `triggers` and the action `binds`).
- **mirror-runner** — store the control + action fixture records and sources, materialize them, and run the fixture interpreter (red → green).
- **idea-intake** — open the `idea → mirror → /goal` door when the control/action SOURCE does not yet exist in the kernel.
- **changeset** — wrap the control-spec + action-spec + their mirrors as one recorded decision (append-only), never a direct edit.

## Workbench visualization

Next route under `front/web/app/` (a **Control & Action** panel): render the button across its fixture states (visible/hidden, enabled/disabled) and the action's success/error effect timeline, each row tied to its fixture and showing red until green. Add/extend that route's Playwright e2e — e.g. assert that with an empty `$.cart` the checkout button renders hidden, and with a valid form it renders enabled. Never touch existing routes.

## Honesty rules

Never invent a `target`, a `targetId`, a view, an operation, an arg, or a business rule (a `visible_when`/`enabled_when` condition) to complete a control-spec or action-spec; every gap — unknown view or operation, undefined Expr root, missing arg, unclear effect — becomes an **OpenQuestion** (an idea/provenance entry), never a guess written into the spec.
