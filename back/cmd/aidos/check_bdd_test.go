package main

import (
	"bytes"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/cmd/aidos/lawcoverage"
)

// check_bdd_test.go is the S45 FIXTURE mirror (N2: state → command → events,
// interpreted in Go) materialized for the runner — conceptually stored in the
// `mirrors` schema (reflects: cmd/aidos.check; test_kind: fixture; cert_language:
// operation-dsl/go; authority: below). For EACH law `check` owns it pins one RED
// fixture (a violating graph fragment + `aidos check --red <law>` → the expected
// breach, exit != 0) and one GREEN fixture (the demo project → no breach for that
// law). The laws owned by stable/diff/explain are covered by those verbs' own BDD
// tests; here we prove the 1-law-1-red-1-green criterion for the `check`-owned laws
// AND the all-green demo-project end-to-end case.

// expectedCode maps each check-owned law to the breach code its RED fixture emits.
// Declared, never derived — the test fails loudly if a detector's code drifts.
var expectedCode = map[lawcoverage.LawID]string{
	lawcoverage.LawTruthWithoutKind:     "TRUTH_WITHOUT_KIND",
	lawcoverage.LawMirrorIncompatible:   "MIRROR_INCOMPATIBLE",
	lawcoverage.LawScopeAbsent:          "OUT_OF_SCOPE",
	lawcoverage.LawAuthorityAbsent:      "MISSING_AUTHORITY",
	lawcoverage.LawMemoryWithoutGoal:    "MEMORY_CANNOT_DECLARE_TRUTH",
	lawcoverage.LawComposesWeight:       "COMPOSES_WEIGHT_UNJUSTIFIED",
	lawcoverage.LawMutationScore:        "MUTATION_SCORE_INSUFFICIENT",
	lawcoverage.LawInvariantTooGlobal:   "INVARIANT_TOO_GLOBAL",
	lawcoverage.LawContextDecisionUntst: "CONTEXT_DECISION_UNTESTED",
	lawcoverage.LawCompleteness:         "MONSTER",
}

// TestFixture_DemoProjectGreen — GREEN end-to-end: `aidos check` on the demo project
// reports zero breaches and exits 0.
//
//	state   (graph): the demo project (every law satisfied)
//	command:         aidos check
//	events: [ verdict GREEN, no breach, exit == 0 ]
func TestFixture_DemoProjectGreen(t *testing.T) {
	var out bytes.Buffer
	code := Run([]string{"check", "demo"}, &out)
	if code != exitOK {
		t.Fatalf("demo project: exit = %d, want %d (green)\n%s", code, exitOK, out.String())
	}
	if !strings.Contains(out.String(), "GREEN") {
		t.Fatalf("demo project: expected GREEN verdict, got:\n%s", out.String())
	}
}

// TestFixture_EachCheckLaw_RedThenGreen — for EACH law `check` owns, the RED fixture
// breaches with the expected code (exit != 0) and the demo project does not breach
// for that law (exit 0). This IS the 1-law-1-red-1-green done criterion, per law.
func TestFixture_EachCheckLaw_RedThenGreen(t *testing.T) {
	for _, l := range lawcoverage.Laws() {
		if l.OwningVerb != lawcoverage.VerbCheck {
			continue
		}
		wantCode := expectedCode[l.ID]
		if wantCode == "" {
			t.Fatalf("law %q is check-owned but has no expected code (test must pin it)", l.ID)
		}

		// RED: aidos check --red <law> → the breach, exit != 0.
		var red bytes.Buffer
		code := Run([]string{"check", "--red", string(l.ID)}, &red)
		if code == exitOK {
			t.Fatalf("law %q RED: exit 0, expected a breach\n%s", l.ID, red.String())
		}
		if !strings.Contains(red.String(), wantCode) {
			t.Fatalf("law %q RED: expected code %q, got:\n%s", l.ID, wantCode, red.String())
		}
		if !strings.Contains(red.String(), "INVALID") {
			t.Fatalf("law %q RED: expected INVALID verdict, got:\n%s", l.ID, red.String())
		}

		// GREEN: the demo project does not breach for this law (it appears in no
		// breach list when check runs all-green).
		var green bytes.Buffer
		gcode := Run([]string{"check", "demo"}, &green)
		if gcode != exitOK {
			t.Fatalf("law %q GREEN: demo project should be all-green, exit = %d\n%s", l.ID, gcode, green.String())
		}
		if strings.Contains(green.String(), wantCode) {
			t.Fatalf("law %q GREEN: demo project unexpectedly breached %q:\n%s", l.ID, wantCode, green.String())
		}
	}
}

// TestFixture_CheckUnknownLaw_UsageError — `aidos check --red <unknown>` is a usage
// error (exit 2) listing the known laws — never a prison.
func TestFixture_CheckUnknownLaw_UsageError(t *testing.T) {
	var out bytes.Buffer
	code := Run([]string{"check", "--red", "no-such-law"}, &out)
	if code != exitUsage {
		t.Fatalf("unknown law: exit = %d, want %d\n%s", code, exitUsage, out.String())
	}
	if !strings.Contains(out.String(), "loi inconnue") {
		t.Fatalf("unknown law: expected 'loi inconnue', got:\n%s", out.String())
	}
}

// TestFixture_CheckIsDeterministic — same command ⇒ byte-identical output (no clock,
// no rng): the determinism invariant of KRD §82.1, observed through the CLI.
func TestFixture_CheckIsDeterministic(t *testing.T) {
	for _, args := range [][]string{{"check"}, {"check", "--red", "scope_absent"}} {
		var a, b bytes.Buffer
		ca := Run(args, &a)
		cb := Run(args, &b)
		if ca != cb || a.String() != b.String() {
			t.Fatalf("check %v not deterministic:\nA(%d): %s\nB(%d): %s", args, ca, a.String(), cb, b.String())
		}
	}
}

// TestFixture_StableDiffExplainCoverTheirLaws — the verb-view coverage: the laws
// owned by stable/diff/explain are reachable through those verbs (the keystone rule
// across all five verbs, matching S22/S21/S13).
//   - stable owns phase_not_stable: `aidos stable red-sensor` → UNSTABLE.
//   - diff produces the SemanticDiff (S21): `aidos diff refund-policy` → a change_type.
//   - explain explains a blockage (S13): `aidos explain OUT_OF_SCOPE` → the BlockReason.
func TestFixture_StableDiffExplainCoverTheirLaws(t *testing.T) {
	var st bytes.Buffer
	if Run([]string{"stable", "red-sensor"}, &st); !strings.Contains(st.String(), "UNSTABLE") {
		t.Fatalf("stable should reach phase_not_stable (UNSTABLE):\n%s", st.String())
	}
	var df bytes.Buffer
	if Run([]string{"diff", "refund-policy"}, &df); !strings.Contains(df.String(), "change_type") {
		t.Fatalf("diff should produce a SemanticDiff (change_type):\n%s", df.String())
	}
	var ex bytes.Buffer
	if Run([]string{"explain", "OUT_OF_SCOPE"}, &ex); !strings.Contains(ex.String(), "OUT_OF_SCOPE") {
		t.Fatalf("explain should explain a blockage (BlockReason):\n%s", ex.String())
	}
}
