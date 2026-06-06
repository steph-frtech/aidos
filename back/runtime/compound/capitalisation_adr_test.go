// capitalisation_adr_test.go — CE02 parity mirror (RED FIRST). The done-criterion is an
// ACCEPTED ADR with a CLEAR FRONTIER (capitalisation ≠ apprentissage de critères ; tout via
// /goal). This mirror is the deterministic JUDGE that:
//
//	(1) the ADR's decision rows are a faithful, total projection of the authoritative
//	    capitalisationTable (the document cannot diverge from the code);
//	(2) every CAPITALISE row crosses the wall (firewall.ViaIdea → idée → miroir → /goal) — no
//	    shortcut to the kernel — and NO capitalise row touches the fitness (the frontier);
//	(3) the headline counts agree with the verdict (2 capitalise / 3 forbidden);
//	(4) the published ADR FILE on disk exists, is "Accepted", declares its number, names each
//	    subject + disposition, AND states the frontier verbatim ("tout via /goal", the fitness is
//	    never touched, capitalisation ≠ apprentissage de critères).
//
// RED-FIRST. Written before capitalisation_adr.go and the ADR file existed; the first run failed
// to compile (no ADRParity) then failed on the missing/Proposed ADR file. That red IS the goal.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the projection is pure, so it is also a reproducibility
// mirror — same table ⇒ same rows + same headline, no drift possible.
package compound

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"pgregory.net/rapid"
)

const wantSubjects = 5

// TestADRParity_TotalAndFaithful pins the ADR rows are a total, order-stable projection of the
// five subjects, each row agreeing with the authoritative capitalisationTable.
func TestADRParity_TotalAndFaithful(t *testing.T) {
	rows := ADRParity()
	if len(rows) != wantSubjects {
		t.Fatalf("ADR has %d rows, want %d subjects", len(rows), wantSubjects)
	}
	decisions := CapitalisationDecisions()
	for i, r := range rows {
		d := decisions[i]
		if r.Subject != d.Subject || r.Disposition != d.Disposition || r.Channel != d.Channel ||
			r.ViaWall != d.ViaWall || r.TouchesFitness != d.TouchesFitness {
			t.Fatalf("ADR row %d drifted from capitalisationTable: %+v vs %+v", i, r, d)
		}
		switch r.Disposition {
		case DispositionCapitalise, DispositionForbidden:
		default:
			t.Fatalf("ADR row %q has unknown disposition %q", r.Subject, r.Disposition)
		}
	}
}

// TestFrontier_EveryCapitaliseViaWall_NoneTouchesFitness pins the load-bearing CE02 invariants:
// every CAPITALISE row reaches its sink through the wall (firewall.ViaIdea → idée → miroir →
// /goal) and NO capitalise row touches the fitness. This is the encoded "capitalisation ≠
// apprentissage de critères ; tout via /goal".
func TestFrontier_EveryCapitaliseViaWall_NoneTouchesFitness(t *testing.T) {
	for _, d := range CapitalisationDecisions() {
		if d.Disposition != DispositionCapitalise {
			continue
		}
		if !d.ViaWall {
			t.Fatalf("capitalise subject %q must cross the wall (firewall.ViaIdea → /goal); ViaWall=false is a kernel shortcut", d.Subject)
		}
		if d.TouchesFitness {
			t.Fatalf("capitalise subject %q touches the fitness — capitalisation must NOT learn criteria (frontier breached)", d.Subject)
		}
		if d.Channel == ChannelNone {
			t.Fatalf("capitalise subject %q has no channel — a capitalised pattern needs a sink", d.Subject)
		}
	}
	v := Compute()
	if !v.AllCapitaliseViaWall {
		t.Fatalf("verdict: not every capitalise row crosses the wall — a kernel shortcut exists")
	}
	if !v.NoCapitaliseTouchesFitness {
		t.Fatalf("verdict: a capitalise row touches the fitness — capitalisation ≠ apprentissage de critères breached")
	}
}

