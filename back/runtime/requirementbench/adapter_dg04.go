// adapter_dg04.go — DG04: the MODEL ADAPTER behind the RequirementBench port. A ModelAdapter PROPOSES
// candidate LLMOutputs for a Spec; the port's pure judge (DG03 Metric / DG02 Derive) ALWAYS re-judges
// that Text into a CompletenessReport before ANY use. Two adapters ship for the differential bench:
//
//   - FixtureModel: a DETERMINISTIC, network-free adapter (the hermetic mirror's model). It re-graves
//     the DG01 spike's two-lens corpus as ratcheted code: a "single recompile" baseline + a UX-leaning
//     "A" + a structure-leaning "B" — three candidates per spec, derived purely from the spec's own
//     declared structure. No network, no clock, no rng.
//   - ClaudeModel: a REAL adapter that shells to the claude CLI (`claude --print --model <model>`),
//     running TWO distinct prompt LENSES (UX-facing "A" + formal/cross-cutting "B") as two "models"
//     for the differential — plus a deterministic "single" recompile baseline. If claude is
//     unavailable/slow/errs, it FALLS BACK to the deterministic recompile-only baseline and reports
//     usedRealLLM=false HONESTLY (a model absent ⇒ governed degradation, never a screen error).
//
// MODEL-AGNOSTIC (the honest infra note). The REAL DiffusionGemma (Gemma diffusion architecture) needs
// weights/GPU NOT guaranteed in this environment. This adapter is therefore MODEL-AGNOSTIC: the real
// DiffusionGemma wires in as JUST ANOTHER ModelAdapter (a DiffusionGemmaModel implementing Propose),
// behind THIS same port, re-judged by THIS same pure metric. Documented as an infra dependency (ADR
// 0079/0088), it does NOT block DG04 — the contract is provable with the fixture + the claude adapter.
//
// THE WALL (CLAUDE.md §2). Everything here is READ-ONLY and below the line: an adapter PROPOSES Text,
// BenchVia DERIVES a value report. NO DB, no truth-store, no write to kernel/mirrors/fitness. The
// report's MissingTypes are PROPOSED holes — they reach truth ONLY via firewall.ViaIdea → idea →
// mirror → /goal, NEVER ToKernel. The deterministic completeness law stays authoritative (ADR 0072):
// the bench proposes, it never governs.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The LLM is the GATED EXCEPTION, confined to ClaudeModel.Propose
// (irreducible generation). Its Text is ALWAYS re-judged by the pure Extract/Derive before any use —
// the judge is deterministic and DOMINATES the model: two different adapters emitting the same Text
// yield the SAME report. The fixtureModel path is fully pure, so the mirror is hermetic.
package requirementbench

import (
	"context"
	"os"
	"os/exec"
	"strings"
	"time"
)

// ModelAdapter is the DG04 seam — an injectable "model" behind the RequirementBench port. Propose maps
// a Spec to the slice of candidate outputs the differential bench compares (e.g. a single recompile
// baseline + ≥1 genuinely-divergent model lens). Available reports whether the adapter can actually
// produce (a real model with no weights/GPU/binary reports false ⇒ governed fallback). Name is an
// opaque identity label the bench NEVER lets influence the report (the judge dominates identity).
//
// The real DiffusionGemma plugs in here as just another ModelAdapter — model-agnostic by construction.
type ModelAdapter interface {
	// Propose returns candidate LLMOutputs for the spec. It must be TOTAL (never panic). An adapter
	// that cannot produce returns (nil, err); BenchVia then falls back deterministically.
	Propose(spec Spec) ([]LLMOutput, error)
	// Available reports whether the adapter can produce without falling back (binary present, etc.).
	Available() bool
	// Name is the opaque identity of the model — for display only; the report is invariant to it.
	Name() string
}

// Provenance is the HONEST, deterministic record of HOW a BenchVia report was produced: whether a real
// LLM was actually consulted (UsedRealLLM) and whether the adapter fell back to the recompile-only
// baseline (FellBack). It carries NO score and writes nothing — it is the audit of the gated exception,
// surfaced so the Workbench (DG06) can show "AI sampled" vs "recompile seul" truthfully.
type Provenance struct {
	ModelName   string // the adapter's Name (display only)
	UsedRealLLM bool   // true IFF a real claude call actually produced the candidates
	FellBack    bool   // true IFF the adapter was unavailable/errored and the recompile baseline was used
}

