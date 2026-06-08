package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// The async-operation MCP server is PURE computation (the wall): these tests prove each tool
// returns deterministically without any I/O — they mirror the S73 done-criteria at the MCP
// boundary: a scheduled op fires at its echeance (tick), the outbox replays + dispatches
// exactly-once-relative (dispatch), the effect id is content-addressed, and a malformed async
// block is refused (never coerced).

func reminder() operation.Async {
	_, a := operation.SendReminder()
	return a
}

func TestAsyncValidate_ConformingAccepted(t *testing.T) {
	_, out, _ := validate(context.Background(), nil, validateInput{Async: reminder()})
	if !out.OK || out.Block != nil {
		t.Fatalf("a conforming async block must be accepted: %+v", out)
	}
}

func TestAsyncValidate_UnknownTriggerRefused(t *testing.T) {
	bad := operation.Async{Trigger: operation.AsyncTrigger{Kind: operation.TriggerKind("frobnicate")}}
	_, out, _ := validate(context.Background(), nil, validateInput{Async: bad})
	if out.OK || out.Block == nil {
		t.Fatalf("unknown trigger kind must be refused: %+v", out)
	}
	if out.Block.Code != "ASYNC_UNKNOWN_TRIGGER_KIND" || len(out.Block.HowToFix) == 0 {
		t.Fatalf("refusal not actionable: %+v", out.Block)
	}
}

func TestAsyncValidate_CronMissingEcheanceRefused(t *testing.T) {
	bad := operation.Async{Trigger: operation.AsyncTrigger{Kind: operation.TriggerCron, At: ""}}
	_, out, _ := validate(context.Background(), nil, validateInput{Async: bad})
	if out.OK || out.Block == nil || out.Block.Code != "ASYNC_CRON_MISSING_ECHEANCE" {
		t.Fatalf("cron with no echeance must be refused ASYNC_CRON_MISSING_ECHEANCE: %+v", out)
	}
}

func TestAsyncDue_NowGEEcheance(t *testing.T) {
	_, before, _ := due(context.Background(), nil, dueInput{Echeance: "2026-06-08T09:00:00Z", Now: "2026-06-08T08:59:59Z"})
	if !before.OK || before.Due {
		t.Fatalf("before echeance must not be due: %+v", before)
	}
	_, at, _ := due(context.Background(), nil, dueInput{Echeance: "2026-06-08T09:00:00Z", Now: "2026-06-08T09:00:00Z"})
	if !at.OK || !at.Due {
		t.Fatalf("at echeance must be due: %+v", at)
	}
}

func TestAsyncTick_FiresAtEcheance(t *testing.T) {
	sched := []operation.ScheduledOp{{Name: "sendReminder", Trigger: operation.AsyncTrigger{Kind: operation.TriggerCron, At: "2026-06-08T09:00:00Z"}}}
	_, before, _ := tick(context.Background(), nil, tickInput{Scheduled: sched, Now: "2026-06-08T08:59:59Z"})
	if !before.OK || len(before.Fired) != 0 {
		t.Fatalf("before echeance must fire nothing: %+v", before)
	}
	_, at, _ := tick(context.Background(), nil, tickInput{Scheduled: sched, Now: "2026-06-08T09:00:00Z"})
	if !at.OK || len(at.Fired) != 1 || at.Fired[0] != "sendReminder" {
		t.Fatalf("at echeance must fire sendReminder: %+v", at)
	}
}

func TestAsyncEffectID_Deterministic(t *testing.T) {
	eff := reminder().Effects[0]
	_, a, _ := effectID(context.Background(), nil, effectIDInput{Effect: eff})
	_, b, _ := effectID(context.Background(), nil, effectIDInput{Effect: eff})
	if !a.OK || a.ID == "" || a.ID != b.ID {
		t.Fatalf("effect id non-deterministic: %q vs %q", a.ID, b.ID)
	}
}

func TestAsyncDispatch_ExactlyOnceRelative(t *testing.T) {
	eff := reminder().Effects[0]
	entry, err := operation.NewOutboxEntry(eff)
	if err != nil {
		t.Fatalf("NewOutboxEntry: %v", err)
	}

	// A fresh PENDING entry, nothing dispatched yet: delivered once.
	_, first, _ := dispatch(context.Background(), nil, dispatchInput{Pending: []operation.OutboxEntry{entry}})
	if !first.OK || first.Delivered != 1 {
		t.Fatalf("first dispatch must deliver once: %+v", first)
	}

	// The same id already dispatched (the at-least-once redelivery): suppressed, 0 delivered.
	_, replay, _ := dispatch(context.Background(), nil, dispatchInput{
		Pending:    []operation.OutboxEntry{{ID: entry.ID, Effect: eff, Status: operation.OutboxPending}},
		Dispatched: []string{entry.ID},
	})
	if !replay.OK || replay.Delivered != 0 {
		t.Fatalf("replay must deliver 0 (suppressed): %+v", replay)
	}
	if len(replay.Suppressed) != 1 || replay.Suppressed[0] != entry.ID {
		t.Fatalf("replay must report the suppressed id: %+v", replay)
	}
}
