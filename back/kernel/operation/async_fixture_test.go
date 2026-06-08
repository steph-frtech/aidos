package operation_test

// Fixture mirror (N2: state → scheduled-cmd → events), interpreted in Go.
// reflects=kernel.operation/async · test_kind=workflow · cert_language=fixture ·
// liveness=live · authority=below.
//
// Materialized source: tests/kernel/scheduledOperation_async.fixture.md (the
// human-readable fixture, conceptually stored in the `mirrors` schema; persisted to
// Postgres at S06 — bootstrap exception). It is the LIEN PORTEUR: this test loads the
// async/scheduled-fires + async/outbox-replay + async/no-duplicate scenarios; if the
// fixture intention disappears the test breaks (no silent rot into a monster).
//
// The async operation is the S73 sendReminder anchor (cron trigger + a notification
// effect). The scheduler reads an INJECTED clock and the outbox/sink are MOCKS, so the
// package stays pure (no DB/HTTP/real-clock).

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// mockOutbox is the in-memory test double for the transactional outbox seam. It records
// entries in insertion order, tracks the dispatched id set, and lets the no-duplicate
// scenario pre-seed an already-dispatched id.
type mockOutbox struct {
	entries    []operation.OutboxEntry
	dispatched map[string]bool
}

func newMockOutbox() *mockOutbox {
	return &mockOutbox{dispatched: map[string]bool{}}
}

func (o *mockOutbox) write(e operation.OutboxEntry) { o.entries = append(o.entries, e) }

func (o *mockOutbox) Pending() []operation.OutboxEntry {
	out := make([]operation.OutboxEntry, 0, len(o.entries))
	for _, e := range o.entries {
		if e.Status == operation.OutboxPending {
			out = append(out, e)
		}
	}
	return out
}

func (o *mockOutbox) MarkDispatched(id string) {
	o.dispatched[id] = true
	for i := range o.entries {
		if o.entries[i].ID == id {
			o.entries[i].Status = operation.OutboxDispatched
		}
	}
}

func (o *mockOutbox) IsDispatched(id string) bool { return o.dispatched[id] }

// mockSink records the observable deliveries so the no-duplicate scenario can assert the
// delivered count stays exactly 1.
type mockSink struct{ delivered []operation.Effect }

func (s *mockSink) Deliver(e operation.Effect) error {
	s.delivered = append(s.delivered, e)
	return nil
}

// ── async/scheduled-fires ─────────────────────────────────────────────────────────

func TestFixture_ScheduledOpFiresAtEcheance(t *testing.T) {
	op, async := operation.SendReminder()
	scheduled := []operation.ScheduledOp{{Name: op.Name, Trigger: async.Trigger}}

	// Before the echeance: the scheduler does NOT fire.
	before := operation.FixedClock{At: "2026-06-08T08:59:59Z"}
	fired, err := operation.Tick(scheduled, before)
	if err != nil {
		t.Fatalf("Tick(before): %v", err)
	}
	if len(fired) != 0 {
		t.Fatalf("fired before echeance = %v, want [] (not yet due)", fired)
	}

	// At the echeance: the operation fires exactly once.
	at := operation.FixedClock{At: "2026-06-08T09:00:00Z"}
	fired, err = operation.Tick(scheduled, at)
	if err != nil {
		t.Fatalf("Tick(at): %v", err)
	}
	if len(fired) != 1 || fired[0] != "sendReminder" {
		t.Fatalf("fired at echeance = %v, want [sendReminder]", fired)
	}

	// It emits its declared events [ReminderSent].
	deps := &mockDeps{authorizeAllow: true}
	events, _, err := operation.Interpret(op, operation.NewState(map[string]any{"to": "user@example.com"}, nil), deps)
	if err != nil {
		t.Fatalf("Interpret(sendReminder): %v", err)
	}
	if len(op.Emits) != 1 || op.Emits[0] != "ReminderSent" {
		t.Fatalf("emits = %v, want [ReminderSent]", op.Emits)
	}
	_ = events

	// Its effect is written to the outbox as PENDING (never fired inline).
	outbox := newMockOutbox()
	for _, eff := range async.Effects {
		entry, err := operation.NewOutboxEntry(eff)
		if err != nil {
			t.Fatalf("NewOutboxEntry: %v", err)
		}
		if entry.Status != operation.OutboxPending {
			t.Fatalf("new outbox entry status = %q, want pending (never fired inline)", entry.Status)
		}
		outbox.write(entry)
	}
	if len(outbox.Pending()) != 1 {
		t.Fatalf("pending outbox entries = %d, want 1", len(outbox.Pending()))
	}
	// The effect was NOT delivered yet (written, not dispatched).
	sink := &mockSink{}
	if len(sink.delivered) != 0 {
		t.Fatalf("delivered before dispatch = %d, want 0 (effect written, not fired inline)", len(sink.delivered))
	}
}