// BenchVia runs an adapter behind the port and ALWAYS re-judges its output with the pure DG03 Metric.
// This is the determinism-first heart of DG04: the model PROPOSES Text, the deterministic judge COUNTS
// types — the judge DOMINATES. PURE w.r.t. the judge: given the SAME candidate Texts, BenchVia returns
// the SAME report regardless of which adapter produced them. Governed degradation: if the adapter is
// unavailable OR Propose errors OR yields no candidates, BenchVia falls back to the deterministic
// RecompileProjection (the "recompile seul") — it NEVER returns an error to a screen. The Provenance
// records, honestly, whether the real LLM was used and whether it fell back.
func BenchVia(adapter ModelAdapter, spec Spec) (CompletenessMetric, Provenance) {
	prov := Provenance{ModelName: adapter.Name()}

	var cands []LLMOutput
	if adapter.Available() {
		out, err := adapter.Propose(spec)
		if err == nil && len(out) > 0 {
			cands = out
			// UsedRealLLM is true only when the adapter is a real LLM that actually produced output.
			prov.UsedRealLLM = adapterUsedRealLLM(adapter)
		}
	}
	if len(cands) == 0 {
		// Governed fallback: recompile-only baseline. Never an error, never a screen crash.
		cands = RecompileProjection(spec)
		prov.FellBack = true
		prov.UsedRealLLM = false
	}

	// The judge ALWAYS re-derives the report from the candidate Texts (pure Metric / Extract).
	return Metric(spec, cands), prov
}

// usedRealLLM is a private hook so BenchVia can tell a "real model that actually ran" from a
// deterministic stand-in WITHOUT widening the public ModelAdapter contract. The default (any adapter
// that does not opt in) is false — only ClaudeModel that actually shelled out reports true.
type realLLMReporter interface{ usedRealLLM() bool }

// usedRealLLM dispatches via the optional realLLMReporter; absent it, an adapter is deterministic.
func adapterUsedRealLLM(a ModelAdapter) bool {
	if r, ok := a.(realLLMReporter); ok {
		return r.usedRealLLM()
	}
	return false
}

// --- FixtureModel — the deterministic, network-free adapter (the hermetic mirror's model) ----------

// FixtureModel is the DETERMINISTIC adapter the property mirror runs on — NO network, no clock, no rng.
// Propose derives three candidate outputs PURELY from the spec's declared expected types: a "single"
// recompile baseline (the literal happy-path projection) + a UX-leaning "A" + a structure-leaning "B".
// The two lenses are COMPLEMENTARY (A surfaces UX facets, B the cross-cutting formal facets), so the
// differential surplus is real, yet every Text is generated deterministically from the spec — the
// reproducibility mirror replays it 100× with zero network.
type FixtureModel struct{}

// statically assert FixtureModel satisfies the adapter contract.
var _ ModelAdapter = FixtureModel{}

func (FixtureModel) Available() bool { return true }
func (FixtureModel) Name() string    { return "fixture" }

// Propose builds the three deterministic candidates from the spec's ExpectedKinds. It is PURE: the
// same spec yields the same candidate Texts (lensTaggedText partitions the expected kinds by lens and
// emits a tagged line per kind), so the whole bench is reproducible. It never errors.
func (FixtureModel) Propose(spec Spec) ([]LLMOutput, error) {
	return []LLMOutput{
		{Role: "single", Text: lensTaggedText(spec, lensSingle)},
		{Role: "A", Text: lensTaggedText(spec, lensUX)},
		{Role: "B", Text: lensTaggedText(spec, lensFormal)},
	}, nil
}

// --- The deterministic recompile projection (the fallback baseline) --------------------------------

// RecompileProjection is the DETERMINISTIC "recompile seul" candidate set — what a single deterministic
// emitter (ADR 0072 baseline) would project from the spec, with NO model. It re-states exactly the
// spec's literal happy-path structure (the lensSingle partition). This is the floor BenchVia falls back
// to when an adapter is absent, AND it is itself a valid one-candidate baseline. PURE, never errors,
// exported so the mirror can pin the fallback contract directly.
func RecompileProjection(spec Spec) []LLMOutput {
	return []LLMOutput{{Role: "single", Text: lensTaggedText(spec, lensSingle)}}
}

// lens partitions the closed taxonomy into what each "model lens" reliably surfaces. The partition is
// DECLARED (above the line), never learned: lensSingle = the literal happy-path verticale a recompile
// emits; lensUX = the user-facing facets an instruct model leans toward; lensFormal = the cross-cutting
// ∀/policy/budget/guard/event/edge facets a structure (diffusion) model fills in. Their union covers
// the whole taxonomy, and lensSingle ⊂ lensUX ∪ lensFormal is NOT assumed — the lenses are complementary.
type lens int

