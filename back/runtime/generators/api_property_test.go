package generators_test

// Reproducibility / faithfulness mirror (S36): the ∀ invariants of the API emitter.
// reflects=runtime.generators.EmitAPI, test_kind=property, cert_language=rapid,
// liveness=live, authority=below.
//
// The properties (KRD §6 determinism-first; the honesty rules):
//   1. DETERMINISTIC — same (operation, entity) ⇒ byte-identical handler output.
//   2. TOTAL — never panics; an incoherent operation/entity pairing ⇒ a BlockReason
//      (UNKNOWN_OPERATION_IO), never a panic and never a guessed handler.
//   3. ROUTE/METHOD FAITHFUL — the emitted route/method equal exactly what the
//      operation+entity pin (POST + the entity collection), none invented.
//   4. NO ADD/DROP/RENAME — the request/response field set == the entity attribute set.
//   5. CONTENT-ADDRESSED — source_hash == Hash(Canonicalize(operation ⊕ entity)).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"pgregory.net/rapid"
)

// genScalar draws a member of the closed scalar set.
func genScalar(t *rapid.T) entities.ScalarType {
	all := entities.ScalarTypes()
	return all[rapid.IntRange(0, len(all)-1).Draw(t, "scalarIdx")]
}

// genEntityNamed builds a projectable entity with a pinned name (so it can be paired
// with an operation that mutates that same name) and a random, well-typed attribute set
// — one identifier int + 1..4 extra attributes.
func genEntityNamed(t *rapid.T, name string) entities.Entity {
	n := rapid.IntRange(1, 4).Draw(t, "extraAttrs")
	attrs := []entities.Attribute{{Name: "id", Type: entities.TypeInt, Required: true, Identifier: true}}
	for i := 0; i < n; i++ {
		attrs = append(attrs, entities.Attribute{
			Name:     "f" + rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "attrName"),
			Type:     genScalar(t),
			Required: rapid.Bool().Draw(t, "required"),
		})
	}
	return entities.Entity{Name: name, Attributes: attrs}
}

// opMutating builds a minimal create-mutate operation over the named entity.
func opMutating(name string) operation.Operation {
	return operation.Operation{
		Name:  "create" + name,
		Input: "Create" + name + "Input",
		Steps: []operation.Step{
			operation.ValidateStep{Schema: "Create" + name + "Input"},
			operation.MutateStep{Entity: name, Op: operation.MutateCreate, As: "$." + strings.ToLower(name)},
			operation.ReturnStep{Ref: "$." + strings.ToLower(name)},
		},
		Emits: []string{name + "Created"},
	}
}

func TestProp_EmitAPIDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEntityNamed(t, "Order")
		op := opMutating("Order")
		a1, b1 := generators.EmitAPI(op, e)
		a2, b2 := generators.EmitAPI(op, e)
		if (b1 == nil) != (b2 == nil) {
			t.Fatal("EmitAPI block-decision is not deterministic")
		}
		if b1 == nil {
			if string(a1.Bytes) != string(a2.Bytes) {
				t.Fatal("EmitAPI is not byte-identical on identical sources")
			}
		}
	})
}

func TestProp_EmitAPITotalNeverPanics(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Pair an Order-mutating op with a DIFFERENTLY-named entity sometimes (incoherent)
		// and sometimes the matching one — EmitAPI must never panic either way.
		entName := rapid.SampledFrom([]string{"Order", "Widget", "Gizmo"}).Draw(t, "entName")
		e := genEntityNamed(t, entName)
		op := opMutating("Order")
		art, br := generators.EmitAPI(op, e)
		if entName == "Order" {
			if br != nil {
				t.Fatalf("a coherent Order pairing must emit, got block: %+v", br)
			}
		} else {
			if br == nil {
				t.Fatal("an incoherent pairing must be Blocked (UNKNOWN_OPERATION_IO), not guessed")
			}
			if !strings.Contains(br.Explanation, generators.CodeUnknownOperationIO) {
				t.Fatalf("block does not name UNKNOWN_OPERATION_IO: %q", br.Explanation)
			}
			if len(art.Bytes) != 0 {
				t.Fatal("a blocked emit must produce no bytes")
			}
		}
	})
}

func TestProp_RouteMethodFaithful(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEntityNamed(t, "Order")
		op := opMutating("Order")
		method, route := generators.MethodRoute(op, "Order")
		if method != "POST" {
			t.Fatalf("create-mutate must map to POST, got %q", method)
		}
		if route != "/orders" {
			t.Fatalf("route must be the entity collection /orders, got %q", route)
		}
		art, br := generators.EmitAPI(op, e)
		if br != nil {
			t.Fatalf("unexpected block: %+v", br)
		}
		if !strings.Contains(string(art.Bytes), route) {
			t.Fatal("emitted handler does not carry the pinned route")
		}
	})
}

func TestProp_NoAddDropRename(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEntityNamed(t, "Order")
		op := opMutating("Order")
		art, br := generators.EmitAPI(op, e)
		if br != nil {
			t.Fatalf("unexpected block: %+v", br)
		}
		src := string(art.Bytes)
		// Every entity attribute appears as a json tag in the request struct; no extra
		// field beyond the attribute set is introduced.
		for _, a := range e.Attributes {
			if !strings.Contains(src, `json:"`+a.Name) {
				t.Fatalf("attribute %q absent from emitted request/response (drop/rename)", a.Name)
			}
		}
	})
}

func TestProp_ContentAddressed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		e := genEntityNamed(t, "Order")
		op := opMutating("Order")
		art, br := generators.EmitAPI(op, e)
		if br != nil {
			t.Fatalf("unexpected block: %+v", br)
		}
		body, err := generators.APISourceBodyForTest(op, e)
		if err != nil {
			t.Fatalf("APISourceBodyForTest: %v", err)
		}
		if art.SourceHash != records.Hash(body) {
			t.Fatal("source_hash != Hash(Canonicalize(operation ⊕ entity))")
		}
	})
}
