package main

// Unit + fault-injection mirror for the ci-ratchet pre-merge gate.
// mirror record: reflects=S05-ci-ratchet-hook, test_kind=journey, liveness=live
//
// The hook is print-only at this level: it decodes a replay result and decides
// via the pure cliquet core. The fault-injection meta-test (CLAUDE.md §5 hook
// honesty) deliberately reddens a known-green mirror and asserts the gate fires —
// a detector that never fires is mute.

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	ratchet "github.com/steph-frtech/aidos/back/mcp/mirror-runner"
)

func green(id string) ratchet.MirrorVerdict {
	return ratchet.MirrorVerdict{MirrorID: id, Version: "v1", ContentHash: "h" + id, Status: ratchet.StatusGreen}
}
func red(id string) ratchet.MirrorVerdict {
	return ratchet.MirrorVerdict{MirrorID: id, Version: "v1", ContentHash: "h" + id, Status: ratchet.StatusRed}
}

func runHook(t *testing.T, ev Event) (int, Decision) {
	t.Helper()
	raw, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}
	var out bytes.Buffer
	code := Run(bytes.NewReader(raw), &out)
	var d Decision
	if err := json.Unmarshal(out.Bytes(), &d); err != nil {
		t.Fatalf("decode decision: %v (out=%q)", err, out.String())
	}
	return code, d
}

// All-green candidate ⇒ ALLOWED, exit 0, no BlockReason.
func TestHookAllowsAllGreen(t *testing.T) {
	ev := Event{
		Ref:       "candidate",
		Baseline:  []ratchet.MirrorVerdict{green("a"), green("b"), green("c")},
		Candidate: []ratchet.MirrorVerdict{green("a"), green("b"), green("c")},
	}
	code, d := runHook(t, ev)
	if code != exitAllow {
		t.Fatalf("expected exit %d (allow), got %d", exitAllow, code)
	}
	if d.Verdict != ratchet.VerdictAllowed || d.BlockReason != nil {
		t.Fatalf("expected ALLOWED/no-block, got %+v", d)
	}
}

// FAULT INJECTION: redden one previously-green mirror ⇒ the gate must fire.
func TestHookFaultInjectionRedRegressionFires(t *testing.T) {
	baseline := []ratchet.MirrorVerdict{green("a"), green("b"), green("c")}

	// Sanity: the same set unchanged is allowed (the gate is not stuck red).
	if code, _ := runHook(t, Event{Ref: "x", Baseline: baseline, Candidate: baseline}); code != exitAllow {
		t.Fatalf("control run must be ALLOWED, got exit %d", code)
	}

	// Inject the fault: candidate reddens mirror b.
	candidate := []ratchet.MirrorVerdict{green("a"), red("b"), green("c")}
	code, d := runHook(t, Event{Ref: "candidate", Baseline: baseline, Candidate: candidate})

	if code != exitDeny {
		t.Fatalf("FAULT NOT CAUGHT: reddening b must yield exit %d (deny), got %d", exitDeny, code)
	}
	if d.Verdict != ratchet.VerdictRejected {
		t.Fatalf("expected REJECTED, got %s", d.Verdict)
	}
	if d.BlockReason == nil || d.BlockReason.Code != ratchet.CodeRedRegression {
		t.Fatalf("expected RED_REGRESSION BlockReason, got %v", d.BlockReason)
	}
	if len(d.Regressed) != 1 || d.Regressed[0].MirrorID != "b" {
		t.Fatalf("expected b in the regressed set, got %+v", d.Regressed)
	}
}

// Already-red at baseline, still red ⇒ not a regression ⇒ allowed.
func TestHookAlreadyRedNotRegression(t *testing.T) {
	ev := Event{
		Ref:       "candidate",
		Baseline:  []ratchet.MirrorVerdict{red("a"), green("b")},
		Candidate: []ratchet.MirrorVerdict{red("a"), green("b")},
	}
	if code, d := runHook(t, ev); code != exitAllow || d.Verdict != ratchet.VerdictAllowed {
		t.Fatalf("already-red must be allowed, got exit=%d verdict=%s", code, d.Verdict)
	}
}

// Fail-closed: an undecodable event is rejected (exit 2) with a RED_REGRESSION.
func TestHookFailsClosedOnGarbage(t *testing.T) {
	var out bytes.Buffer
	code := Run(strings.NewReader("not json"), &out)
	if code != exitDeny {
		t.Fatalf("fail-closed: garbage must yield exit %d, got %d", exitDeny, code)
	}
	if !strings.Contains(out.String(), ratchet.CodeRedRegression) {
		t.Fatalf("fail-closed decision must carry RED_REGRESSION, got %q", out.String())
	}
}
