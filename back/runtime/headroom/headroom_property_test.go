package headroom

// headroom_property_test.go — the HR03 BDD mirror (invariant ∀), written RED FIRST: it names
// SidecarCompressor / FakeSidecar / DeriveAction / DerivedAction and calls the REAL
// agentimpl.GateAction before this package compiles, so the build failure IS the red of the goal
// (CLAUDE.md §6 mirror-first). Code is then written to make it green.
//
// The HR03 done-criterion, proven here as invariants over arbitrary LLM-input prompts:
//
//  1. GATE-INVARIANCE (the theorem). The agentimpl.GateAction verdict is INVARIANT to
//     compression: GateAction(DeriveAction(prompt)) == GateAction(DeriveAction(Retrieve(Compress(
//     prompt)))) — same structure of action, same verdict (the SAME Decision: Allowed + DeniedAxis
//     + BlockReason code). Compression changes nothing the gate decides; it is the gated exception,
//     never authoritative.
//  2. retrieve∘compress preserves the CARRIER FACTS (re-proven through the HR03 adapter, not only
//     the bare port) — losing one would change the derived action and break invariance.
//  3. The gate stays DETERMINISTIC end-to-end: the same prompt yields the same verdict 100×, with
//     and without going through the sidecar adapter (determinism-first reproducibility mirror).
//
// The adapter under test is SidecarCompressor{FakeSidecar{}} — the HR03 `headroom` sidecar
// behind the HR02 port — so the theorem is proven against the ADAPTER, exactly the object HR04
// will wire into agentloop.Drive.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	rctx "github.com/steph-frtech/aidos/back/runtime/context"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"

	"pgregory.net/rapid"
)

// adapter is the HR03 object under test: the `headroom` sidecar adapter behind the HR02 port.
var adapter rctx.ContextCompressor = SidecarCompressor{Side: FakeSidecar{}}

// genGatePrompt generates an arbitrary, repetition-prone LLM-input prompt that ALSO carries the
// structural carrier markers DeriveAction reads (the boundaries block) — so the derived action
// varies across runs while staying recoverable. The markers are drawn from a small set of values,
// some allowed by permissiveImpl and some not, so the gate verdict varies (allow AND each axis's
// deny), making the invariance theorem non-trivial.
func genGatePrompt(t *rapid.T) string {
	// Targets: one inside the granted tree (allowed), one above the waterline (zone deny),
	// one outside the tree (path deny).
	target := rapid.SampledFrom([]string{"app/main.go", "/kernel/entities.json", "/etc/passwd"}).Draw(t, "target")
	// Tool pair: the bound one (allowed) vs an unbound one (capacity deny).
	tool := rapid.SampledFrom([]string{"store/read", "evil/exfiltrate", ""}).Draw(t, "tool")
	skill := rapid.SampledFrom([]string{"tdd", "forbidden-skill", ""}).Draw(t, "skill")

	// Repetition-prone filler so the compressor has spans to collapse (the realistic shape).
	filler := ""
	n := rapid.IntRange(0, 30).Draw(t, "n")
	vocab := []string{"the", "wall", "red", "mirror", "goal", "stop", "condition", "checkout"}
	for i := 0; i < n; i++ {
		if i > 0 {
			filler += " "
		}
		filler += vocab[rapid.IntRange(0, len(vocab)-1).Draw(t, "w")]
	}

	p := "# CONTEXT PACK\n" + filler + "\n## Boundaries (THE WALL)\n"
	p += "allowed_paths: " + target + "\n"
	if tool != "" {
		p += "tool: " + tool + "\n"
	}
	if skill != "" {
		p += "skill: " + skill + "\n"
	}
	p += "forbidden_paths: /kernel/**, /mirror/**\n" + filler + "\n"
	return p
}

// toAction assembles the agentimpl.Action the gate evaluates from a DerivedAction. The
// AgentAction is a fixed deterministic-tool structure (rg search) so the determinism axis always
// passes — the test exercises the OTHER axes, which is where compression could (but must not)
// change the verdict.
func toAction(d DerivedAction) agentimpl.Action {
	return agentimpl.Action{
		AgentAction: agentimpl.AgentAction{Tool: "bash", Args: []string{"rg", "foo"}},
		Target:      d.Target,
		Server:      d.Server,
		Tool:        d.Tool,
		Skill:       d.Skill,
		Host:        d.Host,
		Exec:        d.Exec,
	}
}

// permissiveImpl mirrors the BA13 gate fixture's permissive implementation: grants app/, binds
// store/read + tdd, carries the wall in ForbiddenPaths. (Re-declared here — the gate fixture's is
// test-package-private; this is the same shape, the public AgentImplementation contract.)
func permissiveImpl() agentimpl.AgentImplementation {
	return agentimpl.AgentImplementation{
		LayerRef:       "couche-agent@deadbeef",
		AllowedPaths:   []string{"app/"},
		ForbiddenPaths: agentimpl.WallForbiddenPaths(),
		Tools:          []agentimpl.ResolvedTool{{Server: "store", Tool: "read"}},
		Skills:         []string{"tdd"},
	}
}

