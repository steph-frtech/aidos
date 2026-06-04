package agentimpl

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Reproducibility / invariant mirror (rapid, N1): reflects=runtime.agentimpl (the
// CAPACITY-axis enforcer, BA07), test_kind=invariant, cert_language=rapid,
// liveness=live, authority=below.
//
// THE LAW OF BA07 (the capability axis joins the zone axis). The S04/S52 wall
// applies the ZONE axis (MayWrite — deny truth zones). BA07 applies the CAPACITY
// axis: a build-agent may exercise an MCP tool ONLY if (server, tool) is present in
// the resolved implementation's Tools (an Enabled binding). The enforcer is a PURE
// TOTAL function, fail-closed (default-deny): anything not explicitly bound is
// refused, never the inverse. Restated as one invariant:
//
//	ToolAllowed(impl, server, tool).allowed == true  IFF  (server, tool) ∈ impl.Tools
//
// and on a deny the verdict carries the NEW S13 BlockReason code
// AGENT_TOOL_NOT_BOUND (the actionable form, naming the idée→miroir→/goal door to
// add a binding). The same fail-closed verdict SHAPE as MayWrite (allowed bool +
// *BlockReason), but on the capability axis.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): ToolAllowed is set-membership, never a
// judgment — a pure total function of (impl, server, tool), no DB/clock/rng/I/O, so
// the same input always yields the same verdict. This file IS the reproducibility
// mirror.

// genServerTool draws an arbitrary (server, tool) pair from a small alphabet so the
// generator regularly hits BOTH the bound and the unbound case.
func genServerTool() *rapid.Generator[ResolvedTool] {
	names := []string{"store", "mirror-runner", "changeset", "memory", "context", "dag", "telemetry-reader", ""}
	tools := []string{"read", "write", "query", "run", "list", "propose", "approve", ""}
	return rapid.Custom(func(t *rapid.T) ResolvedTool {
		return ResolvedTool{
			Server: rapid.SampledFrom(names).Draw(t, "server"),
			Tool:   rapid.SampledFrom(tools).Draw(t, "tool"),
		}
	})
}

// genResolvedToolSet draws an arbitrary set of resolved tool bindings (the impl's
// capability surface) from the same alphabet.
func genResolvedToolSet() *rapid.Generator[[]ResolvedTool] {
	return rapid.SliceOfN(genServerTool(), 0, 6)
}

func contains(set []ResolvedTool, server, tool string) bool {
	for _, rt := range set {
		if rt.Server == server && rt.Tool == tool {
			return true
		}
	}
	return false
}

// TestProp_ToolAllowed_TrueIffBound: allowed == true IFF (server, tool) ∈ impl.Tools.
// This is the BA07 law — set-membership, default-deny on the unknown.
func TestProp_ToolAllowed_TrueIffBound(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		set := genResolvedToolSet().Draw(rt, "tools")
		probe := genServerTool().Draw(rt, "probe")
		impl := AgentImplementation{Tools: set}

		dec := ToolAllowed(impl, probe.Server, probe.Tool)
		want := contains(set, probe.Server, probe.Tool)

		if dec.Allowed != want {
			rt.Fatalf("ToolAllowed(%+v, %q, %q).Allowed = %v, want %v (set=%+v)",
				impl, probe.Server, probe.Tool, dec.Allowed, want, set)
		}
	})
}

// TestProp_ToolAllowed_AllowCarriesNoBlockReason: an allowed verdict carries NO
// BlockReason (the same shape as MayWrite on an allow).
func TestProp_ToolAllowed_AllowCarriesNoBlockReason(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		set := genResolvedToolSet().Draw(rt, "tools")
		impl := AgentImplementation{Tools: set}
		// Probe one of the bound tools (guaranteed allow) — skip empty sets.
		if len(set) == 0 {
			return
		}
		idx := rapid.IntRange(0, len(set)-1).Draw(rt, "idx")
		probe := set[idx]

		dec := ToolAllowed(impl, probe.Server, probe.Tool)
		if !dec.Allowed {
			rt.Fatalf("a bound tool %+v must be allowed", probe)
		}
		if dec.BlockReason != nil {
			rt.Fatalf("an allowed verdict must carry no BlockReason, got %+v", dec.BlockReason)
		}
	})
}

