// compression_loop_fixture_test.go — the HR04 BDD mirror (fixture state→command→events),
// written RED FIRST: it names DriveInput.Compressor, ScriptedTurn.Prompt, MeasureTokens and
// the loop's compression wiring before any of them exist, so the build failure IS the red of
// the goal (CLAUDE.md §6 mirror-first). Code is then written to make it green.
//
// HR04 WIRES the HR02/HR03 ContextCompressor into agentloop.Drive BEFORE GenerateAction and
// integrates it with the budget (S51/BA11/BA27). These fixtures pin the done-criterion verbatim:
//
//  1. SAME VERDICT OF ACTIONS — an AgentRun replayed WITH and WITHOUT compression records the
//     SAME sequence of action verdicts (the HR03 gate-invariance theorem, now proven through the
//     loop, not only the bare adapter): compression changes the tokens measured, NEVER what the
//     gate decides.
//  2. TOKENS MEASURED ↓ — the run's measured token meter is STRICTLY LOWER with compression than
//     without, on a repetition-prone prompt the reference compressor collapses.
//  3. CheckBudget COHERENT — the budget gate runs against the (lower) compressed meter exactly as
//     before; the verdict is taken against the SAME declared caps.
//  4. THE CAP IS NEVER RAISED — compression extends the margin UNDER the cap; it never relieves it.
//     A run that breaches the cap WITHOUT compression and fits WITH it does so because it spends
//     FEWER tokens, never because the cap moved (the EffectiveTokensCap is byte-identical both ways).
//
// THE WALL / DETERMINISM (CLAUDE.md §2/§6/§8). Compression is the gated exception, never
// authoritative: the gate verdict is invariant to it (proven below). Token measurement is a PURE
// deterministic function (MeasureTokens — whitespace token count), the reproducibility mirror
// pins same-input ⇒ same-meter. Drive writes no truth; raising a cap is a /goal, never an edit.
package agentloop

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	rctx "github.com/steph-frtech/aidos/back/runtime/context"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// repetitivePrompt is a realistic, repetition-prone LLM-input the reference compressor collapses
// (the wall boilerplate recurring across the prompt), while carrying the action's carrier facts so
// DeriveAction recovers the SAME structural action after retrieve∘compress (HR03). It writes into
// the granted app/ tree, so the derived action is ALLOWED.
func repetitivePrompt(target string) string {
	wall := "respect the wall respect the wall respect the wall "
	return "# CONTEXT PACK\n" + wall + wall + wall +
		"\n## Boundaries (THE WALL)\nallowed_paths: " + target + "\n" +
		"forbidden_paths: /kernel/**, /mirror/**\n" + wall + wall + wall + "\n"
}

// promptTurn is a write turn that ALSO carries the LLM-input prompt the loop feeds to
// GenerateAction. The token cost is left to the loop to MEASURE from the (possibly compressed)
// prompt — the fixture does not hard-code it, so compression can lower it.
func promptTurn(target, flip string) ScriptedTurn {
	tn := writeTurn(target, flip)
	tn.Prompt = repetitivePrompt(target)
	// Zero the hard-coded token cost: under HR04 the loop measures tokens from the prompt
	// (compressed when a compressor is wired), so the cost is derived, not declared.
	tn.Cost.Tokens = 0
	return tn
}

// withCompressor wires the HR03 reference compressor (via the HR02 port) into a DriveInput.
func withCompressor(in DriveInput) DriveInput {
	in.Compressor = rctx.ReferenceCompressor{}
	return in
}

// --- 1. SAME VERDICT OF ACTIONS (the HR03 theorem, proven through the loop) -------------

// A run replayed WITH and WITHOUT compression records the SAME sequence of action verdicts:
// same Type/Cible/Autorisee/BlockReason-code per action, same Result. Only the measured tokens
// differ (proven separately). Compression is invisible to the gate.
func TestDrive_Compression_SameActionVerdicts(t *testing.T) {
	g := twoMirrorGoal()
	g.Budgets = goal.Budgets{TimeSeconds: 10_000, Turns: 10_000, Tokens: 1_000_000}
	turns := []ScriptedTurn{promptTurn("app/a.go", "mirror.a"), promptTurn("app/b.go", "mirror.b")}

	plain := baseInput(g, turns)
	plain.Goal = g
	compressed := withCompressor(plain)

	runPlain, err := Drive(plain)
	if err != nil {
		t.Fatalf("Drive (plain) errored: %v", err)
	}
	runComp, err := Drive(compressed)
	if err != nil {
		t.Fatalf("Drive (compressed) errored: %v", err)
	}

	if runPlain.Result != runComp.Result {
		t.Fatalf("compression changed the Result: plain=%q compressed=%q", runPlain.Result, runComp.Result)
	}
	if !sameActionVerdicts(runPlain.Actions, runComp.Actions) {
		t.Fatalf("compression changed the action verdicts:\n plain=%+v\n comp =%+v", runPlain.Actions, runComp.Actions)
	}
}

