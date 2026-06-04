// sandbox_fixture_test.go — BA17 (agentloop side): the RED fixture (provider fake) proving
// the loop binds the sandbox + the gated LLM exception end-to-end.
package agentloop

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentloop/provider"
)

func e2eImpl() agentimpl.AgentImplementation {
	return agentimpl.AgentImplementation{
		LayerRef:            "agent:builder@v1",
		Model:               "claude",
		Provider:            agentlayer.ProviderAnthropic,
		AllowedPaths:        []string{"apps/demo/"},
		ForbiddenPaths:      agentimpl.WallForbiddenPaths(),
		AllowedNetworkHosts: []string{"api.anthropic.com"},
		AllowedExec:         []string{"go"},
		ResourceLimits:      agentlayer.ResourceLimits{MaxMemoryMB: 256, MaxCPUMillis: 1000, MaxWallSeconds: 30},
	}
}

// fakeProvider is a deterministic provider.Provider double (no SDK) so the production
// ProviderGenerator is provable without a live model — the BA17 provider-fake fixture.
type fakeProvider struct{ text string }

func (f fakeProvider) Generate(_ context.Context, _ provider.Request) (provider.Response, error) {
	return provider.Response{Text: f.text}, nil
}

// The production generator (provider-backed) satisfies the agentimpl seam and returns the
// provider's text — the LLM isolated behind ONE function, fed by a deterministic fake here.
func TestProviderGenerator_WrapsProvider(t *testing.T) {
	g := ProviderGenerator{P: fakeProvider{text: "next-action"}}
	out, err := g.GenerateAction(context.Background(), e2eImpl(), agentimpl.Transcript{})
	if err != nil {
		t.Fatalf("provider generator must not error: %v", err)
	}
	if out.Text != "next-action" {
		t.Fatalf("generator must return the provider's text, got %q", out.Text)
	}
	var _ agentimpl.ActionGenerator = g
}

// END-TO-END DEFENSE IN DEPTH: a write the model GENERATED to a non-AllowedPaths truth zone is
// refused at all three levels (FS + hook + GRANT) — the wall holds three times over.
func TestCheckGeneratedWrite_NonAllowed_RefusedThreeLevels(t *testing.T) {
	impl := e2eImpl()
	v := CheckGeneratedWrite(impl, "back/kernel/truth.go")
	if v.Allowed {
		t.Fatal("a generated write to a truth zone must be refused (defense in depth)")
	}
	if len(v.DeniedLevels) < 3 {
		t.Fatalf("expected refusal at >= 3 levels (fs, hook, grant), got %v", v.DeniedLevels)
	}
	// A generated write INSIDE the app tree is allowed (the agent CAN do its job).
	ok := CheckGeneratedWrite(impl, "apps/demo/src/main.go")
	if !ok.Allowed {
		t.Fatalf("a generated write inside the app tree must be allowed, denied at %v", ok.DeniedLevels)
	}
}

// END-TO-END FAIL-CLOSED EGRESS: a generated egress to an undeclared host is refused at the
// boundary AND the gate.
func TestCheckGeneratedEgress_Undeclared_Refused(t *testing.T) {
	impl := e2eImpl()
	v := CheckGeneratedEgress(impl, "evil.example.com")
	if v.Allowed {
		t.Fatal("a generated egress to an undeclared host must be refused (fail-closed)")
	}
	if len(v.DeniedLevels) < 2 {
		t.Fatalf("expected egress refusal at >= 2 levels (boundary, gate), got %v", v.DeniedLevels)
	}
	if ok := CheckGeneratedEgress(impl, "api.anthropic.com"); !ok.Allowed {
		t.Fatalf("the declared host must be reachable, denied at %v", ok.DeniedLevels)
	}
}

// THE HARD-STOP through the production generator: a provider that returns a long response is
// truncated at the declared token cap (the G3 seam wired through the loop). With the current
// tokenCapOf returning 0 (no declared cap yet), the text passes through verbatim — the test
// pins that the NO-CAP path is fail-OPEN-documented, and applyTokenCap truncates when a cap
// is set (proven directly here against applyTokenCap).
func TestApplyTokenCap_HardStops(t *testing.T) {
	out := applyTokenCap("a b c d e f", 3)
	if out.Tokens > 3 {
		t.Fatalf("must hard-stop at the cap (3), emitted %d", out.Tokens)
	}
	if !out.Truncated {
		t.Fatal("a response over the cap must be marked Truncated")
	}
	// No cap ⇒ verbatim.
	full := applyTokenCap("a b c", 0)
	if full.Truncated || full.Text != "a b c" {
		t.Fatalf("no cap must pass text verbatim, got %+v", full)
	}
}
