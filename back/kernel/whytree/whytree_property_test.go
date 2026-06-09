package whytree_test

// Property mirror (∀) for the WhyTree Build / Serialize round-trip (FK13). reflects=kernel.whytree
// · test_kind=property · cert_language=rapid · liveness=live · authority=below (these are
// computational properties of the pure functions — the loop-closure RULE itself is the human's,
// above the line, pinned by the fixture). Run via `go test` (rapid is the frozen invariant slot,
// ADR 0003).
//
// The invariants are FKE-35.1 / ROADMAP FK13:
//
//  1. DETERMINISTIC BUILD. ∀ input ⇒ Build == Build (byte-identical tree or the same error) — same
//     graph + symptom + reproductions ⇒ same WhyTree (FK13 "remontée graphe déterministe").
//  2. REPRODUCIBILITY GATE (anti-confabulation). If ANY candidate cause on the trace lacks a
//     positive reproduction, Build REFUSES with ErrCauseNotReproduced — no tree with an unproven
//     cause is ever returned (the FK13 done-criterion: a non-reproducible cause is rejected).
//  3. ALL ADMITTED CAUSES ARE REPRODUCED. ∀ successful Build, every CauseNode.Reproduced is true.
//  4. NO-MIRROR REFUSAL. An empty terminal MirrorID ⇒ ErrNoTerminalMirror (WHYTREE_NO_MIRROR) —
//     a WhyTree never terminates without a mirror.
//  5. ROUND-TRIP CONTENT-ADDRESSED. SerializeBody → Record round-trips; same tree ⇒ same version
//     (byte-stable address); a changed terminal mirror ⇒ a different version (a new tree).
//  6. CYCLE REFUSED. A caused_by cycle reachable from the symptom ⇒ ErrCycle (never a partial tree).
//  7. TOTAL. Build never panics on a malformed graph (a malformed edge is skipped, inherited FK12).

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/causedby"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/whytree"
	"pgregory.net/rapid"
)

func genRef(t *rapid.T, label string) links.Ref {
	id := rapid.SampledFrom([]string{"n0", "n1", "n2", "n3", "n4"}).Draw(t, label+"_id")
	ver := rapid.SampledFrom([]string{"v1", "v2"}).Draw(t, label+"_ver")
	return links.Ref{ID: id, Version: ver}
}

func genEdge(t *rapid.T) causedby.Edge {
	return causedby.Edge{From: genRef(t, "from"), To: genRef(t, "to")}
}

func genEdges(t *rapid.T) []causedby.Edge {
	n := rapid.IntRange(0, 8).Draw(t, "n_edges")
	out := make([]causedby.Edge, n)
	for i := 0; i < n; i++ {
		out[i] = genEdge(t)
	}
	return out
}

// reproduceAll returns a positive reproduction for every node id 0..4 (so the trace is always
// fully reproduced unless we deliberately drop one).
func reproduceAll() []whytree.Reproduction {
	out := []whytree.Reproduction{}
	for _, id := range []string{"n0", "n1", "n2", "n3", "n4"} {
		out = append(out, whytree.Reproduction{CauseID: id, Reproduced: true})
	}
	return out
}

// TestProp_BuildIsDeterministic: same input ⇒ identical tree (or identical error). (FK13 criterion)
func TestProp_BuildIsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		symptom := rapid.SampledFrom([]string{"n0", "n1", "n2"}).Draw(t, "symptom")
		edges := genEdges(t)
		in := whytree.Input{
			Symptom:       symptom,
			Provenance:    whytree.FromMirror,
			Edges:         edges,
			Reproductions: reproduceAll(),
			Terminal:      whytree.TerminalMirror{MirrorID: "m1"},
		}
		// Build needs the terminal to reflect the actual root; compute it from a first trace so the
		// determinism check is on a path that succeeds when it can.
		chain, traceErr := causedby.Trace(symptom, edges)
		root := symptom
		if traceErr == nil && len(chain.Causes) > 0 {
			// deepest = last in nearest-first order.
			root = chain.Causes[len(chain.Causes)-1]
		}
		in.Terminal.ReflectsRootCause = root

		a, errA := whytree.Build(in)
		b, errB := whytree.Build(in)
		if (errA == nil) != (errB == nil) {
			t.Fatalf("determinism broken: errA=%v errB=%v", errA, errB)
		}
		if errA != nil {
			return
		}
		if a.Symptom != b.Symptom || a.RootCause != b.RootCause || len(a.Causes) != len(b.Causes) {
			t.Fatalf("non-deterministic tree:\n a=%+v\n b=%+v", a, b)
		}
		for i := range a.Causes {
			if a.Causes[i] != b.Causes[i] {
				t.Fatalf("cause[%d] differs: %+v vs %+v", i, a.Causes[i], b.Causes[i])
			}
		}
	})
}

