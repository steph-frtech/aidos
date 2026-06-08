---
name: project-s73-async-operation
description: S73 verification — async/scheduled Operation DSL extension (third dimension) + transactional outbox exactly-once-relative; verified-green zero corrections
metadata:
  type: project
---

S73 « Operation asynchrone/planifiée + outbox transactionnel » — THIRD dimension over the S10 Operation DSL (after the six sync Step verbs), purely additive (the sync verbs untouched).

- **AsyncTrigger** {kind ∈ closed set cron|queue|webhook_out|notification, at} + **Effect** + **Async**{trigger,effects} block. ValidateAsync refuses ASYNC_UNKNOWN_TRIGGER_KIND / ASYNC_CRON_MISSING_ECHEANCE (typed, never coerced). BlockAsync = step-LOCAL code string (S72 blob pattern), NOT a new entry in the global closed blockreason enum (would need its own ChangeSet/ADR).
- **Scheduler = CODE, pure on INJECTED Clock seam** (FixedClock). Due(echeance,now)=now≥echeance, Tick→sorted fired names. async_clock.go = the ONLY place touching `time`, only to PARSE declared RFC3339, NEVER reads wall clock. No LLM/rng anywhere (grep confirmed `time.Now` only in COMMENTS).
- **Transactional outbox exactly-once-relative**: NewOutboxEntry writes PENDING in state txn; Outbox+Sink seams; Dispatch delivers PENDING once (at-least-once after crash) + SUPPRESSES already-dispatched replay via IsDispatched on content-addressed EffectID = records.Hash/Canonicalize VERBATIM → observable count stays 1.
- **DONE-CRIT proven**: fixture (ScheduledOpFiresAtEcheance before→nothing/at→fires once+PENDING never inline; OutboxReplaysUndispatchedAfterCrash; ReplayNeverDuplicatesEffect observable=1) + property (TickDeterministic, DueIffNowGEEcheance, EffectIDStable key-order-stable, DispatchNoDuplicate ∀ interleaving ⇒ ≤1) — all PASS.
- **Byte-anchor 3587dff209c7f0c5...074a210** INDEPENDENTLY verified: Go EffectID == TS effectId byte-equal (recomputed both, matched report).
- go test ok, vet/gofmt clean. MCP back/mcp/async-operation 5 PURE tools (async_validate/effect_id/due/tick/dispatch) write nothing.
- Front: lib/async-operation.ts byte-twin vitest 13/13; /async-operation action-capable route, actions.ts writes-NOTHING (pure value compute, tick+dispatch over snapshots), nav:139 asyncOperation. e2e 4/4 testids-match (run-submit via Submit component, op-name=sendReminder, observable data-count=1, fired before/after echeance). tsc clean, biome clean. wall-grep CLEAN.
- Mirror lien porteur: tests/kernel/scheduledOperation_async.fixture.md (Postgres persistence back-filled at S06 — bootstrap exception).
- Docs 3-layer internals (Implémentation/Méta/Méta-méta) + concept, docs.json:215-216, mint validate PASS, pushed 30390c5 0-ahead of origin/main.
- **OQ by-design (NOT residual)**: Linear MCP unauth; emitted realisation (TS worker + outbox table) = S74's tooth (seams mocked here); async block carried alongside Operation (SendReminder returns (Operation,Async)) — persisting as kernel.operation column = aidos-CLI/ChangeSet path (the wall); Windmill/NATS substrate (DP16, ADR0043) = emitted realisation replaceable slot.

verified-green ZERO corrections.
