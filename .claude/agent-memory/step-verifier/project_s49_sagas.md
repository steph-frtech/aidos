---
name: s49-sagas
description: S49 SagaInvariant + CoherenceTest — pure cross-cell saga evaluator reusing S02/S08/S17, compensation property, content-addressed kernel.saga_invariant; verified-green
metadata:
  type: project
---

S49 = KRD §49.2 SagaInvariant + CoherenceTest, the cross-cell distributed-transaction invariant ("un changement dans une cellule ne bloque ni ne corrompt la fédération").

**Shape**: pure Go `back/kernel/sagas` + TS twin `front/web/lib/saga.ts`. Functions `Validate`/`Evaluate`/`RunCompensation`/`CheckCoherence` — all pure, total, deterministic, no I/O.

**Key reuse (no forks)**: S02 records.Hash/Canonicalize for the content-addressed row; S08 Expr DSL for the property via **De Morgan encoding** — the canonical "payment_captured implies (order_confirmed or compensation_executed)" is encoded as `!(payment_captured && (!order_confirmed && !compensation_executed))` because the closed Expr catalogue has `!`,`&&` but NOT `||`/`implies` (extending it would be an S08 contract change). S17 links.Ref (id@version) for compensation/contract refs + links.Resolve composed in CheckCoherence (incompatible iff any consumed ref not at head). S48 GlobalInvariant frame specialised.

**The done case**: a failed leg AFTER payment_captured → RunCompensation emits [refundPayment@v3, cancelOrder@v2, compensation_executed] (reverse participant order, only participants whose commit event is present) → Evaluate satisfied (property holds VIA compensation). Dangling-money (payment_captured alone) → violated/SAGA_INVARIANT_VIOLATED.

**Scope CHECK excludes local_cell** (a saga is transverse by definition, §49.1) — both pure Validate AND the Postgres CHECK constraint reject it (defense in depth, fault-injected in Testcontainers).

**Mirrors**: fixture (9 cases) + rapid (4 props: totality/determinism, core safety, coherence-composes-Resolve, validate-guards) + Testcontainers roundtrip (round-trip + scope CHECK + agent SELECT-only wall). cert_language CHECK pins {statechart,pact,tla+}.

**UI**: read-only `/sagas`, action-capable (propose→ChangeSet stub for the truth-write, ui-completeness vacuous on write-path); e2e 6/6 on :3000.

Verified-green. NB: e2e ran on :3000 (the live deployed Workbench at aidos.sagedesk.fr), not :3100 this time — probe ports before flagging.
