package ref_test

// Property mirror (∀ invariants, rapid). reflects=kernel.entities.ref.{ID,Body,Parse,Resolve},
// test_kind=property, cert_language=rapid, liveness=live, authority=below (computational
// — MEANS-tests toward the human red, not new truths the agent grades).
//
// The invariants (S71 spec):
//  1. ROUND-TRIP — Parse(Body(r)) preserves r; ID(Parse(Body(r))) == ID(r) (the relation
//     round-trips as a content-addressed AST — THE done-criterion).
//  2. CONTENT-ADDRESSED — id == Hash(Canonicalize(body)); any byte change ⇒ new version.
//  3. DETERMINISM — ID(r) == ID(r) (no clock/RNG/map-order; same input → same output).
//  4. CLOSED SETS — every drawn cardinality/semantic is a member of the declared set;
//     a token outside it is refused, never defaulted.
//  5. UNKNOWN TARGET REFUSED — a relation to an entity NOT in the declared set is an
//     ErrUnknownTarget (UNKNOWN_RELATION_TARGET), never a guessed resolution.
//  6. SCALAR SET UNTOUCHED — a relation carries no scalar Type; the closed scalar set
//     of S35 is not widened by the existence of a relation node.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"pgregory.net/rapid"
)

// genRelation draws a well-shaped relation: a non-empty name + target over the closed
// cardinality and semantic sets. The target name is whatever the generator draws — the
// resolution properties check it is REFUSED unless declared.
func genRelation(t *rapid.T) ref.Relation {
	name := rapid.StringMatching(`[a-z][a-z0-9_]{0,7}`).Draw(t, "name")
	target := rapid.StringMatching(`[A-Z][A-Za-z0-9]{0,7}`).Draw(t, "target")
	cards := ref.Cardinalities()
	sems := ref.Semantics()
	return ref.Relation{
		Name:        name,
		Target:      target,
		Cardinality: cards[rapid.IntRange(0, len(cards)-1).Draw(t, "card")],
		Semantic:    sems[rapid.IntRange(0, len(sems)-1).Draw(t, "sem")],
		Required:    rapid.Bool().Draw(t, "req"),
	}
}

// 1. ROUND-TRIP — Parse(Body(r)) preserves r; ID round-trips. THE done-criterion.
func TestProp_RoundTrip(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		r := genRelation(rt)
		body, err := ref.Body(r)
		if err != nil {
			rt.Fatalf("Body: %v", err)
		}
		got, err := ref.Parse(body)
		if err != nil {
			rt.Fatalf("Parse: %v", err)
		}
		if got != r {
			rt.Fatalf("round-trip changed the relation: %+v != %+v", got, r)
		}
		id1, _ := ref.ID(r)
		id2, _ := ref.ID(got)
		if id1 != id2 {
			rt.Fatalf("ID(Parse(Body(r))) != ID(r): %q != %q", id2, id1)
		}
	})
}

// 2. CONTENT-ADDRESSED — id == Hash(Canonicalize(body)); a byte change ⇒ new version.
func TestProp_ContentAddressed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		r := genRelation(rt)
		id, err := ref.ID(r)
		if err != nil {
			rt.Fatalf("ID: %v", err)
		}
		body, _ := ref.Body(r)
		if id != records.Hash(body) {
			rt.Fatalf("id != Hash(Canonicalize(body))")
		}
		// retarget ⇒ a DIFFERENT id (the target is part of identity).
		alt := r
		alt.Target = r.Target + "X"
		aid, _ := ref.ID(alt)
		if aid == id {
			rt.Fatalf("retarget did not change id")
		}
	})
}

// 3. DETERMINISM — same relation → same id, every time.
func TestProp_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		r := genRelation(rt)
		a, ea := ref.ID(r)
		b, eb := ref.ID(r)
		if (ea == nil) != (eb == nil) || a != b {
			rt.Fatalf("ID non-determinism: %q/%v vs %q/%v", a, ea, b, eb)
		}
	})
}

// 4. CLOSED SETS — every drawn kind is a member; a non-member token is refused.
func TestProp_ClosedKindSets(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		r := genRelation(rt)
		known := map[string]bool{r.Target: true}
		// a well-shaped, resolvable relation passes.
		if err := ref.Resolve(r, known); err != nil {
			rt.Fatalf("well-shaped relation refused: %v", err)
		}
		if !ref.IsKnownCardinality(r.Cardinality) {
			rt.Fatalf("drawn cardinality %q not in closed set", r.Cardinality)
		}
		if !ref.IsKnownSemantic(r.Semantic) {
			rt.Fatalf("drawn semantic %q not in closed set", r.Semantic)
		}
		// inject an out-of-set cardinality ⇒ refused (UNKNOWN_RELATION_KIND).
		bad := r
		bad.Cardinality = ref.Cardinality("7-7")
		if err := ref.Resolve(bad, known); err == nil {
			rt.Fatalf("out-of-set cardinality not refused")
		}
	})
}

// 5. UNKNOWN TARGET REFUSED — an undeclared target is ErrUnknownTarget, never guessed.
func TestProp_UnknownTargetRefused(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		r := genRelation(rt)
		// known set deliberately EXCLUDES the relation's target.
		empty := map[string]bool{}
		err := ref.Resolve(r, empty)
		if err == nil {
			rt.Fatalf("relation to undeclared target was not refused")
		}
		// the refusal renders as UNKNOWN_RELATION_TARGET (no prison).
		br := ref.BlockUnknownTarget(err)
		if !strings.Contains(br.Explanation, "UNKNOWN_RELATION_TARGET") {
			rt.Fatalf("refusal not UNKNOWN_RELATION_TARGET: %q", br.Explanation)
		}
		if len(br.HowToFix) == 0 {
			rt.Fatalf("UNKNOWN_RELATION_TARGET has empty how_to_fix (prison)")
		}
	})
}

// 6. SCALAR SET UNTOUCHED — the existence of relations does not widen the S35 scalar set.
func TestProp_ScalarSetUntouched(t *testing.T) {
	want := []entities.ScalarType{
		entities.TypeString, entities.TypeInt, entities.TypeDecimal, entities.TypeBool, entities.TypeTimestamptz,
	}
	got := entities.ScalarTypes()
	if len(got) != len(want) {
		t.Fatalf("scalar set size changed: got %d, want %d (relation must not widen it)", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("scalar set member %d changed: %q != %q", i, got[i], want[i])
		}
	}
	// a relation carries no scalar type field — it is its own node kind.
	r := ref.Relation{Name: "customer", Target: "Customer", Cardinality: ref.OneToMany, Semantic: ref.FK}
	if entities.IsKnownType(entities.ScalarType(r.Target)) {
		t.Fatalf("a relation target leaked into the scalar set")
	}
}
