package gateway_test

// S58 REPRODUCIBILITY MIRROR (∀, rapid — the frozen N1 slot). reflects=
// runtime.gateway-route · test_kind=property · cert_language=rapid · authority=below ·
// liveness=live. Conceptually in the mirrors schema; materialized here for the runner.
//
// It pins the determinism-first done-criterion ("pur routage, zéro LLM"): Route is a
// PURE TOTAL function of (registry, call) — same input ⇒ same RouteDecision, always a
// terminal outcome, the wall never widens. RED before gateway.go existed.
import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/projectwall"
	"pgregory.net/rapid"
)

func toolNames(reg *gateway.Registry) []string {
	ts := reg.Tools()
	out := make([]string, 0, len(ts))
	for _, t := range ts {
		out = append(out, t.Name)
	}
	return out
}

// TestRouteDeterministic: same input ⇒ byte-identical decision.
func TestRouteDeterministic(t *testing.T) {
	reg := gateway.DefaultRegistry()
	names := toolNames(reg)
	rapid.Check(t, func(rt *rapid.T) {
		idStrs := []string{"", "alice", "bob"}
		projStrs := []string{"", "proj-a", "proj-b"}
		identity := rapid.SampledFrom(idStrs).Draw(rt, "identity")
		active := rapid.SampledFrom(projStrs).Draw(rt, "active")
		target := rapid.SampledFrom(projStrs).Draw(rt, "target")
		claimed := rapid.SampledFrom(idStrs).Draw(rt, "claimed")
		tool := rapid.SampledFrom(append([]string{"nonexistent_tool", ""}, names...)).Draw(rt, "tool")

		call := gateway.Call{
			Scope:  projectwall.Scope{Identity: identity, ActiveProject: active},
			Tool:   tool,
			Target: projectwall.Target{ProjectID: target, ClaimedIdentity: claimed},
		}
		d1 := reg.Route(call)
		d2 := reg.Route(call)
		if d1.Outcome != d2.Outcome {
			rt.Fatalf("non-deterministic outcome: %v != %v", d1.Outcome, d2.Outcome)
		}
		if (d1.BlockReason == nil) != (d2.BlockReason == nil) {
			rt.Fatalf("non-deterministic block reason presence")
		}
		if d1.BlockReason != nil && d1.BlockReason.Code != d2.BlockReason.Code {
			rt.Fatalf("non-deterministic block code: %v != %v", d1.BlockReason.Code, d2.BlockReason.Code)
		}
	})
}

// TestRouteTotalAndTerminal: every call yields exactly one of the four outcomes, and a
// refusal ALWAYS carries a BlockReason while a route ALWAYS carries the tool.
func TestRouteTotalAndTerminal(t *testing.T) {
	reg := gateway.DefaultRegistry()
	names := toolNames(reg)
	rapid.Check(t, func(rt *rapid.T) {
		identity := rapid.SampledFrom([]string{"", "alice", "bob"}).Draw(rt, "identity")
		active := rapid.SampledFrom([]string{"", "proj-a", "proj-b"}).Draw(rt, "active")
		target := rapid.SampledFrom([]string{"", "proj-a", "proj-b"}).Draw(rt, "target")
		claimed := rapid.SampledFrom([]string{"", "alice", "mallory"}).Draw(rt, "claimed")
		tool := rapid.SampledFrom(append([]string{"nope", ""}, names...)).Draw(rt, "tool")

		d := reg.Route(gateway.Call{
			Scope:  projectwall.Scope{Identity: identity, ActiveProject: active},
			Tool:   tool,
			Target: projectwall.Target{ProjectID: target, ClaimedIdentity: claimed},
		})
		switch d.Outcome {
		case gateway.OutcomeRoute:
			if d.Tool == nil {
				rt.Fatalf("route outcome without a tool")
			}
			if d.BlockReason != nil {
				rt.Fatalf("route outcome carries a block reason")
			}
		case gateway.OutcomeRefusedScope, gateway.OutcomeRefusedTruthWrite, gateway.OutcomeUnknownTool:
			if d.BlockReason == nil {
				rt.Fatalf("refusal %v without a block reason", d.Outcome)
			}
		default:
			rt.Fatalf("non-terminal/unknown outcome: %v", d.Outcome)
		}
	})
}

// TestScopeRefusalNeverWidened: a cross-project or forged-identity call is NEVER routed,
// whatever the disposition — the wall never widens server-side (§2). This is the
// isolation guarantee, keyed on the SAME predicate the RLS enforces.
func TestScopeRefusalNeverWidened(t *testing.T) {
	reg := gateway.DefaultRegistry()
	names := toolNames(reg)
	rapid.Check(t, func(rt *rapid.T) {
		tool := rapid.SampledFrom(names).Draw(rt, "tool")
		scope := projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"}
		// A target naming a DIFFERENT project, or a forged identity, must never route.
		bad := rapid.SampledFrom([]projectwall.Target{
			{ProjectID: "proj-b", ClaimedIdentity: ""},
			{ProjectID: "proj-a", ClaimedIdentity: "mallory"},
		}).Draw(rt, "bad")
		d := reg.Route(gateway.Call{Scope: scope, Tool: tool, Target: bad})
		if d.Outcome == gateway.OutcomeRoute {
			rt.Fatalf("a cross-project/forged call was routed for tool %q", tool)
		}
		if d.Outcome != gateway.OutcomeRefusedScope {
			rt.Fatalf("expected scope refusal, got %v", d.Outcome)
		}
		if d.BlockReason == nil || d.BlockReason.Code != gateway.CodeAgentCrossProjectWrite {
			rt.Fatalf("scope refusal without AGENT_CROSS_PROJECT_WRITE")
		}
	})
}

// TestTruthWriteAlwaysNeedsChangeset: a same-project, same-identity truth-zone write is
// ALWAYS refused with the ChangeSet-pointing reason — the door never opens at the edge.
func TestTruthWriteAlwaysNeedsChangeset(t *testing.T) {
	reg := gateway.DefaultRegistry()
	scope := projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"}
	target := projectwall.Target{ProjectID: "proj-a"}
	rapid.Check(t, func(rt *rapid.T) {
		tool := rapid.SampledFrom([]string{"kernel_write", "mirror_write", "fitness_write"}).Draw(rt, "tool")
		d := reg.Route(gateway.Call{Scope: scope, Tool: tool, Target: target})
		if d.Outcome != gateway.OutcomeRefusedTruthWrite {
			rt.Fatalf("truth-write %q not refused: %v", tool, d.Outcome)
		}
		if d.BlockReason == nil || d.BlockReason.Code != gateway.CodeTruthWriteNeedsChangeset {
			rt.Fatalf("truth-write refusal without GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET")
		}
	})
}