// TestProp_ToolAllowed_DenyCarriesAgentToolNotBound: an unbound (server, tool) is
// DENIED with the S13 code AGENT_TOOL_NOT_BOUND and a non-empty how_to_fix path
// (never the prison) — the actionable verdict naming the idée→miroir→/goal door.
func TestProp_ToolAllowed_DenyCarriesAgentToolNotBound(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		set := genResolvedToolSet().Draw(rt, "tools")
		probe := genServerTool().Draw(rt, "probe")
		impl := AgentImplementation{Tools: set}

		dec := ToolAllowed(impl, probe.Server, probe.Tool)
		if dec.Allowed {
			return // only the deny branch is under test here
		}
		if dec.BlockReason == nil {
			rt.Fatalf("a denied verdict MUST carry a BlockReason (the fail-closed shape)")
		}
		if dec.BlockReason.Code != blockreason.CodeAgentToolNotBound {
			rt.Fatalf("deny must carry AGENT_TOOL_NOT_BOUND, got %q", dec.BlockReason.Code)
		}
		if len(dec.BlockReason.HowToFix) < 1 {
			rt.Fatalf("AGENT_TOOL_NOT_BOUND how_to_fix must be non-empty (never the prison)")
		}
	})
}

// TestProp_ToolAllowed_DefaultDenyEmptyImpl: an impl with NO bound tools denies
// EVERY (server, tool) — the fail-closed default (max confinement).
func TestProp_ToolAllowed_DefaultDenyEmptyImpl(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		probe := genServerTool().Draw(rt, "probe")
		impl := AgentImplementation{} // no Tools

		dec := ToolAllowed(impl, probe.Server, probe.Tool)
		if dec.Allowed {
			rt.Fatalf("an impl with no bound tools must deny every (%q, %q)", probe.Server, probe.Tool)
		}
		if dec.BlockReason == nil || dec.BlockReason.Code != blockreason.CodeAgentToolNotBound {
			rt.Fatalf("default-deny must carry AGENT_TOOL_NOT_BOUND, got %+v", dec.BlockReason)
		}
	})
}

// TestProp_ToolAllowed_Deterministic: same input ⇒ same verdict (the determinism-
// first reproducibility property — set-membership, never a judgment).
func TestProp_ToolAllowed_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		set := genResolvedToolSet().Draw(rt, "tools")
		probe := genServerTool().Draw(rt, "probe")
		impl := AgentImplementation{Tools: set}

		a := ToolAllowed(impl, probe.Server, probe.Tool)
		b := ToolAllowed(impl, probe.Server, probe.Tool)
		if a.Allowed != b.Allowed {
			rt.Fatalf("non-deterministic allowed: %v vs %v", a.Allowed, b.Allowed)
		}
		if (a.BlockReason == nil) != (b.BlockReason == nil) {
			rt.Fatalf("non-deterministic BlockReason presence")
		}
		if a.BlockReason != nil && a.BlockReason.Code != b.BlockReason.Code {
			rt.Fatalf("non-deterministic BlockReason code: %q vs %q", a.BlockReason.Code, b.BlockReason.Code)
		}
	})
}

// ── BA09 — the CONFINEMENT enforcers PathAllowed / EgressAllowed / ExecAllowed ─────
//
// THE LAW OF BA09 (the confinement axis joins the zone + capacity + skill axes). The
// S04/S52 wall applies the ZONE axis (MayWrite/Classify — a DENY-LIST: a target
// resolving above the waterline is refused). BA09 adds the CONFINEMENT axis as an
// ALLOW-LIST, fail-closed and DISTINCT from the zone deny-list:
//
//   - PathAllowed(impl, target): allowed IFF target is covered by an AllowedPaths
//     prefix AND NOT covered by any ForbiddenPaths prefix. Default-deny: an EMPTY
//     AllowedPaths denies EVERY path (max confinement). On a deny: AGENT_PATH_NOT_ALLOWED.
//   - EgressAllowed(impl, host): allowed IFF host ∈ AllowedNetworkHosts. Empty ⇒ no
//     egress (fail-closed). On a deny: AGENT_EGRESS_NOT_ALLOWED.
//   - ExecAllowed(impl, cmd): allowed IFF cmd ∈ AllowedExec. Empty ⇒ no subprocess
//     (fail-closed). On a deny: AGENT_EXEC_NOT_ALLOWED.
//
// The path allow-list is DISTINCT from the Classify deny-list: a path can be denied by
// confinement (outside AllowedPaths) while NOT being above the waterline, and the two
// invariants (allow + deny) co-exist. Restated:
//
//	PathAllowed(impl, t).allowed == true  IFF  (∃ a∈AllowedPaths: prefix(a,t)) ∧ (∄ f∈ForbiddenPaths: prefix(f,t))
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): all three are pure total set/prefix predicates,
// never a judgment — no DB/clock/rng/I/O, same input ⇒ same verdict. This block IS the
// reproducibility mirror.

