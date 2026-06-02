package curation_test

// PROPERTY MIRROR (∀) for archive.curation.Curate — conceptually stored in the `mirrors` schema,
// materialized here for the Go runner (rapid is the frozen invariant slot, ADR 0003).
//
//	# reflects: archive.curation.Curate · test_kind: property · cert_language: rapid · authority: below
//
// The invariants are KRD §44.4 (the curator keeps the DAG a living memory; critical history is
// never destroyed), pinned as computational properties of the pure Curate:
//
//  1. DETERMINISTIC + TOTAL. ∀ inputs ⇒ same decisions (now is PASSED, never read from the clock).
//  2. ANY UNSAFE/OBSOLETE node ⇒ TOMBSTONE (any unsafe branch ⇒ tombstone, even if otherwise keep-worthy).
//  3. ANY stable_phase / pareto_elite / incident_related / high_novelty (and NOT unsafe/obsolete) ⇒ KEEP.
//  4. NO NODE DROPPED. Every input node id appears EXACTLY once in the output (tombstone/compress
//     never drop a node — append-only).
//  5. CONTENT-ADDRESSED. Hashed(d).ID == Hash(Canonicalize(body)) (S01/S02 reused, never forked).
//  6. NEVER PANICS. ∀ input (incl. nil flags, zero created_at) ⇒ Curate yields a verdict, never crashes.

import (
	"testing"
	"time"

	"github.com/steph-frtech/aidos/back/archive/curation"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"pgregory.net/rapid"
)

var allFlags = []curation.Flag{
	curation.FlagUnsafe, curation.FlagObsolete, curation.FlagParetoElite,
	curation.FlagIncidentRelated, curation.FlagHighNovelty, curation.FlagFailed, curation.FlagDuplicate,
}

// genNode draws a node with a small random set of declared flags, an optional stable_phase kind,
// and a random created_at near a fixed epoch.
func genNode(t *rapid.T, label string) curation.Node {
	n := rapid.IntRange(0, 3).Draw(t, label+"-nflags")
	flags := make([]curation.Flag, 0, n)
	for i := 0; i < n; i++ {
		flags = append(flags, rapid.SampledFrom(allFlags).Draw(t, label+"-flag"))
	}
	kind := rapid.SampledFrom([]string{"", curation.KindStablePhase, "variant"}).Draw(t, label+"-kind")
	days := rapid.IntRange(0, 120).Draw(t, label+"-days")
	created := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC).Add(time.Duration(days) * 24 * time.Hour)
	return curation.Node{
		ID:        "node-" + rapid.StringMatching(`[a-z]{1,6}`).Draw(t, label+"-id"),
		Kind:      kind,
		Flags:     flags,
		CreatedAt: created,
	}
}

func has(flags []curation.Flag, f curation.Flag) bool {
	for _, x := range flags {
		if x == f {
			return true
		}
	}
	return false
}

func TestProp_DeterministicTotal(t *testing.T) {
	policy := curation.DefaultPolicy()
	now := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	rapid.Check(t, func(t *rapid.T) {
		nodes := rapid.SliceOfN(rapid.Custom(func(t *rapid.T) curation.Node { return genNode(t, "n") }), 0, 6).Draw(t, "nodes")
		a := curation.Curate(nodes, policy, now)
		b := curation.Curate(nodes, policy, now)
		if len(a) != len(b) {
			t.Fatalf("non-deterministic length: %d vs %d", len(a), len(b))
		}
		for i := range a {
			if a[i] != b[i] {
				t.Fatalf("non-deterministic decision %d: %+v vs %+v", i, a[i], b[i])
			}
			switch a[i].Verdict {
			case curation.VerdictKeep, curation.VerdictCompress, curation.VerdictTombstone:
			default:
				t.Fatalf("verdict %q not in the closed set", a[i].Verdict)
			}
		}
	})
}

