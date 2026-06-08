// apisurface_property_test.go — the S90 INVARIANT mirror (reproducibility / byte-stability),
// rapid (the frozen Go property slot, CLAUDE.md §3). It pins the done-criterion a fixture
// cannot: "property — l'OpenAPI est byte-stable depuis le Kernel" (same Kernel cut →
// byte-identical OpenAPI + router + Pact suite, on every run and machine), plus the
// content-address law (a byte change in the spec ⇒ a new SourceHash). Same input → same output.
package apisurface

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"pgregory.net/rapid"
)

// genApiSpec draws an arbitrary projectable ApiSpec: a non-empty project + ≥ 1 op, each with
// a distinct name, a small typed entity, a verb (POST/GET), and random authorize/async flags.
func genApiSpec(t *rapid.T) ApiSpec {
	project := rapid.StringMatching(`[a-z][a-z0-9]{0,7}`).Draw(t, "project")
	n := rapid.IntRange(1, 5).Draw(t, "nops")
	ops := make([]Op, 0, n)
	seen := map[string]bool{}
	for i := 0; i < n; i++ {
		name := rapid.StringMatching(`[a-z][a-zA-Z0-9]{0,9}`).Draw(t, "opname")
		if seen[name] {
			continue
		}
		seen[name] = true
		ent := genEntity(t, i)
		verb := VerbPost
		if rapid.Bool().Draw(t, "isget") {
			verb = VerbGet
		}
		ops = append(ops, Op{
			Name:      name,
			Entity:    ent,
			Verb:      verb,
			Authorize: rapid.Bool().Draw(t, "authorize"),
			Async:     rapid.Bool().Draw(t, "async"),
		})
	}
	if len(ops) == 0 {
		ops = append(ops, Op{Name: "a", Entity: genEntity(t, 0), Verb: VerbPost})
	}
	return ApiSpec{Project: project, Ops: ops}
}

func genEntity(t *rapid.T, idx int) entities.Entity {
	name := rapid.StringMatching(`[A-Z][a-zA-Z]{1,7}`).Draw(t, "ent")
	k := rapid.IntRange(1, 4).Draw(t, "nattr")
	scalars := []entities.ScalarType{entities.TypeString, entities.TypeInt, entities.TypeDecimal, entities.TypeBool, entities.TypeTimestamptz}
	attrs := make([]entities.Attribute, 0, k)
	seen := map[string]bool{}
	for i := 0; i < k; i++ {
		an := rapid.StringMatching(`[a-z][a-z0-9]{0,6}`).Draw(t, "attr")
		if seen[an] {
			continue
		}
		seen[an] = true
		attrs = append(attrs, entities.Attribute{
			Name:     an,
			Type:     scalars[rapid.IntRange(0, len(scalars)-1).Draw(t, "type")],
			Required: rapid.Bool().Draw(t, "req"),
		})
	}
	if len(attrs) == 0 {
		attrs = append(attrs, entities.Attribute{Name: "id", Type: entities.TypeInt, Required: true})
	}
	return entities.Entity{Name: name, Attributes: attrs}
}

// shuffle returns the spec's ops in a rotated order — the same SET, a different input order.
func shuffle(s ApiSpec, by int) ApiSpec {
	if len(s.Ops) < 2 {
		return s
	}
	by = by % len(s.Ops)
	rotated := append(append([]Op(nil), s.Ops[by:]...), s.Ops[:by]...)
	return ApiSpec{Project: s.Project, Ops: rotated}
}

