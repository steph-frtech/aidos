package gatewaydispatch_test

// Mirror for the promotion-gate WIRING into the S59 gateway dispatcher (reflects=
// runtime.gatewaydispatch + hooks.promotion-gate, test_kind=integration, liveness=live,
// §5 hook honesty). A hook that never fires is dead — but a mis-wired hook that blocks a
// legitimate flow breaks the build, so this mirror proves BOTH senses (§5 double-sense):
//
//	RED  (the guarded property VIOLATED) — a /goal-flow kernel write whose provenance is a
//	     mirrored_idea but which carries NO mirror_ref (the injected fault) is BLOCKED by
//	     the gate with NO_MIRROR_NO_KERNEL, BEFORE any dispatch (the backend factory PANICS
//	     if ever reached — the write never persists).
//	GREEN (the normal flow) — the SAME /goal-flow kernel write WITH a mirror_ref PASSES the
//	     gate; the gate does not refuse the legitimate promotion (it then hands off to the
//	     wall, which independently governs the raw kernel_write door — the gate adds the
//	     NO_MIRROR_NO_KERNEL check ABOVE the wall, it does not widen it).
//
// DETERMINISM-FIRST (§6/§8): the dispatcher DEFERS to the pure core (hooks/promotion-gate/
// gate.Evaluate), which defers to ideas.Promote — it does not re-implement the predicate
// and no LLM enters. The decision is a pure function of the injected (idea_status,
// mirror_ref); the same call yields the same verdict.

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
)

// goalFlowKernelArgs is the /goal-flow kernel-write shape the gateway carries: the call
// targets schema=kernel with provenance=mirrored_idea and the injected idea metadata. With
// mirror_ref present it is a legitimate promotion; with mirror_ref empty it is the fault.
func goalFlowKernelArgs(mirrorRef string) map[string]any {
	return map[string]any{
		"schema":      "kernel",
		"provenance":  "mirrored_idea",
		"idea_status": "harvested",
		"idea_id":     "idea-abc",
		"mirror_ref":  mirrorRef,
	}
}

// panicOnDispatchFactory PANICS if the dispatcher ever tries to build a backend — proving
// the gate refuses BEFORE any effect (the write never persists). Reused by the RED case.
func panicOnDispatchFactory(t *testing.T) gatewaydispatch.StoreProvider {
	t.Helper()
	return func(_ context.Context, server string) (*mcp.Server, error) {
		t.Fatalf("backend factory MUST NOT be reached — the promotion-gate failed to block (server=%q)", server)
		panic("unreachable")
	}
}

// RED — the guarded property VIOLATED. A /goal-flow kernel write tagged mirrored_idea but
// carrying NO mirror_ref (the injected fault) MUST be blocked with NO_MIRROR_NO_KERNEL, and
// the backend MUST NEVER be reached (the factory panics if it is).
func TestPromotionGateBlocksMirrorlessKernelWrite(t *testing.T) {
	d := gatewaydispatch.New(gateway.DefaultRegistry(), panicOnDispatchFactory(t))
	defer d.Close()

	result, br, outcome, err := d.Call(context.Background(), dispatchScope(), "kernel_write", goalFlowKernelArgs(""))
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if outcome != gatewaydispatch.OutcomeRefusedPromotionGate {
		t.Fatalf("outcome = %q, want %q (the promotion-gate)", outcome, gatewaydispatch.OutcomeRefusedPromotionGate)
	}
	if br == nil || string(br.Code) != "NO_MIRROR_NO_KERNEL" {
		t.Fatalf("block_reason = %+v, want NO_MIRROR_NO_KERNEL", br)
	}
	if len(br.HowToFix) == 0 {
		t.Fatalf("a BlockReason with no how_to_fix is a prison (forbidden): %+v", br)
	}
	if result != nil {
		t.Fatalf("result must be nil on a gate refusal, got %v", result)
	}
}

// GREEN — the normal flow MUST NOT be falsely blocked. The SAME /goal-flow kernel write WITH
// a mirror_ref PASSES the promotion-gate. The gate does not refuse it; the call then reaches
// the WALL (the raw kernel_write door is DispositionTruthWrite, so the router refuses it with
// GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET — the legal door is a ChangeSet). The CRITICAL assertion
// is that the refusal is the WALL's, NOT the promotion-gate's: the gate let the legitimate
// promotion through (no false block), proving the wiring does not break the legitimate flow.
func TestPromotionGateAllowsMirroredKernelWrite(t *testing.T) {
	// The factory is never reached either (the wall refuses a truth-write before dispatch);
	// the point is the OUTCOME is the wall's, not the gate's.
	d := gatewaydispatch.New(gateway.DefaultRegistry(), panicOnDispatchFactory(t))
	defer d.Close()

	result, br, outcome, err := d.Call(context.Background(), dispatchScope(), "kernel_write", goalFlowKernelArgs("mirror:order-discount-red-bdd"))
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if outcome == gatewaydispatch.OutcomeRefusedPromotionGate {
		t.Fatalf("the gate FALSELY blocked a legitimate mirrored promotion (mirror_ref present) — the wiring breaks the legal flow")
	}
	if outcome != string(gateway.OutcomeRefusedTruthWrite) {
		t.Fatalf("outcome = %q, want refused_truth_write (the wall governs the raw kernel_write door once the gate passes)", outcome)
	}
	if br == nil || br.Code != gateway.CodeTruthWriteNeedsChangeset {
		t.Fatalf("block_reason = %+v, want GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET (the wall, not the gate)", br)
	}
	if result != nil {
		t.Fatalf("result must be nil on a refusal, got %v", result)
	}
}

// GREEN (complement) — a NON-kernel /goal-flow-shaped call is NOT the gate's concern: a
// below-the-line call carrying a provenance tag still routes and dispatches normally (the
// gate only fires on schema=kernel). Proves the gate does not bleed into below-line traffic.
func TestPromotionGateIgnoresBelowLineCalls(t *testing.T) {
	reached := false
	factory := func(_ context.Context, server string) (*mcp.Server, error) {
		if server == "changeset" {
			reached = true
			return newFakeChangesetServer(), nil
		}
		return nil, gatewaydispatch.ErrServerNotDispatched
	}
	d := gatewaydispatch.New(gateway.DefaultRegistry(), factory)
	defer d.Close()

	// changeset_open is below the line; even with a stray provenance tag, the gate ignores it.
	_, br, outcome, err := d.Call(context.Background(), dispatchScope(), "changeset_open",
		map[string]any{"label": "x", "parent_phase": "p", "provenance": "mirrored_idea", "mirror_ref": ""})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if outcome != string(gateway.OutcomeRoute) {
		t.Fatalf("outcome = %q, want route (the gate must not fire on a below-line call)", outcome)
	}
	if br != nil {
		t.Fatalf("unexpected block_reason on a below-line call: %+v", br)
	}
	if !reached {
		t.Fatal("a below-line call carrying a provenance tag MUST still reach its backend")
	}
}
