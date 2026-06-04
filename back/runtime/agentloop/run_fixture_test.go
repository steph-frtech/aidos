// run_fixture_test.go — the runnable BA14 rule: Eval/Run produce a single pass/fail
// Verdict over the live module. Red-first: the live runtime tree MUST pass (the wall
// holds on disk); an injected SDK import flips Passed to false with the violation.
package agentloop

import "testing"

func TestRun_LiveModule_Passes(t *testing.T) {
	v, err := Run("..", "github.com/steph-frtech/aidos/back/runtime", DefaultPolicy())
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if !v.Passed {
		t.Fatalf("live module must PASS the one-LLM-function invariant, got %d violations: %+v", len(v.Violations), v.Violations)
	}
	if v.ScannedModule != "github.com/steph-frtech/aidos/back/runtime" {
		t.Fatalf("verdict must carry the scanned module, got %q", v.ScannedModule)
	}
}

func TestEval_InjectedImport_Fails(t *testing.T) {
	g := ImportGraph{Packages: []PackageImports{
		{ImportPath: "github.com/steph-frtech/aidos/back/runtime/agentloop/provider", Imports: []string{"github.com/anthropics/anthropic-sdk-go"}},
		{ImportPath: "github.com/steph-frtech/aidos/back/runtime/agentrun", Imports: []string{"github.com/openai/openai-go"}},
	}}
	v := Eval(g, DefaultPolicy(), "m")
	if v.Passed {
		t.Fatal("an injected SDK import outside provider must FAIL the verdict")
	}
	if len(v.Violations) != 1 || v.Violations[0].Package != "github.com/steph-frtech/aidos/back/runtime/agentrun" {
		t.Fatalf("verdict must name the offender, got %+v", v.Violations)
	}
}
