package generators_test

// Property mirror (∀ invariants, rapid). reflects=runtime.generators.{Emit,Project},
// test_kind=property, cert_language=rapid, liveness=live, authority=below
// (computational — MEANS-tests toward the human red, not new truths the agent grades).
//
// The invariants (S34 spec):
//  1. DETERMINISM — Emit(e,t) == Emit(e,t) (byte-identical; no clock/RNG/map-order).
//  2. CONTENT-ADDRESSED SOURCE — source_hash == Hash(Canonicalize(e.body)) (S02 reused).
//  3. PROTECTED HEADER — bytes start with the protected marker carrying source_hash.
//  4. ORDER-INDEPENDENCE — Project is order-independent per artifact (field/target/source order).
//  5. NO INTER-TARGET DRIFT — the same e ⇒ Go/DDL/TS agree on the same field set.
//  6. NO SILENT STALE HASH — e.body != e'.body ⇒ different source_hash.
//  7. TOTALITY — a malformed/empty AST ⇒ a BlockReason, never a panic, never a field.

import (
	"bytes"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/generators"
	"pgregory.net/rapid"
)

var knownTypes = []string{"text", "numeric", "int", "bool", "timestamptz"}

func genTarget() *rapid.Generator[generators.Target] {
	return rapid.SampledFrom(generators.Targets())
}

// genEntity draws a well-formed entity: a non-empty name + 1..5 distinct, well-typed
// fields. Field names are distinct so the rendered struct is unambiguous.
func genEntity(t *rapid.T) generators.EntitySource {
	name := rapid.SampledFrom([]string{"Order", "Cart", "Invoice", "Product", "Line"}).Draw(t, "name")
	n := rapid.IntRange(1, 5).Draw(t, "nfields")
	seen := map[string]bool{}
	fields := make([]generators.Field, 0, n)
	for i := 0; i < n; i++ {
		fn := rapid.SampledFrom([]string{"id", "total", "discount", "qty", "active", "createdAt", "sku"}).Draw(t, "fname")
		if seen[fn] {
			continue
		}
		seen[fn] = true
		ty := rapid.SampledFrom(knownTypes).Draw(t, "ftype")
		fields = append(fields, generators.Field{Name: fn, Type: ty})
	}
	if len(fields) == 0 {
		fields = append(fields, generators.Field{Name: "id", Type: "text"})
	}
	return generators.EntitySource{ID: "entity-" + strings.ToLower(name), Kind: generators.KindEntity, Name: name, Fields: fields}
}

// 1. Determinism.
func TestProp_Determinism(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEntity(t)
		tg := genTarget().Draw(t, "target")
		a, bra := generators.Emit(e, tg)
		b, brb := generators.Emit(e, tg)
		if bra != nil || brb != nil {
			t.Fatalf("well-formed entity blocked: %v %v", bra, brb)
		}
		if !bytes.Equal(a.Bytes, b.Bytes) {
			t.Fatalf("Emit not deterministic for %+v target %s", e, tg)
		}
		if a.OutputHash != b.OutputHash {
			t.Fatalf("output_hash not deterministic")
		}
	})
}

// 2. Content-addressed source.
func TestProp_ContentAddressedSource(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEntity(t)
		tg := genTarget().Draw(t, "target")
		a, br := generators.Emit(e, tg)
		if br != nil {
			t.Fatalf("blocked: %v", br)
		}
		body, err := generators.SourceBody(e)
		if err != nil {
			t.Fatalf("SourceBody: %v", err)
		}
		if a.SourceHash != generators.HashForTest(body) {
			t.Fatalf("source_hash != Hash(Canonicalize(body))")
		}
	})
}

