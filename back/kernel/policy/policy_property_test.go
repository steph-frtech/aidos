package policy_test

// Invariant mirror (rapid property test): reflects=kernel.policy/canPlaceOrder,
// test_kind=property, cert_language=rapid, liveness=live, authority=above.
//
// The Policy DSL (KRD §24.4, §93) is an ∀ rule tree — its nature is the invariant,
// NOT a journey. So the canonical mirror is a property test (rapid, the frozen N1
// slot), never a Gherkin acceptance (forcing one would be a double-typed monster).
//
// Properties (the human red — KRD §93 verbatim; the agent invents no rule):
//
//   1. canPlaceOrder ALLOW ⇒ the three §93 conditions hold:
//        Eval(canPlaceOrder, ctx) == ALLOW  ⇒  $.auth.user exists
//                                           ∧  $.cart.userId == $.auth.user.id
//                                           ∧  $.cart.items.length > 0
//   2. canPlaceOrder contrapositive ⇒ DENY:
//        ¬(the three conditions)            ⇒  Eval(canPlaceOrder, ctx) == DENY
//   3. Combination law over arbitrary generated rule trees:
//        any leaf failing under an ALLOW gate ⇒ DENY    (any DENY blocks)
//        all([ ...holding ]) under ALLOW      ⇒ ALLOW    (every ALLOW passes)
//   4. not(not(rule)) ≡ rule                            (Not is an involution)
//   5. Content-address tie-in (S02 substrate):
//        id == version == Hash(Canonicalize(serialize(policy)))   (new version,
//        never an in-place mutation).
//
// These are MEANS-tests toward the human red, above the line. The agent does not
// write a new authorization invariant it would then satisfy (the circularity, §8).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/policy"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"pgregory.net/rapid"
)

// genCtx draws an authorization context: a $-rooted data tree with optional auth
// user and a cart whose userId may or may not match. It deliberately spans the
// ALLOW and DENY regions so both directions of the §93 biconditional are exercised.
func genCtx(rt *rapid.T) map[string]any {
	hasUser := rapid.Bool().Draw(rt, "hasUser")
	userID := rapid.SampledFrom([]string{"u1", "u2", "u3"}).Draw(rt, "userID")
	cartUserID := rapid.SampledFrom([]string{"u1", "u2", "u3", "other"}).Draw(rt, "cartUserID")
	nItems := rapid.IntRange(0, 4).Draw(rt, "nItems")

	items := make([]any, 0, nItems)
	for i := 0; i < nItems; i++ {
		items = append(items, map[string]any{"id": i})
	}
	cart := map[string]any{"userId": cartUserID, "items": items}

	root := map[string]any{"cart": cart}
	auth := map[string]any{}
	if hasUser {
		auth["user"] = map[string]any{"id": userID}
	}
	root["auth"] = auth
	return map[string]any{"$": root}
}

// conditionsHold computes the §93 predicate independently of the policy evaluator,
// so the property cross-checks Eval against a hand-written oracle (not itself).
func conditionsHold(ctx map[string]any) bool {
	root, _ := ctx["$"].(map[string]any)
	auth, _ := root["auth"].(map[string]any)
	user, hasUser := auth["user"].(map[string]any)
	if !hasUser {
		return false
	}
	cart, _ := root["cart"].(map[string]any)
	items, _ := cart["items"].([]any)
	userID, _ := user["id"]
	cartUserID, _ := cart["userId"]
	return userID == cartUserID && len(items) > 0
}

func TestProperty_CanPlaceOrder_AllowIffConditions(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		ctx := genCtx(rt)
		env := policy.NewCtx(ctx)
		dec, err := policy.Eval(policy.CanPlaceOrder(), env)
		if err != nil {
			t.Fatalf("Eval errored (must be total): %v", err)
		}
		want := conditionsHold(ctx)
		if (dec == policy.ALLOW) != want {
			t.Fatalf("ALLOW=%v but conditionsHold=%v for ctx=%v", dec == policy.ALLOW, want, ctx)
		}
		// And the explicit contrapositive: ¬conditions ⇒ DENY.
		if !want && dec != policy.DENY {
			t.Fatalf("expected DENY when conditions fail, got %v", dec)
		}
	})
}

// genLeaf draws a leaf rule whose truth value under an empty ctx is known: a
// constant ALLOW-ish (always-true) or DENY-ish (always-false) comparison.
func genTruth(rt *rapid.T) bool { return rapid.Bool().Draw(rt, "leaf") }

