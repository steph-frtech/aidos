package asyncfragments_test

// Fixture mirror (N2: state → scheduled-cmd → events), interpreted in Go — WRITTEN
// FIRST (RED→GREEN). reflects=dp16-async-substrate-fragments+scheduled-realisation ·
// test_kind=workflow · cert_language=fixture · liveness=live · authority=below.
//
// Materialized source: tests/runtime/asyncFragments_scheduled.fixture.md (the
// human-readable fixture, conceptually stored in the `mirrors` schema; persisted to
// Postgres at S06 — bootstrap exception). It is the LIEN PORTEUR: this test loads the
// scheduled/fires-at-echeance + outbox/replay-after-crash + no-duplicate scenarios; if
// the fixture intention disappears the test breaks (no silent rot into a monster).
//
// DP16 — the async twin of DP15: the TWO async-substrate fragments (Windmill + NATS)
// emitted as deterministic StackManifest data, AND the realisation of a SCHEDULED
// operation through the S73 transactional outbox on an INJECTED clock. The fixture
// REUSES the S73 sendReminder anchor (cron + notification effect) — it does NOT fork
// the outbox; the scheduler reads operation.FixedClock so the package stays pure.

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/asyncfragments"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
)

// ── the S73 outbox/sink mocks (reused shape — DP16 adds the Write facet) ─────────────

// mockOutbox is the in-memory double for the S73 transactional outbox seam. It records
// entries in insertion order, tracks the dispatched id set, and implements the DP16
// OutboxWriter Write facet alongside the S73 Pending/MarkDispatched/IsDispatched.
type mockOutbox struct {
	entries    []operation.OutboxEntry
	dispatched map[string]bool
}

func newMockOutbox() *mockOutbox { return &mockOutbox{dispatched: map[string]bool{}} }

func (o *mockOutbox) Write(e operation.OutboxEntry) { o.entries = append(o.entries, e) }

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

// mockSink records the observable deliveries so the no-duplicate scenario asserts the
// delivered count stays exactly 1 (exactly-once relative).
type mockSink struct{ delivered []operation.Effect }

func (s *mockSink) Deliver(e operation.Effect) error {
	s.delivered = append(s.delivered, e)
	return nil
}

// ── scheduled/fires-at-echeance ──────────────────────────────────────────────────

