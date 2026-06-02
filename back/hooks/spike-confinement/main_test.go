package main

// Spike-confinement fault-injection + behaviour mirror (test_kind: integration,
// liveness: live, §5 hook honesty). A hook that never fires is dead — these tests
// BREAK what the hook watches (a spiking write escaping /spike; a harvest writing
// the kernel) and assert the hook goes red, AND assert it allows a legal write.

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func runHook(t *testing.T, ev Event) (code int, out string) {
	t.Helper()
	in, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}
	var buf bytes.Buffer
	code = Run(bytes.NewReader(in), &buf)
	return code, buf.String()
}

// FAULT INJECTION: while spiking, a write to /kernel must be DENIED with
// SPIKE_WRITE_ESCAPES_ZONE — the throwaway spike must not leak into the kernel.
func TestHookBlocksSpikeWriteEscapingToKernel(t *testing.T) {
	code, out := runHook(t, Event{
		IdeaStatus: "spiking",
		Gesture:    "spike",
		Path:       "/kernel/retry.policy", // the injected fault: escapes /spike
	})
	if code != exitDeny {
		t.Fatalf("exit code = %d, want %d (deny)", code, exitDeny)
	}
	if !strings.Contains(out, "SPIKE_WRITE_ESCAPES_ZONE") {
		t.Fatalf("block output missing SPIKE_WRITE_ESCAPES_ZONE: %s", out)
	}
	if !strings.Contains(out, "confine_write_to_/spike") {
		t.Fatalf("block output missing the fix path confine_write_to_/spike: %s", out)
	}
}

// A spiking write confined to /spike is allowed.
func TestHookAllowsConfinedSpikeWrite(t *testing.T) {
	code, _ := runHook(t, Event{
		IdeaStatus: "spiking",
		Gesture:    "spike",
		Path:       "/spike/retry-probe.go",
	})
	if code != exitAllow {
		t.Fatalf("exit code = %d, want %d (allow)", code, exitAllow)
	}
}

// FAULT INJECTION: a /harvest writing the kernel directly must be DENIED with
// HARVEST_CANNOT_FREEZE — harvest proposes, it never freezes.
func TestHookBlocksHarvestFreezingKernel(t *testing.T) {
	code, out := runHook(t, Event{
		Gesture: "harvest",
		Schema:  "kernel", // the injected fault: harvest tries to freeze
	})
	if code != exitDeny {
		t.Fatalf("exit code = %d, want deny", code)
	}
	if !strings.Contains(out, "HARVEST_CANNOT_FREEZE") {
		t.Fatalf("block output missing HARVEST_CANNOT_FREEZE: %s", out)
	}
	if !strings.Contains(out, "write_mirror_run_goal_freeze") {
		t.Fatalf("block output missing the fix path write_mirror_run_goal_freeze: %s", out)
	}
}

// A harvest proposal (no truth schema target) is allowed.
func TestHookAllowsHarvestProposal(t *testing.T) {
	code, _ := runHook(t, Event{Gesture: "harvest", Schema: "ideas"})
	if code != exitAllow {
		t.Fatalf("exit code = %d, want allow (harvest proposing into the ideas schema)", code)
	}
}

// Outside the spike zone (idea not spiking), the hook does not confine writes — the
// wall hook handles those. A non-spiking write anywhere is allowed by THIS hook.
func TestHookIgnoresWritesOutsideSpikeZone(t *testing.T) {
	code, _ := runHook(t, Event{IdeaStatus: "grilled", Gesture: "spike", Path: "/src/foo.go"})
	if code != exitAllow {
		t.Fatalf("exit code = %d, want allow (confinement only applies while spiking)", code)
	}
}

// A malformed event fails CLOSED (deny) — an unparseable write during a spike must
// not slip out of the zone.
func TestHookFailsClosedOnGarbage(t *testing.T) {
	var buf bytes.Buffer
	code := Run(strings.NewReader("{not json"), &buf)
	if code != exitDeny {
		t.Fatalf("malformed event exit = %d, want deny (fail-closed)", code)
	}
}
