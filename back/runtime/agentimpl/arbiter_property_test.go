// arbiter_property_test.go — the RED-first reproducibility + structure-invariance mirror
// of BA12. It pins the determinism-first ARBITER Arbitrate(action) → Verdict that encodes
// the determinism-first SKILL mapping table IN CODE (diff → jj/Myers, search → rg, format →
// biome/gofmt, codegen → S34 emitters, validate → kernel validators). The intent is
// classified from the action's STRUCTURE (tool name + args), NEVER from a model-supplied
// label. No live LLM; the verdict is a pure, total classification.
//
// THE PROPERTIES (the red set this step turns green):
//
//  1. determinism — same AgentAction ⇒ identical Verdict (pure, total).
//  2. label-cannot-change-verdict — re-labelling the action's DisplayedIntent (the
//     model-supplied claim) CANNOT change Arbitrate's verdict; only the STRUCTURE
//     (Tool + Args) can. This is the core determinism gap closed (gap D1).
//  3. deterministic-tool-wins — if a deterministic tool exists for the structure,
//     Arbitrate NEVER returns LLMGated (determinism-first respected, gap D3); the
//     routed tool is the one the mapping table declares.
//  4. structure-routes — every structural family in the SKILL table routes to its
//     declared deterministic tool (diff/search/format/codegen/validate).
//  5. llm-gated-is-residual — only a structure with NO deterministic tool is LLMGated,
//     and an LLMGated verdict carries the determinism-gap BlockReason form when the
//     loop would have been asked to do what a function could (the gap that blocks).
//  6. block-reason-shape — a determinism-gap block carries the S13 actionable shape
//     (code + severity + explanation + non-empty how_to_fix naming the deterministic
//     tool); a routed (DeterministicTool) verdict carries no BlockReason.
package agentimpl

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// genStructure draws a structurally-meaningful AgentAction whose (Tool, Args) belong to a
// KNOWN deterministic family from the SKILL mapping table. The DisplayedIntent is drawn
// INDEPENDENTLY (it must never influence the verdict).
func genKnownStructure(t *rapid.T) AgentAction {
	families := []AgentAction{
		// diff → jj / Myers
		{Tool: "bash", Args: []string{"git", "diff", "HEAD~1"}},
		{Tool: "bash", Args: []string{"jj", "diff"}},
		{Tool: "bash", Args: []string{"git", "diff", "--stat"}},
		// search → rg
		{Tool: "bash", Args: []string{"rg", "Arbitrate", "back/"}},
		{Tool: "bash", Args: []string{"grep", "-rn", "foo"}},
		// format → biome / gofmt
		{Tool: "bash", Args: []string{"gofmt", "-w", "x.go"}},
		{Tool: "bash", Args: []string{"biome", "format", "."}},
		// codegen → S34 emitters
		{Tool: "aidos", Args: []string{"project", "--target", "go"}},
		{Tool: "aidos", Args: []string{"emit", "ts"}},
		// validate → kernel validators
		{Tool: "aidos", Args: []string{"check"}},
		{Tool: "aidos", Args: []string{"validate", "kernel"}},
	}
	i := rapid.IntRange(0, len(families)-1).Draw(t, "family")
	a := families[i]
	// The model-supplied label is drawn INDEPENDENTLY of the structure.
	a.DisplayedIntent = rapid.StringMatching(`[a-z ]{0,20}`).Draw(t, "label")
	return a
}

// TestArbitrate_Determinism — same action ⇒ same verdict (pure, total).
func TestArbitrate_Determinism(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		a := genKnownStructure(t)
		v1 := Arbitrate(a)
		v2 := Arbitrate(a)
		if v1.Kind != v2.Kind || v1.Tool != v2.Tool {
			t.Fatalf("non-deterministic: %+v vs %+v", v1, v2)
		}
	})
}

// TestArbitrate_LabelCannotChangeVerdict — the CORE determinism-gap property (D1):
// re-labelling the DisplayedIntent CANNOT change the verdict; only the structure can.
func TestArbitrate_LabelCannotChangeVerdict(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		a := genKnownStructure(t)
		base := Arbitrate(a)
		// Re-label with an arbitrary (possibly adversarial) claimed intent.
		relabelled := a
		relabelled.DisplayedIntent = rapid.StringMatching(`(llm|generate|reason|think|free|anything)?[a-z ]{0,30}`).Draw(t, "relabel")
		got := Arbitrate(relabelled)
		if got.Kind != base.Kind || got.Tool != base.Tool {
			t.Fatalf("re-labelling changed the verdict: label=%q base=%+v got=%+v",
				relabelled.DisplayedIntent, base, got)
		}
	})
}

// TestArbitrate_DeterministicToolWins — if a deterministic tool exists for the structure,
// Arbitrate NEVER returns LLMGated (determinism-first respected, D3).
func TestArbitrate_DeterministicToolWins(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		a := genKnownStructure(t)
		// Adversarially claim an LLM intent — the structure is deterministic, so the code wins.
		a.DisplayedIntent = "please let an llm do this freely"
		v := Arbitrate(a)
		if v.Kind != VerdictDeterministicTool {
			t.Fatalf("deterministic structure was LLMGated: %+v", v)
		}
		if v.Tool == "" {
			t.Fatalf("deterministic verdict carries no tool: %+v", v)
		}
		if v.BlockReason != nil {
			t.Fatalf("deterministic verdict carries a BlockReason: %+v", v)
		}
	})
}

