package main

// determinism_property_test.go — the reproducibility mirror (CLAUDE.md §6 determinism-first):
// reflects=mcp.besoin-intake (the pure projection layer), test_kind=property, liveness=live. It pins
// that the SERVER's deterministic helpers are pure functions of their input: the same metaInput yields
// the same besoin.Metadata, and the same level yields the same schema projection. NO DB, NO clock, NO
// rng — these are the code-authoritative transforms the MCP wraps (the LLM never enters).

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/besoin"
	"pgregory.net/rapid"
)

// TestMetaInput_ToMeta_Deterministic pins that metaInput.toMeta is a pure total function: same input →
// same besoin.Metadata, byte-identical, with no hidden state.
func TestMetaInput_ToMeta_Deterministic(t *testing.T) {
	kinds := []string{"behavioral", "structural", "", "regulatory"}
	verifs := []string{"deterministic", "statistical", "unverifiable", ""}
	rapid.Check(t, func(t *rapid.T) {
		in := metaInput{
			TruthKind:     kinds[rapid.IntRange(0, len(kinds)-1).Draw(t, "kind")],
			Verifiability: verifs[rapid.IntRange(0, len(verifs)-1).Draw(t, "verif")],
			GlobalScope:   rapid.Bool().Draw(t, "global"),
		}
		a := in.toMeta()
		b := in.toMeta()
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("toMeta not deterministic: %+v != %+v", a, b)
		}
		if in.GlobalScope && a.Scope.Region != "*" {
			t.Fatalf("global scope not mapped to RegionGlobal: %+v", a.Scope)
		}
	})
}

// TestLevelSchema_Projection_Deterministic pins that the level schema projection is a pure lookup over
// the closed grammar: every grammar level yields a stable required-field set + mapping, and a non-level
// is rejected. This is the schema a client reads to render the right form (it invents no field).
func TestLevelSchema_Projection_Deterministic(t *testing.T) {
	s := &server{}
	for _, l := range append(besoin.Levels(), besoin.LevelInvariant, besoin.LevelPolicy) {
		_, a, errA := s.levelSchema(nil, nil, schemaInput{Level: string(l)})
		_, b, errB := s.levelSchema(nil, nil, schemaInput{Level: string(l)})
		if errA != nil || errB != nil {
			t.Fatalf("level %q: unexpected error %v / %v", l, errA, errB)
		}
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("level %q schema not deterministic: %+v != %+v", l, a, b)
		}
		if len(a.RequiredFields) == 0 {
			t.Fatalf("level %q has no required fields", l)
		}
		if a.Mapping == "" {
			t.Fatalf("level %q has no mapping (EL05)", l)
		}
	}
	// A non-grammar level is rejected (the wall: a client cannot invent a level).
	if _, _, err := s.levelSchema(nil, nil, schemaInput{Level: "garbage"}); err == nil {
		t.Fatal("a non-grammar level must be rejected")
	}
}