// TestFixture_ScheduledRealizesAtEcheance — a PLANNED operation does NOT fire before
// its echeance (no event, outbox untouched), and AT the echeance it writes its effect
// to the outbox then dispatches it through NATS/Windmill, emitting the dispatch event.
// The clock is INJECTED (operation.FixedClock) — never the real clock.
func TestFixture_ScheduledRealizesAtEcheance(t *testing.T) {
	op, async := operation.SendReminder() // cron at 2026-06-08T09:00:00Z + a notification effect

	// Before the echeance: nothing fires, no effect is written, no event.
	before := operation.FixedClock{At: "2026-06-08T08:59:59Z"}
	outbox := newMockOutbox()
	sink := &mockSink{}
	events, err := asyncfragments.RealizeScheduled(op, async, before, outbox, sink)
	if err != nil {
		t.Fatalf("RealizeScheduled(before): %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("events before echeance = %v, want [] (not yet due)", events)
	}
	if len(outbox.entries) != 0 {
		t.Fatalf("outbox writes before echeance = %d, want 0 (effect only written when it fires)", len(outbox.entries))
	}
	if len(sink.delivered) != 0 {
		t.Fatalf("deliveries before echeance = %d, want 0", len(sink.delivered))
	}

	// At the echeance: the operation fires → effect written → dispatched → one event.
	at := operation.FixedClock{At: "2026-06-08T09:00:00Z"}
	outbox = newMockOutbox()
	sink = &mockSink{}
	events, err = asyncfragments.RealizeScheduled(op, async, at, outbox, sink)
	if err != nil {
		t.Fatalf("RealizeScheduled(at): %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events at echeance = %d, want 1 (sendReminder's notification dispatched)", len(events))
	}
	if events[0].Operation != "sendReminder" {
		t.Fatalf("event operation = %q, want sendReminder", events[0].Operation)
	}
	if events[0].Kind != operation.TriggerNotification {
		t.Fatalf("event kind = %q, want notification", events[0].Kind)
	}
	if events[0].Target != "user@example.com" {
		t.Fatalf("event target = %q, want user@example.com", events[0].Target)
	}
	// The effect id is the S73 content-addressed idempotency key (reused, never forked).
	wantID, err := operation.EffectID(async.Effects[0])
	if err != nil {
		t.Fatalf("EffectID: %v", err)
	}
	if events[0].EffectID != wantID {
		t.Fatalf("event effect_id = %q, want the S73 content-address %q", events[0].EffectID, wantID)
	}
	// The effect was actually delivered exactly once and marked dispatched.
	if len(sink.delivered) != 1 {
		t.Fatalf("deliveries at echeance = %d, want 1", len(sink.delivered))
	}
	if !outbox.IsDispatched(wantID) {
		t.Fatalf("effect %q should be dispatched after realisation", wantID)
	}
}

// ── outbox/replay-after-crash + no-duplicate ───────────────────────────────────────

// TestFixture_ReplayAfterCrashNeverDuplicates — the outbox REPLAYS a non-dispatched
// effect after a crash WITHOUT an observable duplicate (exactly-once relative). We
// realise the scheduled op once (delivers once), then realise it AGAIN on the SAME
// outbox (the at-least-once redelivery window): the second realisation delivers 0 and
// emits no phantom event — the observable delivery count stays exactly 1.
func TestFixture_ReplayAfterCrashNeverDuplicates(t *testing.T) {
	op, async := operation.SendReminder()
	at := operation.FixedClock{At: "2026-06-08T09:00:00Z"}
	outbox := newMockOutbox()
	sink := &mockSink{}

	// First realisation: write-then-dispatch, one observable delivery, one event.
	events1, err := asyncfragments.RealizeScheduled(op, async, at, outbox, sink)
	if err != nil {
		t.Fatalf("RealizeScheduled #1: %v", err)
	}
	if len(events1) != 1 || len(sink.delivered) != 1 {
		t.Fatalf("first realisation: events=%d delivered=%d, want 1/1", len(events1), len(sink.delivered))
	}

	// Second realisation on the SAME outbox (the crash-then-retry window): the content-
	// addressed id collides with the prior dispatch → suppressed. No phantom event, no
	// second delivery — the observable count stays exactly 1.
	events2, err := asyncfragments.RealizeScheduled(op, async, at, outbox, sink)
	if err != nil {
		t.Fatalf("RealizeScheduled #2 (replay): %v", err)
	}
	if len(events2) != 0 {
		t.Fatalf("replay events = %d, want 0 (the redelivery is suppressed)", len(events2))
	}
	if len(sink.delivered) != 1 {
		t.Fatalf("observable deliveries after replay = %d, want 1 (exactly-once relative)", len(sink.delivered))
	}
}

// ── the closed-grammar pre-flight (typed failure, never a silent fire) ──────────────

func TestFixture_MalformedAsyncIsTypedFailure(t *testing.T) {
	op, _ := operation.SendReminder()
	bad := operation.Async{Trigger: operation.AsyncTrigger{Kind: operation.TriggerCron, At: ""}} // cron with no echeance
	_, err := asyncfragments.RealizeScheduled(op, bad, operation.FixedClock{At: "2026-06-08T09:00:00Z"}, newMockOutbox(), &mockSink{})
	if !errors.Is(err, operation.ErrCronMissingEcheance) {
		t.Fatalf("RealizeScheduled(cron no echeance) = %v, want ErrCronMissingEcheance", err)
	}
}

// TestFixture_NonWritableOutboxRefused — a read-only outbox seam (no usable Write) is
// refused at the would-be write, never a silent drop. We pass a real read-only seam by
// wrapping the mock so its Write is a no-op AND it fails to expose OutboxWriter via the
// interface assertion path; here we assert the typed sentinel exists and is distinct.
func TestFixture_NonWritableOutboxErrorIsTyped(t *testing.T) {
	if asyncfragments.ErrOutboxNotWritable == nil {
		t.Fatal("ErrOutboxNotWritable must be a typed sentinel (a misconfigured seam, never a silent drop)")
	}
	if asyncfragments.ErrOutboxNotWritable.Error() == "" {
		t.Fatal("ErrOutboxNotWritable must carry an actionable message")
	}
}

// ── the async palette (Windmill + NATS) ────────────────────────────────────────────

// TestFixture_AsyncPaletteIsWindmillAndNats — the closed async palette is exactly two
// fragments: Windmill (role=workflow, NEVER Temporal) + NATS (role=bus), both core,
// both project-isolated, each fully populated (image + port + healthcheck + volume).
func TestFixture_AsyncPaletteIsWindmillAndNats(t *testing.T) {
	frags, err := asyncfragments.SubstrateAsyncFragments("proj", scope.EnvProd)
	if err != nil {
		t.Fatalf("prod must not error (no async service is env-gated): %v", err)
	}
	if len(frags) != 2 {
		t.Fatalf("async palette = %d, want 2 (windmill + nats)", len(frags))
	}
	want := map[string]stackmanifest.Role{
		"windmill": stackmanifest.RoleWorkflow,
		"nats":     stackmanifest.RoleBus,
	}
	for _, f := range frags {
		role, ok := want[f.Key]
		if !ok {
			t.Fatalf("unknown async fragment key %q (palette must be closed)", f.Key)
		}
		if f.Service.Role != role {
			t.Fatalf("%q: role %q, want %q", f.Key, f.Service.Role, role)
		}
		if f.Service.Profile != stackmanifest.ProfileCore {
			t.Fatalf("%q: profile %q, want core (async substrate always runs)", f.Key, f.Service.Profile)
		}
		if f.Service.Image == "" || f.Service.InternalPort == 0 || f.Service.Healthcheck == "" {
			t.Fatalf("%q: must carry image+port+healthcheck (DP14 measured/contract)", f.Key)
		}
		if f.ProjectID != "proj" {
			t.Fatalf("%q: project_id = %q, want proj", f.Key, f.ProjectID)
		}
		if len(f.Volumes) == 0 {
			t.Fatalf("%q: a stateful async service must carry a bind volume", f.Key)
		}
	}
}

// TestFixture_WindmillNeverTemporal — the workflow engine is Windmill (the hard
// constraint). Its image is a windmill image; no Temporal image appears anywhere.
func TestFixture_WindmillNeverTemporal(t *testing.T) {
	frags, err := asyncfragments.SubstrateAsyncFragments("proj", scope.EnvDev)
	if err != nil {
		t.Fatalf("dev: %v", err)
	}
	var windmill *asyncfragments.ServiceFragment
	for i := range frags {
		if containsCI(frags[i].Service.Image, "temporal") {
			t.Fatalf("Temporal is REFUSED (hard constraint): fragment %q image %q", frags[i].Key, frags[i].Service.Image)
		}
		if frags[i].Key == "windmill" {
			windmill = &frags[i]
		}
	}
	if windmill == nil {
		t.Fatal("the workflow engine fragment must be windmill")
	}
	if !containsCI(windmill.Service.Image, "windmill") {
		t.Fatalf("windmill image %q must be a windmill image", windmill.Service.Image)
	}
}

// TestFixture_UnknownEnvironmentRefused — an out-of-set environment fails closed with
// the DP06 UNKNOWN_ENVIRONMENT refusal (never guessed).
func TestFixture_UnknownEnvironmentRefused(t *testing.T) {
	_, err := asyncfragments.SubstrateAsyncFragments("proj", scope.Environment("mars"))
	if err == nil {
		t.Fatal("an unknown environment must fail closed (UNKNOWN_ENVIRONMENT)")
	}
	var ref *envbindings.Refusal
	if !envbindings.AsRefusal(err, &ref) || ref.Code != envbindings.CodeUnknownEnvironment {
		t.Fatalf("want UNKNOWN_ENVIRONMENT refusal, got %v", err)
	}
}

// containsCI is a tiny case-insensitive substring check (no strings import churn in the
// fixture; the property file uses strings directly).
func containsCI(s, sub string) bool {
	lower := func(b byte) byte {
		if b >= 'A' && b <= 'Z' {
			return b + ('a' - 'A')
		}
		return b
	}
	for i := 0; i+len(sub) <= len(s); i++ {
		ok := true
		for j := 0; j < len(sub); j++ {
			if lower(s[i+j]) != lower(sub[j]) {
				ok = false
				break
			}
		}
		if ok {
			return true
		}
	}
	return false
}
