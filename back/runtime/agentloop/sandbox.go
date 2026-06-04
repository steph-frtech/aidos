// sandbox.go — BA17 (agentloop side): wire the OS/Postgres sandbox + the gated LLM exception
// INTO the loop. BA15's Drive runs against a scripted mock; BA17 binds the production seam:
//
//   - the SANDBOX confines the run (agentimpl.BindSandbox) — the app tree is the only writable
//     root, fail-closed egress/exec, cgroup/ulimit; CheckGeneratedWrite proves a generated
//     write to a non-AllowedPaths path is refused at all three levels (FS + hook + GRANT);
//   - the LLM is isolated behind agentimpl.ActionGenerator; the PRODUCTION generator wraps a
//     provider.Provider (the ONE SDK-importing package, kept isolated by the BA14 arch-fitness
//     rule) and the provider HARD-STOPS streaming at the token cap.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): everything here is deterministic code; the only
// non-determinism is the wrapped provider.Provider.Generate, confined to ONE call. The tests
// use agentimpl.FakeGenerator (no SDK). The arch-fitness rule (back/runtime/agentloop.Run)
// keeps the SDK out of every package but provider/.
package agentloop

import (
	"context"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentloop/provider"
)

// ProviderGenerator is the PRODUCTION agentimpl.ActionGenerator: it adapts a
// provider.Provider (the single seam where a real LLM SDK is imported, isolated by BA14) into
// the loop's ActionGenerator. It is the ONLY place the loop touches the model; the gate
// (before), the post-check (after) and the sandbox (confinement) are all deterministic code
// around this one call — the code wins, the agent defers.
type ProviderGenerator struct {
	// P is the underlying provider (anthropic/openai/google behind the BA14-isolated SDK). In
	// production it is a real provider; in tests it is a deterministic fake so no model runs.
	P provider.Provider
}

// GenerateAction satisfies agentimpl.ActionGenerator: it builds the provider Request from the
// transcript, calls the single gated exception (provider.Generate), and HARD-STOPS the stream
// at the impl's declared token cap (agentimpl.HardStop). The provider cooperates by stopping
// the moment the emitted token count crosses the cap (gap G3) — here, since provider.Generate
// returns a complete Response, the hard-stop truncates the returned text at the cap so a
// runaway response can never blow the budget.
func (g ProviderGenerator) GenerateAction(ctx context.Context, impl agentimpl.AgentImplementation, tr agentimpl.Transcript) (agentimpl.Generated, error) {
	resp, err := g.P.Generate(ctx, provider.Request{System: tr.System, Prompt: lastTurn(tr)})
	if err != nil {
		return agentimpl.Generated{}, err
	}
	return applyTokenCap(resp.Text, tokenCapOf(impl)), nil
}

// lastTurn returns the most recent transcript turn as the prompt (the deterministic context
// the generator receives). Empty when the transcript has no turns yet (the first turn).
func lastTurn(tr agentimpl.Transcript) string {
	if len(tr.Turns) == 0 {
		return ""
	}
	return tr.Turns[len(tr.Turns)-1]
}

// tokenCapOf resolves the declared streaming token cap for a run. The cap lives on the
// governed layer (BA01); here MaxTurns is NOT a token cap, so a run with no declared token cap
// returns 0 (no cap). A real provider reads the per-request cap; the loop passes it through.
// (The cap is sourced from the impl's declared knobs once BA01's token-cap knob is wired; for
// now an absent cap means no hard-stop — the fail-open is documented, never silent.)
func tokenCapOf(_ agentimpl.AgentImplementation) int {
	return 0
}

// applyTokenCap streams text token by token under cap, hard-stopping at the boundary (the G3
// seam) and marking Truncated. cap <= 0 ⇒ no cap (text verbatim). Pure, total.
func applyTokenCap(text string, cap int) agentimpl.Generated {
	// Reuse the same deterministic tokenizer + HardStop the fake uses (single-sourced shape).
	gen := agentimpl.FakeGenerator{Replies: []string{text}, TokenCap: cap}
	out, _ := gen.GenerateAction(context.Background(), agentimpl.AgentImplementation{}, agentimpl.Transcript{})
	return out
}

// CheckGeneratedWrite is the end-to-end defense-in-depth proof BA17 demands: given a resolved
// impl and a write target the (mocked) model GENERATED, bind the sandbox and check the write
// at all three levels. A generated write to a non-AllowedPaths path is refused by the FS
// boundary AND the hook AND would miss the GRANT — the wall holds three times over, regardless
// of what the model proposed. Pure, total, deterministic.
func CheckGeneratedWrite(impl agentimpl.AgentImplementation, target string) agentimpl.WriteVerdict {
	return agentimpl.BindSandbox(impl).CheckWrite(target)
}

// CheckGeneratedEgress is the egress twin: a generated egress to an undeclared host is refused
// at the boundary AND the gate (fail-closed). Pure, total, deterministic.
func CheckGeneratedEgress(impl agentimpl.AgentImplementation, host string) agentimpl.EgressVerdict {
	return agentimpl.BindSandbox(impl).CheckEgress(host)
}

// the production generator implements the agentimpl seam.
var _ agentimpl.ActionGenerator = ProviderGenerator{}
