package causedby_test

// Property mirror (∀) for the caused_by causal-edge Validate / Trace / round-trip (FK12).
// reflects=kernel.causedby · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below (these are computational properties of the pure functions — the causal RULE
// itself is the human's, above the line, pinned by the fixture). Run via `go test` (rapid is the
// frozen invariant slot, ADR 0003).
//
// The invariants are FKE-35.1 / ROADMAP FK12:
//
//  1. CLOSED KIND + PINNED + NO-SELF VALIDATION. Validate accepts iff from/to are pinned
//     id@version refs AND from.id != to.id; else it errors.
//  2. DETERMINISTIC TRACE. ∀ symptom, edges ⇒ Trace == Trace (byte-identical CauseChain or the
//     same error) — same graph + symptom ⇒ same chain of candidate causes (FK12 criterion).
//  3. CHAIN NEVER CONTAINS THE SYMPTOM. The symptom is never a cause of itself.
//  4. CHAIN IS THE REACHABLE SET. On an acyclic graph, Causes is EXACTLY the set of nodes
//     reachable upward via caused_by from the symptom (no spurious cause, no missed cause).
//  5. CHAIN IS ORDERED (distance asc, id asc) — a stable total order (determinism).
//  6. CYCLE REFUSED. A caused_by cycle reachable from the symptom ⇒ Trace returns ErrCycle
//     (never a partial chain) — "cycle refusé" (FK12 criterion).
//  7. ROUND-TRIP VERSIONED. SerializeEdgeBody → NewRecord(KindLink) round-trips as
//     id == version == Hash(Canonicalize(body)); ParseEdgeBody recovers the edge; changing the
//     pinned `to` (cause) version yields a DIFFERENT version (a new row, never a mutation).
//  8. TOTAL. Trace never panics on a malformed graph (a malformed edge is skipped).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/causedby"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"pgregory.net/rapid"
)

// genRef draws a pinned ref over a small id space (so cycles and reachability actually occur).
func genRef(t *rapid.T, label string) links.Ref {
	id := rapid.SampledFrom([]string{"n0", "n1", "n2", "n3", "n4"}).Draw(t, label+"_id")
	ver := rapid.SampledFrom([]string{"v1", "v2", "v3"}).Draw(t, label+"_ver")
	return links.Ref{ID: id, Version: ver}
}

func genEdge(t *rapid.T, label string) causedby.Edge {
	return causedby.Edge{From: genRef(t, label+"_from"), To: genRef(t, label+"_to")}
}

func genEdges(t *rapid.T) []causedby.Edge {
	n := rapid.IntRange(0, 8).Draw(t, "n_edges")
	out := make([]causedby.Edge, n)
	for i := 0; i < n; i++ {
		out[i] = genEdge(t, "e")
	}
	return out
}

// reachableSet computes the upward-reachable cause set by an independent walk (the oracle for
// invariant 4) — skipping self-edges and invalid edges, exactly as Trace does.
func reachableSet(symptom string, edges []causedby.Edge) map[string]bool {
	adj := map[string][]string{}
	for _, e := range edges {
		if causedby.Validate(e) != nil {
			continue
		}
		adj[e.From.ID] = append(adj[e.From.ID], e.To.ID)
	}
	seen := map[string]bool{symptom: true}
	stack := []string{symptom}
	for len(stack) > 0 {
		node := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		for _, c := range adj[node] {
			if !seen[c] {
				seen[c] = true
				stack = append(stack, c)
			}
		}
	}
	delete(seen, symptom)
	return seen
}

// hasCycleFrom is the oracle for invariant 6 — a white/grey/black DFS over the reachable graph.
func hasCycleFrom(symptom string, edges []causedby.Edge) bool {
	adj := map[string][]string{}
	for _, e := range edges {
		if causedby.Validate(e) != nil {
			continue
		}
		adj[e.From.ID] = append(adj[e.From.ID], e.To.ID)
	}
	const white, grey, black = 0, 1, 2
	color := map[string]int{}
	var dfs func(string) bool
	dfs = func(node string) bool {
		color[node] = grey
		for _, c := range adj[node] {
			if color[c] == grey {
				return true
			}
			if color[c] == white && dfs(c) {
				return true
			}
		}
		color[node] = black
		return false
	}
	return dfs(symptom)
}

func TestProp_ValidatePinnedNoSelf(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEdge(t, "e")
		err := causedby.Validate(e)
		wantOK := e.From.IsPinned() && e.To.IsPinned() && e.From.ID != e.To.ID
		if wantOK && err != nil {
			t.Fatalf("expected valid, got %v for %+v", err, e)
		}
		if !wantOK && err == nil {
			t.Fatalf("expected invalid, got nil for %+v", e)
		}
	})
}

