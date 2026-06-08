package main

import (
	"bytes"
	"strings"
	"testing"
)

// stable_test.go pins the S23 `aidos stable` behaviour (KRD §43 / §82.1): it reads the current
// cut and prints the stable-phase verdict — "is this a stable phase?" = "all links resolved + all
// green?" — is READ-ONLY (it records no node), and is deterministic (same args ⇒ byte-identical
// stdout). It is a means-test toward the human red (empty is stable; any red is unstable), not a
// new truth.

func runStableArgs(t *testing.T, args ...string) (string, int) {
	t.Helper()
	var buf bytes.Buffer
	code := Run(append([]string{"stable"}, args...), &buf)
	return buf.String(), code
}

// THE base done criterion (CLI surface): the empty cut is STABLE.
func TestStable_EmptyIsStable(t *testing.T) {
	out, code := runStableArgs(t, "empty")
	if code != exitOK {
		t.Fatalf("exit = %d, want %d", code, exitOK)
	}
	if !strings.Contains(out, "STABLE") || strings.Contains(out, "UNSTABLE") {
		t.Fatalf("the empty cut must print STABLE (not UNSTABLE), got:\n%s", out)
	}
}

// A cut where every link resolves and every sensor is green is STABLE.
func TestStable_AllGreenIsStable(t *testing.T) {
	out, code := runStableArgs(t, "green")
	if code != exitOK {
		t.Fatalf("exit = %d, want %d", code, exitOK)
	}
	if !strings.Contains(out, "STABLE") || strings.Contains(out, "UNSTABLE") {
		t.Fatalf("an all-green cut must print STABLE, got:\n%s", out)
	}
}

// THE done criterion (CLI surface): a single red mirror (a red sensor) makes the cut UNSTABLE and
// names the offender in reasons.
func TestStable_RedSensorIsUnstable(t *testing.T) {
	out, code := runStableArgs(t, "red-sensor")
	if code != exitOK {
		t.Fatalf("exit = %d, want %d", code, exitOK)
	}
	if !strings.Contains(out, "UNSTABLE") {
		t.Fatalf("a cut with a red sensor must print UNSTABLE, got:\n%s", out)
	}
	if !strings.Contains(out, "createOrder.fixture") {
		t.Fatalf("the offending sensor must be named in reasons, got:\n%s", out)
	}
}

// A stale (off-head) link makes the cut UNSTABLE and names the offending link.
func TestStable_StaleLinkIsUnstable(t *testing.T) {
	out, code := runStableArgs(t, "stale-link")
	if code != exitOK {
		t.Fatalf("exit = %d, want %d", code, exitOK)
	}
	if !strings.Contains(out, "UNSTABLE") {
		t.Fatalf("a cut with a stale link must print UNSTABLE, got:\n%s", out)
	}
	if !strings.Contains(out, "stale") || !strings.Contains(out, "createOrder@v2") {
		t.Fatalf("the offending stale link must be named in reasons, got:\n%s", out)
	}
}

// READ-ONLY: the verb states it records nothing (the wall — the node is recorded by the writer
// role inside a ChangeSet).
func TestStable_IsReadOnly(t *testing.T) {
	out, _ := runStableArgs(t, "green")
	if !strings.Contains(out, "ChangeSet") || !strings.Contains(out, "aucune verite") {
		t.Fatalf("the verb must state it writes nothing (the wall), got:\n%s", out)
	}
}

// The phase content address is printed (the kernel's lockfile, S02 reused).
func TestStable_PrintsContentAddress(t *testing.T) {
	out, _ := runStableArgs(t, "green")
	if !strings.Contains(out, "phase id") || !strings.Contains(out, "content-addressed") {
		t.Fatalf("the verb must print the phase content address, got:\n%s", out)
	}
}

// Deterministic: same args ⇒ byte-identical stdout (no clock, no rng).
func TestStable_Deterministic(t *testing.T) {
	a, _ := runStableArgs(t, "red-sensor")
	b, _ := runStableArgs(t, "red-sensor")
	if a != b {
		t.Fatalf("stable output must be deterministic:\n--- a ---\n%s\n--- b ---\n%s", a, b)
	}
}

// An unknown cut is a usage error (exit 2) listing the known cuts — never a prison.
func TestStable_UnknownCutIsUsageError(t *testing.T) {
	out, code := runStableArgs(t, "no-such-cut")
	if code != exitUsage {
		t.Fatalf("exit = %d, want %d (usage error)", code, exitUsage)
	}
	if !strings.Contains(out, "inconnue") || !strings.Contains(out, "empty") {
		t.Fatalf("an unknown cut must list the known cuts, got:\n%s", out)
	}
}

// With no operand `aidos stable` falls back to the S03 declared contract (still wired).
func TestStable_NoOperandFallsBackToContract(t *testing.T) {
	out, code := runStableArgs(t)
	if code != exitOK {
		t.Fatalf("exit = %d, want %d", code, exitOK)
	}
	if !strings.Contains(out, "aidos stable") {
		t.Fatalf("no-operand must render the stable contract, got:\n%s", out)
	}
}

// S86 — per-project stable-phase recording. `aidos stable green --project shop` records a
// per-project DAG node when the §43 verdict passes; an inconsistent cut is refused, no node.
func TestStable_Project_RecordsNodeAtVerdict(t *testing.T) {
	out, code := runStableArgs(t, "green", "--project", "shop")
	if code != exitOK {
		t.Fatalf("exit = %d, want %d, out:\n%s", code, exitOK, out)
	}
	if !strings.Contains(out, "STABLE") || strings.Contains(out, "UNSTABLE") {
		t.Fatalf("a green cut must record a stable node, got:\n%s", out)
	}
	if !strings.Contains(out, "node id") || !strings.Contains(out, "parents") {
		t.Fatalf("the recording branch must print the per-project node, got:\n%s", out)
	}
}

func TestStable_Project_RefusesInconsistentCut(t *testing.T) {
	out, code := runStableArgs(t, "red-sensor", "--project", "shop")
	if code != exitOK {
		t.Fatalf("exit = %d, want %d, out:\n%s", code, exitOK, out)
	}
	if !strings.Contains(out, "UNSTABLE") || !strings.Contains(out, "STABLE_PHASE_INCONSISTENT_CUT") {
		t.Fatalf("an inconsistent cut must be refused with STABLE_PHASE_INCONSISTENT_CUT, got:\n%s", out)
	}
	if strings.Contains(out, "node id") {
		t.Fatalf("an unstable cut must record NO node, got:\n%s", out)
	}
}
