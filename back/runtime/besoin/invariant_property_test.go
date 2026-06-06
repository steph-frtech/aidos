package besoin

// invariant_property_test.go — EL14 reproducibility mirror (rapid, N1): the lateral band's pure
// functions are DETERMINISTIC (CLAUDE.md §6/§8 determinism-first). Same input → same output, no
// clock/rng/IO/LLM. The properties pin the EL14 done-criteria:
//
//   - an invariant attached at a SOURCE rung L laterally constrains L AND every rung ABOVE L
//     (CrossedLevels is the upward cross-product — "true on all paths");
//   - an ∃ (a single example) is REFUSED (IsForallStatement false → ParseInvariantBand errors with
//     INVARIANT_IS_EXAMPLE_NOT_FORALL); a ∀ is accepted;
//   - RecordInvariant is deterministic (same args → byte-identical InvariantResult body), and the
//     circularity ban (selfAuthored) always refuses, never records;
//   - a POLICY band emits AT MOST ONE Idea{Proposes:policy} (never two, never one for a ∀ invariant);
//   - a refused turn leaves the graph_hash UNCHANGED (no record);
//   - CrossedLevels is sorted, de-duplicated and stable.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
	"pgregory.net/rapid"
)

// bandMeta is a fixed complete (verifiable) metadata so the band records rather than routing to /spike.
func bandMeta() Metadata {
	return Metadata{
		TruthKind:     truthtyping.KindBehavioral,
		Verifiability: truthtyping.LevelDeterministic,
		Scope:         scope.TruthScope{Region: scope.RegionGlobal},
	}
}

// genSourceRung draws one of the 7 SOURCE rungs.
func genSourceRung(t *rapid.T) Level {
	rungs := Levels()
	return rungs[rapid.IntRange(0, len(rungs)-1).Draw(t, "rung")]
}

// TestCrossedLevels_ConstrainsEveryRungAbove pins the LATERAL constraint: an invariant attached at L
// constrains L and every SOURCE rung strictly above L. This is the EL14 done-criterion "invariant
// constrained laterally": an invariant on `operation` also constrains action/control/view/journey/product.
func TestCrossedLevels_ConstrainsEveryRungAbove(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		attached := genSourceRung(t)
		band := InvariantBand{
			Statement:      "pour tout chemin, P implique Q",
			AttachedLevels: []Level{attached},
			Kind:           InvariantPathIndependent,
		}
		idx := sourceIndex(attached)
		// Every rung at or above the attached rung must be constrained.
		for i := 0; i <= idx; i++ {
			if !ConstrainsLevel(band, sourceOrder[i]) {
				t.Fatalf("attached at %q: expected %q (above/at) to be constrained", attached, sourceOrder[i])
			}
		}
		// Every rung strictly BELOW must NOT be constrained.
		for i := idx + 1; i < len(sourceOrder); i++ {
			if ConstrainsLevel(band, sourceOrder[i]) {
				t.Fatalf("attached at %q: %q (below) must NOT be constrained", attached, sourceOrder[i])
			}
		}
	})
}

// TestCrossedLevels_DeterministicSortedDeduped pins CrossedLevels is a deterministic, sorted,
// de-duplicated cross-product (re-running yields the identical slice).
func TestCrossedLevels_DeterministicSortedDeduped(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		n := rapid.IntRange(1, 3).Draw(t, "nAttached")
		var attached []Level
		for i := 0; i < n; i++ {
			attached = append(attached, genSourceRung(t))
		}
		band := InvariantBand{Statement: "toujours P", AttachedLevels: attached, Kind: InvariantPathIndependent}
		a := CrossedLevels(band)
		b := CrossedLevels(band)
		if len(a) != len(b) {
			t.Fatalf("CrossedLevels not deterministic: %v vs %v", a, b)
		}
		for i := range a {
			if a[i] != b[i] {
				t.Fatalf("CrossedLevels not deterministic at %d: %v vs %v", i, a, b)
			}
			if i > 0 && levelRank(a[i-1]) >= levelRank(a[i]) {
				t.Fatalf("CrossedLevels not strictly sorted/deduped: %v", a)
			}
		}
	})
}