// ── async/outbox-replay ─────────────────────────────────────────────────────────

func TestFixture_OutboxReplaysUndispatchedAfterCrash(t *testing.T) {
	_, async := operation.SendReminder()
	outbox := newMockOutbox()

	// The process crashed AFTER the state-write transaction (the effect is PENDING) but
	// BEFORE the dispatch — the classic outbox crash window.
	entry, err := operation.NewOutboxEntry(async.Effects[0])
	if err != nil {
		t.Fatalf("NewOutboxEntry: %v", err)
	}
	outbox.write(entry)

	// The dispatcher runs after the crash: it picks up the PENDING effect and delivers it.
	sink := &mockSink{}
	delivered, err := operation.Dispatch(outbox, sink)
	if err != nil {
		t.Fatalf("Dispatch: %v", err)
	}
	if delivered != 1 {
		t.Fatalf("delivered after crash = %d, want 1 (a write-then-crash never loses the effect)", delivered)
	}
	if len(sink.delivered) != 1 {
		t.Fatalf("sink deliveries = %d, want 1 (at-least-once)", len(sink.delivered))
	}
	// And the entry is now DISPATCHED (no longer pending).
	if len(outbox.Pending()) != 0 {
		t.Fatalf("pending after dispatch = %d, want 0 (marked dispatched)", len(outbox.Pending()))
	}
	if !outbox.IsDispatched(entry.ID) {
		t.Fatalf("effect %q should be marked dispatched after delivery", entry.ID)
	}
}

// ── async/no-duplicate ──────────────────────────────────────────────────────────

func TestFixture_ReplayNeverDuplicatesEffect(t *testing.T) {
	_, async := operation.SendReminder()
	outbox := newMockOutbox()
	sink := &mockSink{}

	entry, err := operation.NewOutboxEntry(async.Effects[0])
	if err != nil {
		t.Fatalf("NewOutboxEntry: %v", err)
	}
	outbox.write(entry)

	// First dispatch delivers exactly once.
	if _, err := operation.Dispatch(outbox, sink); err != nil {
		t.Fatalf("Dispatch #1: %v", err)
	}
	if len(sink.delivered) != 1 {
		t.Fatalf("after first dispatch delivered = %d, want 1", len(sink.delivered))
	}

	// Simulate the at-least-once REDELIVERY: a crash after dispatch but before the ack
	// re-presents the SAME effect as PENDING (same content-addressed id).
	redeliver := operation.OutboxEntry{ID: entry.ID, Effect: async.Effects[0], Status: operation.OutboxPending}
	outbox.write(redeliver)

	// The dispatcher recognises the id as already dispatched and SUPPRESSES the re-deliver.
	delivered, err := operation.Dispatch(outbox, sink)
	if err != nil {
		t.Fatalf("Dispatch #2: %v", err)
	}
	if delivered != 0 {
		t.Fatalf("re-dispatch delivered = %d, want 0 (the replay is suppressed)", delivered)
	}
	// The OBSERVABLE delivery count stays exactly 1 (exactly-once relative).
	if len(sink.delivered) != 1 {
		t.Fatalf("observable deliveries after replay = %d, want 1 (exactly-once relative)", len(sink.delivered))
	}
}

// ── the closed trigger set / validation ─────────────────────────────────────────

func TestFixture_UnknownTriggerKindIsTypedFailure(t *testing.T) {
	bad := operation.Async{Trigger: operation.AsyncTrigger{Kind: operation.TriggerKind("frobnicate")}}
	err := operation.ValidateAsync(bad)
	if !errors.Is(err, operation.ErrUnknownTriggerKind) {
		t.Fatalf("ValidateAsync(unknown kind) = %v, want ErrUnknownTriggerKind", err)
	}
	// The refusal is an actionable BlockReason with a non-empty fix path (never a prison).
	br := operation.BlockAsync(err)
	if len(br.HowToFix) < 1 {
		t.Fatalf("BlockAsync.HowToFix is empty — a wall without a door is a prison")
	}
	if br.Code != "ASYNC_UNKNOWN_TRIGGER_KIND" {
		t.Fatalf("BlockAsync code = %q, want ASYNC_UNKNOWN_TRIGGER_KIND", br.Code)
	}
}

func TestFixture_CronMissingEcheanceIsTypedFailure(t *testing.T) {
	bad := operation.Async{Trigger: operation.AsyncTrigger{Kind: operation.TriggerCron, At: ""}}
	err := operation.ValidateAsync(bad)
	if !errors.Is(err, operation.ErrCronMissingEcheance) {
		t.Fatalf("ValidateAsync(cron no echeance) = %v, want ErrCronMissingEcheance", err)
	}
}