// sameActionVerdicts compares two action sequences on what the GATE decides (Type, Cible,
// Autorisee, and the BlockReason CODE) — NOT on the measured cost, which compression changes.
func sameActionVerdicts(a, b []agentrun.AgentAction) bool {
	if len(a) != len(b) {
		return false
	}
	codeOf := func(x agentrun.AgentAction) string {
		if x.RaisonBlocage == nil {
			return ""
		}
		return string(x.RaisonBlocage.Code)
	}
	for i := range a {
		if a[i].Type != b[i].Type || a[i].Cible != b[i].Cible ||
			a[i].Autorisee != b[i].Autorisee || codeOf(a[i]) != codeOf(b[i]) {
			return false
		}
	}
	return true
}

// --- 2. TOKENS MEASURED ↓ ---------------------------------------------------------------

// The measured token meter is STRICTLY LOWER with compression on a repetition-prone prompt the
// reference compressor collapses. The margin under the cap is extended; the verdicts are unchanged.
func TestDrive_Compression_TokensMeasuredLower(t *testing.T) {
	g := twoMirrorGoal()
	g.Budgets = goal.Budgets{TimeSeconds: 10_000, Turns: 10_000, Tokens: 1_000_000}
	turns := []ScriptedTurn{promptTurn("app/a.go", "mirror.a"), promptTurn("app/b.go", "mirror.b")}

	plain := baseInput(g, turns)
	plain.Goal = g
	compressed := withCompressor(plain)

	_, meterPlain, err := DriveWithEconomics(plain)
	if err != nil {
		t.Fatalf("DriveWithEconomics (plain) errored: %v", err)
	}
	_, meterComp, err := DriveWithEconomics(compressed)
	if err != nil {
		t.Fatalf("DriveWithEconomics (compressed) errored: %v", err)
	}

	if meterPlain.Tokens <= 0 {
		t.Fatalf("the plain run must measure a positive token cost from the prompt, got %d", meterPlain.Tokens)
	}
	if !(meterComp.Tokens < meterPlain.Tokens) {
		t.Fatalf("compression must measure STRICTLY FEWER tokens: plain=%d compressed=%d", meterPlain.Tokens, meterComp.Tokens)
	}
}

// --- 3 & 4. CheckBudget COHERENT ∧ THE CAP IS NEVER RAISED -------------------------------

