package agentimpl_test

// Property mirror (∀) for the BINDING RESOLUTION (BA05).
// reflects=runtime.agent_impl.bindings · test_kind=property · cert_language=rapid ·
// liveness=live · authority=below. The resolution is the deterministic foundation the
// app (BA-E2) verifies: the implementation's capability surface is a PROVABLE SUBSET of
// the governed CoucheAgent — governance can only NARROW the capability surface, never
// WIDEN it.
//
// The invariants pinned here (the RED set BA05 must turn green):
//  1. ResolveTools ⊆ enabled declared MCP bindings: every ResolvedTool corresponds to a
//     declared OutilsMCPAutorises binding with Enabled==true; a disabled or absent
//     binding can NEVER appear (no widening). The result is deterministic (same input ⇒
//     same output) and order-independent (the SOURCE's binding order cannot change it).
//  2. ResolveSkills ⊆ enabled declared skills: every resolved skill name corresponds to a
//     declared SkillsAutorises binding with Enabled==true; a disabled/absent skill never
//     appears. Deterministic + order-independent.
//  3. ResolveHooks preserves Mandatory: a Mandatory hook in HooksObligatoires ALWAYS
//     survives projection (a non-bypassable hook can never be dropped). The resolution
//     never invents a hook not declared in the SOURCE. Deterministic + order-independent.
//  4. Determinism-first / reproducibility: resolving the SAME bindings twice yields
//     byte-identical results; shuffling the input order yields the SAME canonical output.

import (
	"reflect"
	"sort"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"pgregory.net/rapid"
)

// drawMCPBindings draws a slice of MCP bindings with random enabled toggles. Server/tool
// names are drawn from a small alphabet so disabled-vs-enabled collisions can occur.
func drawMCPBindings(rt *rapid.T) []agentlayer.MCPBinding {
	n := rapid.IntRange(0, 8).Draw(rt, "nmcp")
	out := make([]agentlayer.MCPBinding, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, agentlayer.MCPBinding{
			Server:  rapid.SampledFrom([]string{"store", "mirror-runner", "memory", "context"}).Draw(rt, "server"),
			Tool:    rapid.SampledFrom([]string{"read", "write", "run", "query", "list"}).Draw(rt, "tool"),
			Enabled: rapid.Bool().Draw(rt, "enabled"),
		})
	}
	return out
}

func drawSkillBindings(rt *rapid.T) []agentlayer.SkillBinding {
	n := rapid.IntRange(0, 8).Draw(rt, "nskill")
	out := make([]agentlayer.SkillBinding, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, agentlayer.SkillBinding{
			SkillName: rapid.SampledFrom([]string{"tdd", "grill", "context", "diagnose", "action"}).Draw(rt, "skill"),
			Enabled:   rapid.Bool().Draw(rt, "enabled"),
		})
	}
	return out
}

func drawHookPolicies(rt *rapid.T) []agentlayer.AgentHookPolicy {
	n := rapid.IntRange(0, 6).Draw(rt, "nhook")
	out := make([]agentlayer.AgentHookPolicy, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, agentlayer.AgentHookPolicy{
			Phase:     rapid.SampledFrom([]string{"PreToolUse", "PostToolUse", "Stop", "SessionStart"}).Draw(rt, "phase"),
			Hook:      rapid.SampledFrom([]string{"wall", "sensors", "completeness", "audit"}).Draw(rt, "hook"),
			Mandatory: rapid.Bool().Draw(rt, "mandatory"),
		})
	}
	return out
}

// (1) ResolveTools ⊆ enabled declared bindings — governance NARROWS, never WIDENS.
func TestProp_ResolveTools_SubsetOfEnabled(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		bindings := drawMCPBindings(rt)
		got := agentimpl.ResolveTools(bindings)

		// Build the set of declared ENABLED (server,tool) pairs.
		enabled := map[agentimpl.ResolvedTool]bool{}
		for _, b := range bindings {
			if b.Enabled {
				enabled[agentimpl.ResolvedTool{Server: b.Server, Tool: b.Tool}] = true
			}
		}
		// Every resolved tool MUST be an enabled declared binding (subset / no widening).
		for _, rtool := range got {
			if !enabled[rtool] {
				rt.Fatalf("ResolveTools widened the surface: %+v is not an enabled declared binding", rtool)
			}
		}
		// And every enabled declared pair MUST be present (no silent drop of a granted tool).
		present := map[agentimpl.ResolvedTool]bool{}
		for _, rtool := range got {
			present[rtool] = true
		}
		for pair := range enabled {
			if !present[pair] {
				rt.Fatalf("ResolveTools dropped an enabled granted tool: %+v", pair)
			}
		}
		// A disabled binding can NEVER appear.
		for _, b := range bindings {
			if !b.Enabled && present[agentimpl.ResolvedTool{Server: b.Server, Tool: b.Tool}] {
				// allowed only if the SAME pair also appears enabled elsewhere
				alsoEnabled := false
				for _, b2 := range bindings {
					if b2.Enabled && b2.Server == b.Server && b2.Tool == b.Tool {
						alsoEnabled = true
						break
					}
				}
				if !alsoEnabled {
					rt.Fatalf("ResolveTools surfaced a disabled binding: %+v", b)
				}
			}
		}
	})
}

