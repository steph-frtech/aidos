package main

// Sandbox-confinement fault-injection + behaviour mirror (test_kind: integration,
// liveness: live, §5 hook honesty). A hook that never fires is dead — these tests
// BREAK what the hook watches (an active /evolve run writing /kernel and /fitness; a
// run attempting to govern) and assert the hook goes red, AND assert it allows a legal
// can_write write.

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

// FAULT INJECTION: an active /evolve run writing /kernel must be DENIED with
// SANDBOX_WRITE_ESCAPES_ZONE — the loop must never govern.
func TestHookBlocksRunWriteEscapingToKernel(t *testing.T) {
	code, out := runHook(t, Event{RunActive: true, Path: "/kernel/createOrder.operation"})
	if code != exitDeny {
		t.Fatalf("exit code = %d, want %d (deny)", code, exitDeny)
	}
	if !strings.Contains(out, "SANDBOX_WRITE_ESCAPES_ZONE") {
		t.Fatalf("block output missing SANDBOX_WRITE_ESCAPES_ZONE: %s", out)
	}
	if !strings.Contains(out, "open_a_/goal_to_promote_a_candidate") {
		t.Fatalf("block output missing the /goal door: %s", out)
	}
}

// FAULT INJECTION: an active /evolve run writing /fitness must be DENIED — the fitness
// is held above the line, never edited by the loop (§62 insight: a loop that edits its
// own fitness is the danger).
func TestHookBlocksRunWriteEscapingToFitness(t *testing.T) {
	code, out := runHook(t, Event{RunActive: true, Path: "/fitness/createOrder.budget"})
	if code != exitDeny {
		t.Fatalf("exit code = %d, want deny", code)
	}
	if !strings.Contains(out, "SANDBOX_WRITE_ESCAPES_ZONE") {
		t.Fatalf("block output missing SANDBOX_WRITE_ESCAPES_ZONE: %s", out)
	}
}

// FAULT INJECTION: a run attempting to GOVERN (write a truth/approval/right directly)
// must be DENIED with SANDBOX_CANNOT_GOVERN.
func TestHookBlocksGovernAttempt(t *testing.T) {
	code, out := runHook(t, Event{RunActive: true, Govern: true, Path: "/ideas/proposed/x"})
	if code != exitDeny {
		t.Fatalf("exit code = %d, want deny", code)
	}
	if !strings.Contains(out, "SANDBOX_CANNOT_GOVERN") {
		t.Fatalf("block output missing SANDBOX_CANNOT_GOVERN: %s", out)
	}
	if !strings.Contains(out, "open_a_/goal_to_promote_a_candidate") {
		t.Fatalf("block output missing the /goal door: %s", out)
	}
}

// An active run's write confined to /branches/evolution is allowed.
func TestHookAllowsConfinedRunWrite(t *testing.T) {
	for _, p := range []string{"/branches/evolution/var-7", "/reports/var-7.json", "/ideas/proposed/retry-cap"} {
		code, _ := runHook(t, Event{RunActive: true, Path: p})
		if code != exitAllow {
			t.Fatalf("Confine(%q) exit = %d, want allow", p, code)
		}
	}
}

// When no /evolve run is active, the hook does not confine writes — the wall hook
// handles those. A write anywhere with no active run is allowed by THIS hook.
func TestHookIgnoresWritesWhenNoRunActive(t *testing.T) {
	code, _ := runHook(t, Event{RunActive: false, Path: "/kernel/x"})
	if code != exitAllow {
		t.Fatalf("exit code = %d, want allow (confinement only applies while a run is active)", code)
	}
}

// A malformed event fails CLOSED (deny) — an unparseable write during an /evolve run
// must not slip out of the quarantine.
func TestHookFailsClosedOnGarbage(t *testing.T) {
	var buf bytes.Buffer
	code := Run(strings.NewReader("{not json"), &buf)
	if code != exitDeny {
		t.Fatalf("malformed event exit = %d, want deny (fail-closed)", code)
	}
}