const (
	lensSingle lens = iota
	lensUX
	lensFormal
)

// lensKinds returns the subset of the taxonomy a given lens surfaces (deterministic membership test).
func lensKinds(l lens) map[RequirementKind]bool {
	switch l {
	case lensSingle:
		// The literal happy-path projection: views/controls/actions/operations/entities + their bind.
		return asSet([]RequirementKind{
			KindViewGoal, KindViewData,
			KindControl, KindControlTrigger,
			KindActionInvoke,
			KindOperation,
			KindEntity, KindEntityField, KindEntityRel,
		})
	case lensUX:
		// UX-leaning: the user-facing facets (visibility/enabled, success/error effects, empty state).
		return asSet([]RequirementKind{
			KindViewGoal, KindViewData, KindViewEmptyState,
			KindControl, KindControlVisible, KindControlEnabled, KindControlTrigger,
			KindActionInvoke, KindActionOnSuccess, KindActionOnError,
			KindEntity, KindEntityField,
			KindErrorCase,
		})
	case lensFormal:
		// Structure-leaning: the cross-cutting formal facets a recompile misses.
		return asSet([]RequirementKind{
			KindViewGoal,
			KindControl, KindControlTrigger,
			KindActionInvoke,
			KindOperation, KindOperationEvent, KindOperationGuard,
			KindEntity, KindEntityField, KindEntityRel,
			KindInvariant, KindPolicy, KindBudget, KindErrorCase, KindEdgeCase,
		})
	default:
		return map[RequirementKind]bool{}
	}
}

// lensTaggedText renders a candidate output text for a lens: for each of the spec's ExpectedKinds that
// the lens surfaces, it emits one tagged line using that kind's FIRST declared marker (the same closed
// vocabulary Extract parses). PURE and deterministic: same (spec, lens) → same text. This makes the
// fixture candidates realistic (tagged requirement notes) yet fully controlled, so the report is exact.
func lensTaggedText(spec Spec, l lens) string {
	surfaces := lensKinds(l)
	markers := kindMarkers()
	var b strings.Builder
	b.WriteString("# candidate spec=" + spec.ID + "\n")
	// Iterate the canonical taxonomy order so the text is byte-stable; emit only kinds the spec expects
	// AND the lens surfaces (a lens never invents a type the spec doesn't declare — the wall: the model
	// proposes within the human-declared structure, the judge counts).
	expected := asSet(spec.ExpectedKinds)
	for _, k := range AllKinds() {
		if expected[k] && surfaces[k] {
			b.WriteString(markers[k][0] + " something\n")
		}
	}
	return b.String()
}

// --- ClaudeModel — the REAL adapter (the gated exception) ------------------------------------------

// ClaudeModel is the REAL adapter: it shells to the claude CLI with TWO distinct prompt LENSES (a
// UX-facing "A" + a formal/cross-cutting "B") as two "models" for the differential, plus a
// deterministic "single" recompile baseline. The LLM is the GATED EXCEPTION (§8), confined to this
// adapter's Propose; its Text is ALWAYS re-judged by Extract in BenchVia. If the binary is missing OR
// a call errors/times out, Propose returns an error and Available reports false so BenchVia falls back
// deterministically — usedRealLLM is reported HONESTLY.
type ClaudeModel struct {
	Bin     string        // path to the claude binary (default /home/stevig/.local/bin/claude)
	Model   string        // --model (default $AIDOS_LLM_MODEL or claude-opus-4-8)
	Timeout time.Duration // per-call timeout (default 60s)

	calledReal bool // set true once a real call actually produced output (honest usedRealLLM)
}

// statically assert ClaudeModel satisfies both the adapter contract and the real-LLM reporter.
var (
	_ ModelAdapter    = (*ClaudeModel)(nil)
	_ realLLMReporter = (*ClaudeModel)(nil)
)

// NewClaudeModel builds a ClaudeModel with the project defaults (the claude binary path + the
// AIDOS_LLM_MODEL env, default claude-opus-4-8 — CLAUDE.md §7). Deterministic construction: no clock,
// no rng; only env reads for the model id and binary override.
func NewClaudeModel() *ClaudeModel {
	bin := os.Getenv("AIDOS_CLAUDE_BIN")
	if bin == "" {
		bin = "/home/stevig/.local/bin/claude"
	}
	model := os.Getenv("AIDOS_LLM_MODEL")
	if model == "" {
		model = "claude-opus-4-8"
	}
	return &ClaudeModel{Bin: bin, Model: model, Timeout: 60 * time.Second}
}