// genPath draws an arbitrary on-disk target so the generator regularly hits both the
// covered and the uncovered case (incl. the empty path and a forbidden-overlap path).
func genPath() *rapid.Generator[string] {
	paths := []string{
		"apps/demo/src/main.go", "apps/demo/README.md", "apps/other/x.ts",
		"back/kernel/foo.go", "back/migrations/001.sql", "tmp/scratch", "",
	}
	return rapid.SampledFrom(paths)
}

func genPrefixSet() *rapid.Generator[[]string] {
	prefixes := []string{"apps/demo/", "apps/", "back/kernel/", "tmp/", ""}
	return rapid.SliceOfN(rapid.SampledFrom(prefixes), 0, 4)
}

// coveredByPrefix is the reference predicate: does some non-empty prefix cover target?
func coveredByPrefix(prefixes []string, target string) bool {
	if target == "" {
		return false
	}
	for _, p := range prefixes {
		if p == "" {
			continue
		}
		if len(target) >= len(p) && target[:len(p)] == p {
			return true
		}
	}
	return false
}

// TestProp_PathAllowed_TrueIffCoveredAndNotForbidden: the BA09 confinement law.
func TestProp_PathAllowed_TrueIffCoveredAndNotForbidden(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		allowed := genPrefixSet().Draw(rt, "allowed")
		forbidden := genPrefixSet().Draw(rt, "forbidden")
		target := genPath().Draw(rt, "target")
		impl := AgentImplementation{AllowedPaths: allowed, ForbiddenPaths: forbidden}

		dec := PathAllowed(impl, target)
		want := coveredByPrefix(allowed, target) && !coveredByPrefix(forbidden, target)

		if dec.Allowed != want {
			rt.Fatalf("PathAllowed(allowed=%v forbidden=%v, %q).Allowed = %v, want %v",
				allowed, forbidden, target, dec.Allowed, want)
		}
	})
}

// TestProp_PathAllowed_AllowCarriesNoBlockReason: an allowed verdict carries NO BlockReason.
func TestProp_PathAllowed_AllowCarriesNoBlockReason(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		allowed := genPrefixSet().Draw(rt, "allowed")
		target := genPath().Draw(rt, "target")
		// No forbidden paths ⇒ allowed IFF covered.
		impl := AgentImplementation{AllowedPaths: allowed}
		dec := PathAllowed(impl, target)
		if dec.Allowed && dec.BlockReason != nil {
			rt.Fatalf("an allowed verdict must carry no BlockReason, got %+v", dec.BlockReason)
		}
	})
}

// TestProp_PathAllowed_DenyCarriesAgentPathNotAllowed: a denied path carries the S13
// code AGENT_PATH_NOT_ALLOWED + a non-empty how_to_fix (never the prison).
func TestProp_PathAllowed_DenyCarriesAgentPathNotAllowed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		allowed := genPrefixSet().Draw(rt, "allowed")
		forbidden := genPrefixSet().Draw(rt, "forbidden")
		target := genPath().Draw(rt, "target")
		impl := AgentImplementation{AllowedPaths: allowed, ForbiddenPaths: forbidden}
		dec := PathAllowed(impl, target)
		if dec.Allowed {
			return
		}
		if dec.BlockReason == nil {
			rt.Fatalf("a denied verdict MUST carry a BlockReason (the fail-closed shape)")
		}
		if dec.BlockReason.Code != blockreason.CodeAgentPathNotAllowed {
			rt.Fatalf("deny must carry AGENT_PATH_NOT_ALLOWED, got %q", dec.BlockReason.Code)
		}
		if len(dec.BlockReason.HowToFix) < 1 {
			rt.Fatalf("AGENT_PATH_NOT_ALLOWED how_to_fix must be non-empty (never the prison)")
		}
	})
}

