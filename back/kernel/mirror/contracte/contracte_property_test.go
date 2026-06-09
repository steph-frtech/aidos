package contracte

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/mirror/prooftype"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"pgregory.net/rapid"
)

// The FK16 reproducibility mirror (CLAUDE.md §6 determinism-first). The contract bascule is a PURE
// deterministic re-labelling: same mirror ⇒ same E, same corpus ⇒ byte-identical output, the N
// preserved and never lost, the lifecycle monotone. These property mirrors pin every guarantee.

var (
	allCerts = []records.CertLanguage{
		records.CertGherkin, records.CertXState, records.CertFastCheck, records.CertRapid,
		records.CertZod, records.CertPact, records.CertTypeCheck, records.CertK6,
		records.CertFixture, records.CertSnapshot, records.CertUnit, records.CertProse,
	}
	allKinds = []records.TestKind{
		records.TestKindAcceptance, records.TestKindE2E, records.TestKindProperty,
		records.TestKindFixture, records.TestKindContract, records.TestKindSchema,
		records.TestKindUnit, records.TestKindSnapshot, records.TestKindMeter,
	}
	allN = []prooftype.NLevel{
		prooftype.N0, prooftype.N1, prooftype.N2, prooftype.N3, prooftype.N4, prooftype.N5,
	}
)

// MirrorE is deterministic: same (kind, cert) ⇒ same E, every time.
func TestProp_MirrorE_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		k := allKinds[rapid.IntRange(0, len(allKinds)-1).Draw(rt, "kind")]
		c := allCerts[rapid.IntRange(0, len(allCerts)-1).Draw(rt, "cert")]
		a := MirrorE(k, c)
		b := MirrorE(k, c)
		if a != b {
			rt.Fatalf("MirrorE(%s,%s) not deterministic: %d vs %d", k, c, a, b)
		}
	})
}

// MirrorE is TOTAL: every (kind, cert) — including unknowns — maps to a real E-level (E0…E7),
// never a panic, never out of range.
func TestProp_MirrorE_Total(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		k := records.TestKind(rapid.StringMatching(`[a-z]{1,8}`).Draw(rt, "k"))
		c := records.CertLanguage(rapid.StringMatching(`[a-z-]{1,10}`).Draw(rt, "c"))
		e := MirrorE(k, c)
		if !e.IsReal() {
			rt.Fatalf("MirrorE(%s,%s)=%d not a real E-level", k, c, e)
		}
	})
}

// A non-executable cert (prose) ALWAYS attains E0 — no evidence — regardless of the test_kind
// (KRD §805: a proof that does not run is no evidence).
func TestProp_Prose_AlwaysE0(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		k := allKinds[rapid.IntRange(0, len(allKinds)-1).Draw(rt, "kind")]
		if got := MirrorE(k, records.CertProse); got != prooftype.E0 {
			rt.Fatalf("prose with kind %s attained %d, want E0", k, got)
		}
	})
}

// Relabel loses NOTHING: for any corpus, the output has one tag per input, in order, each carrying
// its preserved N and a Deprecated lifecycle — NoLoss always holds.
func TestProp_Relabel_NoLoss(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		n := rapid.IntRange(0, 12).Draw(rt, "n")
		corpus := make([]MirrorIn, 0, n)
		for i := 0; i < n; i++ {
			corpus = append(corpus, MirrorIn{
				MirrorID:     rapid.StringMatching(`m[0-9]{1,4}`).Draw(rt, "id"),
				TestKind:     allKinds[rapid.IntRange(0, len(allKinds)-1).Draw(rt, "k")],
				CertLanguage: allCerts[rapid.IntRange(0, len(allCerts)-1).Draw(rt, "c")],
				N:            allN[rapid.IntRange(0, len(allN)-1).Draw(rt, "nn")],
			})
		}
		tags := Relabel(corpus)
		if !NoLoss(corpus, tags) {
			rt.Fatalf("Relabel lost something for corpus of %d", n)
		}
		// Every N is preserved verbatim and never empty.
		for i := range corpus {
			if tags[i].N != corpus[i].N {
				rt.Fatalf("N not preserved at %d: %s vs %s", i, tags[i].N, corpus[i].N)
			}
		}
	})
}

// Relabel is byte-stable: same corpus ⇒ identical output.
func TestProp_Relabel_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		n := rapid.IntRange(0, 8).Draw(rt, "n")
		corpus := make([]MirrorIn, 0, n)
		for i := 0; i < n; i++ {
			corpus = append(corpus, MirrorIn{
				MirrorID:     rapid.StringMatching(`m[0-9]{1,3}`).Draw(rt, "id"),
				TestKind:     allKinds[rapid.IntRange(0, len(allKinds)-1).Draw(rt, "k")],
				CertLanguage: allCerts[rapid.IntRange(0, len(allCerts)-1).Draw(rt, "c")],
				N:            allN[rapid.IntRange(0, len(allN)-1).Draw(rt, "nn")],
			})
		}
		a := Relabel(corpus)
		b := Relabel(corpus)
		if len(a) != len(b) {
			rt.Fatalf("len mismatch")
		}
		for i := range a {
			if a[i] != b[i] {
				rt.Fatalf("tag %d differs: %+v vs %+v", i, a[i], b[i])
			}
		}
	})
}

// Deprecate is monotone + idempotent: from ANY lifecycle it yields Deprecated, and re-applying it
// is a fixpoint — it never reverses to Active, never deletes the N.
func TestProp_Deprecate_Monotone(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		stages := []NLifecycle{NActive, NDeprecated}
		s := stages[rapid.IntRange(0, len(stages)-1).Draw(rt, "s")]
		if got := Deprecate(s); got != NDeprecated {
			rt.Fatalf("Deprecate(%s)=%s, want deprecated", s, got)
		}
		if Deprecate(Deprecate(s)) != NDeprecated {
			rt.Fatalf("Deprecate not idempotent")
		}
	})
}
