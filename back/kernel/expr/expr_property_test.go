package expr_test

// Invariant mirror (rapid property test): reflects=kernel.expr.Parse/Eval,
// test_kind=property, cert_language=rapid, liveness=live, authority=below.
//
// ∀ ast:      Parse(Canonicalize(ast)) round-trips — encode∘decode is identity on
//             valid ASTs (the content-address is stable, so the version is stable).
// ∀ ast,env:  Eval is deterministic — same (ast, env) ⇒ same Value. now/uuid/
//             randomToken resolve through injected Env providers, never a real
//             clock/RNG, so repeated Eval is byte-identical.
// ∀ name:     every node kind ∈ {lit,ref,call,obj,arr} and every call name ∈ the
//             closed catalogue, else Parse errors (no free-code escape).
// ∀ ast,env:  Eval never panics — a malformed ref / type mismatch yields a typed
//             error, not a crash.
//
// These are MEANS-tests toward the human red, below the line. The agent does not
// invent a new Expr invariant it would then satisfy.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/expr"
	"pgregory.net/rapid"
)

// genExpr draws a small, well-typed Expr AST node (bounded depth) from the closed
// grammar — lit / ref / call (from the catalogue) / obj / arr — returning its
// canonical JSONB. It only ever produces VALID ASTs (valid kinds, catalogue
// functions, well-formed refs) so the round-trip / determinism / no-panic
// invariants exercise the happy path; the closed-catalogue invariant is checked
// separately with deliberately-invalid inputs.
func genExpr(rt *rapid.T, depth int) expr.Expr {
	choices := []string{"lit", "ref"}
	if depth > 0 {
		choices = append(choices, "call", "obj", "arr")
	}
	kind := rapid.SampledFrom(choices).Draw(rt, "kind")
	switch kind {
	case "lit":
		return expr.Lit(rapid.OneOf(
			rapid.StringMatching(`[a-z]{0,5}`).AsAny(),
			rapid.IntRange(-100, 100).AsAny(),
			rapid.Bool().AsAny(),
		).Draw(rt, "lit"))
	case "ref":
		root := rapid.SampledFrom([]string{"$.input", "$.auth.user", "$.cart", "$.form.valid"}).Draw(rt, "root")
		return expr.Ref(root)
	case "call":
		// Unary functions only, to keep generation total over the catalogue.
		fn := rapid.SampledFrom([]string{"lowercase", "!", "now", "uuid", "randomToken"}).Draw(rt, "fn")
		switch fn {
		case "now", "uuid", "randomToken":
			return expr.Call(fn)
		default:
			return expr.Call(fn, genExpr(rt, depth-1))
		}
	case "obj":
		return expr.Obj(map[string]expr.Expr{"a": genExpr(rt, depth-1)})
	case "arr":
		return expr.Arr(genExpr(rt, depth-1))
	}
	return expr.Lit(nil)
}

func TestProperty_RoundTrip(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		e := genExpr(rt, 3)
		b1, err := expr.Canonicalize(e)
		if err != nil {
			t.Fatalf("Canonicalize: %v", err)
		}
		parsed, err := expr.Parse(b1)
		if err != nil {
			t.Fatalf("Parse(Canonicalize(ast)): %v", err)
		}
		b2, err := expr.Canonicalize(parsed)
		if err != nil {
			t.Fatalf("re-Canonicalize: %v", err)
		}
		if string(b1) != string(b2) {
			t.Fatalf("round-trip not identity:\n %s\n %s", b1, b2)
		}
	})
}

func TestProperty_EvalDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		e := genExpr(rt, 3)
		// A deterministic Env: providers return fixed values, so now/uuid/
		// randomToken are reproducible (no real clock/RNG).
		env := expr.NewEnv(map[string]any{
			"$": map[string]any{
				"input": "x",
				"auth":  map[string]any{"user": map[string]any{"name": "ADA"}},
				"cart":  map[string]any{"items": []any{}},
				"form":  map[string]any{"valid": true},
			},
		}, expr.FixedProviders("2026-05-31T00:00:00Z", "fixed-uuid", "fixed-token"))

		v1, err1 := expr.Eval(e, env)
		v2, err2 := expr.Eval(e, env)
		if (err1 == nil) != (err2 == nil) {
			t.Fatalf("determinism broken on error: %v vs %v", err1, err2)
		}
		if err1 != nil {
			return // both errored — still deterministic
		}
		if !expr.ValueEqual(v1, v2) {
			t.Fatalf("Eval not deterministic: %#v vs %#v", v1, v2)
		}
	})
}

func TestProperty_ClosedCatalogue(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// An obviously-invalid function name is never in the closed catalogue.
		bad := rapid.StringMatching(`(exec|system|eval|rm|[A-Z]{3,8})`).Draw(rt, "badfn")
		if expr.IsCatalogueFunc(bad) {
			return // skip the rare case it collides with a real name
		}
		ast := `{"kind":"call","fn":"` + bad + `","args":[]}`
		if _, err := expr.Parse([]byte(ast)); err == nil {
			t.Fatalf("Parse accepted non-catalogue function %q (free-code escape)", bad)
		}
	})
}

func TestProperty_UnknownKindRejected(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		bad := rapid.StringMatching(`[a-z]{2,6}`).Draw(rt, "kind")
		if expr.IsNodeKind(bad) {
			return
		}
		ast := `{"kind":"` + bad + `","value":1}`
		if _, err := expr.Parse([]byte(ast)); err == nil {
			t.Fatalf("Parse accepted unknown node kind %q", bad)
		}
	})
}

func TestProperty_EvalNeverPanics(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		e := genExpr(rt, 3)
		// A possibly-empty Env, so refs may dangle and types may mismatch.
		env := expr.NewEnv(map[string]any{"$": map[string]any{}}, expr.FixedProviders("t", "u", "r"))
		defer func() {
			if r := recover(); r != nil {
				t.Fatalf("Eval panicked: %v", r)
			}
		}()
		_, _ = expr.Eval(e, env) // an error is fine; a panic is not.
	})
}