// TestProp_PathAllowed_DefaultDenyEmptyImpl: an impl with NO AllowedPaths denies EVERY
// path — the fail-closed default (max confinement), DISTINCT from the zone deny-list.
func TestProp_PathAllowed_DefaultDenyEmptyImpl(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		target := genPath().Draw(rt, "target")
		impl := AgentImplementation{} // no AllowedPaths
		dec := PathAllowed(impl, target)
		if dec.Allowed {
			rt.Fatalf("an impl with no allowed paths must deny every path %q", target)
		}
		if dec.BlockReason == nil || dec.BlockReason.Code != blockreason.CodeAgentPathNotAllowed {
			rt.Fatalf("default-deny must carry AGENT_PATH_NOT_ALLOWED, got %+v", dec.BlockReason)
		}
	})
}

// TestProp_PathAllowed_Deterministic: same input ⇒ same verdict.
func TestProp_PathAllowed_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		allowed := genPrefixSet().Draw(rt, "allowed")
		forbidden := genPrefixSet().Draw(rt, "forbidden")
		target := genPath().Draw(rt, "target")
		impl := AgentImplementation{AllowedPaths: allowed, ForbiddenPaths: forbidden}
		a := PathAllowed(impl, target)
		b := PathAllowed(impl, target)
		if a.Allowed != b.Allowed {
			rt.Fatalf("non-deterministic allowed: %v vs %v", a.Allowed, b.Allowed)
		}
		if (a.BlockReason == nil) != (b.BlockReason == nil) {
			rt.Fatalf("non-deterministic BlockReason presence")
		}
	})
}

// TestProp_EgressAllowed_TrueIffDeclared: allowed IFF host ∈ AllowedNetworkHosts;
// empty ⇒ no egress (fail-closed); deny carries AGENT_EGRESS_NOT_ALLOWED.
func TestProp_EgressAllowed_TrueIffDeclared(t *testing.T) {
	hosts := []string{"api.anthropic.com", "registry.npmjs.org", "evil.example", ""}
	rapid.Check(t, func(rt *rapid.T) {
		set := rapid.SliceOfN(rapid.SampledFrom(hosts), 0, 4).Draw(rt, "hosts")
		probe := rapid.SampledFrom(hosts).Draw(rt, "probe")
		impl := AgentImplementation{AllowedNetworkHosts: set}
		dec := EgressAllowed(impl, probe)

		want := false
		if probe != "" {
			for _, h := range set {
				if h == probe {
					want = true
				}
			}
		}
		if dec.Allowed != want {
			rt.Fatalf("EgressAllowed(set=%v, %q).Allowed = %v, want %v", set, probe, dec.Allowed, want)
		}
		if !dec.Allowed {
			if dec.BlockReason == nil || dec.BlockReason.Code != blockreason.CodeAgentEgressNotAllowed {
				rt.Fatalf("deny must carry AGENT_EGRESS_NOT_ALLOWED, got %+v", dec.BlockReason)
			}
		} else if dec.BlockReason != nil {
			rt.Fatalf("an allowed egress must carry no BlockReason")
		}
	})
}

// TestProp_ExecAllowed_TrueIffDeclared: allowed IFF cmd ∈ AllowedExec; empty ⇒ no
// subprocess (fail-closed); deny carries AGENT_EXEC_NOT_ALLOWED. The agent's Bash is
// itself gated — every command passes ExecAllowed, never a free shell.
func TestProp_ExecAllowed_TrueIffDeclared(t *testing.T) {
	cmds := []string{"go", "npm", "rm", "curl", ""}
	rapid.Check(t, func(rt *rapid.T) {
		set := rapid.SliceOfN(rapid.SampledFrom(cmds), 0, 4).Draw(rt, "cmds")
		probe := rapid.SampledFrom(cmds).Draw(rt, "probe")
		impl := AgentImplementation{AllowedExec: set}
		dec := ExecAllowed(impl, probe)

		want := false
		if probe != "" {
			for _, c := range set {
				if c == probe {
					want = true
				}
			}
		}
		if dec.Allowed != want {
			rt.Fatalf("ExecAllowed(set=%v, %q).Allowed = %v, want %v", set, probe, dec.Allowed, want)
		}
		if !dec.Allowed {
			if dec.BlockReason == nil || dec.BlockReason.Code != blockreason.CodeAgentExecNotAllowed {
				rt.Fatalf("deny must carry AGENT_EXEC_NOT_ALLOWED, got %+v", dec.BlockReason)
			}
		} else if dec.BlockReason != nil {
			rt.Fatalf("an allowed exec must carry no BlockReason")
		}
	})
}