// TestForbiddenRows_HaveNoSink pins that every FRONTIER (forbidden) row has no capitalisation
// channel and never crosses the wall — there is no legal sink for the goal's own substance, the
// fitness, or a direct kernel write.
func TestForbiddenRows_HaveNoSink(t *testing.T) {
	for _, d := range CapitalisationDecisions() {
		if d.Disposition != DispositionForbidden {
			continue
		}
		if d.Channel != ChannelNone {
			t.Fatalf("forbidden subject %q must have no channel, has %q", d.Subject, d.Channel)
		}
		if d.ViaWall {
			t.Fatalf("forbidden subject %q must not cross the wall (it has no legal sink)", d.Subject)
		}
	}
}

// TestSummary_AgreesWithVerdict pins the headline counts cannot disagree with the verdict — the
// precise "ce qu'on capitalise / ce qu'on ne touche jamais" numbers are a derivation.
func TestSummary_AgreesWithVerdict(t *testing.T) {
	v := Compute()
	s := ADRSummary()
	if s.Capitalise != v.Capitalise || s.Forbidden != v.Forbidden {
		t.Fatalf("ADR summary (%d/%d) disagrees with verdict (%d/%d)", s.Capitalise, s.Forbidden, v.Capitalise, v.Forbidden)
	}
	// the real CE02 shape, pinned: 2 capitalise, 3 forbidden.
	if s.Capitalise != 2 || s.Forbidden != 3 {
		t.Fatalf("CE02 boundary shape changed: capitalise=%d forbidden=%d (want 2/3)", s.Capitalise, s.Forbidden)
	}
	if !s.EverythingViaGoal || !s.FitnessUntouched || !s.NotLearningCriteria {
		t.Fatalf("ADR summary must assert: everything via /goal=%v, fitness untouched=%v, not learning criteria=%v", s.EverythingViaGoal, s.FitnessUntouched, s.NotLearningCriteria)
	}
}

// TestADRFile_AcceptedAndComplete pins the PUBLISHED ADR file on disk: it exists, declares the
// expected number, is "Accepted", names each subject + disposition verbatim, AND states the
// frontier (everything via /goal ; the fitness is never touched ; capitalisation ≠ apprentissage
// de critères). This is the CE02 done-criterion made non-gameable: a Proposed/missing ADR, or
// one that omits a subject/disposition or the frontier statement, goes red.
func TestADRFile_AcceptedAndComplete(t *testing.T) {
	path := filepath.Join("..", "..", "..", "docs", "adr", adrNumber+"-ce02-capitalisation-loop.md")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("CE02 ADR file missing at %s: %v", path, err)
	}
	doc := string(raw)
	if !strings.Contains(doc, "Status: "+string(ADRAccepted)) {
		t.Fatalf("CE02 ADR is not Accepted (done-criterion: ADR accepté)")
	}
	if !strings.Contains(doc, "ADR "+adrNumber) {
		t.Fatalf("CE02 ADR file does not declare its number %s", adrNumber)
	}
	for _, r := range ADRParity() {
		if !strings.Contains(doc, r.Subject) {
			t.Fatalf("CE02 ADR omits subject %q", r.Subject)
		}
		if !strings.Contains(doc, string(r.Disposition)) {
			t.Fatalf("CE02 ADR omits disposition %q (subject %q)", r.Disposition, r.Subject)
		}
	}
	// the frontier must be stated verbatim (the clear boundary the done-criterion demands).
	for _, must := range []string{
		"/goal",   // tout via /goal
		"fitness", // la fitness n'est jamais touchée
		"firewall.ViaIdea",
		"mur",
	} {
		if !strings.Contains(doc, must) {
			t.Fatalf("CE02 ADR must state the frontier verbatim, missing %q", must)
		}
	}
	if !strings.Contains(doc, "apprentissage de critères") {
		t.Fatalf("CE02 ADR must state the frontier: capitalisation ≠ apprentissage de critères")
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
		if ADRSummary() != ADRSummary() {
			t.Fatalf("ADR summary drifted between calls")
		}
	})
}
