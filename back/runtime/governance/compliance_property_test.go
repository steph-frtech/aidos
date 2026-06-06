// compliance_property_test.go — GV04 reproducibility + fault-injection mirror.
//
// RED-FIRST. Written before compliance.go existed; the first run failed to compile (no
// Mirrors/CheckCompliance/CheckInjected) — that compile-red IS the goal. Green follows the
// ten mirrors being wired to the real enforcers. There is no LLM in this mirror: a property
// test whose JUDGE is the enforcer itself (CLAUDE.md §6/§8 determinism-first).
//
// THE GV04 DONE-CRITERIA, PINNED:
//   - chaque risque a un miroir — TestMirrors_OnePerRisk (the completeness law: a risk with
//     no mirror is a monster; a mirror for an unknown risk is a monster).
//   - tous verts sur l'état courant — TestCompliance_AllGreenOnCurrentState (every mirror's
//     GOVERNED scenario is Compliant; CheckCompliance().AllCompliant).
//   - injecter la violation correspondante → le miroir passe rouge — TestInjection_EachTurnsRed
//     (every mirror's INJECTED scenario is NOT Compliant; this is the load-bearing proof that
//     the enforcer the mirror reads is doing the work — a mirror that stays green under its
//     injection is a monster).
//   - déterministe — TestCompliance_Reproducible (same enforcers ⇒ same suite, byte-stable).
package governance

import (
	"testing"

	"pgregory.net/rapid"
)

// TestMirrors_OnePerRisk pins the completeness law: EXACTLY one compliance mirror per OWASP
// risk, no risk without a mirror, no mirror for an unknown risk, each mirror anchored to a
// REAL enforcer (a non-empty Anchor) and naming its forbidden action.
func TestMirrors_OnePerRisk(t *testing.T) {
	mirrors := Mirrors()
	if len(mirrors) != wantRisks {
		t.Fatalf("want %d compliance mirrors, got %d", wantRisks, len(mirrors))
	}
	// every risk has a mirror, in canonical order.
	for i, r := range Risks() {
		if mirrors[i].Risk != r {
			t.Fatalf("mirror %d covers %q, want %q (order drift)", i, mirrors[i].Risk, r)
		}
		m, ok := MirrorFor(r)
		if !ok {
			t.Fatalf("risk %q has NO compliance mirror (monster: a risk with no mirror)", r)
		}
		if m.Anchor == "" {
			t.Fatalf("mirror %q names no enforcer anchor (it must read a REAL verdict)", r)
		}
		if m.Title == "" || m.Forbidden == "" {
			t.Fatalf("mirror %q has empty Title/Forbidden", r)
		}
	}
	// no duplicate risk among the mirrors.
	seen := map[Risk]bool{}
	for _, m := range mirrors {
		if seen[m.Risk] {
			t.Fatalf("duplicate mirror for risk %q", m.Risk)
		}
		seen[m.Risk] = true
	}
}

// TestCompliance_AllGreenOnCurrentState pins "tous verts sur l'état courant": every mirror's
// GOVERNED scenario — the forbidden action presented to the LIVE enforcer — is Compliant, and
// each carries the enforcer's evidence (the denied axis / BlockReason code / firewall signal).
func TestCompliance_AllGreenOnCurrentState(t *testing.T) {
	suite := CheckCompliance()
	if suite.Total != wantRisks {
		t.Fatalf("suite total %d != %d risks", suite.Total, wantRisks)
	}
	if !suite.AllCompliant {
		for _, r := range suite.Results {
			if !r.Compliant {
				t.Errorf("risk %q is NOT governed on the current state: %s (%s)", r.Risk, r.Detail, r.Evidence)
			}
		}
		t.Fatalf("not all risks governed on the current state (%d/%d)", suite.Compliant, suite.Total)
	}
	if suite.Compliant != wantRisks {
		t.Fatalf("compliant count %d != %d", suite.Compliant, wantRisks)
	}
	// every governed result must carry evidence (the enforcer signal that decided it).
	for _, r := range suite.Results {
		if r.Evidence == "" {
			t.Fatalf("governed risk %q is compliant but names no evidence", r.Risk)
		}
	}
}

// TestInjection_EachTurnsRed is the LOAD-BEARING fault-injection: for every risk, injecting the
// corresponding violation (degrading the enforcer the way that risk materializes) turns its
// mirror RED — NOT Compliant. A mirror that stays compliant under its own injection would prove
// the enforcer is dead weight (a monster); every one MUST flip. This is "injecter la violation
// correspondante → le miroir passe rouge", proved per risk.
func TestInjection_EachTurnsRed(t *testing.T) {
	for _, m := range Mirrors() {
		gov := m.CheckGoverned()
		inj := m.CheckInjected()
		if !gov.Compliant {
			t.Errorf("risk %q: GOVERNED must be compliant but was red (%s)", m.Risk, gov.Detail)
		}
		if inj.Compliant {
			t.Errorf("risk %q: INJECTED must be RED but stayed compliant — the enforcer is not load-bearing (monster): %s",
				m.Risk, inj.Detail)
		}
	}
	// the suite-level injection roll-up: ZERO mirrors may wrongly stay compliant under injection.
	injSuite := CheckInjected()
	if injSuite.Compliant != 0 {
		t.Fatalf("%d/%d mirrors stayed compliant under injection (must be 0)", injSuite.Compliant, injSuite.Total)
	}
}

// TestCompliance_Reproducible is the determinism-first reproducibility mirror: the suite is a
// pure derivation over the pure enforcers, so calling it twice yields the IDENTICAL results —
// no clock, no rng, no I/O, no LLM could make it drift. rapid drives many independent reads.
func TestCompliance_Reproducible(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		_ = rapid.IntRange(0, 8).Draw(rt, "n") // vary the run; the output must not change.
		a, b := CheckCompliance(), CheckCompliance()
		if a.AllCompliant != b.AllCompliant || a.Compliant != b.Compliant || len(a.Results) != len(b.Results) {
			rt.Fatalf("compliance suite drifted between calls")
		}
		for i := range a.Results {
			if a.Results[i].Risk != b.Results[i].Risk || a.Results[i].Compliant != b.Results[i].Compliant ||
				a.Results[i].Evidence != b.Results[i].Evidence {
				rt.Fatalf("compliance row %d drifted between calls", i)
			}
		}
		ia, ib := CheckInjected(), CheckInjected()
		if ia.Compliant != ib.Compliant {
			rt.Fatalf("injection suite drifted between calls")
		}
	})
}