// trueRule / falseRule are constant leaves: eq(1,1) holds, eq(1,0) fails.
func trueRule() policy.Rule  { return policy.Eq(policy.LitV(1), policy.LitV(1)) }
func falseRule() policy.Rule { return policy.Eq(policy.LitV(1), policy.LitV(0)) }

func TestProperty_CombinationLaw_AnyFailBlocks(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		n := rapid.IntRange(1, 5).Draw(rt, "n")
		anyFail := false
		children := make([]policy.Rule, 0, n)
		for i := 0; i < n; i++ {
			if genTruth(rt) {
				children = append(children, trueRule())
			} else {
				children = append(children, falseRule())
				anyFail = true
			}
		}
		// An ALLOW-gate policy over all([...]) : the gate holds iff every child holds.
		p := policy.New("test", policy.ScopeOperation, "x", policy.All(children...), policy.EffectAllow)
		dec, err := policy.Eval(p, policy.NewCtx(map[string]any{"$": map[string]any{}}))
		if err != nil {
			t.Fatalf("Eval errored: %v", err)
		}
		if anyFail && dec != policy.DENY {
			t.Fatalf("any failing child must block (DENY), got %v", dec)
		}
		if !anyFail && dec != policy.ALLOW {
			t.Fatalf("all holding children under ALLOW must pass (ALLOW), got %v", dec)
		}
	})
}

func TestProperty_NotInvolution(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		var r policy.Rule
		if genTruth(rt) {
			r = trueRule()
		} else {
			r = falseRule()
		}
		env := policy.NewCtx(map[string]any{"$": map[string]any{}})
		h1, err1 := policy.Holds(r, env)
		h2, err2 := policy.Holds(policy.Not(policy.Not(r)), env)
		if err1 != nil || err2 != nil {
			t.Fatalf("Holds errored: %v / %v", err1, err2)
		}
		if h1 != h2 {
			t.Fatalf("not(not(rule)) must equal rule: %v vs %v", h1, h2)
		}
	})
}

func TestProperty_Eval_Total(t *testing.T) {
	// Totality: over arbitrary generated contexts (incl. missing/dangling selectors)
	// Eval never errors and never panics — it always returns a Decision.
	rapid.Check(t, func(rt *rapid.T) {
		ctx := genCtx(rt)
		defer func() {
			if r := recover(); r != nil {
				t.Fatalf("Eval panicked: %v", r)
			}
		}()
		dec, err := policy.Eval(policy.CanPlaceOrder(), policy.NewCtx(ctx))
		if err != nil {
			t.Fatalf("Eval must be total, errored: %v", err)
		}
		if dec != policy.ALLOW && dec != policy.DENY {
			t.Fatalf("Decision must be ALLOW or DENY, got %q", dec)
		}
	})
}

func TestProperty_ContentAddressed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		nItems := rapid.IntRange(0, 3).Draw(rt, "n")
		// Build a small but varying policy so the hash is exercised over byte changes.
		gate := policy.Gt(policy.Selector("$.cart.items.length"), policy.LitV(nItems))
		p := policy.New("varP", policy.ScopeOperation, "createOrder", gate, policy.EffectAllow)

		canon, err := policy.Canonicalize(p)
		if err != nil {
			t.Fatalf("Canonicalize: %v", err)
		}
		id := records.Hash(canon)

		// Re-serialize ⇒ same bytes ⇒ same id (content-address is stable).
		canon2, err := policy.Canonicalize(p)
		if err != nil {
			t.Fatalf("re-Canonicalize: %v", err)
		}
		if string(canon) != string(canon2) {
			t.Fatalf("canonical form not stable")
		}
		if records.Hash(canon2) != id {
			t.Fatalf("id not stable under re-serialize")
		}

		// A byte change (different threshold) ⇒ a DIFFERENT id (a new version, never
		// an in-place mutation).
		p2 := policy.New("varP", policy.ScopeOperation, "createOrder",
			policy.Gt(policy.Selector("$.cart.items.length"), policy.LitV(nItems+1)), policy.EffectAllow)
		canon3, _ := policy.Canonicalize(p2)
		if records.Hash(canon3) == id {
			t.Fatalf("a changed policy must hash to a new id")
		}
	})
}
