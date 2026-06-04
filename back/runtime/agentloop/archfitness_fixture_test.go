// archfitness_fixture_test.go — BA14: the RED-FIRST fault-injection arch mirror for the
// "one single LLM function" architectural invariant. CheckLLMIsolation is the
// deterministic depguard-equivalent: given the module's import graph + the declared
// policy (which prefixes are LLM-SDK packages, which single package may import them), it
// returns the violations — any package OTHER than back/runtime/agentloop/provider that
// imports an LLM SDK.
//
// THE FAULT INJECTION (the done criterion). The mirror proves the rule is a RULE, not
// prose: the clean graph passes (no violation), and adding an LLM-SDK import ANYWHERE
// ELSE flips the rule red (a Violation naming the offending package + import). The
// provider package is the SINGLE gated exception and importing the SDK there is allowed.
package agentloop

import "testing"

// policy is the BA14 invariant declared as DATA (above-the-line intent, projected to a
// deterministic check below): the LLM-SDK import prefixes, and the ONE package allowed
// to import them.
func testPolicy() Policy {
	return Policy{
		LLMSDKPrefixes: []string{
			"github.com/anthropics/anthropic-sdk-go",
			"github.com/openai/openai-go",
			"google.golang.org/genai",
		},
		AllowedImporters: []string{
			"github.com/steph-frtech/aidos/back/runtime/agentloop/provider",
		},
	}
}

// cleanGraph is the live shape of the module: only the provider package imports the SDK;
// every other package is SDK-free. This MUST pass (no violation).
func cleanGraph() ImportGraph {
	return ImportGraph{
		Packages: []PackageImports{
			{
				ImportPath: "github.com/steph-frtech/aidos/back/runtime/agentloop/provider",
				Imports:    []string{"context", "github.com/anthropics/anthropic-sdk-go"},
			},
			{
				ImportPath: "github.com/steph-frtech/aidos/back/runtime/agentloop",
				Imports:    []string{"go/parser", "go/token"},
			},
			{
				ImportPath: "github.com/steph-frtech/aidos/back/runtime/agentimpl",
				Imports:    []string{"github.com/steph-frtech/aidos/back/runtime/blockreason"},
			},
		},
	}
}

func TestCheckLLMIsolation_CleanGraph_NoViolation(t *testing.T) {
	got := CheckLLMIsolation(cleanGraph(), testPolicy())
	if len(got) != 0 {
		t.Fatalf("clean graph must have NO violation, got %d: %+v", len(got), got)
	}
}

// FAULT INJECTION: a second package (agentimpl) imports the SDK. The rule MUST go red.
func TestCheckLLMIsolation_SecondLLMImport_FlipsRed(t *testing.T) {
	g := cleanGraph()
	g.Packages[2].Imports = append(g.Packages[2].Imports, "github.com/openai/openai-go")

	got := CheckLLMIsolation(g, testPolicy())
	if len(got) != 1 {
		t.Fatalf("a second LLM-SDK import must flip the rule red with exactly 1 violation, got %d: %+v", len(got), got)
	}
	v := got[0]
	if v.Package != "github.com/steph-frtech/aidos/back/runtime/agentimpl" {
		t.Fatalf("violation must name the offending package, got %q", v.Package)
	}
	if v.Import != "github.com/openai/openai-go" {
		t.Fatalf("violation must name the forbidden import, got %q", v.Import)
	}
	if v.BlockReason == nil || v.BlockReason.Code != "LLM_SDK_IMPORT_OUTSIDE_PROVIDER" {
		t.Fatalf("violation must carry the LLM_SDK_IMPORT_OUTSIDE_PROVIDER BlockReason, got %+v", v.BlockReason)
	}
}

// The provider package — the SINGLE gated exception — may import the SDK without a
// violation (a sub-package prefix of an allowed importer is also allowed).
func TestCheckLLMIsolation_ProviderAllowed(t *testing.T) {
	g := ImportGraph{Packages: []PackageImports{
		{ImportPath: "github.com/steph-frtech/aidos/back/runtime/agentloop/provider", Imports: []string{"github.com/anthropics/anthropic-sdk-go"}},
		{ImportPath: "github.com/steph-frtech/aidos/back/runtime/agentloop/provider/internal", Imports: []string{"google.golang.org/genai"}},
	}}
	if got := CheckLLMIsolation(g, testPolicy()); len(got) != 0 {
		t.Fatalf("provider (and its sub-packages) may import the SDK, got %d violations: %+v", len(got), got)
	}
}

// Multiple offenders across distinct packages each yield a violation, in a deterministic
// (graph) order.
func TestCheckLLMIsolation_MultipleOffenders(t *testing.T) {
	g := ImportGraph{Packages: []PackageImports{
		{ImportPath: "pkg/a", Imports: []string{"github.com/anthropics/anthropic-sdk-go"}},
		{ImportPath: "pkg/b", Imports: []string{"google.golang.org/genai", "github.com/openai/openai-go"}},
	}}
	got := CheckLLMIsolation(g, testPolicy())
	if len(got) != 3 {
		t.Fatalf("expected 3 violations (a×1, b×2), got %d: %+v", len(got), got)
	}
	if got[0].Package != "pkg/a" || got[1].Package != "pkg/b" || got[2].Package != "pkg/b" {
		t.Fatalf("violations must be in deterministic package/import order, got %+v", got)
	}
}

// The REAL module guard: scanning the live back/ module yields NO violation — the
// invariant holds on disk (the wall holds, not just in fixtures). When a real LLM SDK is
// later wired into provider*, this stays green; sprinkling one elsewhere flips it red at
// build time.
func TestCheckLLMIsolation_LiveModule_Holds(t *testing.T) {
	g, err := ScanModule("..", "github.com/steph-frtech/aidos/back/runtime")
	if err != nil {
		t.Fatalf("ScanModule failed: %v", err)
	}
	if got := CheckLLMIsolation(g, testPolicy()); len(got) != 0 {
		t.Fatalf("the LIVE module must hold the one-LLM-function invariant, got %d violations: %+v", len(got), got)
	}
}
