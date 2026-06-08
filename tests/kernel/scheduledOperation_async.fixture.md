# Mirror · kernel.operation/async-scheduled + outbox · fixture (state → scheduled-cmd → events)

- reflects: `kernel.operation/async` (the async/scheduled Operation node + the transactional outbox)
- test_kind: `workflow`
- cert_language: `fixture` (the async/scheduled extension is interpreted in Go; the fixture IS the N2 truth form)
- liveness: `live`
- authority: `below` (the scheduler/dispatcher are computational projections of the async AST; the async Operation SOURCE truth itself is above the line)

This is the materialized, human-readable form of the **workflow** mirror; the runnable
mirror is `back/kernel/operation/async_fixture_test.go`. Conceptually this record lives
in the `mirrors` Postgres schema and is persisted there at S06 (bootstrap exception —
the schema predates this step; until the back-fill the file + the Go test ARE the
red→green proof — CLAUDE.md §6 bootstrap exception).

It is the **lien porteur**: the test loads `async/scheduled-fires`, `async/outbox-replay`,
`async/no-duplicate`; if the fixture disappears, the tests break (the mirror cannot
silently rot into a monster).

## The async/scheduled node (S73)

S73 extends the Operation DSL (S10) with a **third dimension**, neither a sync step nor a
plain mutate: an **AsyncTrigger** — the declared way an operation may run **out of band**
(at a cron echeance, off a queue, from an inbound webhook, or as a side-effect
notification/email). The trigger kinds are a CLOSED set, invented by neither the agent nor
the LLM:

```
trigger.kind ∈ { cron, queue, webhook_out, notification }
```

An operation may carry an optional `Async { Trigger, Effects[] }` block. Each **Effect** is a
side-effect the operation must perform on the world (send an email, POST a webhook, enqueue a
job, push a notification). An effect is NEVER fired inline; it is written to the **outbox** in
the same logical transaction as the state mutation, then dispatched by the **dispatcher**.

## The transactional outbox (exactly-once relative)

The outbox is the classic transactional-outbox pattern: the operation writes its effects as
**pending outbox entries** in the SAME transaction as its state change (so an effect can never
exist without its state change, nor a state change without its effect — atomic). A separate
**dispatcher** then reads the pending entries, dispatches each to the world, and marks it
dispatched. The guarantee is **exactly-once RELATIVE**: at-least-once delivery + idempotent
dispatch ⇒ no observable duplicate. The idempotency key is the **content-addressed effect id**
(`records.Hash(Canonicalize(effect))`), so a replayed effect collides with its prior dispatch
and is suppressed.

## Scenario `async/scheduled-fires` — a scheduled operation fires at its echeance

```
Given a scheduled operation "sendReminder" with trigger { kind: cron, at: "2026-06-08T09:00:00Z" }
  And an injected clock at "2026-06-08T08:59:59Z"
 When the scheduler is ticked
 Then the operation does NOT fire (before its echeance)
 When the injected clock advances to "2026-06-08T09:00:00Z"
  And the scheduler is ticked
 Then the operation fires exactly once
  And it emits its declared events [ "ReminderSent" ]
  And its effect is written to the outbox as PENDING (never fired inline)
```

## Scenario `async/outbox-replay` — an undispatched effect is replayed after a crash

```
Given an outbox holding a PENDING effect (written, never dispatched — the process crashed
      between the state-write transaction and the dispatch)
 When the dispatcher runs after the crash
 Then it picks up the PENDING effect
  And dispatches it (the effect reaches the world)
  And marks it DISPATCHED
  And the effect is delivered (at-least-once: a write-then-crash never loses the effect)
```

## Scenario `async/no-duplicate` — a replay never duplicates an observable effect

```
Given an effect ALREADY dispatched once (marked DISPATCHED in the outbox)
 When the dispatcher runs again over the same outbox (a crash AFTER dispatch but BEFORE the
      ack was recorded — the at-least-once redelivery)
 Then the dispatcher recognises the effect's content-addressed id as already dispatched
  And it SUPPRESSES the re-dispatch (no second delivery to the world)
  And the observable delivery count stays exactly 1 (exactly-once relative)
```

## Property `async/clock-deterministic` — scheduling is deterministic on the injected clock

```
∀ (echeance, ticks) : Due(echeance, now) ⇔ now ≥ echeance
  And Tick is a PURE function of (schedule, injected-clock) — same (schedule, now) ⇒ same fired set
```

The scheduler holds NO real clock, NO rng, NO I/O: the clock is INJECTED (a `Clock` seam,
exactly like S10's Deps). `Tick(now)` is a pure function — the determinism-first mandate
(CLAUDE.md §6/§8): the scheduler is **code, never an LLM**, and its reproducibility mirror
(`async_property_test.go`) pins same-input → same-output.

## The wall (CLAUDE.md §2)

The scheduler and dispatcher write NO truth: the async/scheduled Operation AST is a SOURCE row
written only by the `aidos` CLI through an approved ChangeSet. The outbox is a runtime/datastore
table (a projection seam, below the waterline), reached only through an injected `Outbox`
interface — the package itself is PURE (no DB, no HTTP, no real clock, no RNG). The emitted
realisation (a TS worker + an outbox table, per the S74 target) is a later tooth (ROADMAP note);
here the fixture passes mocks at each seam.