// TestProp_ReproductionGate: dropping the reproduction of any reachable cause ⇒ refusal (no tree
// with an unproven cause is ever returned). (FK13 anti-confabulation criterion)
func TestProp_ReproductionGate(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		symptom := rapid.SampledFrom([]string{"n0", "n1"}).Draw(t, "symptom")
		edges := genEdges(t)
		chain, err := causedby.Trace(symptom, edges)
		if err != nil || len(chain.Causes) == 0 {
			return // need an acyclic graph with at least one cause to drop.
		}
		// Drop the reproduction of the first reachable cause.
		drop := chain.Causes[0]
		repros := []whytree.Reproduction{}
		for _, r := range reproduceAll() {
			if r.CauseID == drop {
				continue
			}
			repros = append(repros, r)
		}
		_, buildErr := whytree.Build(whytree.Input{
			Symptom:       symptom,
			Provenance:    whytree.FromMirror,
			Edges:         edges,
			Reproductions: repros,
			Terminal:      whytree.TerminalMirror{MirrorID: "m1", ReflectsRootCause: chain.Causes[len(chain.Causes)-1]},
		})
		if !errors.Is(buildErr, whytree.ErrCauseNotReproduced) {
			t.Fatalf("dropping cause %q reproduction must refuse, got %v", drop, buildErr)
		}
	})
}

// TestProp_AllAdmittedCausesReproduced: every cause in a successful tree is reproduced.
func TestProp_AllAdmittedCausesReproduced(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		symptom := rapid.SampledFrom([]string{"n0", "n1", "n2"}).Draw(t, "symptom")
		edges := genEdges(t)
		chain, err := causedby.Trace(symptom, edges)
		if err != nil {
			return
		}
		root := symptom
		if len(chain.Causes) > 0 {
			root = chain.Causes[len(chain.Causes)-1]
		}
		tree, buildErr := whytree.Build(whytree.Input{
			Symptom:       symptom,
			Provenance:    whytree.FromIncident,
			Edges:         edges,
			Reproductions: reproduceAll(),
			Terminal:      whytree.TerminalMirror{MirrorID: "m1", ReflectsRootCause: root},
		})
		if buildErr != nil {
			return
		}
		for _, c := range tree.Causes {
			if !c.Reproduced {
				t.Fatalf("admitted cause %q is not reproduced", c.CauseID)
			}
		}
	})
}

// TestProp_NoMirrorRefused: an empty terminal MirrorID always refuses. (WHYTREE_NO_MIRROR)
func TestProp_NoMirrorRefused(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		symptom := rapid.SampledFrom([]string{"n0", "n1", "n2"}).Draw(t, "symptom")
		edges := genEdges(t)
		_, err := whytree.Build(whytree.Input{
			Symptom:       symptom,
			Provenance:    whytree.FromMirror,
			Edges:         edges,
			Reproductions: reproduceAll(),
			Terminal:      whytree.TerminalMirror{}, // no mirror
		})
		// Either a cycle or the no-mirror refusal — never a success (a tree with no mirror).
		if err == nil {
			t.Fatal("a WhyTree with no terminal mirror must never build")
		}
	})
}

// TestProp_RoundTripContentAddressed: SerializeBody/Record round-trips; same tree ⇒ same version.
func TestProp_RoundTripContentAddressed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		symptom := rapid.SampledFrom([]string{"n0", "n1", "n2"}).Draw(t, "symptom")
		edges := genEdges(t)
		chain, err := causedby.Trace(symptom, edges)
		if err != nil {
			return
		}
		root := symptom
		if len(chain.Causes) > 0 {
			root = chain.Causes[len(chain.Causes)-1]
		}
		tree, buildErr := whytree.Build(whytree.Input{
			Symptom:       symptom,
			Provenance:    whytree.FromMirror,
			Edges:         edges,
			Reproductions: reproduceAll(),
			Terminal:      whytree.TerminalMirror{MirrorID: "m1", ReflectsRootCause: root},
		})
		if buildErr != nil {
			return
		}
		r1, e1 := whytree.Record(tree)
		r2, e2 := whytree.Record(tree)
		if e1 != nil || e2 != nil {
			t.Fatalf("Record errored: %v / %v", e1, e2)
		}
		if r1.Version != r2.Version {
			t.Fatalf("same tree ⇒ same version, got %q vs %q", r1.Version, r2.Version)
		}
		if r1.ID != r1.Version {
			t.Fatalf("content-address invariant: id %q != version %q", r1.ID, r1.Version)
		}
		back, perr := whytree.ParseBody(r1.Body)
		if perr != nil {
			t.Fatalf("ParseBody: %v", perr)
		}
		if back.Symptom != tree.Symptom || back.RootCause != tree.RootCause {
			t.Fatalf("round-trip lost data")
		}
	})
}