// (1b) ResolveTools is deterministic + order-independent (reproducibility mirror).
func TestProp_ResolveTools_DeterministicOrderIndependent(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		bindings := drawMCPBindings(rt)
		a := agentimpl.ResolveTools(bindings)
		b := agentimpl.ResolveTools(bindings)
		if !reflect.DeepEqual(a, b) {
			rt.Fatalf("ResolveTools not deterministic: %+v vs %+v", a, b)
		}
		// Reverse the input order; canonical output must be identical.
		rev := make([]agentlayer.MCPBinding, len(bindings))
		for i := range bindings {
			rev[len(bindings)-1-i] = bindings[i]
		}
		c := agentimpl.ResolveTools(rev)
		if !reflect.DeepEqual(a, c) {
			rt.Fatalf("ResolveTools is order-dependent: %+v vs %+v", a, c)
		}
		// And the output is sorted canonically.
		if !sort.SliceIsSorted(a, func(i, j int) bool {
			if a[i].Server != a[j].Server {
				return a[i].Server < a[j].Server
			}
			return a[i].Tool < a[j].Tool
		}) {
			rt.Fatalf("ResolveTools output not canonically sorted: %+v", a)
		}
	})
}

// (2) ResolveSkills ⊆ enabled declared skills.
func TestProp_ResolveSkills_SubsetOfEnabled(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		bindings := drawSkillBindings(rt)
		got := agentimpl.ResolveSkills(bindings)

		enabled := map[string]bool{}
		for _, b := range bindings {
			if b.Enabled {
				enabled[b.SkillName] = true
			}
		}
		for _, s := range got {
			if !enabled[s] {
				rt.Fatalf("ResolveSkills widened the surface: %q is not an enabled declared skill", s)
			}
		}
		// every enabled skill present
		present := map[string]bool{}
		for _, s := range got {
			present[s] = true
		}
		for s := range enabled {
			if !present[s] {
				rt.Fatalf("ResolveSkills dropped an enabled granted skill: %q", s)
			}
		}
		// deterministic + order-independent
		rev := make([]agentlayer.SkillBinding, len(bindings))
		for i := range bindings {
			rev[len(bindings)-1-i] = bindings[i]
		}
		if !reflect.DeepEqual(got, agentimpl.ResolveSkills(rev)) {
			rt.Fatalf("ResolveSkills is order-dependent")
		}
	})
}

// (3) ResolveHooks preserves Mandatory — a Mandatory hook ALWAYS survives projection.
func TestProp_ResolveHooks_MandatorySurvives(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		policies := drawHookPolicies(rt)
		got := agentimpl.ResolveHooks(policies)

		// every resolved hook corresponds to a declared policy (no invention)
		declared := map[agentimpl.ResolvedHook]bool{}
		for _, p := range policies {
			declared[agentimpl.ResolvedHook{Phase: p.Phase, Hook: p.Hook, Mandatory: p.Mandatory}] = true
		}
		for _, h := range got {
			if !declared[h] {
				rt.Fatalf("ResolveHooks invented a hook not declared in the SOURCE: %+v", h)
			}
		}
		// every MANDATORY declared hook MUST survive (preserving the Mandatory flag)
		gotSet := map[agentimpl.ResolvedHook]bool{}
		for _, h := range got {
			gotSet[h] = true
		}
		for _, p := range policies {
			if p.Mandatory {
				want := agentimpl.ResolvedHook{Phase: p.Phase, Hook: p.Hook, Mandatory: true}
				if !gotSet[want] {
					rt.Fatalf("ResolveHooks dropped a Mandatory hook: %+v", p)
				}
			}
		}
		// deterministic + order-independent
		rev := make([]agentlayer.AgentHookPolicy, len(policies))
		for i := range policies {
			rev[len(policies)-1-i] = policies[i]
		}
		if !reflect.DeepEqual(got, agentimpl.ResolveHooks(rev)) {
			rt.Fatalf("ResolveHooks is order-dependent")
		}
	})
}