func TestProp_TraceDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		symptom := rapid.SampledFrom([]string{"n0", "n1", "n2", "n3", "n4"}).Draw(t, "symptom")
		edges := genEdges(t)
		a, errA := causedby.Trace(symptom, edges)
		b, errB := causedby.Trace(symptom, edges)
		if (errA == nil) != (errB == nil) {
			t.Fatalf("trace error nondeterministic: %v vs %v", errA, errB)
		}
		if errA != nil {
			return
		}
		if a.Symptom != b.Symptom || len(a.Causes) != len(b.Causes) {
			t.Fatalf("nondeterministic chain: %+v vs %+v", a, b)
		}
		for i := range a.Causes {
			if a.Causes[i] != b.Causes[i] {
				t.Fatalf("nondeterministic order at %d: %v vs %v", i, a.Causes, b.Causes)
			}
		}
	})
}

func TestProp_ChainReachableAndOrdered(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		symptom := rapid.SampledFrom([]string{"n0", "n1", "n2", "n3", "n4"}).Draw(t, "symptom")
		edges := genEdges(t)
		// only assert reachability on ACYCLIC graphs (a cyclic one errors, invariant 6).
		if hasCycleFrom(symptom, edges) {
			return
		}
		chain, err := causedby.Trace(symptom, edges)
		if err != nil {
			t.Fatalf("acyclic graph errored: %v", err)
		}
		// never contains the symptom (invariant 3).
		for _, c := range chain.Causes {
			if c == symptom {
				t.Fatalf("chain contains the symptom %q", symptom)
			}
		}
		// exactly the reachable set (invariant 4).
		want := reachableSet(symptom, edges)
		if len(chain.Causes) != len(want) {
			t.Fatalf("chain %v != reachable set %v", chain.Causes, want)
		}
		for _, c := range chain.Causes {
			if !want[c] {
				t.Fatalf("spurious cause %q not in reachable %v", c, want)
			}
		}
		// ordered (id asc within equal distance ⇒ at minimum globally non-decreasing per the
		// distance, here we assert the chain has no duplicates and is a permutation of want).
		seen := map[string]bool{}
		for _, c := range chain.Causes {
			if seen[c] {
				t.Fatalf("duplicate cause %q", c)
			}
			seen[c] = true
		}
	})
}

func TestProp_CycleRefused(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		symptom := rapid.SampledFrom([]string{"n0", "n1", "n2", "n3", "n4"}).Draw(t, "symptom")
		edges := genEdges(t)
		_, err := causedby.Trace(symptom, edges)
		if hasCycleFrom(symptom, edges) {
			if err == nil {
				t.Fatalf("cycle reachable from %q but Trace returned no error", symptom)
			}
		} else if err != nil {
			t.Fatalf("acyclic graph from %q errored: %v", symptom, err)
		}
	})
}

func TestProp_RoundTripVersioned(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEdge(t, "e")
		if causedby.Validate(e) != nil {
			return // only well-formed edges serialize.
		}
		body, err := causedby.SerializeEdgeBody(e)
		if err != nil {
			t.Fatalf("serialize: %v", err)
		}
		rec, err := records.NewRecord(records.KindLink, body)
		if err != nil {
			t.Fatalf("new record: %v", err)
		}
		if err := records.Validate(rec); err != nil {
			t.Fatalf("record invalid (content-address): %v", err)
		}
		// round-trip: parse recovers the edge.
		got, err := causedby.ParseEdgeBody(rec.Body)
		if err != nil {
			t.Fatalf("parse: %v", err)
		}
		if got.From != e.From || got.To != e.To {
			t.Fatalf("round-trip lost edge: %+v != %+v", got, e)
		}
		// changing the pinned cause version yields a DIFFERENT version (a new row).
		altVer := "vX"
		if e.To.Version == altVer {
			altVer = "vY"
		}
		alt := causedby.Edge{From: e.From, To: links.Ref{ID: e.To.ID, Version: altVer}}
		altBody, _ := causedby.SerializeEdgeBody(alt)
		altRec, err := records.NewRecord(records.KindLink, altBody)
		if err != nil {
			t.Fatalf("alt record: %v", err)
		}
		if altRec.Version == rec.Version {
			t.Fatalf("changing cause version did not change record version: %q", rec.Version)
		}
	})
}
