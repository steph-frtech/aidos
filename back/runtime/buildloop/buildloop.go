// Package buildloop is the S83 Runtime BUILD-LOOP SERVICE — the executing agent of the
// app-builder (ROADMAP-app-builder EPIC 8) — together with its DETERMINISTIC CIRCUIT
// BREAKER. It is the orchestration that takes a red set and drives it toward green:
//
//	red set → ContextRouter compiles a ContextPack (an ALGORITHM, S33, not a prompt)
//	        → calls the LLM (the GENERATION-ONLY exception, §6/§8)
//	        → writes code into the per-project SANDBOX (S82, below the waterline)
//	        → runs the AFFECTED mirrors/sensors → iterates red→green
//	        → records the AgentRun/AgentAction (S52)
//	        → STOPS HONESTLY the instant the non-gameable Stop passes OR a build that
//	          SPENDS WITHOUT ADVANCING is detected (BUILD_LOOP_NO_PROGRESS), wired to the
//	          HarnessCostBudget (S51/economics).
//
// THE THREE NON-NEGOTIABLE LAWS this package pins (the step's three mirrors):
//
//  1. GREEN-ONLY-WHEN-THE-NON-GAMEABLE-STOP-PASSES (Godog, §57/§8). The loop terminates
//     GREEN iff goal.IsClosed holds — red set→green ∧ prior green intact ∧ mutation ≥ floor
//     ∧ no monster. The engine NEVER reads the agent's claim of "done": Terminate takes NO
//     confidence field. REUSES goal.IsClosed verbatim — the Stop is NOT re-implemented here.
//
//  2. THE AGENT WRITES NOTHING ABOVE THE WATERLINE (property, the wall §2). Every action
//     the loop attempts is stamped by agentrun.ApplyWall (the S04 waterline predicate via
//     agentlayer.MayWrite). A write whose target resolves above the line lands
//     Autorisee=false with AGENT_WRITE_ABOVE_WATERLINE — for EVERY role. Truth-writes go
//     through propose→ChangeSet (S85), never a direct write from the loop.
//
//  3. TERMINATION IS A PURE FUNCTION OF THE HISTORY (property, §6/§8 determinism-first).
//     Terminate and NoProgress are PURE, TOTAL, DETERMINISTIC over the iteration history —
//     no clock, no rng, no I/O, never panic. Same history ⇒ same halt verdict. The judge is
//     the mirror + the pure detector; the LLM never decides termination (it is the
//     generation-only exception, isolated to GenerateDiff, checked deterministically by the
//     mirror).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The no-progress detector is the canonical example of
// "whatever can be a pure function MUST be code": stagnation is a structural property of the
// iteration history (repeated diff-hash / red↔green oscillation / zero newly-green mirror /
// max-iteration cap), computed by NoProgress, NEVER an LLM "I think we're stuck" judgment.
// The reproducibility mirror (buildloop_property_test.go) pins same-history→same-verdict.
//
// THE WALL (CLAUDE.md §2). This package writes NOTHING above the line and returns VALUES:
// the Verdict, the recorded AgentRun (via agentrun.Record), the BlockReason. Persisting the
// run rides the agent's below-the-line INSERT grant; the sandbox write rides S82. The kernel/
// mirrors/fitness are SELECT-only to the agent.
package buildloop

