package mirrorrunner

// Reproducibility + soundness property mirror for the cliquet core.
// mirror record: reflects=S05-ci-ratchet-core, test_kind=invariant,
//               cert_language=rapid, liveness=live
//
// Determinism-first (CLAUDE.md §6): the regression decision is a pure total
// function, so it carries a reproducibility mirror — same input → same output —
// and a soundness invariant — a mirror is regressed IFF it was green at baseline
// and red on the candidate. These hold for ALL inputs, not a handful of cases.

import (
	"testing"

	"pgregory.net/rapid"
)

// genVerdicts builds a list of MirrorVerdicts over a small id space so baseline
// and candidate overlap often (the interesting case is the same id in both).
func genVerdicts(t *rapid.T, label string) []MirrorVerdict {
	n := rapid.IntRange(0, 6).Draw(t, label+"-n")
	out := make([]MirrorVerdict, 0, n)
	seen := map[string]bool{}
	for i := 0; i < n; i++ {
		id := "m" + rapid.SampledFrom([]string{"0", "1", "2", "3", "4"}).Draw(t, label+"-id")
		if seen[id] {
			continue // one verdict per mirror id in a set
		}
		seen[id] = true
		st := StatusGreen
		if rapid.Bool().Draw(t, label+"-red") {
			st = StatusRed
		}
		out = append(out, MirrorVerdict{
			MirrorID:    id,
			Version:     "v" + id,
			ContentHash: "h" + id,
			Status:      st,
		})
	}
	return out
}

// Determinism: Regressed is a pure function — the same inputs always yield the
// identical result. Re-running must not change the regressed set or its order.
func TestRegressedIsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		base := genVerdicts(t, "base")
		cand := genVerdicts(t, "cand")
		a := Regressed(base, cand)
		b := Regressed(base, cand)
		if len(a) != len(b) {
			t.Fatalf("non-deterministic length: %d vs %d", len(a), len(b))
		}
		for i := range a {
			if a[i] != b[i] {
				t.Fatalf("non-deterministic at %d: %+v vs %+v", i, a[i], b[i])
			}
		}
	})
}

// Soundness: a mirror appears in the regressed set IFF it was green at baseline
// AND red on the candidate (and present in both). Nothing else regresses.
func TestRegressedIffGreenThenRed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		base := genVerdicts(t, "base")
		cand := genVerdicts(t, "cand")

		candByID := map[string]MirrorVerdict{}
		for _, c := range cand {
			candByID[c.MirrorID] = c
		}
		baseByID := map[string]MirrorVerdict{}
		for _, b := range base {
			baseByID[b.MirrorID] = b
		}

		got := map[string]bool{}
		for _, r := range Regressed(base, cand) {
			got[r.MirrorID] = true
		}

		// Every id: regressed in result IFF green-at-base AND red-on-candidate.
		for id := range baseByID {
			b := baseByID[id]
			c, inCand := candByID[id]
			want := b.Status == StatusGreen && inCand && c.Status == StatusRed
			if got[id] != want {
				t.Fatalf("id %s: regressed=%v want %v (base=%s cand=%v/%s)",
					id, got[id], want, b.Status, inCand, c.Status)
			}
		}
		// Nothing outside the baseline can be regressed.
		for id := range got {
			if _, ok := baseByID[id]; !ok {
				t.Fatalf("id %s regressed but absent from baseline", id)
			}
		}
	})
}

// Ordering: the regressed set is sorted by mirror id (deterministic output).
func TestRegressedIsSorted(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		base := genVerdicts(t, "base")
		cand := genVerdicts(t, "cand")
		r := Regressed(base, cand)
		for i := 1; i < len(r); i++ {
			if r[i-1].MirrorID >= r[i].MirrorID {
				t.Fatalf("not sorted: %s then %s", r[i-1].MirrorID, r[i].MirrorID)
			}
		}
	})
}

// Verdict totality: ALLOWED with nil BlockReason iff empty regressed set;
// REJECTED with a RED_REGRESSION BlockReason otherwise.
func TestVerdictTotality(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		base := genVerdicts(t, "base")
		cand := genVerdicts(t, "cand")
		r := Regressed(base, cand)
		v, br := Verdict(r)
		if len(r) == 0 {
			if v != VerdictAllowed || br != nil {
				t.Fatalf("empty regressed must be ALLOWED/nil, got %s/%v", v, br)
			}
		} else {
			if v != VerdictRejected {
				t.Fatalf("non-empty regressed must be REJECTED, got %s", v)
			}
			if br == nil || br.Code != CodeRedRegression {
				t.Fatalf("expected RED_REGRESSION BlockReason, got %v", br)
			}
			if len(br.HowToFix) == 0 {
				t.Fatalf("BlockReason must carry how_to_fix steps")
			}
		}
	})
}