// 3. Protected header.
func TestProp_ProtectedHeader(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEntity(t)
		tg := genTarget().Draw(t, "target")
		a, br := generators.Emit(e, tg)
		if br != nil {
			t.Fatalf("blocked: %v", br)
		}
		firstLine := strings.SplitN(string(a.Bytes), "\n", 2)[0]
		if !strings.Contains(firstLine, generators.ProtectedMarker) {
			t.Fatalf("first line lacks the protected marker: %q", firstLine)
		}
		if !strings.Contains(firstLine, a.SourceHash) {
			t.Fatalf("header missing source_hash")
		}
	})
}

// 4. Order-independence: shuffling fields and target order never changes a target's bytes.
func TestProp_OrderIndependent(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEntity(t)
		shuffled := e
		shuffled.Fields = append([]generators.Field(nil), e.Fields...)
		rapid.Permutation(shuffled.Fields).Draw(t, "perm")

		base, _ := generators.Project([]generators.EntitySource{e}, generators.Targets())
		shuf, _ := generators.Project([]generators.EntitySource{shuffled}, []generators.Target{generators.TargetTSTypes, generators.TargetPgDDL, generators.TargetGoSqlc})

		byTarget := map[generators.Target][]byte{}
		for _, a := range base {
			byTarget[a.Target] = a.Bytes
		}
		for _, a := range shuf {
			if !bytes.Equal(byTarget[a.Target], a.Bytes) {
				t.Fatalf("target %s differs under field/target permutation", a.Target)
			}
		}
	})
}

// 5. No inter-target drift: every projection mentions every pinned field name.
func TestProp_NoInterTargetDrift(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEntity(t)
		arts, br := generators.Project([]generators.EntitySource{e}, generators.Targets())
		if br != nil {
			t.Fatalf("blocked: %v", br)
		}
		for _, a := range arts {
			body := string(a.Bytes)
			for _, f := range e.Fields {
				// Go exports the field capitalized; DDL/TS keep it verbatim. Check
				// the verbatim or capitalized form is present in each projection.
				cap := strings.ToUpper(f.Name[:1]) + f.Name[1:]
				if !strings.Contains(body, f.Name) && !strings.Contains(body, cap) {
					t.Fatalf("target %s missing field %q (inter-target drift)", a.Target, f.Name)
				}
			}
		}
	})
}

// 6. No silent stale hash: a different body ⇒ a different source_hash.
func TestProp_DifferentBodyDifferentHash(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEntity(t)
		e2 := e
		e2.Fields = append([]generators.Field(nil), e.Fields...)
		e2.Fields = append(e2.Fields, generators.Field{Name: "extraField", Type: "int"})
		a, _ := generators.Emit(e, generators.TargetGoSqlc)
		b, _ := generators.Emit(e2, generators.TargetGoSqlc)
		if a.SourceHash == b.SourceHash {
			t.Fatalf("distinct bodies share a source_hash (silent stale hash)")
		}
	})
}

// 7. Totality: a malformed/empty AST never panics; it yields a BlockReason.
func TestProp_MalformedNeverPanics(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Draw an arbitrary (possibly malformed) entity: empty name, no fields, or
		// an unknown type — all must yield a BlockReason, not a panic.
		name := rapid.SampledFrom([]string{"", "X"}).Draw(t, "name")
		nf := rapid.IntRange(0, 2).Draw(t, "nf")
		fields := make([]generators.Field, 0, nf)
		for i := 0; i < nf; i++ {
			fields = append(fields, generators.Field{
				Name: rapid.SampledFrom([]string{"", "id"}).Draw(t, "fn"),
				Type: rapid.SampledFrom([]string{"text", "bogus", ""}).Draw(t, "ft"),
			})
		}
		e := generators.EntitySource{ID: "e", Kind: generators.KindEntity, Name: name, Fields: fields}
		tg := rapid.SampledFrom([]generators.Target{generators.TargetGoSqlc, generators.Target("mobile")}).Draw(t, "tg")
		// Must not panic; we don't assert which (ok or block) — only totality.
		_, _ = generators.Emit(e, tg)
	})
}
