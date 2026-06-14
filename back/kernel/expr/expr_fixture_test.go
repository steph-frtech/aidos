package expr_test

// Fixture mirror (N2: state → command → events), interpreted in Go.
// reflects=kernel.expr.Eval · test_kind=fixture · cert_language=operation-dsl/go ·
// liveness=live · authority=above.
//
// Materialized source: tests/kernel/expr_eval.fixture.md (the human-readable
// fixture, conceptually stored in the `mirrors` schema; persisted to Postgres at
// S06). Each case below is one fixture row: an Env (state), an Expr AST built
// from its canonical JSONB (command), and the expected resolved Value or Parse
// rejection (events). This is a MEANS-test toward the human red ("visible_when
// must evaluate"), never a self-graded truth.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/expr"
)

// fixtureCase is one state→command→events row of the fixture mirror.
type fixtureCase struct {
	name string
	// command: the Expr AST as canonical JSONB (the form stored in kernel.expr).
	ast string
	// state: the evaluation Env as JSON ($-rooted). Empty ⇒ no Env needed (the
	// Parse-rejection cases never reach Eval).
	env string
	// events (one of):
	wantValue    any     // the expected resolved Value (when parseErr == false)
	wantBool     bool    // convenience for boolean results
	isBool       bool    // use wantBool instead of wantValue
	wantString   string  // convenience for string results
	isString     bool    // use wantString
	wantNumber   float64 // convenience for numeric results
	isNumber     bool    // use wantNumber
	parseRejects bool    // Parse must reject this AST (unknown function / kind)
}

func TestExprFixtures(t *testing.T) {
	cases := []fixtureCase{
		{
			name:     "visible_when evaluates true when cart has items",
			ast:      `{"kind":"call","fn":">","args":[{"kind":"ref","path":"$.cart.items.length"},{"kind":"lit","value":0}]}`,
			env:      `{"$":{"cart":{"items":[{"id":"a"},{"id":"b"}]}}}`,
			isBool:   true,
			wantBool: true,
		},
		{
			name:     "visible_when evaluates false when cart is empty",
			ast:      `{"kind":"call","fn":">","args":[{"kind":"ref","path":"$.cart.items.length"},{"kind":"lit","value":0}]}`,
			env:      `{"$":{"cart":{"items":[]}}}`,
			isBool:   true,
			wantBool: false,
		},
		{
			name:       "function call composes",
			ast:        `{"kind":"call","fn":"lowercase","args":[{"kind":"ref","path":"$.auth.user.name"}]}`,
			env:        `{"$":{"auth":{"user":{"name":"ADA"}}}}`,
			isString:   true,
			wantString: "ada",
		},
		{
			name:     "enabled_when composes logical and negation",
			ast:      `{"kind":"call","fn":"&&","args":[{"kind":"ref","path":"$.form.valid"},{"kind":"call","fn":"!","args":[{"kind":"ref","path":"$.submitting"}]}]}`,
			env:      `{"$":{"form":{"valid":true},"submitting":false}}`,
			isBool:   true,
			wantBool: true,
		},
		{
			// The §93 anchor's total: sum($.cart.items, "price") = 10 + 5 = 15.
			name:       "sum folds a numeric field over a collection (createOrder total)",
			ast:        `{"kind":"call","fn":"sum","args":[{"kind":"ref","path":"$.cart.items"},{"kind":"lit","value":"price"}]}`,
			env:        `{"$":{"cart":{"items":[{"price":10},{"price":5}]}}}`,
			isNumber:   true,
			wantNumber: 15,
		},
		{
			// sum over an empty collection is the neutral element 0 (an empty cart).
			name:       "sum over an empty collection is 0",
			ast:        `{"kind":"call","fn":"sum","args":[{"kind":"ref","path":"$.cart.items"},{"kind":"lit","value":"price"}]}`,
			env:        `{"$":{"cart":{"items":[]}}}`,
			isNumber:   true,
			wantNumber: 0,
		},
		{
			name:         "unknown function is rejected, not evaluated",
			ast:          `{"kind":"call","fn":"exec","args":[{"kind":"lit","value":"rm -rf /"}]}`,
			parseRejects: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e, err := expr.Parse([]byte(tc.ast))
			if tc.parseRejects {
				if err == nil {
					t.Fatalf("Parse should reject %q (closed allow-list), got nil error", tc.ast)
				}
				return
			}
			if err != nil {
				t.Fatalf("Parse(%q) unexpected error: %v", tc.ast, err)
			}

			env, err := expr.ParseEnv([]byte(tc.env))
			if err != nil {
				t.Fatalf("ParseEnv(%q) error: %v", tc.env, err)
			}

			v, err := expr.Eval(e, env)
			if err != nil {
				t.Fatalf("Eval error: %v", err)
			}

			switch {
			case tc.isBool:
				got, ok := v.AsBool()
				if !ok {
					t.Fatalf("result is not a bool: %#v", v)
				}
				if got != tc.wantBool {
					t.Fatalf("got %v, want %v", got, tc.wantBool)
				}
			case tc.isString:
				got, ok := v.AsString()
				if !ok {
					t.Fatalf("result is not a string: %#v", v)
				}
				if got != tc.wantString {
					t.Fatalf("got %q, want %q", got, tc.wantString)
				}
			case tc.isNumber:
				got, ok := v.AsNumber()
				if !ok {
					t.Fatalf("result is not a number: %#v", v)
				}
				if got != tc.wantNumber {
					t.Fatalf("got %v, want %v", got, tc.wantNumber)
				}
			default:
				t.Fatalf("fixture %q declares no expected event", tc.name)
			}
		})
	}
}
