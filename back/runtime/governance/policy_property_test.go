// policy_property_test.go — GV05 EQUIVALENCE + tighten-never-widen mirror (RED-first).
//
// RED-FIRST. Written before policy.go existed; the first run failed to compile (no
// CompilePolicy / Policy / GateUnderPolicy / SamplePolicyYAML / TightenPolicyYAML /
// WidenPolicyYAML). That compile-red IS the goal. Green follows the YAML compiler being
// wired to project a Policy onto the REAL AgentImplementation the existing GateAction reads.
// There is no LLM in this mirror: the JUDGE is the existing GateAction itself (CLAUDE.md
// §6/§8 determinism-first — a policy compiler is a pure parse+project, never an "LLM
// translating policy to code").
//
// THE GV05 DONE-CRITERIA, PINNED:
//
//   - ÉQUIVALENCE — TestEquivalence_PolicyMatchesEnforcers: for ANY sampled action, the
//     policy compiled from the reference surface produces EXACTLY the same Decision
//     (Allowed, DeniedAxis, BlockReason.Code) as the reference AgentImplementation read
//     directly by GateAction. The YAML is a SOURCE; GateAction is the PROJECTION's judge;
//     they cannot diverge (the property proves it over a generated action space).
//
//   - TIGHTEN-NEVER-WIDEN — TestTighten_NeverWidens: a TIGHTER policy (a strict SUBSET of
//     the reference allow-lists / a LOWER budget cap) denies a SUPERSET of actions — for
//     every action the reference denied, the tighter policy also denies; the tighter policy
//     NEVER allows an action the reference denied. determinism-first: the declared YAML can
//     only EQUAL or RESSERRER the wall, never widen it.
//
//   - WIDEN-IS-REFUSED — TestWiden_IsRejected: a policy that tries to WIDEN beyond the
//     reference (admit a host/path/tool/skill the reference forbids, or RAISE the budget
//     cap above the reference) is REJECTED by the compiler (CompilePolicy returns an error)
//     — the compiler structurally CANNOT emit a wider-than-reference enforcer.
//
//   - ROUND-TRIP / DETERMINISTIC — TestPolicy_RoundTripDeterministic: the same YAML compiles
//     to the same Policy twice (byte-stable), and the compiled gate is reproducible.
package governance

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"pgregory.net/rapid"
)

// drawAction generates a structurally-varied Action across every gate axis, so the
// equivalence property exercises the WHOLE perimeter (zone/path/egress/exec/capacity/
// skill), not a single axis.
func drawAction(rt *rapid.T) agentimpl.Action {
	targets := []string{
		"", "kernel.truth", "back/kernel/x.go", "back/runtime/governance/x.go",
		"front/web/app/secret/page.tsx", "back/migrations/001.sql",
	}
	hosts := []string{"", "evil.example.com", "api.anthropic.com"}
	execs := []string{"", "/bin/sh", "go"}
	servers := []string{"", "store", "privileged"}
	tools := []string{"", "read", "deploy"}
	skills := []string{"", "tdd", "untrusted-third-party"}
	return agentimpl.Action{
		Target: rapid.SampledFrom(targets).Draw(rt, "target"),
		Host:   rapid.SampledFrom(hosts).Draw(rt, "host"),
		Exec:   rapid.SampledFrom(execs).Draw(rt, "exec"),
		Server: rapid.SampledFrom(servers).Draw(rt, "server"),
		Tool:   rapid.SampledFrom(tools).Draw(rt, "tool"),
		Skill:  rapid.SampledFrom(skills).Draw(rt, "skill"),
	}
}

// TestEquivalence_PolicyMatchesEnforcers is the load-bearing GV05 proof: the YAML-compiled
// policy and the reference enforcer give the IDENTICAL Decision for every sampled action.
func TestEquivalence_PolicyMatchesEnforcers(t *testing.T) {
	pol, err := CompilePolicy(SamplePolicyYAML())
	if err != nil {
		t.Fatalf("reference policy must compile: %v", err)
	}
	ref := ReferenceImpl()
	rapid.Check(t, func(rt *rapid.T) {
		act := drawAction(rt)
		fromPolicy := GateUnderPolicy(pol, act)
		fromEnforcer := agentimpl.GateAction(ref, act, agentimpl.RunMeter{}, pol.harnessBudget(), pol.goalBudget(), 0, nil)
		if fromPolicy.Allowed != fromEnforcer.Allowed {
			rt.Fatalf("Allowed diverged for %+v: policy=%v enforcer=%v", act, fromPolicy.Allowed, fromEnforcer.Allowed)
		}
		if fromPolicy.DeniedAxis != fromEnforcer.DeniedAxis {
			rt.Fatalf("DeniedAxis diverged for %+v: policy=%q enforcer=%q", act, fromPolicy.DeniedAxis, fromEnforcer.DeniedAxis)
		}
		if brCode(fromPolicy.BlockReason) != brCode(fromEnforcer.BlockReason) {
			rt.Fatalf("BlockReason diverged for %+v: policy=%q enforcer=%q",
				act, brCode(fromPolicy.BlockReason), brCode(fromEnforcer.BlockReason))
		}
	})
}

// TestTighten_NeverWidens pins the determinism-first half: a TIGHTER policy denies a
// SUPERSET — it never allows an action the reference denied.
func TestTighten_NeverWidens(t *testing.T) {
	ref, err := CompilePolicy(SamplePolicyYAML())
	if err != nil {
		t.Fatalf("reference policy must compile: %v", err)
	}
	tight, err := CompilePolicy(TightenPolicyYAML())
	if err != nil {
		t.Fatalf("tighter policy must compile (a subset is legal): %v", err)
	}
	rapid.Check(t, func(rt *rapid.T) {
		act := drawAction(rt)
		refD := GateUnderPolicy(ref, act)
		tightD := GateUnderPolicy(tight, act)
		// If the reference DENIED, the tighter policy MUST also deny (never widen).
		if !refD.Allowed && tightD.Allowed {
			rt.Fatalf("tighter policy WIDENED: reference denied %+v but tighter allowed it", act)
		}
	})
}

// TestWiden_IsRejected pins that the compiler structurally refuses a wider-than-reference
// policy: admitting a forbidden host/path/tool/skill or RAISING a budget cap is an error.
func TestWiden_IsRejected(t *testing.T) {
	for name, y := range WidenPolicyYAMLs() {
		if _, err := CompilePolicy(y); err == nil {
			t.Errorf("widening policy %q compiled but must be REJECTED (YAML can only equal or tighten)", name)
		}
	}
}

// TestPolicy_RoundTripDeterministic pins determinism: same YAML ⇒ same Policy + same gate.
func TestPolicy_RoundTripDeterministic(t *testing.T) {
	a, err1 := CompilePolicy(SamplePolicyYAML())
	b, err2 := CompilePolicy(SamplePolicyYAML())
	if err1 != nil || err2 != nil {
		t.Fatalf("compile errors: %v %v", err1, err2)
	}
	rapid.Check(t, func(rt *rapid.T) {
		act := drawAction(rt)
		da, db := GateUnderPolicy(a, act), GateUnderPolicy(b, act)
		if da.Allowed != db.Allowed || da.DeniedAxis != db.DeniedAxis || brCode(da.BlockReason) != brCode(db.BlockReason) {
			rt.Fatalf("policy gate drifted between compiles for %+v", act)
		}
	})
}