// The decisive HR04 fixture: a token cap set BETWEEN the compressed cost and the plain cost.
// WITHOUT compression the run breaches the cap (abandoned); WITH compression the SAME run fits
// under the SAME cap (green) — because it spends FEWER tokens, NEVER because the cap moved. The
// EffectiveTokensCap is byte-identical both ways (asserted), proving the cap is never relieved.
func TestDrive_Compression_FitsUnderSameCap_CapNeverRaised(t *testing.T) {
	g := twoMirrorGoal()
	turns := []ScriptedTurn{promptTurn("app/a.go", "mirror.a"), promptTurn("app/b.go", "mirror.b")}

	// Measure both costs first to choose a cap strictly between them.
	probe := baseInput(g, turns)
	probe.Goal = g
	probe.Goal.Budgets = goal.Budgets{TimeSeconds: 10_000, Turns: 10_000, Tokens: 1_000_000}
	_, meterPlain, _ := DriveWithEconomics(probe)
	_, meterComp, _ := DriveWithEconomics(withCompressor(probe))
	if !(meterComp.Tokens < meterPlain.Tokens) {
		t.Fatalf("setup: need compressed (%d) < plain (%d)", meterComp.Tokens, meterPlain.Tokens)
	}
	// A cap that the plain run exceeds but the compressed run meets.
	cap := (meterComp.Tokens + meterPlain.Tokens) / 2
	if cap < meterComp.Tokens || cap >= meterPlain.Tokens {
		t.Fatalf("setup: cap %d must satisfy compressed(%d) <= cap < plain(%d)", cap, meterComp.Tokens, meterPlain.Tokens)
	}

	g.Budgets = goal.Budgets{TimeSeconds: 10_000, Turns: 10_000, Tokens: cap}

	plain := baseInput(g, turns)
	plain.Goal = g
	compressed := withCompressor(plain)

	// The cap is byte-identical both ways — compression NEVER raises it.
	capPlain := agentimpl.EffectiveTokensCap(plain.HarnessBudget, plain.Goal.Budgets)
	capComp := agentimpl.EffectiveTokensCap(compressed.HarnessBudget, compressed.Goal.Budgets)
	if capPlain != capComp {
		t.Fatalf("compression must NOT change the effective cap: plain=%d compressed=%d", capPlain, capComp)
	}

	runPlain, _, err := DriveWithEconomics(plain)
	if err != nil {
		t.Fatalf("DriveWithEconomics (plain) errored: %v", err)
	}
	runComp, meterComp2, err := DriveWithEconomics(compressed)
	if err != nil {
		t.Fatalf("DriveWithEconomics (compressed) errored: %v", err)
	}

	// WITHOUT compression: the run breaches the cap and abandons.
	if runPlain.Result != agentrun.ResultAbandoned {
		t.Fatalf("without compression the run must breach the cap (abandoned), got %q", runPlain.Result)
	}
	// WITH compression: the SAME run fits under the SAME cap and closes green.
	if runComp.Result != agentrun.ResultGreen {
		t.Fatalf("with compression the run must fit under the same cap (green), got %q", runComp.Result)
	}
	// CheckBudget is coherent: the compressed meter is within the cap, the plain one is over.
	if vc := agentimpl.CheckBudget(meterComp2, compressed.HarnessBudget, compressed.Goal.Budgets, compressed.RatePerToken); !vc.WithinBudget {
		t.Fatalf("the compressed run's meter must be within budget, got %+v", vc)
	}
	if meterComp2.Tokens > cap {
		t.Fatalf("the compressed meter (%d) must stay at/below the cap (%d)", meterComp2.Tokens, cap)
	}
}

// --- DETERMINISM: MeasureTokens is a pure function, the loop is reproducible -------------

// MeasureTokens is the pure deterministic token measurer (whitespace token count) — the
// reproducibility mirror: same input ⇒ same count, and it never exceeds the raw count after
// compression (compression only removes tokens).
func TestMeasureTokens_PureAndCompressionReduces(t *testing.T) {
	prompt := repetitivePrompt("app/a.go")
	raw := MeasureTokens(prompt)
	if raw != MeasureTokens(prompt) {
		t.Fatalf("MeasureTokens is not pure")
	}
	compacted, _ := rctx.ReferenceCompressor{}.Compress(prompt)
	comp := MeasureTokens(compacted.Text)
	if comp > raw {
		t.Fatalf("compression must not increase the token count: raw=%d compressed=%d", raw, comp)
	}
	if comp >= raw {
		t.Fatalf("on a repetition-prone prompt compression must reduce tokens: raw=%d compressed=%d", raw, comp)
	}
}

// The whole compressed run is reproducible: same input ⇒ same (run, meter), twice.
func TestDrive_Compression_Reproducible(t *testing.T) {
	g := twoMirrorGoal()
	g.Budgets = goal.Budgets{TimeSeconds: 10_000, Turns: 10_000, Tokens: 1_000_000}
	turns := []ScriptedTurn{promptTurn("app/a.go", "mirror.a"), promptTurn("app/b.go", "mirror.b")}
	in := withCompressor(baseInput(g, turns))
	in.Goal = g

	r1, m1, e1 := DriveWithEconomics(in)
	r2, m2, e2 := DriveWithEconomics(in)
	if (e1 == nil) != (e2 == nil) {
		t.Fatalf("error nondeterminism: %v vs %v", e1, e2)
	}
	if !reflect.DeepEqual(r1, r2) || m1 != m2 {
		t.Fatalf("compressed Drive not reproducible:\n run %+v vs %+v\n meter %+v vs %+v", r1, r2, m1, m2)
	}
}