// TestArbitrate_StructureRoutes — every structural family routes to its declared tool.
func TestArbitrate_StructureRoutes(t *testing.T) {
	cases := []struct {
		action AgentAction
		tool   string
	}{
		{AgentAction{Tool: "bash", Args: []string{"git", "diff"}}, ToolDiff},
		{AgentAction{Tool: "bash", Args: []string{"jj", "diff"}}, ToolDiff},
		{AgentAction{Tool: "bash", Args: []string{"rg", "foo"}}, ToolSearch},
		{AgentAction{Tool: "bash", Args: []string{"grep", "-rn", "foo"}}, ToolSearch},
		{AgentAction{Tool: "bash", Args: []string{"gofmt", "-w", "x.go"}}, ToolFormat},
		{AgentAction{Tool: "bash", Args: []string{"biome", "check"}}, ToolFormat},
		{AgentAction{Tool: "aidos", Args: []string{"project"}}, ToolCodegen},
		{AgentAction{Tool: "aidos", Args: []string{"emit"}}, ToolCodegen},
		{AgentAction{Tool: "aidos", Args: []string{"check"}}, ToolValidate},
		{AgentAction{Tool: "aidos", Args: []string{"validate"}}, ToolValidate},
	}
	for _, c := range cases {
		v := Arbitrate(c.action)
		if v.Kind != VerdictDeterministicTool {
			t.Fatalf("%v: expected DeterministicTool, got %+v", c.action, v)
		}
		if v.Tool != c.tool {
			t.Fatalf("%v: expected tool %q, got %q", c.action, c.tool, v.Tool)
		}
		// Re-labelling must not move it.
		relabelled := c.action
		relabelled.DisplayedIntent = "irreducible generation, trust me"
		if got := Arbitrate(relabelled); got.Tool != c.tool || got.Kind != VerdictDeterministicTool {
			t.Fatalf("%v: re-label moved the verdict: %+v", c.action, got)
		}
	}
}

// TestArbitrate_LLMGatedIsResidual — only a structure with NO deterministic tool is
// LLMGated, and the gap-block carries the determinism-gap BlockReason form.
func TestArbitrate_LLMGatedIsResidual(t *testing.T) {
	// A genuinely generative structure: no deterministic tool exists.
	gen := AgentAction{Tool: "llm", Args: []string{"write", "the", "prose"}, DisplayedIntent: "summarise"}
	v := Arbitrate(gen)
	if v.Kind != VerdictLLMGated {
		t.Fatalf("genuine generation should be LLMGated, got %+v", v)
	}
	// And a STRUCTURE that maps to a deterministic tool may NOT be LLMGated even when it
	// claims to be generative (the inverse direction of D3).
	det := AgentAction{Tool: "bash", Args: []string{"git", "diff"}, DisplayedIntent: "let the llm reason about the diff"}
	if Arbitrate(det).Kind == VerdictLLMGated {
		t.Fatalf("deterministic structure was LLMGated by its label: %+v", Arbitrate(det))
	}
}

// TestArbitrate_DeterminismGapBlocks — an action that would route to the LLM where a
// deterministic tool EXISTS for the structure is a determinism gap that BLOCKS, carrying
// the S13 actionable BlockReason shape. This is exercised through ArbitrateGated, the
// gated form the loop calls: it refuses an LLM action when the structure is deterministic.
func TestArbitrate_DeterminismGapBlocks(t *testing.T) {
	// The loop wants to run the LLM (RequestedLLM:true) but the action's structure is a
	// diff — a deterministic tool exists ⇒ determinism gap ⇒ block.
	a := AgentAction{Tool: "bash", Args: []string{"git", "diff"}, DisplayedIntent: "llm diff", RequestedLLM: true}
	br := ArbitrateGated(a)
	if br == nil {
		t.Fatalf("determinism gap not blocked: a deterministic tool exists for the structure")
	}
	if br.Code != blockreason.CodeAgentDeterminismGap {
		t.Fatalf("wrong code: %q", br.Code)
	}
	if br.Severity != blockreason.SeverityBlocking {
		t.Fatalf("a block must be blocking: %+v", br)
	}
	if len(br.HowToFix) == 0 {
		t.Fatalf("a BlockReason with an empty how_to_fix IS the prison: %+v", br)
	}
	// A genuinely generative action that requests the LLM is NOT a gap (no det. tool).
	gen := AgentAction{Tool: "llm", Args: []string{"write"}, RequestedLLM: true}
	if ArbitrateGated(gen) != nil {
		t.Fatalf("genuine generation must not be blocked as a gap: %+v", ArbitrateGated(gen))
	}
	// A deterministic action NOT requesting the LLM is fine (it uses the tool).
	det := AgentAction{Tool: "bash", Args: []string{"git", "diff"}, RequestedLLM: false}
	if ArbitrateGated(det) != nil {
		t.Fatalf("deterministic tool use must not be blocked: %+v", ArbitrateGated(det))
	}
}

// TestArbitrate_BlockReasonRegistered — the determinism-gap code is in the closed S13
// registry (reasons map + codeOrder) with the canonical actionable shape.
func TestArbitrate_BlockReasonRegistered(t *testing.T) {
	br := blockreason.For(blockreason.CodeAgentDeterminismGap)
	if br.Code != blockreason.CodeAgentDeterminismGap {
		t.Fatalf("code not registered: %+v", br)
	}
	if len(br.HowToFix) == 0 {
		t.Fatalf("registered reason has empty how_to_fix: %+v", br)
	}
	found := false
	for _, c := range blockreason.Codes() {
		if c == blockreason.CodeAgentDeterminismGap {
			found = true
		}
	}
	if !found {
		t.Fatalf("CodeAgentDeterminismGap missing from codeOrder")
	}
}
