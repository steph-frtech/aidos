package agentimpl

import (
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
)

// Binding resolution (BA05). These are the DETERMINISTIC, PURE functions that project a
// governed CoucheAgent's declared bindings DOWN into the implementation's resolved
// capability surface. They embody the one law BA05 proves: GOVERNANCE CAN ONLY NARROW
// THE CAPABILITY SURFACE, NEVER WIDEN IT.
//
//   - Tools[]  derive ONLY from OutilsMCPAutorises with Enabled==true;
//   - Skills[] derive ONLY from SkillsAutorises with Enabled==true;
//   - Hooks[]  derive from HooksObligatoires, PRESERVING the Mandatory flag (a Mandatory
//     hook can never be dropped).
//
// The resolution is the foundation the app (BA-E2) verifies: the implementation's
// capability surface is a PROVABLE SUBSET of the governed layer (the property mirror
// bindings_property_test.go pins ResolvedTools ⊆ enabled bindings, ResolvedSkills ⊆
// enabled skills, and a Mandatory hook always survives).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every function here is PURE + TOTAL — no DB, no
// clock, no rng, no I/O. The output is canonically sorted so it is ORDER-INDEPENDENT
// (the SOURCE's binding order can never change the projection) and byte-stable (same
// input ⇒ same output). These functions ARE the authoritative resolution; the BA03
// emitter (Project) delegates to them — there is one resolution, not two.

// ResolveTools maps the ENABLED MCP bindings to ResolvedTool, in canonical (server, tool)
// order. A disabled or absent binding NEVER appears (no widening). Duplicates collapse.
// Deterministic, order-independent, byte-stable. An empty result is nil.
func ResolveTools(bindings []agentlayer.MCPBinding) []ResolvedTool {
	seen := make(map[ResolvedTool]struct{}, len(bindings))
	out := make([]ResolvedTool, 0, len(bindings))
	for _, b := range bindings {
		if !b.Enabled {
			continue
		}
		rt := ResolvedTool{Server: b.Server, Tool: b.Tool}
		if _, ok := seen[rt]; ok {
			continue
		}
		seen[rt] = struct{}{}
		out = append(out, rt)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Server != out[j].Server {
			return out[i].Server < out[j].Server
		}
		return out[i].Tool < out[j].Tool
	})
	if len(out) == 0 {
		return nil
	}
	return out
}

// ResolveSkills maps the ENABLED skill bindings to their names, sorted + de-duplicated. A
// disabled or absent skill NEVER appears (no widening). Deterministic, order-independent.
func ResolveSkills(bindings []agentlayer.SkillBinding) []string {
	out := make([]string, 0, len(bindings))
	for _, b := range bindings {
		if b.Enabled {
			out = append(out, b.SkillName)
		}
	}
	return normalizePaths(out)
}

// ResolveHooks maps the mandatory-hook policies to ResolvedHook, PRESERVING the Mandatory
// flag, sorted by (phase, hook, mandatory) + de-duplicated. It never invents a hook not
// declared in the SOURCE; a Mandatory hook ALWAYS survives. Deterministic, order-independent.
func ResolveHooks(policies []agentlayer.AgentHookPolicy) []ResolvedHook {
	seen := make(map[ResolvedHook]struct{}, len(policies))
	out := make([]ResolvedHook, 0, len(policies))
	for _, p := range policies {
		h := ResolvedHook{Phase: p.Phase, Hook: p.Hook, Mandatory: p.Mandatory}
		if _, ok := seen[h]; ok {
			continue
		}
		seen[h] = struct{}{}
		out = append(out, h)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Phase != out[j].Phase {
			return out[i].Phase < out[j].Phase
		}
		if out[i].Hook != out[j].Hook {
			return out[i].Hook < out[j].Hook
		}
		return !out[i].Mandatory && out[j].Mandatory
	})
	if len(out) == 0 {
		return nil
	}
	return out
}
