// arbiter_fixture_test.go — the RED-first FIXTURE mirror of BA12: the determinism-first
// SKILL mapping table, transcribed verbatim as state → classify → verdict fixtures. Each
// row is a structural action and the deterministic tool the SKILL prose declares for it;
// a final block of rows asserts that re-labelling the displayed intent is INERT.
package agentimpl

import "testing"

// TestArbitrate_SkillMappingTable — the SKILL's prose-as-code: every structural family
// the determinism-first mandate names routes to its deterministic tool. This fixture IS
// the authoritative transcription of the table (diff → jj/Myers, search → rg, format →
// biome/gofmt, codegen → S34 emitters, validate → kernel validators).
func TestArbitrate_SkillMappingTable(t *testing.T) {
	type row struct {
		name   string
		action AgentAction
		kind   VerdictKind
		tool   string
	}
	rows := []row{
		// diff → jj / Myers (a diff is a diff algorithm, never an "LLM diff agent")
		{"git-diff", AgentAction{Tool: "bash", Args: []string{"git", "diff"}}, VerdictDeterministicTool, ToolDiff},
		{"jj-diff", AgentAction{Tool: "bash", Args: []string{"jj", "diff"}}, VerdictDeterministicTool, ToolDiff},
		{"git-diff-stat", AgentAction{Tool: "bash", Args: []string{"git", "diff", "--stat"}}, VerdictDeterministicTool, ToolDiff},
		// search → rg
		{"rg", AgentAction{Tool: "bash", Args: []string{"rg", "pat"}}, VerdictDeterministicTool, ToolSearch},
		{"grep", AgentAction{Tool: "bash", Args: []string{"grep", "-rn", "pat"}}, VerdictDeterministicTool, ToolSearch},
		// format/arch → biome / gofmt / go-arch-lint
		{"gofmt", AgentAction{Tool: "bash", Args: []string{"gofmt", "-w", "x.go"}}, VerdictDeterministicTool, ToolFormat},
		{"biome", AgentAction{Tool: "bash", Args: []string{"biome", "format"}}, VerdictDeterministicTool, ToolFormat},
		// codegen → S34 emitters (deterministic emitters over LLM generation)
		{"aidos-project", AgentAction{Tool: "aidos", Args: []string{"project"}}, VerdictDeterministicTool, ToolCodegen},
		{"aidos-emit", AgentAction{Tool: "aidos", Args: []string{"emit", "go"}}, VerdictDeterministicTool, ToolCodegen},
		// validate → kernel validators
		{"aidos-check", AgentAction{Tool: "aidos", Args: []string{"check"}}, VerdictDeterministicTool, ToolValidate},
		{"aidos-validate", AgentAction{Tool: "aidos", Args: []string{"validate"}}, VerdictDeterministicTool, ToolValidate},
		// residual: genuine generation — no deterministic tool exists ⇒ LLMGated.
		{"llm-prose", AgentAction{Tool: "llm", Args: []string{"write", "docs"}}, VerdictLLMGated, ""},
		{"unknown-bash", AgentAction{Tool: "bash", Args: []string{"echo", "hi"}}, VerdictLLMGated, ""},
	}
	for _, r := range rows {
		v := Arbitrate(r.action)
		if v.Kind != r.kind {
			t.Fatalf("%s: kind = %q, want %q (action=%+v)", r.name, v.Kind, r.kind, r.action)
		}
		if v.Tool != r.tool {
			t.Fatalf("%s: tool = %q, want %q (action=%+v)", r.name, v.Tool, r.tool, r.action)
		}
	}
}

// TestArbitrate_RelabellingIsInert — the fixture form of the core property: a fixed
// structure keeps its verdict across a battery of adversarial displayed-intent labels.
func TestArbitrate_RelabellingIsInert(t *testing.T) {
	structure := AgentAction{Tool: "bash", Args: []string{"git", "diff", "HEAD"}}
	want := Arbitrate(structure)
	if want.Kind != VerdictDeterministicTool || want.Tool != ToolDiff {
		t.Fatalf("setup: a git diff must route to the diff tool, got %+v", want)
	}
	labels := []string{
		"",
		"diff",
		"search",                              // wrong label — must NOT route to search
		"let an llm generate the diff freely", // adversarial
		"validate",
		"this is irreducible judgment",
	}
	for _, lbl := range labels {
		a := structure
		a.DisplayedIntent = lbl
		got := Arbitrate(a)
		if got.Kind != want.Kind || got.Tool != want.Tool {
			t.Fatalf("label %q moved the verdict: want %+v got %+v", lbl, want, got)
		}
	}
}
