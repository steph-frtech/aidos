// BA22 — the TICK DRIVER (gap E1): the runtime scheduler's ONLY impure shell.
//
// THE WALL (CLAUDE.md §2). The driver computes nothing about truth — it loops, supplies
// `now` per tick, calls the PURE Schedule planner, and hands the result to an applier the
// BA23 MCP shell wires to the aidos_scheduler-role UPDATE (the four transition columns
// only). The driver never claims for the agent, never writes a truth schema. It is the
// reason a dead-agent item is reclaimed WITHOUT a human click: the loop re-runs Schedule
// at every tick, and the expire rule (lease_until < now) fires on the next tick after a
// lease lapses — no human action.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). All decision logic stays in the pure Schedule
// planner; the driver is the thin impure boundary. It does NOT call an arg-less clock
// inline — `now` is produced by an injected Clock (defaulting to time.Now in production,
// a fake stepper in tests), so a test drives the loop deterministically tick-by-tick. The
// loop carries no judgment: it only sequences pure calls. (CLAUDE.md §7 forbids arg-less
// clocks in /long-run scripts; this is a runtime daemon shell, where a ticker is allowed —
// the single sanctioned impurity of the scheduler.)
package scheduler

import (
	"context"
	"time"
)

// Clock supplies the per-tick `now` (RFC3339) the pure planner consumes. Production wires
// it to the wall clock; tests inject a deterministic stepper so the loop is reproducible.
// It is the ONLY source of impurity in the scheduler — isolated to one interface.
type Clock interface {
	// Now returns the current instant as an RFC3339 string (the format Schedule compares).
	Now() string
}

// SystemClock is the production Clock: UTC wall time formatted RFC3339. It is the only
// place the scheduler touches a real clock — and it lives behind the Clock seam so every
// decision path stays pure and testable.
type SystemClock struct{}

// Now returns the current UTC instant in RFC3339 (second precision — the queue's grain).
func (SystemClock) Now() string {
	return time.Now().UTC().Format(time.RFC3339)
}

// QueueSource reads the current queue + candidate agents the next tick will plan over. In
// production this projects runtime.red_work_queue (SELECT, under the scheduler role) and
// kernel.agent_layer (the CoucheAgent specs, gap E4). It is a READ — the driver never
// mutates through it.
type QueueSource interface {
	Snapshot() (queue []QueueEntry, agents []Candidate)
}

// Applier applies one tick's planned transitions. In production it is the BA23 MCP shell's
// aidos_scheduler-role UPDATE on the four transition columns + the assignment record; in
// tests it captures the result. Returning an error lets the driver surface (not swallow) a
// failed apply without crashing the loop.
type Applier interface {
	Apply(result ScheduleResult) error
}

// LeaseWindow computes the lease expiry to stamp on a fresh lease, given the tick's `now`.
// It is a pure helper kept out of the loop's body so the expiry rule is testable and
// declared (now + a fixed duration), never an inline magic constant.
type LeaseWindow struct {
	// Duration is the lease length stamped on each fresh claim. Declared, never learned.
	Duration time.Duration
}

// Until returns the RFC3339 lease_until for a lease granted at `now` (RFC3339). On a
// malformed `now` it returns the empty string — Claim then refuses the lease (fail-closed),
// the loop simply leases nothing that tick rather than stamping a bogus window.
func (w LeaseWindow) Until(now string) string {
	t, err := time.Parse(time.RFC3339, now)
	if err != nil {
		return ""
	}
	return t.Add(w.Duration).UTC().Format(time.RFC3339)
}

// Driver is the scheduler's impure tick loop. It owns the Clock, the QueueSource, the
// Applier and the lease window; everything it DECIDES it delegates to the pure Schedule.
type Driver struct {
	Clock  Clock
	Source QueueSource
	Apply  Applier
	Lease  LeaseWindow
	// Interval is the wall-clock gap between ticks in Run. Tick (single shot) ignores it.
	Interval time.Duration
}

// Tick runs EXACTLY ONE scheduling pass: read the snapshot, ask the Clock for `now`,
// compute the lease window, call the PURE planner, and apply the result. It returns the
// planned ScheduleResult (for inspection/telemetry) and any apply error. A single tick is
// what reclaims a dead-agent lease — calling Tick again after a lease lapses reclaims it,
// with no human action. Pure decision, impure edges only.
func (d Driver) Tick() (ScheduleResult, error) {
	queue, agents := d.Source.Snapshot()
	now := d.Clock.Now()
	leaseUntil := d.Lease.Until(now)
	result := Schedule(queue, agents, now, leaseUntil)
	if err := d.Apply.Apply(result); err != nil {
		return result, err
	}
	return result, nil
}

// Run drives the loop until the context is cancelled, ticking every Interval. It is the
// daemon entry point (BA23 wires it under the scheduler role). Each iteration is one Tick;
// a per-tick apply error is returned (the caller decides whether to keep the daemon up).
// Because every iteration re-runs the expire rule, a dead agent's item is reclaimed on the
// first tick after its lease lapses — the anti-dead-agent guarantee, without a human.
func (d Driver) Run(ctx context.Context) error {
	if d.Interval <= 0 {
		d.Interval = time.Second
	}
	ticker := time.NewTicker(d.Interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if _, err := d.Tick(); err != nil {
				return err
			}
		}
	}
}
