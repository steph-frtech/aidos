# ADR 0028 — S38 Web projection: the `ts-next` target + the widened ledger CHECK

- Status: accepted
- Date: 2026-06-01
- Step: S38 (AIDOS Workbench — web projection)
- Supersedes: none. Extends: ADR 0014 (S34 emitter set + `runtime.generated_artifacts`).

## Context

S38 lands the **web-projection emitter**: a deterministic generator that reads a
control-spec (S11, the button-as-a-kernel-source) + the action-spec it binds (S11) and
emits a **real Next.js client component** whose rendered `visible`/`enabled` are a faithful
mirror of `EvalState(control, given)` (S11) and whose click **declares** the bound
operation (`Plan(action, click).invoke`, S11) — proven green by a playwright-bdd e2e
replaying the S11 fixtures against the rendered DOM. This is the front face of "one source
→ N projections, never double-typed" (KRD LIVRE V).

## Decisions

1. **A new `target = ts-next` inside the S34 emitter set, not a fork.** The web emitter
   lives in `back/runtime/generators/webcomponent/` and mirrors the S34 `Artifact` shape
   (path, target, kind, bytes, source_hash, output_hash, protected) so it records into the
   **same** `runtime.generated_artifacts` ledger with no new table. The kind × target
   matrix grows **additively** (only `ts-next` × `control` here; mobile/voice/other
   controls are later teeth).

2. **The component embeds the control's Expr ASTs + a shared TS evaluator twin.** Rather
   than a network call to the Go `EvalState` (a runtime coupling) or a re-implemented
   business rule, the emitted `.tsx` embeds `visible_when`/`enabled_when` as their canonical
   Expr AST JSON (the kernel head form) and evaluates them with `front/web/lib/aidos-expr.ts`
   — the **byte-identical TS twin** of the FROZEN `back/kernel/expr` closed catalogue
   (`>`, `length`, `&&`, `!`) + `control.EvalState`. Determinism-first: a pure function of
   `(ast, given)`; the Go evaluator stays authoritative (the fast-check mirror anchors the
   twin on the Go hashes `8ebfb46f…` / `5b428d00…`).

3. **`source_hash = Hash(Canonicalize(control.body ⊕ action.body))`.** Reuses S02
   (`records.Hash`/`Canonicalize`) + S11 (`control.Canonicalize`/`action.Canonicalize`) —
   never a forked hashing path. The ⊕ is the `{"action":…,"control":…}` envelope
   re-canonicalized (order-independent). Staleness is the simple inequality vs the head
   (feeds S22's red wave, never hunted).

4. **The click DECLARES, it does not EXECUTE.** The button sets `data-aidos-invoke =
   Plan(action, click).invoke` (a testable signal) + an optional `onInvoke` callback. The
   operation runtime is a later tooth; the projection only declares the bind.

5. **The ledger target CHECK is WIDENED to a superset (expand-only).** The S34 CHECK
   admitted `go-sqlc | pg-ddl | ts-types`; a `ts-next` insert would be refused. The S38
   migration `web_projection_target_baseline.sql` **drops the narrower CHECK and re-adds a
   superset CHECK** `IN ('go-sqlc','pg-ddl','ts-types','ts-next')` — additive (a `refine`
   SemanticDiff: adds a member, removes none), idempotent, guarded; it touches **no column,
   no GRANT, no prior row**. This is the only contract touch; it is recorded here + via a
   SemanticDiff, never a silent edit.

6. **An unresolved trigger/bind ⇒ a BlockReason (S13), reusing `OUT_OF_SCOPE`.** The S13
   code enum is closed; adding a code is a ChangeSet+ADR and is out of S38's scope, so the
   web emitter reuses `CodeOutOfScope` (as the S34 emitter does for a malformed AST) with a
   non-empty French `how_to_fix`. **OpenQuestion OQ-S38-blockcode:** a dedicated
   `ORPHAN_WEB_BIND` code could be added later if the UX warrants it.

## Consequences

- A button is now a **regenerable, protected projection** of the control+action truth, not
  hand-authored UI; the wall holds (the emitter SELECTs the AST, writes only the `.tsx`
  below the line + a ledger row via the writer role).
- No new MCP/hook (the wall hook S04 + the re-emit byte-equality cover `_generated/`
  protection; §5 hook-honesty forbids a hook that never fired).
- **OpenQuestion OQ-S38-web-emit-op:** if a callable `web_project_emit` backend op truly
  emerges, it gets an MCP tool then — not now (`Emit` is a pure library; `/web-project` is
  a harness gesture).