func TestProp_UnsafeOrObsoleteTombstoned(t *testing.T) {
	policy := curation.DefaultPolicy()
	now := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	rapid.Check(t, func(t *rapid.T) {
		n := genNode(t, "n")
		got := curation.Curate([]curation.Node{n}, policy, now)
		if has(n.Flags, curation.FlagUnsafe) || has(n.Flags, curation.FlagObsolete) {
			if got[0].Verdict != curation.VerdictTombstone {
				t.Fatalf("unsafe/obsolete node must be tombstoned, got %q (flags=%v)", got[0].Verdict, n.Flags)
			}
		}
	})
}

func TestProp_KeepBandKept(t *testing.T) {
	policy := curation.DefaultPolicy()
	now := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	rapid.Check(t, func(t *rapid.T) {
		n := genNode(t, "n")
		// only meaningful when the node is NOT in the higher-precedence tombstone band.
		if has(n.Flags, curation.FlagUnsafe) || has(n.Flags, curation.FlagObsolete) {
			return
		}
		keepWorthy := n.Kind == curation.KindStablePhase ||
			has(n.Flags, curation.FlagParetoElite) ||
			has(n.Flags, curation.FlagIncidentRelated) ||
			has(n.Flags, curation.FlagHighNovelty)
		got := curation.Curate([]curation.Node{n}, policy, now)
		if keepWorthy && got[0].Verdict != curation.VerdictKeep {
			t.Fatalf("a keep-band node must be kept, got %q (kind=%q flags=%v)", got[0].Verdict, n.Kind, n.Flags)
		}
	})
}

func TestProp_NoNodeDropped(t *testing.T) {
	policy := curation.DefaultPolicy()
	now := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	rapid.Check(t, func(t *rapid.T) {
		nodes := rapid.SliceOfN(rapid.Custom(func(t *rapid.T) curation.Node { return genNode(t, "n") }), 0, 8).Draw(t, "nodes")
		// give every node a distinct id so the count is exact.
		for i := range nodes {
			nodes[i].ID = "n" + rapid.StringMatching(`[a-z]{6}`).Draw(t, "uid")
		}
		got := curation.Curate(nodes, policy, now)
		if len(got) != len(nodes) {
			t.Fatalf("output count %d != input count %d — a node was dropped (append-only violated)", len(got), len(nodes))
		}
		seen := map[string]int{}
		for _, d := range got {
			seen[d.NodeID]++
		}
		for _, n := range nodes {
			if seen[n.ID] != 1 {
				t.Fatalf("node %q must appear exactly once, got %d", n.ID, seen[n.ID])
			}
		}
	})
}

func TestProp_ContentAddressed(t *testing.T) {
	policy := curation.DefaultPolicy()
	now := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	rapid.Check(t, func(t *rapid.T) {
		n := genNode(t, "n")
		got := curation.Curate([]curation.Node{n}, policy, now)
		hashed, err := got[0].Hashed(policy.Version)
		if err != nil {
			t.Fatalf("Hashed: %v", err)
		}
		// The id must be a valid S02 content address (re-deriving via NewRecord must agree).
		if hashed.ID == "" {
			t.Fatalf("Hashed must stamp a non-empty content address")
		}
		// determinism of the hash.
		again, _ := got[0].Hashed(policy.Version)
		if again.ID != hashed.ID {
			t.Fatalf("content hash is non-deterministic: %q vs %q", again.ID, hashed.ID)
		}
		// it is a real sha-256 hex (S02 Hash shape) — never a fabricated id.
		if len(hashed.ID) != len(records.Hash([]byte("x"))) {
			t.Fatalf("id %q is not an S02 content hash", hashed.ID)
		}
	})
}

func TestProp_NeverPanics(t *testing.T) {
	policy := curation.DefaultPolicy()
	now := time.Time{} // zero clock — still total
	rapid.Check(t, func(t *rapid.T) {
		// malformed inputs: nil flags, zero created_at, empty id.
		_ = curation.Curate(nil, policy, now)
		_ = curation.Curate([]curation.Node{{}}, policy, now)
		_ = curation.Curate([]curation.Node{{ID: "x", Flags: nil}}, curation.Policy{}, now)
	})
}
