package main

// Hook-honesty mirror (CLAUDE.md §5, the MANDATORY fault-injection test, KRD §16 "le test décisif").
// reflects=archive.commit-gate, test_kind=fault-injection, cert_language=go, liveness=live,
// authority=below.
//
// A gate that never fires is dead. We start from a GREEN (complete) envelope, inject ONE REAL fault
// into what the gate watches — DROP the mirror_delta, manufacturing an orphan spec (a monster) —
// and assert the gate goes RED (blocks the DRAFT→APPLIED commit with INCOMPLETE_CHANGESET). Then we
// restore the mirror_delta and assert the gate goes GREEN (allows). We also assert the immutability
// arm fires: a mutate of an APPLIED envelope is refused with APPLIED_IS_IMMUTABLE.

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
	"time"

	cs "github.com/steph-frtech/aidos/back/archive/changeset"
)

func completeDraft(t *testing.T) cs.ChangeSet {
	t.Helper()
	c, err := cs.Open("add order discount", "phase-7",
		&cs.Delta{Kind: "add", Target: "Order.discount"},
		&cs.Delta{Kind: "add", Target: "Order.discount.fixture"})
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	return c
}

func runGate(t *testing.T, req Request) (int, *cs.BlockReason) {
	t.Helper()
	in, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	var out bytes.Buffer
	code := Run(bytes.NewReader(in), &out)
	var br *cs.BlockReason
	if out.Len() > 0 {
		br = &cs.BlockReason{}
		if derr := json.Unmarshal(out.Bytes(), br); derr != nil {
			t.Fatalf("decode block reason: %v (%s)", derr, out.String())
		}
	}
	return code, br
}

// TestGate_GreenWhenComplete — baseline: a complete envelope (spec + mirror) is admitted.
func TestGate_GreenWhenComplete(t *testing.T) {
	code, br := runGate(t, Request{Op: "apply", ChangeSet: completeDraft(t)})
	if code != exitAllow || br != nil {
		t.Fatalf("complete envelope must be allowed (exit %d, br %v)", code, br)
	}
}

// TestGate_RedWhenMirrorDropped — THE fault injection: drop the mirror_delta (orphan spec) and
// assert the gate blocks with INCOMPLETE_CHANGESET. This proves the gate fires on a real monster.
func TestGate_RedWhenMirrorDropped(t *testing.T) {
	faulty := completeDraft(t)
	faulty.MirrorDelta = nil // inject the fault: a spec without its mirror — a monster

	code, br := runGate(t, Request{Op: "apply", ChangeSet: faulty})
	if code != exitBlock {
		t.Fatalf("dropping the mirror_delta must BLOCK the commit (exit %d, want %d)", code, exitBlock)
	}
	if br == nil || br.Code != cs.CodeIncompleteChangeSet {
		t.Fatalf("the gate must block with INCOMPLETE_CHANGESET, got %v", br)
	}
	if len(br.HowToFix) == 0 || !strings.Contains(strings.Join(br.HowToFix, ","), "add_mirror_for_spec_delta") {
		t.Fatalf("the block must name the door (how_to_fix ∋ add_mirror_for_spec_delta), got %v", br.HowToFix)
	}

	// restore the mirror_delta — the gate goes green again (the fault was the cause).
	code, br = runGate(t, Request{Op: "apply", ChangeSet: completeDraft(t)})
	if code != exitAllow || br != nil {
		t.Fatalf("restoring the mirror_delta must allow the commit (exit %d, br %v)", code, br)
	}
}

// TestGate_RefusesMutateOfApplied — the immutability arm: a mutate of an APPLIED envelope is refused.
func TestGate_RefusesMutateOfApplied(t *testing.T) {
	applied, br := cs.Apply(completeDraft(t), time.Now(), cs.SpecHasMirror)
	if br != nil {
		t.Fatalf("setup apply blocked: %v", br)
	}
	code, gbr := runGate(t, Request{Op: "mutate", ChangeSet: applied})
	if code != exitBlock {
		t.Fatalf("mutating an APPLIED envelope must BLOCK (exit %d, want %d)", code, exitBlock)
	}
	if gbr == nil || gbr.Code != cs.CodeAppliedIsImmutable {
		t.Fatalf("the gate must block with APPLIED_IS_IMMUTABLE, got %v", gbr)
	}
}

// TestGate_FailsClosedOnBadRequest — an unparseable request must block (fail-closed).
func TestGate_FailsClosedOnBadRequest(t *testing.T) {
	var out bytes.Buffer
	code := Run(strings.NewReader("{not json"), &out)
	if code != exitBlock {
		t.Fatalf("an unparseable request must fail closed (exit %d, want %d)", code, exitBlock)
	}
}