// TestOpenAPIByteStable — the same Kernel cut yields a byte-identical OpenAPI document on
// every emission, and an input-order shuffle does NOT change the bytes (the canonical sort).
func TestOpenAPIByteStable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := genApiSpec(t)
		a1, br1 := EmitOpenAPI(s)
		a2, br2 := EmitOpenAPI(s)
		if br1 != nil || br2 != nil {
			t.Fatalf("EmitOpenAPI blocked a valid spec: %v / %v", br1, br2)
		}
		if string(a1.Bytes) != string(a2.Bytes) {
			t.Fatalf("OpenAPI not byte-stable across re-emission")
		}
		by := rapid.IntRange(0, len(s.Ops)).Draw(t, "rot")
		a3, br3 := EmitOpenAPI(shuffle(s, by))
		if br3 != nil {
			t.Fatalf("EmitOpenAPI blocked the shuffled spec: %v", br3)
		}
		if string(a3.Bytes) != string(a1.Bytes) {
			t.Fatalf("OpenAPI changed under an input-order shuffle (order leaked)")
		}
		if a1.OutputHash != a3.OutputHash || a1.SourceHash != a3.SourceHash {
			t.Fatalf("hash changed under an input-order shuffle")
		}
	})
}

// TestRouterByteStable — the emitted Hono router is byte-stable + order-independent.
func TestRouterByteStable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := genApiSpec(t)
		a1, br1 := EmitRouter(s)
		if br1 != nil {
			t.Fatalf("EmitRouter blocked a valid spec: %v", br1)
		}
		by := rapid.IntRange(0, len(s.Ops)).Draw(t, "rot")
		a2, br2 := EmitRouter(shuffle(s, by))
		if br2 != nil {
			t.Fatalf("EmitRouter blocked the shuffled spec: %v", br2)
		}
		if string(a1.Bytes) != string(a2.Bytes) {
			t.Fatalf("router changed under an input-order shuffle (order leaked)")
		}
	})
}

// TestPactSuiteByteStable — each per-op contract is byte-stable + order-independent, and the
// suite has exactly one contract per SYNC op (async ops carry no synchronous interaction).
func TestPactSuiteByteStable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := genApiSpec(t)
		arts1, br1 := EmitPactArtifacts(s)
		if br1 != nil {
			t.Fatalf("EmitPactArtifacts blocked a valid spec: %v", br1)
		}
		by := rapid.IntRange(0, len(s.Ops)).Draw(t, "rot")
		arts2, br2 := EmitPactArtifacts(shuffle(s, by))
		if br2 != nil {
			t.Fatalf("EmitPactArtifacts blocked the shuffled spec: %v", br2)
		}
		if len(arts1) != len(arts2) {
			t.Fatalf("pact suite size changed under shuffle: %d vs %d", len(arts1), len(arts2))
		}
		byPath := map[string]string{}
		for _, a := range arts1 {
			byPath[a.Path] = string(a.Bytes)
		}
		for _, a := range arts2 {
			if byPath[a.Path] != string(a.Bytes) {
				t.Fatalf("contract %s not byte-stable under shuffle", a.Path)
			}
		}
		// One contract per SYNC op.
		want := len(syncOps(s))
		if len(arts1) != want {
			t.Fatalf("pact suite has %d contracts, want one per sync op (%d)", len(arts1), want)
		}
	})
}

// TestSourceHashSensitive — a byte change in the spec (an added attribute) yields a NEW
// SourceHash (content-address honesty: no stale artifact passes as fresh).
func TestSourceHashSensitive(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		s := genApiSpec(t)
		h1, err := SourceHash(s)
		if err != nil {
			t.Fatalf("SourceHash: %v", err)
		}
		// Mutate: add an attribute to the first op's entity.
		s2 := ApiSpec{Project: s.Project, Ops: append([]Op(nil), s.Ops...)}
		first := s2.Ops[0]
		first.Entity = entities.Entity{
			Name:       first.Entity.Name,
			Attributes: append(append([]entities.Attribute(nil), first.Entity.Attributes...), entities.Attribute{Name: "extrafld", Type: entities.TypeString}),
		}
		s2.Ops[0] = first
		h2, err := SourceHash(s2)
		if err != nil {
			t.Fatalf("SourceHash: %v", err)
		}
		if h1 == h2 {
			t.Fatalf("SourceHash did not change after adding an attribute (stale-artifact hole)")
		}
	})
}