import (
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// Verdict is the CLOSED outcome of evaluating the loop's termination over its history. The
// loop ends in exactly one of these; it is COMPUTED by Terminate, never declared by the agent.
type Verdict string

const (
	// VerdictContinue — neither the Stop passed nor the breaker tripped: keep iterating.
	VerdictContinue Verdict = "continue"
	// VerdictGreen — the non-gameable Stop passed (goal.IsClosed): the loop terminates GREEN.
	VerdictGreen Verdict = "green"
	// VerdictNoProgress — the deterministic breaker tripped (no-progress / max-iterations /
	// over-budget): the loop STOPS HONESTLY with BUILD_LOOP_NO_PROGRESS. It is NOT green.
	VerdictNoProgress Verdict = "no_progress"
)

// verdictOrder is the declared enumeration order (never map iteration), so projections are
// stable.
var verdictOrder = []Verdict{VerdictContinue, VerdictGreen, VerdictNoProgress}

// Verdicts returns the three closed verdicts in canonical order.
func Verdicts() []Verdict {
	out := make([]Verdict, len(verdictOrder))
	copy(out, verdictOrder)
	return out
}

// IsKnownVerdict reports whether v is one of the three closed verdicts.
func IsKnownVerdict(v Verdict) bool {
	for _, vv := range verdictOrder {
		if vv == v {
			return true
		}
	}
	return false
}

// Iteration is ONE recorded turn of the build loop — the unit the no-progress detector reasons
// over. It is PURE DATA, a projection of what happened, carrying no clock and no judgment:
//
//   - DiffHash is the content-hash of the code diff the LLM produced this turn (records.Hash
//     over the sandbox patch). A REPEATED diff-hash across turns means the agent is writing
//     the SAME change again — spending without advancing.
//   - GreenMirrors is the SET of mirror refs that are green AFTER this turn's sensors ran.
//     Newly-green = present here, absent in the prior turn. Zero newly-green across the
//     stagnation window is the second stagnation signal.
//   - The pair (was any mirror that was green now red?) drives the red↔green OSCILLATION
//     signal — a build that flips a prior green back to red is thrashing, not advancing.
//
// Declared as a value type so a history is trivially comparable and replayable.
type Iteration struct {
	DiffHash     string   `json:"diff_hash"`
	GreenMirrors []string `json:"green_mirrors"`
}

// History is the ordered, append-only sequence of iterations the loop has taken so far — the
// SOLE input to the deterministic no-progress verdict (termination is a pure function of THIS).
type History []Iteration

// Policy is the DECLARED, above-the-line envelope of the breaker (KRD §8: budgets are declared,
// never learned). It is read here, never authored by the agent.
//
//   - MaxIterations is the hard cap on loop turns (a runaway that never converges stops at the
//     cap). Zero means "no iteration cap declared".
//   - StagnationWindow is how many CONSECUTIVE recent turns must show zero progress (no newly-
//     green mirror, only repeated/oscillating diffs) before the breaker trips. A window of 1
//     trips on the first stagnant turn; a larger window tolerates transient plateaus. Must be ≥ 1
//     to arm the zero-newly-green / oscillation detector (a zero window disarms those signals).
type Policy struct {
	MaxIterations    int `json:"max_iterations"`
	StagnationWindow int `json:"stagnation_window"`
}

// NoProgress is the DETERMINISTIC no-progress detector — a PURE, TOTAL function of the iteration
// history and the declared policy (CLAUDE.md §6/§8). It reports true iff the build is SPENDING
// WITHOUT ADVANCING, on ANY of the declared signals:
//
//	(a) MAX-ITERATIONS — the history reached the declared MaxIterations cap (a loop that never
//	    converges stops);
//	(b) ZERO NEWLY-GREEN — across the last StagnationWindow turns, NOT ONE new mirror went
//	    green (the red set is not advancing toward green);
//	(c) REPEATED DIFF-HASH — the last two turns produced the byte-identical diff (the agent is
//	    re-writing the same change — pure churn);
//	(d) RED↔GREEN OSCILLATION — a mirror that was green in the prior turn is no longer green
//	    in the latest turn (the build flipped a prior green back to red — thrashing).
//
// It is NEVER an LLM judgment: stagnation is a structural property of the history, computed
// here. Same history + policy ⇒ same verdict (the property mirror pins it). Totale: a nil/empty
// history is "not stuck yet" (nothing spent), never a panic.
func NoProgress(h History, p Policy) bool {
	n := len(h)
	if n == 0 {
		return false
	}

	// (a) MAX-ITERATIONS cap. A declared cap of 0 disarms this signal.
	if p.MaxIterations > 0 && n >= p.MaxIterations {
		return true
	}

	// The window-based signals need a window and at least one turn.
	if p.StagnationWindow < 1 {
		return false
	}

	// (c) REPEATED DIFF-HASH — the two most recent turns are byte-identical churn.
	if n >= 2 && h[n-1].DiffHash != "" && h[n-1].DiffHash == h[n-2].DiffHash {
		return true
	}

	// (d) RED↔GREEN OSCILLATION — a mirror green in the prior turn is no longer green now.
	if n >= 2 {
		latest := greenSet(h[n-1].GreenMirrors)
		for _, m := range h[n-2].GreenMirrors {
			if !latest[m] {
				return true
			}
		}
	}

	// (b) ZERO NEWLY-GREEN across the last StagnationWindow turns. Newly-green = a mirror green
	// in turn k that was NOT green in turn k-1. If the window covers the WHOLE history, the
	// first turn's own greens count as new (they were green where there was nothing before).
	if n >= p.StagnationWindow {
		start := n - p.StagnationWindow
		sawNew := false
		for k := start; k < n && !sawNew; k++ {
			var prev map[string]bool
			if k == 0 {
				prev = map[string]bool{}
			} else {
				prev = greenSet(h[k-1].GreenMirrors)
			}
			for _, m := range h[k].GreenMirrors {
				if !prev[m] {
					sawNew = true
					break
				}
			}
		}
		if !sawNew {
			return true
		}
	}

	return false
}

// greenSet builds a membership set from a slice of mirror refs. Pure helper.
func greenSet(ms []string) map[string]bool {
	s := make(map[string]bool, len(ms))
	for _, m := range ms {
		s[m] = true
	}
	return s
}

// TerminationInput is the PURE, TOTAL input to Terminate — everything the termination verdict
// is a function of, and NOTHING ELSE. There is DELIBERATELY no agent-confidence field (§57/§8):
// the loop never terminates on the agent's claim of "done".
type TerminationInput struct {
	// Goal carries the red set being driven (the Stop is computed against it).
	Goal goal.Goal
	// Stop is the live non-gameable Stop input (sensors / prior-green / mutation / monsters).
	Stop goal.StopInput
	// History is the iteration history (the sole input to the no-progress breaker).
	History History
	// Policy is the declared breaker envelope (max-iterations / stagnation window).
	Policy Policy
	// Budget is the cell's DECLARED HarnessCostBudget (S51). Zero-value caps disarm the
	// budget breaker (no cap declared ⇒ never over budget).
	Budget economics.HarnessCostBudget
	// Cost is the run's MEASURED consumption so far (S52 AgentRun-derived counting, never an
	// estimate). Compared against Budget by economics.Evaluate.
	Cost economics.MeasuredCost
	// ValueCase is the optional justification that clears an over-budget flag (nil = none).
	ValueCase *economics.ValueCase
}

// Decision is the typed result of Terminate: the verdict plus, when the breaker tripped, the
// actionable BUILD_LOOP_NO_PROGRESS BlockReason (nil otherwise). VerdictGreen and
// VerdictContinue carry no BlockReason (a passing Stop / an advancing loop is not a refusal).
type Decision struct {
	Verdict     Verdict                  `json:"verdict"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
	// OverBudgetAxes names the HarnessCostBudget axes that contributed to a budget-driven halt
	// (empty when the halt was structural, e.g. max-iterations / oscillation). For the console.
	OverBudgetAxes []string `json:"over_budget_axes,omitempty"`
}

// Terminate is the NON-GAMEABLE termination verdict (the step's core, §57/§8). It is PURE,
// TOTAL and DETERMINISTIC over its input — no clock, no rng, no I/O, never panics; same input
// ⇒ same Decision (the property mirror pins it). The precedence is honest:
//
//  1. GREEN FIRST — if the non-gameable Stop passes (goal.IsClosed), the loop terminates GREEN.
//     A converged build is green even if it had earlier stagnated turns; reaching green is the
//     legitimate exit. (The Stop is REUSED verbatim — never re-implemented here.)
//  2. ELSE BREAKER — if the build is NOT green AND (the deterministic no-progress detector
//     fired OR the HarnessCostBudget flags the run over a declared cap), the loop STOPS
//     HONESTLY with BUILD_LOOP_NO_PROGRESS. A loop that cannot reach green stops, it never
//     claims a done it did not earn (§8).
//  3. ELSE CONTINUE — neither: keep iterating.
//
// The LLM never enters here: termination is a function of the mirror verdicts (goal.IsClosed),
// the iteration history (NoProgress), and the declared budget (economics.Evaluate). The judge
// is deterministic.
func Terminate(in TerminationInput) Decision {
	// (1) GREEN — the non-gameable Stop is the only path to a green termination.
	if goal.IsClosed(in.Goal, in.Stop) {
		return Decision{Verdict: VerdictGreen}
	}

	// (2) BREAKER — structural no-progress OR over-budget, evaluated against the history/budget.
	stuck := NoProgress(in.History, in.Policy)

	econ := economics.Evaluate(in.Budget, in.Cost, in.ValueCase)
	overBudget := econ.Verdict == economics.VerdictOverBudgetFlagged

	if stuck || overBudget {
		br := blockreason.For(blockreason.CodeBuildLoopNoProgress)
		return Decision{
			Verdict:        VerdictNoProgress,
			BlockReason:    &br,
			OverBudgetAxes: econ.OverAxes,
		}
	}

	// (3) CONTINUE — not green, not stuck, within budget.
	return Decision{Verdict: VerdictContinue}
}

// RunResultFor maps a terminal Verdict to the agentrun.Result the recorded AgentRun (S52) ends
// with — the bridge from the loop's verdict to the run's closed outcome. A green termination is
// agentrun.ResultGreen; a breaker halt is agentrun.ResultBlocked (the loop stopped honestly on
// a BlockReason); VerdictContinue is NOT terminal and maps to ResultStillRed (the run is still
// open against its red set). Pure, total.
func RunResultFor(v Verdict) agentrun.Result {
	switch v {
	case VerdictGreen:
		return agentrun.ResultGreen
	case VerdictNoProgress:
		return agentrun.ResultBlocked
	default:
		return agentrun.ResultStillRed
	}
}
