package ref_test

// Schema-validation FIXTURE mirror (the relation node's required mirror kind, KRD §27:
// a source node ─mirrors→ schema-validation). N2 frozen slot: state → command → events,
// interpreted in Go. reflects=kernel.entities.ref.{ID,Resolve,BlockUnknownTarget},
// test_kind=schema-validation/fixture, cert_language=fixture, authority=above.
//
// These are the DONE CRITERIA of S71, restated executable. They are means-tests toward
// the human red (a relation round-trips as a content-addressed AST; a relation to a
// nonexistent entity is refused UNKNOWN_RELATION_TARGET, never a guessed mapping) —
// never new truths the agent invents and grades.
//
// The fixture is materialized here (the mirrors Postgres schema persists it at S06's
// back-fill; this file IS the red→green proof, per the CLAUDE.md bootstrap exception).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
)

// orderHasCustomer is the canonical S71 relation example: Order ──1-N FK──▶ Customer
// (each Order references one Customer; a Customer has many Orders). The declared entity
// set holds both Order and Customer.
func orderHasCustomer() ref.Relation {
	return ref.Relation{
		Name:        "customer",
		Target:      "Customer",
		Cardinality: ref.OneToMany,
		Semantic:    ref.FK,
		Required:    true,
	}
}

// declaredSet is the project's entity cut (S70) that a relation resolves against.
func declaredSet() map[string]bool {
	return map[string]bool{"Order": true, "Customer": true, "LineItem": true, "Product": true}
}

// fixture: "a relation round-trips as a content-addressed AST" — THE done criterion.
func TestFixture_RelationRoundTripsAsContentAddressedAST(t *testing.T) {
	r := orderHasCustomer()

	// command (resolve against the declared set): Resolve(r, set) → events [Resolved]
	if err := ref.Resolve(r, declaredSet()); err != nil {
		t.Fatalf("Resolve(Order→Customer) blocked: %v", err)
	}

	// command (round-trip): Body → Parse → ID stable.
	body, err := ref.Body(r)
	if err != nil {
		t.Fatalf("Body: %v", err)
	}
	back, err := ref.Parse(body)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if back != r {
		t.Fatalf("round-trip changed the relation: %+v != %+v", back, r)
	}
	id1, _ := ref.ID(r)
	id2, _ := ref.ID(back)
	if id1 == "" || id1 != id2 {
		t.Fatalf("content address not stable across round-trip: %q vs %q", id1, id2)
	}

	// a re-emission is byte-identical (same body, same hash) — content-addressed.
	body2, _ := ref.Body(back)
	if string(body) != string(body2) {
		t.Fatalf("round-trip body not byte-identical")
	}
}

// fixture: "a relation to a nonexistent entity is refused UNKNOWN_RELATION_TARGET,
// never a guessed mapping" — THE honesty done criterion.
func TestFixture_UnknownRelationTargetIsRefusedNeverGuessed(t *testing.T) {
	// Order ──▶ Ghost, but the declared set has no Ghost entity.
	bad := ref.Relation{
		Name:        "ghost",
		Target:      "Ghost",
		Cardinality: ref.OneToOne,
		Semantic:    ref.FK,
	}

	// command (resolve): Resolve(bad, set) → events [Refused]
	err := ref.Resolve(bad, declaredSet())
	if err == nil {
		t.Fatal("relation to a nonexistent entity must be refused, not resolved")
	}

	// the refusal is the canonical UNKNOWN_RELATION_TARGET, with a non-empty fix path.
	br := ref.BlockUnknownTarget(err)
	if !strings.Contains(br.Explanation, "UNKNOWN_RELATION_TARGET") {
		t.Errorf("refusal explanation missing UNKNOWN_RELATION_TARGET: %q", br.Explanation)
	}
	if len(br.HowToFix) == 0 {
		t.Errorf("UNKNOWN_RELATION_TARGET has empty how_to_fix (prison, KRD §44.5)")
	}
	// HONESTY: nothing was emitted, no target was guessed — the relation is simply refused.
	if br.Severity != "blocking" {
		t.Errorf("UNKNOWN_RELATION_TARGET not blocking: %q", br.Severity)
	}
}

// fixture: "an out-of-set cardinality or semantic is refused UNKNOWN_RELATION_KIND" —
// the closed-set honesty extends to the relation's own kinds.
func TestFixture_UnknownRelationKindIsRefused(t *testing.T) {
	cases := []struct {
		name string
		rel  ref.Relation
	}{
		{"bad cardinality", ref.Relation{Name: "x", Target: "Customer", Cardinality: ref.Cardinality("3-3"), Semantic: ref.FK}},
		{"bad semantic", ref.Relation{Name: "x", Target: "Customer", Cardinality: ref.OneToOne, Semantic: ref.Semantic("owns")}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := ref.Resolve(c.rel, declaredSet())
			if err == nil {
				t.Fatalf("%s not refused", c.name)
			}
			br := ref.BlockUnknownTarget(err)
			if !strings.Contains(br.Explanation, "UNKNOWN_RELATION_KIND") {
				t.Errorf("%s: refusal not UNKNOWN_RELATION_KIND: %q", c.name, br.Explanation)
			}
		})
	}
}

// fixture: "the three cardinalities and three semantics each round-trip with a distinct
// content address" — every member of the closed sets is a first-class, addressable node.
func TestFixture_EveryKindIsAddressable(t *testing.T) {
	seen := map[string]bool{}
	for _, card := range ref.Cardinalities() {
		for _, sem := range ref.Semantics() {
			r := ref.Relation{Name: "r", Target: "Customer", Cardinality: card, Semantic: sem}
			if err := ref.Resolve(r, declaredSet()); err != nil {
				t.Fatalf("%s/%s refused: %v", card, sem, err)
			}
			id, err := ref.ID(r)
			if err != nil {
				t.Fatalf("%s/%s ID: %v", card, sem, err)
			}
			if seen[id] {
				t.Fatalf("%s/%s collides with a prior content address %q", card, sem, id)
			}
			seen[id] = true
		}
	}
	if len(seen) != len(ref.Cardinalities())*len(ref.Semantics()) {
		t.Fatalf("expected %d distinct addresses, got %d", len(ref.Cardinalities())*len(ref.Semantics()), len(seen))
	}
}
