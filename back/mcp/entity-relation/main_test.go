package main

import (
	"context"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
)

// The entity-relation MCP server is PURE computation (the wall): these tests prove each tool returns
// deterministically without any I/O — they mirror the S71 done-criteria at the MCP boundary: a
// relation round-trips as a content-addressed AST, and a relation to a nonexistent entity is refused
// UNKNOWN_RELATION_TARGET (never a guessed mapping).

func TestRelationResolve_OK(t *testing.T) {
	r := ref.Relation{Name: "customer", Target: "Customer", Cardinality: ref.OneToMany, Semantic: ref.FK, Required: true}
	_, out, err := resolve(context.Background(), nil, resolveInput{Relation: r, Known: []string{"Order", "Customer"}})
	if err != nil {
		t.Fatalf("resolve err: %v", err)
	}
	if !out.OK || out.Block != nil {
		t.Fatalf("declared target must resolve OK: %+v", out)
	}
}

func TestRelationResolve_UnknownTargetRefused(t *testing.T) {
	r := ref.Relation{Name: "ghost", Target: "Ghost", Cardinality: ref.OneToOne, Semantic: ref.FK}
	_, out, _ := resolve(context.Background(), nil, resolveInput{Relation: r, Known: []string{"Order", "Customer"}})
	if out.OK || out.Block == nil {
		t.Fatalf("undeclared target must be refused: %+v", out)
	}
	if !strings.Contains(out.Block.Explanation, "UNKNOWN_RELATION_TARGET") {
		t.Fatalf("refusal not UNKNOWN_RELATION_TARGET: %q", out.Block.Explanation)
	}
	if len(out.Block.HowToFix) == 0 {
		t.Fatalf("UNKNOWN_RELATION_TARGET has empty how_to_fix (prison)")
	}
}

func TestRelationResolve_UnknownKindRefused(t *testing.T) {
	r := ref.Relation{Name: "x", Target: "Customer", Cardinality: ref.Cardinality("9-9"), Semantic: ref.FK}
	_, out, _ := resolve(context.Background(), nil, resolveInput{Relation: r, Known: []string{"Customer"}})
	if out.OK || out.Block == nil {
		t.Fatalf("out-of-set cardinality must be refused: %+v", out)
	}
	if !strings.Contains(out.Block.Explanation, "UNKNOWN_RELATION_KIND") {
		t.Fatalf("refusal not UNKNOWN_RELATION_KIND: %q", out.Block.Explanation)
	}
}

func TestRelationAddress_RoundTripDeterministic(t *testing.T) {
	r := ref.Relation{Name: "customer", Target: "Customer", Cardinality: ref.OneToMany, Semantic: ref.FK, Required: true}
	_, a, _ := address(context.Background(), nil, addressInput{Relation: r})
	_, b, _ := address(context.Background(), nil, addressInput{Relation: r})
	if !a.OK || !b.OK {
		t.Fatalf("address must succeed: %+v %+v", a, b)
	}
	if a.ID == "" || a.ID != b.ID {
		t.Fatalf("content address non-deterministic: %q vs %q", a.ID, b.ID)
	}
	// the returned body parses back to the same relation (round-trip).
	back, err := ref.Parse([]byte(a.Body))
	if err != nil {
		t.Fatalf("Parse(body): %v", err)
	}
	if back != r {
		t.Fatalf("round-trip changed the relation: %+v != %+v", back, r)
	}
}

func TestRelationAddress_MalformedRefused(t *testing.T) {
	r := ref.Relation{Name: "", Target: "", Cardinality: ref.OneToOne, Semantic: ref.FK}
	_, out, _ := address(context.Background(), nil, addressInput{Relation: r})
	if out.OK || out.Block == nil {
		t.Fatalf("malformed relation must not be addressable: %+v", out)
	}
}