// TestForall_AcceptsUniversalRefusesExample pins the ∃-vs-∀ gate: a universal-marked statement is a
// forall; an example-marked statement is NOT — the EL14 done-criterion "∃-au-lieu-de-∀ refusé".
func TestForall_AcceptsUniversalRefusesExample(t *testing.T) {
	universals := []string{
		"pour tout utilisateur, le solde reste positif",
		"toujours, P implique Q",
		"the total is never negative",
		"∀ x, f(x) > 0",
		"every order has a customer",
	}
	for _, s := range universals {
		if !IsForallStatement(s) {
			t.Fatalf("expected %q to be a forall", s)
		}
	}
	examples := []string{
		"par exemple, la commande #12 est payée",
		"for example, order 7 is shipped",
		"une fois, le paiement a échoué",
		"the cart had 3 items",           // no universal marker
		"toujours par exemple ce cas-ci", // universal marker BUT an example phrasing → refused
	}
	for _, s := range examples {
		if IsForallStatement(s) {
			t.Fatalf("expected %q to be an example (∃), not a forall", s)
		}
	}
}

// TestParseInvariantBand_RefusesExample pins that ParseInvariantBand HARD-refuses an ∃ with the EL14
// code, and accepts a ∀ attached to a valid rung.
func TestParseInvariantBand_RefusesExample(t *testing.T) {
	_, err := ParseInvariantBand(map[string]any{
		"statement":       "par exemple la commande #3 est payée",
		"attached_levels": []any{"operation"},
	})
	if err == nil {
		t.Fatal("expected an ∃ to be refused")
	}
	if blockCode := bandCodeOf(err); string(blockCode) != string(CodeInvariantIsExample) {
		t.Fatalf("expected %q, got %q", CodeInvariantIsExample, blockCode)
	}
	band, err := ParseInvariantBand(map[string]any{
		"statement":       "pour tout paiement, le solde reste positif",
		"attached_levels": []any{"operation"},
	})
	if err != nil {
		t.Fatalf("expected a ∀ to parse, got %v", err)
	}
	if band.Kind != InvariantPathIndependent {
		t.Fatalf("expected path_independent, got %q", band.Kind)
	}
}

// TestRecordInvariant_Deterministic pins RecordInvariant is deterministic: same args → identical
// result body (the reproducibility property).
func TestRecordInvariant_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		g := NewGraph("p")
		statement := rapid.SampledFrom([]string{
			"pour tout chemin P implique Q",
			"par exemple le cas #3", // an ∃ → refused (still deterministic)
			"toujours non négatif",
		}).Draw(t, "statement")
		body := map[string]any{"statement": statement, "attached_levels": []any{"operation"}}
		r1 := RecordInvariant(g, body, "verbatim", false, bandMeta())
		r2 := RecordInvariant(g, body, "verbatim", false, bandMeta())
		if string(canonicalJSON(r1)) != string(canonicalJSON(r2)) {
			t.Fatalf("RecordInvariant not deterministic:\n%s\n%s", canonicalJSON(r1), canonicalJSON(r2))
		}
	})
}

