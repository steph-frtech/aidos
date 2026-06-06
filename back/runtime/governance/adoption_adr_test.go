// adoption_adr_test.go — GV02 parity mirror. The done-criterion is an ACCEPTED ADR listing
// precisely what AIDOS adopts / does not adopt + why the wall stays the garant. This mirror
// is the deterministic JUDGE that (1) the ADR's adoption rows are a faithful, total projection
// of the authoritative adoptionTable, (2) the wall is the named garant on every non-rejected
// row, (3) the headline counts agree with the verdict, and (4) the published ADR FILE on disk
// actually carries the declared number, the Accepted status, and names every pillar's decision
// — so the document can never silently diverge from the code (CLAUDE.md §6/§8 determinism-first).
//
// RED-FIRST. Written before adoption_adr.go and the ADR file existed; the first run failed to
// compile (no ADRParity) then failed on the missing/Proposed ADR file. That red IS the goal.
package governance

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"pgregory.net/rapid"
)

// TestADRParity_TotalAndFaithful pins the ADR rows are a total, order-stable projection of the
// five pillars, each row agreeing with the authoritative adoptionTable.
func TestADRParity_TotalAndFaithful(t *testing.T) {
	rows := ADRParity()
	if len(rows) != wantPillars {
		t.Fatalf("ADR has %d rows, want %d pillars", len(rows), wantPillars)
	}
	verdicts := PillarVerdicts()
	for i, r := range rows {
		v := verdicts[i]
		if r.Pillar != v.Pillar || r.Decision != v.Decision || r.Title != v.Title || r.Step != v.Step {
			t.Fatalf("ADR row %d drifted from adoptionTable: %+v vs %+v", i, r, v)
		}
		switch r.Decision {
		case DecisionAdoptAugment, DecisionAlreadyCovered, DecisionReject:
		default:
			t.Fatalf("ADR row %q has unknown decision %q", r.Pillar, r.Decision)
		}
	}
}

// TestADRParity_WallIsGarant pins the load-bearing GV02 invariant: on every NON-rejected row
// the structural wall remains the garant the pillar augments/provides. No adopted pillar may
// ever replace the wall (the wall stays stronger than default-allow middleware).
func TestADRParity_WallIsGarant(t *testing.T) {
	for _, r := range ADRParity() {
		want := r.Decision != DecisionReject
		if r.WallIsGarant != want {
			t.Fatalf("pillar %q WallIsGarant=%v, want %v for decision %q", r.Pillar, r.WallIsGarant, want, r.Decision)
		}
	}
	s := AdoptionADRSummary()
	if !s.WallStaysGarant {
		t.Fatalf("ADR summary must keep the wall as garant unconditionally")
	}
}

// TestADRSummary_AgreesWithVerdict pins the headline counts cannot disagree with the verdict —
// the precise "ce qu'on adopte / n'adopte pas" numbers are a derivation, never a parallel claim.
func TestADRSummary_AgreesWithVerdict(t *testing.T) {
	v := Verdict()
	s := AdoptionADRSummary()
	if s.Adopt != v.ToAdopt || s.AlreadyCovered != v.AlreadyCovered || s.Rejected != v.Rejected {
		t.Fatalf("ADR summary (%d/%d/%d) disagrees with verdict (%d/%d/%d)",
			s.Adopt, s.AlreadyCovered, s.Rejected, v.ToAdopt, v.AlreadyCovered, v.Rejected)
	}
	// the real GV02 finding, pinned: 4 adopt-as-augment, 1 already-covered, 0 rejected.
	if s.Adopt != 4 || s.AlreadyCovered != 1 || s.Rejected != 0 {
		t.Fatalf("GV02 adoption shape changed: adopt=%d covered=%d rejected=%d (want 4/1/0)", s.Adopt, s.AlreadyCovered, s.Rejected)
	}
}

// TestADRFile_AcceptedAndComplete pins the PUBLISHED ADR file on disk: it exists, declares the
// expected number, is "Accepted", and NAMES each pillar's decision verbatim — so the document
// is provably the same decision as the code (anti-drift). This is the GV02 done-criterion made
// non-gameable: a Proposed or missing ADR, or one that omits a pillar/decision, goes red.
func TestADRFile_AcceptedAndComplete(t *testing.T) {
	path := filepath.Join("..", "..", "..", "docs", "adr", adrNumber+"-gv02-agt-adoption.md")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("GV02 ADR file missing at %s: %v", path, err)
	}
	doc := string(raw)
	if !strings.Contains(doc, "Status: "+string(ADRAccepted)) {
		t.Fatalf("GV02 ADR is not Accepted (done-criterion: ADR accepté)")
	}
	if !strings.Contains(doc, "ADR "+adrNumber) {
		t.Fatalf("GV02 ADR file does not declare its number %s", adrNumber)
	}
	// every pillar's decision value must appear in the ADR's adoption table (each pillar listed,
	// each decision stated) — the precise "ce qu'on adopte/n'adopte pas".
	for _, r := range ADRParity() {
		if !strings.Contains(doc, string(r.Pillar)) {
			t.Fatalf("GV02 ADR omits pillar %q", r.Pillar)
		}
		if !strings.Contains(doc, string(r.Decision)) {
			t.Fatalf("GV02 ADR omits decision %q (pillar %q)", r.Decision, r.Pillar)
		}
	}
	// the wall must be named as the garant.
	if !strings.Contains(doc, "mur") {
		t.Fatalf("GV02 ADR must explain why the mur (wall) stays the garant")
	}
}

// TestADRParity_Reproducible is the determinism-first reproducibility mirror: the ADR projection
// is a pure derivation, so repeated reads yield identical rows and headline — no drift possible.
func TestADRParity_Reproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		_ = rapid.IntRange(0, 8).Draw(t, "n")
		a, b := ADRParity(), ADRParity()
		if len(a) != len(b) {
			t.Fatalf("ADR row count drift %d != %d", len(a), len(b))
		}
		for i := range a {
			if a[i] != b[i] {
				t.Fatalf("ADR row %d drifted between calls", i)
			}
		}
		if AdoptionADRSummary() != AdoptionADRSummary() {
			t.Fatalf("ADR summary drifted between calls")
		}
	})
}