// TestProp_PathAllowed_DistinctFromZoneDenyList: the confinement allow-list is DISTINCT
// from the Classify zone deny-list — a path NOT above the waterline can still be denied
// by confinement, and the two invariants co-exist on the same impl.
func TestProp_PathAllowed_DistinctFromZoneDenyList(t *testing.T) {
	// "tmp/scratch" is NOT above the waterline (the zone deny-list lets it pass)…
	if IsAboveWaterline("tmp/scratch") {
		t.Fatalf("precondition: tmp/scratch must not be above the waterline")
	}
	// …yet with an AllowedPaths that does not cover it, confinement DENIES it.
	impl := AgentImplementation{AllowedPaths: []string{"apps/demo/"}}
	dec := PathAllowed(impl, "tmp/scratch")
	if dec.Allowed {
		t.Fatalf("confinement must deny tmp/scratch (outside AllowedPaths) even though the zone deny-list passes it")
	}
	if dec.BlockReason == nil || dec.BlockReason.Code != blockreason.CodeAgentPathNotAllowed {
		t.Fatalf("confinement deny must carry AGENT_PATH_NOT_ALLOWED, got %+v", dec.BlockReason)
	}
	// The allow invariant co-exists: a path under AllowedPaths AND outside ForbiddenPaths passes.
	implOK := AgentImplementation{AllowedPaths: []string{"apps/demo/"}, ForbiddenPaths: []string{"apps/demo/secret/"}}
	if !PathAllowed(implOK, "apps/demo/src/main.go").Allowed {
		t.Fatalf("a path under AllowedPaths and outside ForbiddenPaths must pass")
	}
	if PathAllowed(implOK, "apps/demo/secret/key").Allowed {
		t.Fatalf("a path under a ForbiddenPaths prefix must be denied")
	}
}

// ── BA08 — the SKILL-axis enforcer SkillAllowed (the reproducibility mirror) ───────
//
// THE LAW OF BA08 (the skill axis joins the zone + capacity axes). The S04/S52 wall
// applies the ZONE axis (MayWrite — deny truth zones); BA07 applies the CAPACITY axis
// (ToolAllowed — default-deny an unbound MCP tool); BA08 applies the SKILL axis: a
// build-agent may use a skill ONLY if it is present in the resolved implementation's
// Skills (the Enabled SkillBindings BA05 resolved). The enforcer is a PURE TOTAL
// function, fail-closed (default-deny): anything not explicitly bound is refused,
// never the inverse. Restated as one invariant:
//
//	SkillAllowed(impl, skill).allowed == true  IFF  skill ∈ impl.Skills
//
// and on a deny the verdict carries the NEW S13 BlockReason code
// AGENT_SKILL_NOT_BOUND (the actionable form, naming the idée→miroir→/goal door to
// add a binding). The same fail-closed verdict SHAPE as MayWrite/ToolAllowed (allowed
// bool + *BlockReason), but on the skill axis — the 3rd of the four declared axes.
// Without it SkillBinding.Enabled is mere documentation: an ungoverned skill is the
// same leak class as an ungoverned tool (§5/§35).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): SkillAllowed is set-membership, never a
// judgment — a pure total function of (impl, skill), no DB/clock/rng/I/O, so the
// same input always yields the same verdict. This block IS the reproducibility mirror.

// genSkill draws an arbitrary skill name from a small alphabet so the generator
// regularly hits BOTH the bound and the unbound case (incl. the empty skill).
func genSkill() *rapid.Generator[string] {
	skills := []string{"tdd", "write-bdd-scenario", "derive-mirror", "evolve", "grill", "diagnose", "context", ""}
	return rapid.SampledFrom(skills)
}

// genSkillSet draws an arbitrary set of resolved skill names (the impl's skill surface).
func genSkillSet() *rapid.Generator[[]string] {
	return rapid.SliceOfN(genSkill(), 0, 6)
}

func containsSkill(set []string, skill string) bool {
	for _, s := range set {
		if s == skill {
			return true
		}
	}
	return false
}

