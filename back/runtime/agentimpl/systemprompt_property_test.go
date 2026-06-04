package agentimpl_test

// Property mirror (∀) for the DETERMINISTIC SystemPrompt assembly (BA04).
// reflects=runtime.agent_system_prompt · test_kind=property · cert_language=rapid ·
// liveness=live · authority=below.
//
// AssembleSystemPrompt is a PURE TEMPLATE over the ONLY declared fields. The
// invariants pinned here (the RED set BA04 turns green):
//  1. DETERMINISTIC: identical projections → identical prompts (same input ⇒ same
//     output, no clock/rng/I/O).
//  2. RESPONSIVE: changing a DECLARED field (Role / Objectif / a StopCondition / an
//     AllowedPath) changes the prompt.
//  3. NO LEAK: a field that is NOT one of the declared template inputs (Seed, APIKey
//     via cfg, MaxConcurrency, ResourceLimits, Tools, Skills, Hooks, Model,
//     Temperature, MaxTurns, LayerRef) can NOT change the prompt — only the declared
//     template inputs can.
//  4. THE WALL IS ALWAYS PRESENT: the kernel/mirror zones appear in EVERY prompt
//     (defence in depth — the wall is in the prompt AND the hooks AND the GRANTs).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"pgregory.net/rapid"
)

// drawPromptImpl draws a valid, fully-resolved projection with declared
// Role/Objectif/StopConditions and AllowedPaths varied.
func drawPromptImpl(rt *rapid.T) agentimpl.AgentImplementation {
	impl := goldenImpl()
	impl.Role = rapid.SampledFrom([]string{"executor", "bdd-writer", "verifier"}).Draw(rt, "role")
	impl.Objectif = rapid.StringMatching(`[a-z ]{4,30}`).Draw(rt, "objectif")
	n := rapid.IntRange(0, 4).Draw(rt, "nStop")
	stops := make([]string, 0, n)
	for i := 0; i < n; i++ {
		stops = append(stops, rapid.StringMatching(`[a-z ]{3,20}`).Draw(rt, "stop"))
	}
	impl.StopConditions = stops
	np := rapid.IntRange(1, 3).Draw(rt, "nPath")
	paths := make([]string, 0, np)
	for i := 0; i < np; i++ {
		paths = append(paths, rapid.SampledFrom([]string{"front/web", "back/gen", "back/internal", "docs"}).Draw(rt, "path"))
	}
	impl.AllowedPaths = paths
	return impl
}

// (1) Deterministic: identical projections → identical prompts.
func TestProp_SystemPrompt_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		impl := drawPromptImpl(rt)
		p1 := agentimpl.AssembleSystemPrompt(impl)
		p2 := agentimpl.AssembleSystemPrompt(impl)
		if p1 != p2 {
			rt.Fatalf("AssembleSystemPrompt is not deterministic:\n%q\n!=\n%q", p1, p2)
		}
	})
}

// (2) Changing a DECLARED field changes the prompt.
func TestProp_SystemPrompt_DeclaredFieldChangesPrompt(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		impl := drawPromptImpl(rt)
		base := agentimpl.AssembleSystemPrompt(impl)

		// Role
		r := impl
		r.Role = impl.Role + "-X"
		if agentimpl.AssembleSystemPrompt(r) == base {
			rt.Fatalf("changing Role must change the prompt")
		}
		// Objectif
		o := impl
		o.Objectif = impl.Objectif + " EXTRA"
		if agentimpl.AssembleSystemPrompt(o) == base {
			rt.Fatalf("changing Objectif must change the prompt")
		}
		// AllowedPaths
		a := impl
		a.AllowedPaths = append(append([]string{}, impl.AllowedPaths...), "NEW/zone/added")
		if agentimpl.AssembleSystemPrompt(a) == base {
			rt.Fatalf("changing AllowedPaths must change the prompt")
		}
		// A StopCondition
		s := impl
		s.StopConditions = append(append([]string{}, impl.StopConditions...), "a-new-stop-rule")
		if agentimpl.AssembleSystemPrompt(s) == base {
			rt.Fatalf("adding a StopCondition must change the prompt")
		}
	})
}

// (3) No leak: a NON-declared field can NOT change the prompt. We perturb every
// field that is NOT one of the declared template inputs and assert the prompt is
// byte-identical.
func TestProp_SystemPrompt_NoOutOfLayerLeak(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		impl := drawPromptImpl(rt)
		base := agentimpl.AssembleSystemPrompt(impl)

		perturbed := impl
		perturbed.Seed = "a-totally-different-seed-value-0123456789"
		perturbed.MaxConcurrency = impl.MaxConcurrency + 7
		perturbed.MaxTurns = impl.MaxTurns + 13
		perturbed.Temperature = 1.7
		perturbed.Model = "claude-haiku-4-5"
		perturbed.LayerRef = "agentlayer:OTHER-VERSION"
		perturbed.ResourceLimits.MaxMemoryMB = impl.ResourceLimits.MaxMemoryMB + 999
		perturbed.Tools = []agentimpl.ResolvedTool{{Server: "leak", Tool: "leak"}}
		perturbed.Skills = []string{"leaked-skill"}
		perturbed.Hooks = []agentimpl.ResolvedHook{{Phase: "Stop", Hook: "leak", Mandatory: true}}
		perturbed.AllowedNetworkHosts = []string{"leak.example.com"}
		perturbed.AllowedExec = []string{"leak-cmd"}

		if agentimpl.AssembleSystemPrompt(perturbed) != base {
			rt.Fatalf("a NON-declared field leaked into the prompt — only Role/Objectif/StopConditions/AllowedPaths/ForbiddenPaths are template inputs")
		}
	})
}

// (4) The wall is ALWAYS present — every kernel/mirror zone appears in every prompt.
func TestProp_SystemPrompt_AlwaysCarriesWall(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		impl := drawPromptImpl(rt)
		prompt := agentimpl.AssembleSystemPrompt(impl)
		for _, w := range agentimpl.WallForbiddenPaths() {
			if !strings.Contains(prompt, w) {
				rt.Fatalf("the assembled prompt must always carry the wall zone %q (defence in depth)", w)
			}
		}
		// /kernel/** /mirror/** prose markers from the spec are present.
		for _, marker := range []string{"kernel", "mirrors"} {
			if !strings.Contains(prompt, marker) {
				rt.Fatalf("the wall prose must name %q", marker)
			}
		}
	})
}

// (5) ForbiddenPaths appear VERBATIM in the prompt (no paraphrase, no omission).
func TestProp_SystemPrompt_ForbiddenPathsVerbatim(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		impl := drawPromptImpl(rt)
		prompt := agentimpl.AssembleSystemPrompt(impl)
		for _, fp := range impl.ForbiddenPaths {
			if !strings.Contains(prompt, fp) {
				rt.Fatalf("ForbiddenPath %q must appear verbatim in the prompt", fp)
			}
		}
		for _, ap := range impl.AllowedPaths {
			if !strings.Contains(prompt, ap) {
				rt.Fatalf("AllowedPath %q must appear verbatim in the prompt", ap)
			}
		}
	})
}
