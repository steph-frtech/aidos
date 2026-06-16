package main

// spike_test.go — the DOUBLE-SENSE fault-injection mirror for the spike-confinement
// gate WIRED INTO the live PreToolUse path (the wall hook fired by .claude/settings.json).
//
// §5 hook honesty + §6/§8 determinism-first: a hook that never fires is dead, AND a
// mis-wired hook that blocks a legal flow breaks the build. So this gate must prove BOTH
// senses, through the SAME Run() entrypoint the harness invokes:
//
//   - RED  (the guarded property VIOLATED is blocked): while an idea is spiking, a write
//     escaping /spike → exit 2 + SPIKE_WRITE_ESCAPES_ZONE ; a harvest freezing the kernel
//     → exit 2 + HARVEST_CANNOT_FREEZE.
//   - GREEN (the legal flow PASSES — no false block): while spiking, a write confined to
//     /spike → exit 0 ; a harvest proposing into the ideas schema → exit 0 ; and — the
//     anti-regression sense — a plain below-waterline write with NO spike context still
//     flows through the bare wall unchanged (exit 0).
//
// The gate DEFERS to the pure core (runtime/exploration.CheckSpikeWrite / CheckHarvestWrite
// via spike.go); it re-implements no decision. These tests drive Run() end-to-end so the
// proof is of the WIRING, not just the predicate.

import (
	"bytes"
	"strings"
	"testing"
)

// runPre drives the binary entrypoint Run over a raw JSON event and returns (exit, stdout).
func runPre(t *testing.T, rawJSON string) (int, string) {
	t.Helper()
	var out bytes.Buffer
	code := Run(strings.NewReader(rawJSON), &out)
	return code, out.String()
}

// RED — FAULT INJECTION: a spiking idea writing to /kernel must be DENIED through the live
// PreToolUse Run() with SPIKE_WRITE_ESCAPES_ZONE (the throwaway spike must not leak out).
func TestRunDeniesSpikeWriteEscapingZone(t *testing.T) {
	code, out := runPre(t, `{"tool_name":"Write","idea_status":"spiking","gesture":"spike","tool_input":{"file_path":"/kernel/retry.policy"}}`)
	if code != exitDeny {
		t.Fatalf("spiking write escaping /spike: exit = %d, want %d (deny)", code, exitDeny)
	}
	if !strings.Contains(out, "SPIKE_WRITE_ESCAPES_ZONE") {
		t.Fatalf("block output missing SPIKE_WRITE_ESCAPES_ZONE: %s", out)
	}
}

// RED — FAULT INJECTION: a /harvest writing the kernel directly must be DENIED through the
// live Run() with HARVEST_CANNOT_FREEZE (harvest proposes, it never freezes).
func TestRunDeniesHarvestFreezingKernel(t *testing.T) {
	code, out := runPre(t, `{"tool_name":"Write","gesture":"harvest","schema":"kernel"}`)
	if code != exitDeny {
		t.Fatalf("harvest freezing kernel: exit = %d, want %d (deny)", code, exitDeny)
	}
	if !strings.Contains(out, "HARVEST_CANNOT_FREEZE") {
		t.Fatalf("block output missing HARVEST_CANNOT_FREEZE: %s", out)
	}
}

// GREEN — the legal flow: a spiking write CONFINED to /spike must PASS through Run (exit 0).
// CRITICAL: proves the gate does not falsely block the normal spike flow.
func TestRunAllowsConfinedSpikeWrite(t *testing.T) {
	code, _ := runPre(t, `{"tool_name":"Write","idea_status":"spiking","gesture":"spike","tool_input":{"file_path":"/spike/retry-probe.go"}}`)
	if code != exitAllow {
		t.Fatalf("confined spike write: exit = %d, want %d (allow)", code, exitAllow)
	}
}