func (c *ClaudeModel) Name() string { return "claude:" + c.Model }

// Available reports whether the claude binary is resolvable on disk — the cheap pre-flight that lets
// BenchVia fall back WITHOUT a failed exec when the model is simply absent (the honest infra note:
// the real DiffusionGemma's weights/GPU may be absent; the same gate applies to any real adapter).
func (c *ClaudeModel) Available() bool {
	if c.Bin == "" {
		return false
	}
	if _, err := os.Stat(c.Bin); err == nil {
		return true
	}
	if _, err := exec.LookPath(c.Bin); err == nil {
		return true
	}
	return false
}

// usedRealLLM honestly reports whether a real call actually produced output during Propose.
func (c *ClaudeModel) usedRealLLM() bool { return c.calledReal }

// Propose shells to the claude CLI three times: the "single" recompile baseline (re-state literally),
// "A" (UX lens), "B" (formal lens) — the differential pair + the baseline. Each call is re-judged by
// Extract downstream. If ANY call fails (timeout, missing bin), Propose returns the error so BenchVia
// falls back; on success it marks calledReal so usedRealLLM is true. The LLM proposes Text only; the
// pure judge counts the types. NEVER writes truth (the wall): it returns a value.
func (c *ClaudeModel) Propose(spec Spec) ([]LLMOutput, error) {
	if !c.Available() {
		return nil, errExecUnavailable
	}
	roles := []string{"single", "A", "B"}
	cands := make([]LLMOutput, 0, len(roles))
	for _, role := range roles {
		text, err := c.callRole(role, spec)
		if err != nil {
			return nil, err
		}
		cands = append(cands, LLMOutput{Role: role, Text: text})
	}
	c.calledReal = true
	return cands, nil
}

// callRole runs one role-lensed elicitation through the claude CLI.
func (c *ClaudeModel) callRole(role string, spec Spec) (string, error) {
	to := c.Timeout
	if to == 0 {
		to = 60 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), to)
	defer cancel()

	cmd := exec.CommandContext(ctx, c.Bin, "--print", "--model", c.Model)
	cmd.Stdin = strings.NewReader(rolePrompt(role, spec))
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// errExecUnavailable is the sentinel returned when the claude binary is absent — BenchVia treats it as
// the governed fallback trigger (a model absent ⇒ recompile seul, never a screen error).
var errExecUnavailable = &execUnavailableError{}

type execUnavailableError struct{}

func (*execUnavailableError) Error() string {
	return "claude CLI unavailable (binary absent): governed fallback to recompile-only baseline"
}

// rolePrompt turns ONE spec into a role-lensed elicitation: "single" mimics a deterministic recompile
// (re-state literally, infer nothing), "A" the UX/behaviour requirements, "B" the formal/cross-cutting
// ones — two distinct prompts as the cheap stand-in for two distinct models (the differential). It asks
// for the SAME closed marker vocabulary Extract parses, so the output is deterministically re-judged
// (the LLM proposes tagged lines; the pure Extract counts types). Re-graved from the DG01 spike.
func rolePrompt(role string, spec Spec) string {
	common := "You receive a terse app spec. List the concrete software REQUIREMENTS it implies, " +
		"one per line, each starting with one of these exact tags: 'view goal:', 'zone:', " +
		"'displays field:', 'empty state:', 'control:', 'visible_when:', 'enabled_when:', " +
		"'triggers action:', 'invoke operation', 'on_success:', 'on_error:', 'operation:', " +
		"'emits event:', 'guard:', 'entity:', 'field:', 'relation:', 'invariant:', 'policy:', " +
		"'budget:', 'error case:', 'edge case:'. Output ONLY the tagged lines, no prose.\n\n"
	var lensInstr string
	switch role {
	case "single":
		lensInstr = "Re-state ONLY what the spec LITERALLY declares. Do NOT infer implicit requirements.\n"
	case "A":
		lensInstr = "Focus on the USER-FACING behaviour: screens, controls, visibility/enabled rules, " +
			"success/error effects, empty states, and the obvious error cases.\n"
	case "B":
		lensInstr = "Focus on the FORMAL and cross-cutting structure: ∀ invariants, authorization " +
			"policies, operation guards/validations, emitted events, edge/boundary cases, perf budgets.\n"
	}
	return common + lensInstr + "\nSPEC:\n" + spec.SpecText
}
