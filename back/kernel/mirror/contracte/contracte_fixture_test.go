package contracte

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/mirror/prooftype"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
)

// The FK16 bascule FIXTURE (KRD §S workflow form: state → command → events). A pre-FK16 N-typed
// corpus (the state) undergoes the contract command (Relabel) and we assert the events: every
// mirror re-labelled E with zero loss, the N preserved and Deprecated, the panel histogram exact.
// This is the deterministic acceptance of the switch.

func TestFixture_Bascule_ZeroLoss(t *testing.T) {
	// STATE — a representative slice of the existing N-typed corpus (the frozen-proven).
	corpus := []MirrorIn{
		{MirrorID: "m-journey", TestKind: records.TestKindAcceptance, CertLanguage: records.CertGherkin, N: prooftype.N0},
		{MirrorID: "m-invariant", TestKind: records.TestKindProperty, CertLanguage: records.CertRapid, N: prooftype.N1},
		{MirrorID: "m-workflow", TestKind: records.TestKindFixture, CertLanguage: records.CertFixture, N: prooftype.N2},
		{MirrorID: "m-contract", TestKind: records.TestKindContract, CertLanguage: records.CertPact, N: prooftype.N3},
		{MirrorID: "m-unit", TestKind: records.TestKindUnit, CertLanguage: records.CertUnit, N: prooftype.N4},
		{MirrorID: "m-infra", TestKind: records.TestKindContract, CertLanguage: records.CertPact, N: prooftype.N5},
		{MirrorID: "m-prose", TestKind: records.TestKindUnit, CertLanguage: records.CertProse, N: prooftype.N4},
	}

	// COMMAND — throw the switch.
	tags := Relabel(corpus)

	// EVENT 1 — zero loss: one tag per mirror, each preserving its N, all Deprecated.
	if !NoLoss(corpus, tags) {
		t.Fatalf("bascule lost a mirror or an N-label")
	}

	// EVENT 2 — each mirror carries the E its proof attains.
	wantE := map[string]prooftype.ELevel{
		"m-journey":   prooftype.E3, // gherkin/acceptance
		"m-invariant": prooftype.E5, // rapid/property
		"m-workflow":  prooftype.E3, // fixture
		"m-contract":  prooftype.E3, // pact/contract
		"m-unit":      prooftype.E2, // unit
		"m-infra":     prooftype.E3, // pact/contract (N5 infra)
		"m-prose":     prooftype.E0, // non-executable → no evidence
	}
	for _, tg := range tags {
		if tg.E != wantE[tg.MirrorID] {
			t.Fatalf("%s: E=%d (%s), want %d", tg.MirrorID, tg.E, tg.EName, wantE[tg.MirrorID])
		}
		if tg.NLifecycle != NDeprecated {
			t.Fatalf("%s: N lifecycle %s, want deprecated", tg.MirrorID, tg.NLifecycle)
		}
		if tg.N == "" {
			t.Fatalf("%s: N erased — FK16 forbids deletion", tg.MirrorID)
		}
	}

	// EVENT 3 — the panel histogram is exact (E0×1, E2×1, E3×4, E5×1, rest 0).
	// E3 = m-journey + m-workflow + m-contract + m-infra (all contract/integration rung).
	h := EHistogram(tags)
	wantH := map[prooftype.ELevel]int{
		prooftype.E0: 1, prooftype.E1: 0, prooftype.E2: 1, prooftype.E3: 4,
		prooftype.E4: 0, prooftype.E5: 1, prooftype.E6: 0, prooftype.E7: 0,
	}
	for e, want := range wantH {
		if h[e] != want {
			t.Fatalf("histogram E%d=%d, want %d", e, h[e], want)
		}
	}
}

// The N-label is NEVER deleted: a deprecated mirror still round-trips its N. (anti-overwrite §9.)
func TestFixture_N_Preserved_AfterDeprecation(t *testing.T) {
	in := MirrorIn{MirrorID: "m1", TestKind: records.TestKindProperty, CertLanguage: records.CertRapid, N: prooftype.N1}
	tg := RelabelOne(in)
	if tg.N != prooftype.N1 {
		t.Fatalf("N lost: %s", tg.N)
	}
	if tg.NLifecycle != NDeprecated {
		t.Fatalf("not deprecated")
	}
	if tg.E != prooftype.E5 {
		t.Fatalf("E=%d, want E5", tg.E)
	}
}

// CertToE / KindToE are the declared, total lenses — spot-check the closed tables.
func TestFixture_Lenses(t *testing.T) {
	cases := []struct {
		c    records.CertLanguage
		want prooftype.ELevel
	}{
		{records.CertGherkin, prooftype.E3},
		{records.CertRapid, prooftype.E5},
		{records.CertTypeCheck, prooftype.E1},
		{records.CertSnapshot, prooftype.E2},
		{records.CertProse, prooftype.E0},
		{records.CertLanguage("made-up"), prooftype.E0}, // total: unknown → floor
	}
	for _, c := range cases {
		if got := CertToE(c.c); got != c.want {
			t.Fatalf("CertToE(%s)=%d, want %d", c.c, got, c.want)
		}
	}
	if got := KindToE(records.TestKindMeter); got != prooftype.E6 {
		t.Fatalf("KindToE(meter)=%d, want E6", got)
	}
	if got := KindToE(records.TestKind("unknown")); got != prooftype.E0 {
		t.Fatalf("KindToE(unknown)=%d, want E0", got)
	}
}