// GREEN — the legal flow: a /harvest PROPOSING into the ideas schema must PASS (exit 0).
func TestRunAllowsHarvestProposal(t *testing.T) {
	code, _ := runPre(t, `{"tool_name":"Write","gesture":"harvest","schema":"ideas"}`)
	if code != exitAllow {
		t.Fatalf("harvest proposal into ideas: exit = %d, want %d (allow)", code, exitAllow)
	}
}

// GREEN — ANTI-REGRESSION: a plain below-waterline write with NO spike/harvest context
// still flows through the bare wall unchanged (exit 0). The gate is strictly ADDITIVE; it
// must not perturb the existing PreToolUse behaviour (anti-overwrite §9).
func TestRunSpikeGateIsAdditiveOnPlainWrite(t *testing.T) {
	code, _ := runPre(t, `{"tool_name":"Write","tool_input":{"file_path":"back/gen/order.go"}}`)
	if code != exitAllow {
		t.Fatalf("plain below-waterline write: exit = %d, want %d (allow)", code, exitAllow)
	}
}

// GREEN — ANTI-REGRESSION: the bare wall still DENIES a non-spike kernel write (the
// spike gate must not have masked or weakened the existing AGENT_WRITE_ABOVE_WATERLINE).
func TestRunBareWallStillDeniesKernelWrite(t *testing.T) {
	code, out := runPre(t, `{"tool_name":"Write","tool_input":{"file_path":"back/kernel/records/store.go"}}`)
	if code != exitDeny {
		t.Fatalf("plain kernel write: exit = %d, want %d (deny)", code, exitDeny)
	}
	if !strings.Contains(out, "AGENT_WRITE_ABOVE_WATERLINE") {
		t.Fatalf("block output missing AGENT_WRITE_ABOVE_WATERLINE: %s", out)
	}
}

// GREEN — a write while the idea is NOT spiking and the gesture is not harvest is left to
// the bare wall: a below-waterline path passes (the gate confines only while spiking).
func TestRunNonSpikingWriteUnaffected(t *testing.T) {
	code, _ := runPre(t, `{"tool_name":"Edit","idea_status":"grilled","gesture":"spike","tool_input":{"file_path":"back/runtime/foo.go"}}`)
	if code != exitAllow {
		t.Fatalf("non-spiking below-waterline write: exit = %d, want %d (allow)", code, exitAllow)
	}
}

// GREEN — the WIRING contract: the spike gate reads the RAW spike_path (absolute-repo prefix
// "/spike", KRD §84), NOT the zone-wall-normalised path. The shim passes "/spike/x.go" in
// spike_path; the gate must see it as confined even though `path` is the slash-stripped
// "spike/x.go" the zone wall reads. This pins the false-block bug found by running the shim.
func TestRunSpikeGateReadsRawSpikePath(t *testing.T) {
	// path is the zone-wall-normalised (slash-stripped) form; spike_path is the raw zone form.
	code, _ := runPre(t, `{"tool_name":"Write","idea_status":"spiking","gesture":"spike","path":"spike/retry-probe.go","spike_path":"/spike/retry-probe.go"}`)
	if code != exitAllow {
		t.Fatalf("confined spike write via spike_path: exit = %d, want %d (allow — no false block)", code, exitAllow)
	}
}

// RED via spike_path — a raw spike_path that escapes the /spike zone is still denied.
func TestRunSpikeGateDeniesRawSpikePathEscape(t *testing.T) {
	code, out := runPre(t, `{"tool_name":"Write","idea_status":"spiking","gesture":"spike","path":"src/leak.go","spike_path":"/src/leak.go"}`)
	if code != exitDeny {
		t.Fatalf("spike_path escaping /spike: exit = %d, want %d (deny)", code, exitDeny)
	}
	if !strings.Contains(out, "SPIKE_WRITE_ESCAPES_ZONE") {
		t.Fatalf("block output missing SPIKE_WRITE_ESCAPES_ZONE: %s", out)
	}
}
