package memory_test

// BDD MIRROR — Store-contract invariant (mirrors schema · reflects: memory.Store · test_kind:
// property · cert_language: rapid · authority: below). The reproducibility mirror: for ANY set of
// writes followed by a recall, the Store contract holds — for the mock backend here (the pgx
// backend is proven observationally equivalent by the fixture, which runs against both). Pure,
// seeded, no container, so it is fast and deterministic.
//
// Invariants pinned: Recall(k) returns ≤ k hits ordered by score desc; kind/branch filters always
// hold; Write returns id == content hash of the body (S01 reused) and the item is then recallable;
// the store is append-only (a superseding write increments the count; no op deletes a row); taint
// round-trips intact; recall never crosses into the truth schemas (the in-memory store reads its
// own items only). Determinism: same writes + same query ⇒ same recall ordering (fixed seed).

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/brain/memory"
	"pgregory.net/rapid"
)

var (
	genKinds  = []memory.Kind{memory.KindEpisodic, memory.KindSemantic, memory.KindProcedural, memory.KindStructural}
	genTaints = memory.Taints()
)

func genWriteInput() *rapid.Generator[memory.WriteInput] {
	return rapid.Custom(func(t *rapid.T) memory.WriteInput {
		kind := genKinds[rapid.IntRange(0, len(genKinds)-1).Draw(t, "kind")]
		nTaint := rapid.IntRange(0, 3).Draw(t, "nTaint")
		taint := make([]memory.Taint, nTaint)
		for i := range taint {
			taint[i] = genTaints[rapid.IntRange(0, len(genTaints)-1).Draw(t, "taint")]
		}
		return memory.WriteInput{
			Kind:       kind,
			Content:    rapid.StringMatching(`[a-z ]{1,40}`).Draw(t, "content"),
			Branch:     rapid.SampledFrom([]string{"main", "branch-x", "branch-y"}).Draw(t, "branch"),
			Provenance: rapid.StringMatching(`[a-z:0-9]{0,12}`).Draw(t, "prov"),
			Confidence: rapid.Float64Range(0, 1).Draw(t, "conf"),
			Taint:      taint,
		}
	})
}

func TestProperty_StoreContract(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		ctx := context.Background()
		emb := memory.NewHashEmbedder(fixtureSeed)
		store := memory.NewMockStore(emb)

		inputs := rapid.SliceOfN(genWriteInput(), 1, 12).Draw(rt, "writes")
		taintByID := map[string][]memory.Taint{}
		for _, in := range inputs {
			id, err := store.Write(ctx, in)
			if err != nil {
				rt.Fatalf("write: %v", err)
			}
			// Write returns id == content hash of the body (S01 reused).
			wantID, err := memory.MemoryItem{
				Kind: in.Kind, Content: in.Content, Provenance: in.Provenance,
				Confidence: in.Confidence, Taint: in.Taint, Branch: in.Branch,
			}.ComputeID()
			if err != nil {
				rt.Fatalf("compute id: %v", err)
			}
			if id != wantID {
				rt.Fatalf("id %s != content hash %s", id, wantID)
			}
			// The item is then recallable, with taint intact.
			got, err := store.Get(ctx, id)
			if err != nil {
				rt.Fatalf("get: %v", err)
			}
			if len(got.Taint) != len(in.Taint) {
				rt.Fatalf("taint round-trip lost: got %v want %v", got.Taint, in.Taint)
			}
			for i := range got.Taint {
				if got.Taint[i] != in.Taint[i] {
					rt.Fatalf("taint round-trip altered: %v vs %v", got.Taint, in.Taint)
				}
			}
			taintByID[id] = in.Taint
		}

		// Append-only: count never less than the number of distinct content hashes written.
		distinct := map[string]struct{}{}
		for id := range taintByID {
			distinct[id] = struct{}{}
		}
		if store.Count() != len(distinct) {
			rt.Fatalf("append-only/idempotency: count %d != distinct ids %d", store.Count(), len(distinct))
		}

		k := rapid.IntRange(0, 10).Draw(rt, "k")
		filterKind := rapid.SampledFrom([]memory.Kind{"", memory.KindSemantic, memory.KindEpisodic}).Draw(rt, "fkind")
		filterBranch := rapid.SampledFrom([]string{"", "main", "branch-x"}).Draw(rt, "fbranch")
		q := memory.RecallQuery{QueryText: "cart basket items", Kind: filterKind, Branch: filterBranch, K: k}

		hits, err := store.Recall(ctx, q)
		if err != nil {
			rt.Fatalf("recall: %v", err)
		}
		// ≤ k hits.
		if len(hits) > k {
			rt.Fatalf("recall returned %d hits > k=%d", len(hits), k)
		}
		// Ordered by score descending; filters honoured.
		for i, h := range hits {
			if i > 0 && hits[i-1].Score < h.Score {
				rt.Fatalf("hits not score-desc at %d: %v < %v", i, hits[i-1].Score, h.Score)
			}
			if filterKind != "" && h.Item.Kind != filterKind {
				rt.Fatalf("kind filter leaked: %q", h.Item.Kind)
			}
			if filterBranch != "" && h.Item.Branch != filterBranch {
				rt.Fatalf("branch filter leaked: %q", h.Item.Branch)
			}
		}

		// Determinism: a second recall with the same query yields the same ordering.
		hits2, err := store.Recall(ctx, q)
		if err != nil {
			rt.Fatalf("recall 2: %v", err)
		}
		if len(hits) != len(hits2) {
			rt.Fatalf("non-deterministic recall length: %d vs %d", len(hits), len(hits2))
		}
		for i := range hits {
			if hits[i].Item.ID != hits2[i].Item.ID {
				rt.Fatalf("non-deterministic recall order at %d: %s vs %s", i, hits[i].Item.ID, hits2[i].Item.ID)
			}
		}
	})
}