// TestProp_SkillAllowed_TrueIffBound: allowed == true IFF skill ∈ impl.Skills.
// This is the BA08 law — set-membership, default-deny on the unknown.
func TestProp_SkillAllowed_TrueIffBound(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		set := genSkillSet().Draw(rt, "skills")
		probe := genSkill().Draw(rt, "probe")
		impl := AgentImplementation{Skills: set}

		dec := SkillAllowed(impl, probe)
		want := containsSkill(set, probe)

		if dec.Allowed != want {
			rt.Fatalf("SkillAllowed(%+v, %q).Allowed = %v, want %v", impl, probe, dec.Allowed, want)
		}
	})
}

// TestProp_SkillAllowed_AllowCarriesNoBlockReason: an allowed verdict carries NO
// BlockReason (the same shape as MayWrite/ToolAllowed on an allow).
func TestProp_SkillAllowed_AllowCarriesNoBlockReason(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		set := genSkillSet().Draw(rt, "skills")
		impl := AgentImplementation{Skills: set}
		if len(set) == 0 {
			return
		}
		idx := rapid.IntRange(0, len(set)-1).Draw(rt, "idx")
		probe := set[idx]

		dec := SkillAllowed(impl, probe)
		if !dec.Allowed {
			rt.Fatalf("a bound skill %q must be allowed", probe)
		}
		if dec.BlockReason != nil {
			rt.Fatalf("an allowed verdict must carry no BlockReason, got %+v", dec.BlockReason)
		}
	})
}

// TestProp_SkillAllowed_DenyCarriesAgentSkillNotBound: an unbound skill is DENIED
// with the S13 code AGENT_SKILL_NOT_BOUND and a non-empty how_to_fix path (never the
// prison) — the actionable verdict naming the idée→miroir→/goal door.
func TestProp_SkillAllowed_DenyCarriesAgentSkillNotBound(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		set := genSkillSet().Draw(rt, "skills")
		probe := genSkill().Draw(rt, "probe")
		impl := AgentImplementation{Skills: set}

		dec := SkillAllowed(impl, probe)
		if dec.Allowed {
			return // only the deny branch is under test here
		}
		if dec.BlockReason == nil {
			rt.Fatalf("a denied verdict MUST carry a BlockReason (the fail-closed shape)")
		}
		if dec.BlockReason.Code != blockreason.CodeAgentSkillNotBound {
			rt.Fatalf("deny must carry AGENT_SKILL_NOT_BOUND, got %q", dec.BlockReason.Code)
		}
		if len(dec.BlockReason.HowToFix) < 1 {
			rt.Fatalf("AGENT_SKILL_NOT_BOUND how_to_fix must be non-empty (never the prison)")
		}
	})
}

// TestProp_SkillAllowed_DefaultDenyEmptyImpl: an impl with NO bound skills denies
// EVERY skill — the fail-closed default (max confinement).
func TestProp_SkillAllowed_DefaultDenyEmptyImpl(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		probe := genSkill().Draw(rt, "probe")
		impl := AgentImplementation{} // no Skills

		dec := SkillAllowed(impl, probe)
		if dec.Allowed {
			rt.Fatalf("an impl with no bound skills must deny every skill %q", probe)
		}
		if dec.BlockReason == nil || dec.BlockReason.Code != blockreason.CodeAgentSkillNotBound {
			rt.Fatalf("default-deny must carry AGENT_SKILL_NOT_BOUND, got %+v", dec.BlockReason)
		}
	})
}

// TestProp_SkillAllowed_Deterministic: same input ⇒ same verdict (the determinism-
// first reproducibility property — set-membership, never a judgment).
func TestProp_SkillAllowed_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		set := genSkillSet().Draw(rt, "skills")
		probe := genSkill().Draw(rt, "probe")
		impl := AgentImplementation{Skills: set}

		a := SkillAllowed(impl, probe)
		b := SkillAllowed(impl, probe)
		if a.Allowed != b.Allowed {
			rt.Fatalf("non-deterministic allowed: %v vs %v", a.Allowed, b.Allowed)
		}
		if (a.BlockReason == nil) != (b.BlockReason == nil) {
			rt.Fatalf("non-deterministic BlockReason presence")
		}
		if a.BlockReason != nil && a.BlockReason.Code != b.BlockReason.Code {
			rt.Fatalf("non-deterministic BlockReason code: %q vs %q", a.BlockReason.Code, b.BlockReason.Code)
		}
	})
}
