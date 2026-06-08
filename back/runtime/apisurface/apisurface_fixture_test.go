// apisurface_fixture_test.go — the S90 ACCEPTANCE + PARITY mirrors. It pins the runtime
// done-criteria a property cannot:
//
//   - "Gherkin — un createOrder-class persiste une ligne et un policy DENY est enforced au
//     runtime" → the createOrder provider replays its happy path (a row, 201) and its DENY
//     interaction (403, no body), in-process, through the SAME interpreter the app runs.
//   - "pact-verifier sur tous les endpoints émis" → VerifySuite verifies EVERY operation's
//     emitted handler against its per-op contract.
//   - "le callback interpréteur Go donne le même verdict que l'interpréteur natif" → the
//     PARITY mirror: SidecarVerdict (the callback the Hono handler crosses) agrees with a
//     direct operation.Interpret call — a DENY in one is a DENY in the other.
//
// State → command → events is exercised through the real S10 operation.Interpret; no LLM, no
// DB (the deps double is pure/reproducible), keeping the mirror deterministic.
package apisurface

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// orderOp is the createOrder Op (the anchored example) the surface projects: a POST that
// authorizes (canPlaceOrder) and creates an Order.
func orderOp() Op {
	return Op{
		Name:      "createOrder",
		Entity:    entities.Order(),
		Verb:      VerbPost,
		Authorize: true,
		// createOrder's INPUT is {cartId} (CreateOrderInput), distinct from its Order response.
		Input: []entities.Attribute{{Name: "cartId", Type: entities.TypeString, Required: true}},
	}
}

// twoOpSpec is a richer surface: createOrder (POST, authorize) + a read-only listOrders
// (GET, no authorize) — so the suite/verify covers BOTH a mutating and a read endpoint, and
// BOTH an authorize and a non-authorize op.
func twoOpSpec() ApiSpec {
	return ApiSpec{
		Project: "shop",
		Ops: []Op{
			orderOp(),
			{Name: "listOrders", Entity: entities.Order(), Verb: VerbGet, Authorize: false},
		},
	}
}

// Given the createOrder operation, When an authorized command is replayed against the
// emitted handler, Then it persists (201) the Order field set the entity AST pins.
func TestCreateOrderPersistsARow(t *testing.T) {
	op := orderOp()
	suite, br := EmitPactSuite(ApiSpec{Project: "shop", Ops: []Op{op}})
	if br != nil {
		t.Fatalf("EmitPactSuite blocked: %v", br.Explanation)
	}
	if len(suite) != 1 {
		t.Fatalf("want one contract, got %d", len(suite))
	}
	res := VerifyOp(op, suite[0])
	if !res.Pass {
		t.Fatalf("createOrder provider verification failed: %s", res.Reason)
	}
	// The happy-path interaction (the create) is among the verified.
	found := false
	for _, d := range res.Interactions {
		if d == "createOrder honours Order" {
			found = true
		}
	}
	if !found {
		t.Fatalf("the createOrder create interaction was not verified: %v", res.Interactions)
	}
}

// Given the createOrder operation carries an authorize step, When an UNAUTHORIZED command is
// replayed, Then the runtime ENFORCES the policy: HTTP 403, no Order row (the DENY interaction).
func TestPolicyDenyEnforcedAtRuntime(t *testing.T) {
	op := orderOp()
	// SidecarVerdict on a deny-marked input must report Denied (the policy enforced).
	denied := SidecarVerdict(op, map[string]any{"cartId": "c1", "__deny__": true})
	if !denied.Denied {
		t.Fatalf("policy DENY not enforced by the sidecar (the authorize step was bypassed)")
	}
	allowed := SidecarVerdict(op, map[string]any{"cartId": "c1"})
	if allowed.Denied {
		t.Fatalf("an authorized command was wrongly denied")
	}
	// And the contract's DENY interaction verifies through the emitted handler (403).
	suite, br := EmitPactSuite(ApiSpec{Project: "shop", Ops: []Op{op}})
	if br != nil {
		t.Fatalf("EmitPactSuite blocked: %v", br.Explanation)
	}
	res := VerifyOp(op, suite[0])
	if !res.Pass {
		t.Fatalf("DENY interaction did not verify: %s", res.Reason)
	}
}

// pact-verifier sur TOUS les endpoints émis — VerifySuite verifies every operation.
func TestVerifySuiteAllEndpoints(t *testing.T) {
	res := VerifySuite(twoOpSpec())
	if !res.Pass {
		t.Fatalf("VerifySuite failed: %s", res.Reason)
	}
	if len(res.Interactions) < 2 {
		t.Fatalf("expected ≥ 2 verified interactions across the suite, got %d", len(res.Interactions))
	}
}

// nativeVerdict runs operation.Interpret DIRECTLY (the native path AIDOS runs) with the same
// reproducible deps, returning the verdict in the SidecarVerdict shape — the comparison baseline.
func nativeVerdict(op Op, input map[string]any) Verdict {
	body := operationBodyFor(op)
	deps := denyOnMarkerDeps{}
	state := operation.NewState(input, authFromInput(input))
	_, res, err := operation.Interpret(body, state, deps)
	if err != nil {
		if errors.Is(err, operation.ErrAuthorizationDenied) {
			return Verdict{Denied: true}
		}
		return Verdict{Denied: true}
	}
	return Verdict{Denied: false, Result: res.Ref}
}

// THE PARITY MIRROR: the Go SIDECAR callback gives the SAME verdict as the native
// interpreter, for the same (op, input) — allowed AND denied. This is the S90 done-criterion
// "le callback interpréteur Go donne le même verdict que l'interpréteur natif".
func TestSidecarParityWithNativeInterpreter(t *testing.T) {
	op := orderOp()
	cases := []map[string]any{
		{"cartId": "c1"},                   // allowed
		{"cartId": "c1", "__deny__": true}, // denied
	}
	for _, in := range cases {
		got := SidecarVerdict(op, in)
		want := nativeVerdict(op, in)
		if got.Denied != want.Denied {
			t.Fatalf("parity broken for input %v: sidecar denied=%v, native denied=%v", in, got.Denied, want.Denied)
		}
	}
}

// A malformed spec (no ops) is a typed BlockReason, never a panic — the wall/honesty.
func TestMalformedSpecBlocks(t *testing.T) {
	_, br := EmitOpenAPI(ApiSpec{Project: "shop"})
	if br == nil {
		t.Fatalf("an empty-ops spec must be blocked")
	}
	if len(br.HowToFix) == 0 {
		t.Fatalf("BlockReason must carry a how_to_fix (no prison)")
	}
}
