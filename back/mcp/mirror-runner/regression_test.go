package mirrorrunner

// Unit mirror (N4) for the cliquet core — the canonical cases that pin the two
// /goal scenarios at the pure-decision level (the runner shell exercises them
// against real mirror runs in runner_test.go).
// mirror record: reflects=S05-ci-ratchet-core, test_kind=unit, liveness=live

import "testing"

func g(id string) MirrorVerdict {
	return MirrorVerdict{MirrorID: id, Version: "v" + id, ContentHash: "h" + id, Status: StatusGreen}
}
func r(id string) MirrorVerdict {
	return MirrorVerdict{MirrorID: id, Version: "v" + id, ContentHash: "h" + id, Status: StatusRed}
}

// Scenario: a step that reddens a prior mirror is rejected before merge.
func TestRejectsRedRegression(t *testing.T) {
	base := []MirrorVerdict{g("a"), g("b"), g("c")}
	cand := []MirrorVerdict{g("a"), r("b"), g("c")} // b regressed green→red
	v, regressed, br := Decide(base, cand)

	if v != VerdictRejected {
		t.Fatalf("expected REJECTED, got %s", v)
	}
	if len(regressed) != 1 || regressed[0].MirrorID != "b" {
		t.Fatalf("expected b regressed, got %+v", regressed)
	}
	if br == nil || br.Code != CodeRedRegression {
		t.Fatalf("expected RED_REGRESSION, got %v", br)
	}
}

// Scenario: a candidate that keeps every prior mirror green is allowed.
func TestAllowsAllGreen(t *testing.T) {
	base := []MirrorVerdict{g("a"), g("b"), g("c")}
	cand := []MirrorVerdict{g("a"), g("b"), g("c")}
	v, regressed, br := Decide(base, cand)

	if v != VerdictAllowed {
		t.Fatalf("expected ALLOWED, got %s", v)
	}
	if len(regressed) != 0 {
		t.Fatalf("expected no regression, got %+v", regressed)
	}
	if br != nil {
		t.Fatalf("expected no BlockReason, got %v", br)
	}
}

// Already-red at baseline is NOT a regression (the cliquet protects green only).
func TestAlreadyRedIsNotRegression(t *testing.T) {
	base := []MirrorVerdict{r("a"), g("b")}
	cand := []MirrorVerdict{r("a"), g("b")}
	if v, reg, _ := Decide(base, cand); v != VerdictAllowed || len(reg) != 0 {
		t.Fatalf("already-red must not regress: %s %+v", v, reg)
	}
}

// A newly-added mirror (absent at baseline) cannot regress.
func TestNewMirrorNotRegression(t *testing.T) {
	base := []MirrorVerdict{g("a")}
	cand := []MirrorVerdict{g("a"), r("z")} // z is new and red, but never baseline-green
	if v, reg, _ := Decide(base, cand); v != VerdictAllowed || len(reg) != 0 {
		t.Fatalf("new red mirror must not count as regression: %s %+v", v, reg)
	}
}
