package main

// Promotion-gate fault-injection + behaviour mirror (test_kind: integration,
// liveness: live, §5 hook honesty). A hook that never fires is dead — these tests
// BREAK what the gate watches (a mirror-less promotion into the kernel) and assert
// the gate goes red, AND assert it allows a legal promotion through.

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func runGate(t *testing.T, ev Event) (code int, out string) {
	t.Helper()
	in, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}
	var buf bytes.Buffer
	code = Run(bytes.NewReader(in), &buf)
	return code, buf.String()
}

// FAULT INJECTION: a harvested idea promoted into the kernel WITHOUT a mirror must
// be DENIED with NO_MIRROR_NO_KERNEL and the write must not pass.
func TestGateBlocksMirrorlessPromotion(t *testing.T) {
	code, out := runGate(t, Event{
		Tool:       "kernel_write",
		Schema:     "kernel",
		IdeaStatus: "harvested",
		IdeaID:     "idea-abc",
		MirrorRef:  "", // the injected fault: no mirror
	})
	if code != exitDeny {
		t.Fatalf("exit code = %d, want %d (deny)", code, exitDeny)
	}
	if !strings.Contains(out, "NO_MIRROR_NO_KERNEL") {
		t.Fatalf("block output missing NO_MIRROR_NO_KERNEL: %s", out)
	}
	if !strings.Contains(out, "write_mirror_run_goal_freeze") {
		t.Fatalf("block output missing the fix path write_mirror_run_goal_freeze: %s", out)
	}
}

// A harvested idea WITH a mirror reference is allowed through to the /goal flow.
func TestGateAllowsPromotionWithMirror(t *testing.T) {
	code, _ := runGate(t, Event{
		Tool:       "kernel_write",
		Schema:     "kernel",
		IdeaStatus: "harvested",
		IdeaID:     "idea-abc",
		MirrorRef:  "mirror:order-discount-red-bdd",
	})
	if code != exitAllow {
		t.Fatalf("exit code = %d, want %d (allow)", code, exitAllow)
	}
}

// A non-harvested idea cannot promote even with a mirror (the lifecycle gate).
func TestGateBlocksNonHarvested(t *testing.T) {
	code, out := runGate(t, Event{
		Schema:     "kernel",
		IdeaStatus: "draft",
		MirrorRef:  "mirror:x",
	})
	if code != exitDeny {
		t.Fatalf("exit code = %d, want deny (only harvested may promote)", code)
	}
	if !strings.Contains(out, "NO_MIRROR_NO_KERNEL") {
		t.Fatalf("missing NO_MIRROR_NO_KERNEL: %s", out)
	}
}

// A non-kernel target is not the gate's concern (the wall hook handles it).
func TestGateIgnoresNonKernelTarget(t *testing.T) {
	code, _ := runGate(t, Event{Schema: "ideas", IdeaStatus: "harvested", MirrorRef: ""})
	if code != exitAllow {
		t.Fatalf("exit code = %d, want allow (gate only fires on kernel writes)", code)
	}
}

// A malformed event fails CLOSED (deny) — an unparseable promotion never slips a
// mirror-less idea into the kernel.
func TestGateFailsClosedOnGarbage(t *testing.T) {
	var buf bytes.Buffer
	code := Run(strings.NewReader("{not json"), &buf)
	if code != exitDeny {
		t.Fatalf("malformed event exit = %d, want deny (fail-closed)", code)
	}
}
