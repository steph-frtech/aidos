package operation

// Reproducibility mirror (the determinism-first mandate, CLAUDE.md §6/§8): the scheduler
// is CODE, never an LLM, and PURE on the injected clock — same (schedule, now) ⇒ same
// fired set; the content-addressed effect id is stable. These are property tests
// (rapid), the in-package twin of the human red fixture, never a self-graded invariant.

import (
	"fmt"
	"testing"
	"time"

	"pgregory.net/rapid"
)

// TestProp_TickDeterministic — Tick is a pure function of (schedule, injected-now):
// running it twice over the same inputs yields the byte-identical ordered fired set.
func TestProp_TickDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		n := rapid.IntRange(0, 6).Draw(t, "n")
		scheduled := make([]ScheduledOp, 0, n)
		for i := 0; i < n; i++ {
			offset := rapid.IntRange(-1000, 1000).Draw(t, fmt.Sprintf("offset%d", i))
			at := base.Add(time.Duration(offset) * time.Minute).Format(time.RFC3339)
			scheduled = append(scheduled, ScheduledOp{
				Name:    fmt.Sprintf("op%d", i),
				Trigger: AsyncTrigger{Kind: TriggerCron, At: at},
			})
		}
		nowOffset := rapid.IntRange(-1000, 1000).Draw(t, "now")
		now := FixedClock{At: base.Add(time.Duration(nowOffset) * time.Minute).Format(time.RFC3339)}

		a, errA := Tick(scheduled, now)
		b, errB := Tick(scheduled, now)
		if (errA == nil) != (errB == nil) {
			t.Fatalf("Tick determinism: errA=%v errB=%v", errA, errB)
		}
		if errA != nil {
			return
		}
		if len(a) != len(b) {
			t.Fatalf("Tick not deterministic: %v vs %v", a, b)
		}
		for i := range a {
			if a[i] != b[i] {
				t.Fatalf("Tick[%d] = %q vs %q", i, a[i], b[i])
			}
		}
	})
}

// TestProp_DueIffNowGEEcheance — the scheduling predicate is exactly now ≥ echeance.
func TestProp_DueIffNowGEEcheance(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		echOff := rapid.IntRange(-1000, 1000).Draw(t, "ech")
		nowOff := rapid.IntRange(-1000, 1000).Draw(t, "now")
		ech := base.Add(time.Duration(echOff) * time.Minute)
		now := base.Add(time.Duration(nowOff) * time.Minute)

		got, err := Due(ech.Format(time.RFC3339), now.Format(time.RFC3339))
		if err != nil {
			t.Fatalf("Due: %v", err)
		}
		want := !now.Before(ech)
		if got != want {
			t.Fatalf("Due(ech=%s, now=%s) = %v, want %v", ech, now, got, want)
		}
	})
}

// TestProp_EffectIDStable — the content-addressed effect id is deterministic: the same
// effect always hashes to the same id (the idempotency key the dispatcher dedupes on),
// regardless of payload key insertion order.
func TestProp_EffectIDStable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		target := rapid.StringMatching(`[a-z@.]{1,12}`).Draw(t, "target")
		k1 := rapid.StringMatching(`[a-z]{1,5}`).Draw(t, "k1")
		k2 := rapid.StringMatching(`[a-z]{1,5}`).Draw(t, "k2")
		if k1 == k2 {
			// Distinct keys only: {a:a} and {a:b} are genuinely different objects (last
			// write wins in a literal), not a key-order reordering of the same object.
			k2 = k2 + "x"
		}
		v1 := rapid.StringMatching(`[a-z]{1,5}`).Draw(t, "v1")
		v2 := rapid.StringMatching(`[a-z]{1,5}`).Draw(t, "v2")

		// Two effects with the SAME logical payload but different key insertion order.
		eA := Effect{Kind: TriggerNotification, Target: target, Payload: map[string]any{k1: v1, k2: v2}}
		eB := Effect{Kind: TriggerNotification, Target: target, Payload: map[string]any{k2: v2, k1: v1}}

		idA, errA := EffectID(eA)
		idB, errB := EffectID(eB)
		if errA != nil || errB != nil {
			t.Fatalf("EffectID errs: %v %v", errA, errB)
		}
		if idA != idB {
			t.Fatalf("EffectID not order-stable: %q vs %q", idA, idB)
		}
		// And stable across repeated calls.
		idA2, _ := EffectID(eA)
		if idA != idA2 {
			t.Fatalf("EffectID not repeatable: %q vs %q", idA, idA2)
		}
	})
}

// TestProp_DispatchNoDuplicate — over ANY interleaving of write + re-write + dispatch,
// the observable delivered count for a single content-addressed effect never exceeds 1
// (exactly-once relative).
func TestProp_DispatchNoDuplicate(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		_, async := SendReminder()
		eff := async.Effects[0]
		entry, err := NewOutboxEntry(eff)
		if err != nil {
			t.Fatalf("NewOutboxEntry: %v", err)
		}

		ob := &propOutbox{dispatched: map[string]bool{}}
		sink := &propSink{}

		rounds := rapid.IntRange(1, 5).Draw(t, "rounds")
		for r := 0; r < rounds; r++ {
			// Each round re-presents the same effect as PENDING (the at-least-once
			// redelivery) before dispatching.
			ob.entries = append(ob.entries, OutboxEntry{ID: entry.ID, Effect: eff, Status: OutboxPending})
			if _, err := Dispatch(ob, sink); err != nil {
				t.Fatalf("Dispatch: %v", err)
			}
		}
		if sink.count != 1 {
			t.Fatalf("delivered count = %d over %d rounds, want exactly 1 (exactly-once relative)", sink.count, rounds)
		}
	})
}

// propOutbox / propSink are minimal in-package doubles for the property test.
type propOutbox struct {
	entries    []OutboxEntry
	dispatched map[string]bool
}

func (o *propOutbox) Pending() []OutboxEntry {
	out := make([]OutboxEntry, 0, len(o.entries))
	for _, e := range o.entries {
		if e.Status == OutboxPending {
			out = append(out, e)
		}
	}
	return out
}

func (o *propOutbox) MarkDispatched(id string) {
	o.dispatched[id] = true
	for i := range o.entries {
		if o.entries[i].ID == id {
			o.entries[i].Status = OutboxDispatched
		}
	}
}

func (o *propOutbox) IsDispatched(id string) bool { return o.dispatched[id] }

type propSink struct{ count int }

func (s *propSink) Deliver(_ Effect) error { s.count++; return nil }