func gateInputs() (agentimpl.RunMeter, economics.HarnessCostBudget, goal.Budgets, float64) {
	m := agentimpl.RunMeter{Tokens: 10, Turns: 1, WallClockSecs: 1}
	h := economics.HarnessCostBudget{CellRef: "cell-1", MaxCIMinutes: 100, MaxLLMTokensPerGoal: 1000}
	b := goal.Budgets{TimeSeconds: 100, Turns: 100, Tokens: 1000}
	return m, h, b, 0.001
}

func gate(d DerivedAction) agentimpl.Decision {
	m, h, b, rate := gateInputs()
	return agentimpl.GateAction(permissiveImpl(), toAction(d), m, h, b, rate, nil)
}

func sameDecision(a, b agentimpl.Decision) bool {
	if a.Allowed != b.Allowed || a.DeniedAxis != b.DeniedAxis {
		return false
	}
	codeOf := func(br *blockreason.BlockReason) blockreason.Code {
		if br == nil {
			return ""
		}
		return br.Code
	}
	return codeOf(a.BlockReason) == codeOf(b.BlockReason)
}

// TestGateInvariantToCompression — THE HR03 THEOREM (the done-criterion). For every prompt, the
// gate verdict on the original action equals the gate verdict on the action derived AFTER
// retrieve∘compress through the `headroom` sidecar adapter. Same structure of action ⇒ same
// verdict — compression is invisible to the gate.
func TestGateInvariantToCompression(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		prompt := genGatePrompt(t)

		// Original: the action the loop would derive from the un-compressed prompt.
		originalVerdict := gate(DeriveAction(prompt))

		// Compressed-then-retrieved through the HR03 adapter, then derive the action again.
		_, handle := adapter.Compress(prompt)
		restored := adapter.Retrieve(handle)
		compressedVerdict := gate(DeriveAction(restored))

		if !sameDecision(originalVerdict, compressedVerdict) {
			t.Fatalf("GATE NOT INVARIANT to compression:\n  original   = %+v\n  compressed = %+v\n  prompt=%q\n  restored=%q",
				originalVerdict, compressedVerdict, prompt, restored)
		}
	})
}

// TestDerivedActionInvariantToCompression — the structural lemma under the theorem: the DERIVED
// ACTION itself is byte-identical after retrieve∘compress (so the gate, a pure function of it,
// cannot differ). Proving this directly localises any future regression to the derivation, not
// the gate.
func TestDerivedActionInvariantToCompression(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		prompt := genGatePrompt(t)
		_, handle := adapter.Compress(prompt)
		restored := adapter.Retrieve(handle)
		if DeriveAction(prompt) != DeriveAction(restored) {
			t.Fatalf("derived action not invariant under retrieve∘compress:\n  from prompt   = %+v\n  from restored = %+v",
				DeriveAction(prompt), DeriveAction(restored))
		}
	})
}

// TestCarrierFactsSurviveThroughAdapter — re-proves the HR02 fidelity invariant THROUGH the HR03
// sidecar adapter (not only the bare port): every load-bearing carrier marker the gate reads
// survives retrieve∘compress. Losing one would change the derived action and break the theorem.
func TestCarrierFactsSurviveThroughAdapter(t *testing.T) {
	prompt := "# CONTEXT PACK\nthe wall the wall the wall\n## Boundaries\n" +
		"allowed_paths: /src/checkout/**\ntool: store/read\nskill: tdd\n" +
		"forbidden_paths: /kernel/**, /mirror/**\nthe wall the wall the wall\n"
	_, handle := adapter.Compress(prompt)
	restored := adapter.Retrieve(handle)
	for _, fact := range []string{"/src/checkout/**", "store/read", "tdd", "/kernel/**", "/mirror/**"} {
		if !contains(restored, fact) {
			t.Fatalf("carrier fact lost through adapter: %q\n  restored=%q", fact, restored)
		}
	}
}

// TestGateDeterministicThroughAdapter — determinism-first reproducibility mirror (CLAUDE.md
// §6/§8): the gate verdict on the adapter-compressed prompt is reproducible 100×. Same input ⇒
// same verdict; the gate never defers to the (LLM-adjacent) compression.
func TestGateDeterministicThroughAdapter(t *testing.T) {
	prompt := "# CONTEXT PACK\nthe wall the wall\n## Boundaries\n" +
		"allowed_paths: app/main.go\ntool: store/read\nskill: tdd\n" +
		"forbidden_paths: /kernel/**, /mirror/**\n"
	_, h0 := adapter.Compress(prompt)
	want := gate(DeriveAction(adapter.Retrieve(h0)))
	for i := 0; i < 100; i++ {
		_, hi := adapter.Compress(prompt)
		got := gate(DeriveAction(adapter.Retrieve(hi)))
		if !sameDecision(got, want) {
			t.Fatalf("gate verdict not reproducible at replay %d:\n  got =%+v\n  want=%+v", i, got, want)
		}
	}
	// The happy-path prompt must be ALLOWED (the theorem is non-trivial: a real verdict).
	if !want.Allowed {
		t.Fatalf("expected happy-path prompt to be allowed, got %+v", want)
	}
}

func contains(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return len(needle) == 0
}
