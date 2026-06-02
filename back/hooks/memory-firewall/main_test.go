// Fault-injection + unit test for the PreToolUse MemoryFirewall hook (S30).
//
// Hook honesty (CLAUDE.md §5): a hook that never fires is dead. These tests FORGE a kernel
// write whose provenance is a raw MemoryItem (the forbidden Memory → Kernel shortcut) and
// assert the gate goes RED and blocks it with MEMORY_CANNOT_DECLARE_TRUTH; then flip the
// provenance to a properly-mirrored idea (the S27 legal path) and assert it stays GREEN. They
// also pin fail-closed on an unknown provenance and on garbage input (anti-passthrough).
package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// runHook feeds a JSON event to Run and returns the exit code + decoded BlockReason (if any).
func runHook(t *testing.T, ev Event) (int, *blockreason.BlockReason) {
	t.Helper()
	b, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}
	var out bytes.Buffer
	code := Run(bytes.NewReader(b), &out)
	var br *blockreason.BlockReason
	if out.Len() > 0 {
		var decoded blockreason.BlockReason
		if err := json.Unmarshal(out.Bytes(), &decoded); err != nil {
			t.Fatalf("decode block reason: %v", err)
		}
		br = &decoded
	}
	return code, br
}

// FAULT INJECTION — a kernel write whose provenance is a raw MemoryItem is BLOCKED.
func TestHook_MemoryProvenanceKernelWrite_Blocked(t *testing.T) {
	code, br := runHook(t, Event{TargetSchema: "kernel", Provenance: "memory"})
	if code != exitBlock {
		t.Fatalf("a memory-provenance kernel write must be BLOCKED: exit %d", code)
	}
	if br == nil || br.Code != blockreason.CodeMemoryCannotDeclareTruth {
		t.Fatalf("expected MEMORY_CANNOT_DECLARE_TRUTH, got %+v", br)
	}
	joined := strings.Join(br.HowToFix, " | ")
	if !strings.Contains(joined, "memory_to_contextpack_to_idea_to_mirror_to_goal_to_kernel") {
		t.Errorf("how_to_fix must name the full flow: %v", br.HowToFix)
	}
}

// GREEN — a kernel write whose provenance is a properly-mirrored idea passes THIS gate.
func TestHook_MirroredIdeaKernelWrite_Allowed(t *testing.T) {
	code, br := runHook(t, Event{TargetSchema: "kernel", Provenance: "mirrored_idea"})
	if code != exitAllow {
		t.Fatalf("a mirrored-idea kernel write must pass this gate: exit %d (br=%+v)", code, br)
	}
	if br != nil {
		t.Errorf("no block reason expected on the legal path: %+v", br)
	}
}

// FAIL CLOSED — an unknown provenance on a kernel write is blocked (anti-passthrough).
func TestHook_UnknownProvenance_FailsClosed(t *testing.T) {
	code, br := runHook(t, Event{TargetSchema: "kernel", Provenance: ""})
	if code != exitBlock {
		t.Fatalf("an unknown-provenance kernel write must fail closed: exit %d", code)
	}
	if br == nil || br.Code != blockreason.CodeMemoryCannotDeclareTruth {
		t.Fatalf("expected MEMORY_CANNOT_DECLARE_TRUTH on fail-closed, got %+v", br)
	}
}

// A write that does not target the kernel is not this gate's concern (allowed here).
func TestHook_NonKernelWrite_Allowed(t *testing.T) {
	code, _ := runHook(t, Event{TargetSchema: "brain", Provenance: "memory"})
	if code != exitAllow {
		t.Fatalf("a brain.* write is below the waterline — this gate must not block it: exit %d", code)
	}
}

// GARBAGE — an unparseable event fails closed (block).
func TestHook_GarbageEvent_FailsClosed(t *testing.T) {
	var out bytes.Buffer
	code := Run(strings.NewReader("not json at all"), &out)
	if code != exitBlock {
		t.Fatalf("garbage must fail closed: exit %d", code)
	}
}