// TestRecordInvariant_CircularityBanAlwaysRefuses pins the §8 circularity ban: a self-authored
// invariant is ALWAYS refused and NEVER records (the graph is unchanged).
func TestRecordInvariant_CircularityBanAlwaysRefuses(t *testing.T) {
	g := NewGraph("p")
	hashBefore, _ := g.Hash()
	res := RecordInvariant(g, map[string]any{
		"statement":       "pour tout P, Q",
		"attached_levels": []any{"operation"},
	}, "verbatim", true /* selfAuthored */, bandMeta())
	if res.Recorded {
		t.Fatal("a self-authored invariant must NOT record (circularity ban §8)")
	}
	if res.Routing != RouteOffAltitude {
		t.Fatalf("expected off_altitude routing, got %q", res.Routing)
	}
	if res.BlockReason == nil || string(res.BlockReason.Code) != string(CodeInvariantCircular) {
		t.Fatalf("expected INVARIANT_CIRCULAR_SELF_AUTHORED, got %+v", res.BlockReason)
	}
	hashAfter, _ := res.Graph.Hash()
	if hashBefore != hashAfter {
		t.Fatal("circularity-banned turn must leave the graph_hash unchanged")
	}
}

// TestRecordInvariant_AtMostOnePolicyIdea pins the EL14 done-criterion "au plus une Idea{policy}": a
// policy band emits exactly ONE Idea{Proposes:policy}; a path-independent invariant emits NONE (NoEmit).
func TestRecordInvariant_AtMostOnePolicyIdea(t *testing.T) {
	g := NewGraph("p")

	// A POLICY band → exactly one Idea{Proposes:policy}, provenance human, verbatim, content-addressed.
	policyRes := RecordInvariant(g, map[string]any{
		"statement":       "pour tout utilisateur non-admin, l'opération de remboursement est interdite",
		"attached_levels": []any{"operation"},
		"kind":            "policy",
		"rule":            "non-admin ne peut pas rembourser",
	}, "je veux que seuls les admins remboursent", false, bandMeta())
	if !policyRes.Recorded {
		t.Fatalf("expected the policy band to record, got %+v", policyRes.BlockReason)
	}
	if policyRes.PolicyIdea == nil {
		t.Fatal("a policy band must emit exactly ONE Idea{Proposes:policy}")
	}
	if policyRes.PolicyIdea.Proposes != ideas.ProposesPolicy {
		t.Fatalf("expected Proposes policy, got %q", policyRes.PolicyIdea.Proposes)
	}
	if policyRes.PolicyIdea.Provenance.Source != ideas.ProvenanceHuman {
		t.Fatalf("expected provenance human, got %q", policyRes.PolicyIdea.Provenance.Source)
	}
	if policyRes.PolicyIdea.Provenance.Detail != "je veux que seuls les admins remboursent" {
		t.Fatalf("expected verbatim utterance, got %q", policyRes.PolicyIdea.Provenance.Detail)
	}
	if policyRes.PolicyIdea.ID == "" {
		t.Fatal("the policy idea must be content-addressed")
	}

	// A path-independent invariant → NO Idea (NoEmit; an invariant's mirror is a property N1).
	invRes := RecordInvariant(g, map[string]any{
		"statement":       "pour tout chemin, le solde reste ≥ 0",
		"attached_levels": []any{"operation"},
		"kind":            "path_independent",
	}, "le solde ne descend jamais sous zéro", false, bandMeta())
	if !invRes.Recorded {
		t.Fatalf("expected the invariant band to record, got %+v", invRes.BlockReason)
	}
	if invRes.PolicyIdea != nil {
		t.Fatal("a path-independent invariant must emit NO Idea (NoEmit)")
	}
}

// TestParseInvariantBand_BadAttachmentRefused pins that a policy band cannot attach to a rung outside
// its AttachableTo (policy → operation/entity only); the refusal is hard, never a silent coercion.
func TestParseInvariantBand_BadAttachmentRefused(t *testing.T) {
	_, err := ParseInvariantBand(map[string]any{
		"statement":       "pour tout, P",
		"attached_levels": []any{"product"}, // policy may NOT attach to product.
		"kind":            "policy",
	})
	if err == nil {
		t.Fatal("expected a policy attaching to product to be refused")
	}
	if string(bandCodeOf(err)) != string(CodeInvariantBadAttachment) {
		t.Fatalf("expected INVARIANT_BAD_ATTACHMENT, got %q", bandCodeOf(err))
	}
}
