// Package economics is the AIDOS Runtime harness-economics diagnostic (step S51):
// the pure, read-only function that names the PRICE of the harness and decides
// whether a costly truth is WORTH it (KRD §66.3 « l'économie du harnais » : « plus
// une contrainte coûte cher à maintenir, plus elle doit justifier sa valeur »).
//
// THE RULE (KRD §66.3). The more a constraint costs to maintain, the more it must
// justify its value. Concretely: each cell DECLARES a HarnessCostBudget (the cap);
// a truth whose MEASURED harness cost exceeds that budget on any axis, and which
// carries NO `justified` ValueCase, is FLAGGED — an actionable advisory BlockReason.
// The SAME over-budget truth carrying a ValueCase{decision: justified} has earned
// its keep (over_budget_justified). A `too_expensive` / `revisit` decision does NOT
// clear the flag.
//
// THE WALL (CLAUDE.md §2/§8). The HarnessCostBudget is DECLARED, above the line, in
// the read-only `fitness` zone (§8 anti-Goodhart: weights/thresholds declared, never
// learned) — this package READS it (SELECT-only for the agent) and NEVER authors or
// raises the bar it is measured against. Raising a cap is a /goal against the
// declared fitness, never an edit here. The ValueCase + the economics snapshot are a
// Runtime diagnostic BELOW the waterline, recorded only by the aidos CLI writer via
// an approved ChangeSet (S20). Evaluate writes NOTHING.
//
// COST IS CONSUMED, NEVER PRODUCED. ci_minutes / human_review_minutes come from
// telemetry / changeset records, mutation_runtime from the S40 mutation run,
// llm_tokens from the goal's recorded spend. This package builds NO cost meter — it
// receives a MeasuredCost and compares it to the declared cap.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Evaluate is a pure, total function of
// (budget, cost, valueCase) — no DB, no I/O, no time.Now(): the per-axis comparison
// is arithmetic, the verdict selection is a switch, the BlockReason is the S13
// canonical shape. Same inputs ⇒ same verdict. The reproducibility property mirror
// pins it. There is NO LLM in the evaluator; the only free text is the human-authored
// `expected_impact`, which is data, never a judgment the evaluator depends on.
//
// REUSE, NEVER FORK. The BlockReason is S13's shape (blockreason.BlockReason). The
// snapshot id is Hash(Canonicalize(body)) over S01/S02's content-hash scheme
// (records.Canonicalize + records.Hash). The over-budget flag is the SAME advisory
// family as S41's KernelDebt (stale fixtures / orphan mirrors / surviving mutants) —
// an economic debt, detect-and-advise, deletes nothing.
package economics

import (
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"

	krec "github.com/steph-frtech/aidos/back/kernel/records"
)

// CodeHarnessCostExceedsBudget is the advisory BlockReason code raised when a truth's
// measured harness cost exceeds its declared budget on any axis WITHOUT a justified
// ValueCase (the KRD §66.3 rule). It is the S13 BlockReason SHAPE reused here; the
// economics diagnostic owns this code locally (advisory, below the line) rather than
// extending the S13 wall enum — the wall codes are non-bypassable refusals, this is a
// read-only economic advisory. Same {code, severity, explanation, how_to_fix} shape.
const CodeHarnessCostExceedsBudget blockreason.Code = "HARNESS_COST_EXCEEDS_BUDGET"

// Risk is the declared gravity of a truth breaking — the `risk_if_broken` axis of a
// ValueCase (KRD §66.3). The set is CLOSED: low | medium | high | critical, never
// invented (the honesty rule).
type Risk string

const (
	// RiskLow — breaking the truth has little consequence.
	RiskLow Risk = "low"
	// RiskMedium — breaking the truth has a moderate consequence.
	RiskMedium Risk = "medium"
	// RiskHigh — breaking the truth has a serious consequence.
	RiskHigh Risk = "high"
	// RiskCritical — breaking the truth is catastrophic.
	RiskCritical Risk = "critical"
)

// risks is the closed set of risk levels, for the validation guard.
var risks = map[Risk]bool{RiskLow: true, RiskMedium: true, RiskHigh: true, RiskCritical: true}

// IsRisk reports whether r is one of the four declared risk levels.
func IsRisk(r Risk) bool { return risks[r] }

// Decision is the human verdict a ValueCase carries for a costly truth (KRD §66.3).
// The set is CLOSED: justified | too_expensive | revisit, never invented. Only
// `justified` clears the over-budget flag (the truth earned its keep).
type Decision string

const (
	// DecisionJustified — the costly truth has earned its keep: the harness spend is
	// worth it against the risk/impact. This is the ONLY decision that clears the flag.
	DecisionJustified Decision = "justified"
	// DecisionTooExpensive — the harness spend is NOT justified: the truth is too
	// costly for its value. Does NOT clear the flag (still over_budget_flagged).
	DecisionTooExpensive Decision = "too_expensive"
	// DecisionRevisit — the value case is undecided / to be revisited. Does NOT clear
	// the flag (an undecided case is not a justification).
	DecisionRevisit Decision = "revisit"
)

// decisions is the closed set of decisions, for the validation guard.
var decisions = map[Decision]bool{DecisionJustified: true, DecisionTooExpensive: true, DecisionRevisit: true}

// IsDecision reports whether d is one of the three declared decisions.
func IsDecision(d Decision) bool { return decisions[d] }

// Verdict is the EconomicsDecision Evaluate returns — the per-truth economic verdict.
// The set is CLOSED: within_budget | over_budget_justified | over_budget_flagged.
// Evaluate is TOTAL — it always returns exactly one of these.
type Verdict string

const (
	// VerdictWithinBudget — the measured cost is within every declared cap. No
	// ValueCase needed; no BlockReason.
	VerdictWithinBudget Verdict = "within_budget"
	// VerdictOverBudgetJustified — the measured cost exceeds a cap, BUT a
	// ValueCase{decision: justified} says the costly truth has earned its keep
	// (the §66.3 rule). No BlockReason.
	VerdictOverBudgetJustified Verdict = "over_budget_justified"
	// VerdictOverBudgetFlagged — the measured cost exceeds a cap and there is NO
	// justified ValueCase. FLAGGED with a HARNESS_COST_EXCEEDS_BUDGET BlockReason.
	VerdictOverBudgetFlagged Verdict = "over_budget_flagged"
)

// HarnessCostBudget is a cell's DECLARED, above-the-line cap (KRD §66.3). It lives in
// the read-only `fitness.harness_cost_budget` zone; this package READS it (the agent
// is SELECT-only) and NEVER authors it (§8). MaxMutationRuntimeSeconds is a duration
// expressed in seconds (the AST stores a duration string like "5m"; the migration
// CHECK keeps the columns numeric, the projection converts). ExpectedRiskReduction
// is a declared risk level the budget is expected to buy down (free declaration).
type HarnessCostBudget struct {
	CellRef                  string `json:"cell_ref"`
	MaxCIMinutes             int    `json:"max_ci_minutes"`
	MaxLLMTokensPerGoal      int    `json:"max_llm_tokens_per_goal"`
	MaxMutationRuntimeSecond int    `json:"max_mutation_runtime_seconds"`
	MaxHumanReviewMinutes    int    `json:"max_human_review_minutes"`
	ExpectedRiskReduction    Risk   `json:"expected_risk_reduction"`
}

// MeasuredCost is the CONSUMED real harness cost of a cell/truth, beside the budget.
// ci_minutes / human_review_minutes from telemetry/changesets, mutation_runtime from
// the S40 run, llm_tokens from the goal's recorded spend. Never produced here.
type MeasuredCost struct {
	CIMinutes             int `json:"ci_minutes"`
	LLMTokens             int `json:"llm_tokens"`
	MutationRuntimeSecond int `json:"mutation_runtime_seconds"`
	HumanReviewMinutes    int `json:"human_review_minutes"`
}

// ValueCase ties a COSTLY truth to a decision (KRD §66.3): the truth ref, the
// risk_if_broken, the free-text expected_impact (human-authored data — never a
// judgment the evaluator depends on), the harness_cost the human attributed, and the
// decision. A nil *ValueCase means "no value case" (the over-budget truth is naked).
type ValueCase struct {
	Truth          string       `json:"truth"`
	RiskIfBroken   Risk         `json:"risk_if_broken"`
	ExpectedImpact string       `json:"expected_impact"`
	HarnessCost    MeasuredCost `json:"harness_cost"`
	Decision       Decision     `json:"decision"`
}

// EconomicsDecision is the typed result of Evaluate: the verdict, the over-budget
// axes that triggered it (named in the ubiquitous language, for the panel and the
// snapshot), and the advisory BlockReason when flagged (nil otherwise). It carries the
// cell_ref the eval was taken against, for provenance.
type EconomicsDecision struct {
	CellRef     string                   `json:"cell_ref"`
	Verdict     Verdict                  `json:"verdict"`
	OverAxes    []string                 `json:"over_axes,omitempty"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// overBudgetAxes returns the names of every axis on which the measured cost EXCEEDS
// the declared cap (per-axis OR: over on ANY axis is over budget — ADR 0035). The
// axis names are the declared budget field names, in a stable order, so the report is
// deterministic. A cost exactly EQUAL to the cap is within budget (the cap is the
// inclusive ceiling).
func overBudgetAxes(b HarnessCostBudget, c MeasuredCost) []string {
	var axes []string
	if c.CIMinutes > b.MaxCIMinutes {
		axes = append(axes, "ci_minutes")
	}
	if c.LLMTokens > b.MaxLLMTokensPerGoal {
		axes = append(axes, "llm_tokens")
	}
	if c.MutationRuntimeSecond > b.MaxMutationRuntimeSecond {
		axes = append(axes, "mutation_runtime")
	}
	if c.HumanReviewMinutes > b.MaxHumanReviewMinutes {
		axes = append(axes, "human_review_minutes")
	}
	return axes
}

// harnessCostExceedsBudget is the canonical advisory BlockReason for a flagged truth
// (the S13 shape; KRD §44.5 — every refusal names the door out). The how_to_fix path
// is the §66.3 rule made actionable: open a ValueCase, reduce the harness cost, or
// raise the budget VIA /goal (never an edit here). axes names which caps were
// exceeded, so the advisory is concrete, never a fabricated target (the honesty rule).
func harnessCostExceedsBudget(cellRef string, axes []string) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     CodeHarnessCostExceedsBudget,
		Severity: blockreason.SeverityBlocking,
		Explanation: fmt.Sprintf(
			"Économie du harnais (KRD §66.3) : le coût de harnais mesuré de la cellule %q dépasse son "+
				"HarnessCostBudget déclaré sur %v, sans ValueCase `justified`. « Plus une contrainte coûte cher "+
				"à maintenir, plus elle doit justifier sa valeur » : une contrainte coûteuse qui ne justifie pas "+
				"sa valeur est signalée (advisory). Le budget est DÉCLARÉ au-dessus de la ligne (zone fitness, "+
				"lecture seule) ; l'agent ne le règle jamais (§8).",
			cellRef, axes),
		HowToFix: []string{
			"open_value_case : ouvrez une ValueCase pour cette vérité coûteuse — reliez son coût de harnais à son risk_if_broken et son expected_impact, et tranchez (decision: justified si elle a gagné sa place).",
			"reduce_harness_cost : ramenez le coût mesuré sous le cap déclaré (CI plus court, moins de tokens par /goal, run de mutation plus rapide, revue humaine plus légère).",
			"raise_budget_via_goal : si le cap est trop bas, RELEVEZ-le via un /goal (reweight/refine de la fitness déclarée) — jamais une édition directe ici ; l'agent est SELECT-only sur fitness.",
		},
	}
}

// Evaluate is the deep, pure heart of S51: it compares the MEASURED cost of a
// cell/truth against its DECLARED HarnessCostBudget and returns the EconomicsDecision
// (KRD §66.3). Pure and TOTAL — no DB, no I/O, no time.Now() — over (budget, cost,
// valueCase). It DETECTS and ADVISES; it never mutates, deletes, writes truth, or
// raises a budget.
//
//   - within every cap                                  ⇒ within_budget        (no BlockReason)
//   - over any cap AND a ValueCase{decision: justified}  ⇒ over_budget_justified (no BlockReason; earned its keep)
//   - over any cap AND no justified ValueCase            ⇒ over_budget_flagged  (HARNESS_COST_EXCEEDS_BUDGET)
//
// A ValueCase whose decision is too_expensive / revisit does NOT clear the flag (an
// undecided or rejected case is not a justification). The ValueCase argument is
// optional (nil = no value case).
func Evaluate(b HarnessCostBudget, c MeasuredCost, vc *ValueCase) EconomicsDecision {
	axes := overBudgetAxes(b, c)
	if len(axes) == 0 {
		// Within every cap. The ValueCase is irrelevant — within budget is within
		// budget regardless of any value case (the property invariant pins this).
		return EconomicsDecision{CellRef: b.CellRef, Verdict: VerdictWithinBudget}
	}
	// Over budget on at least one axis. ONLY a justified ValueCase clears the flag.
	if vc != nil && vc.Decision == DecisionJustified {
		return EconomicsDecision{CellRef: b.CellRef, Verdict: VerdictOverBudgetJustified, OverAxes: axes}
	}
	br := harnessCostExceedsBudget(b.CellRef, axes)
	return EconomicsDecision{CellRef: b.CellRef, Verdict: VerdictOverBudgetFlagged, OverAxes: axes, BlockReason: &br}
}

// ValidateBudget checks the DECLARED budget shape (read here, never authored): every
// cap is non-negative and expected_risk_reduction is in the closed Risk enum. It
// returns a non-empty error on a malformed budget. (This validates the shape of a bar
// the agent READS; it never authors it.)
func ValidateBudget(b HarnessCostBudget) error {
	if b.CellRef == "" {
		return fmt.Errorf("economics: budget cell_ref is empty (a budget is per-cell, KRD §66.3)")
	}
	if b.MaxCIMinutes < 0 || b.MaxLLMTokensPerGoal < 0 || b.MaxMutationRuntimeSecond < 0 || b.MaxHumanReviewMinutes < 0 {
		return fmt.Errorf("economics: budget caps must be non-negative (cell %q)", b.CellRef)
	}
	if !IsRisk(b.ExpectedRiskReduction) {
		return fmt.Errorf("economics: budget expected_risk_reduction %q is not in {low,medium,high,critical}", b.ExpectedRiskReduction)
	}
	return nil
}

// ValidateValueCase checks the ValueCase shape: a non-empty truth ref, a
// risk_if_broken in the closed enum, a decision in the closed enum, and non-negative
// harness_cost fields. It returns a non-empty error on a malformed value case.
func ValidateValueCase(vc ValueCase) error {
	if vc.Truth == "" {
		return fmt.Errorf("economics: value_case truth ref is empty (a value case justifies a real truth)")
	}
	if !IsRisk(vc.RiskIfBroken) {
		return fmt.Errorf("economics: value_case risk_if_broken %q is not in {low,medium,high,critical}", vc.RiskIfBroken)
	}
	if !IsDecision(vc.Decision) {
		return fmt.Errorf("economics: value_case decision %q is not in {justified,too_expensive,revisit}", vc.Decision)
	}
	if vc.HarnessCost.CIMinutes < 0 || vc.HarnessCost.LLMTokens < 0 || vc.HarnessCost.MutationRuntimeSecond < 0 || vc.HarnessCost.HumanReviewMinutes < 0 {
		return fmt.Errorf("economics: value_case harness_cost fields must be non-negative (truth %q)", vc.Truth)
	}
	return nil
}

// snapshotBody is the canonical hashed shape of a recorded economics snapshot (id
// excluded — the id IS its hash). Keys are sorted by records.Canonicalize, so field
// order here is irrelevant.
type snapshotBody struct {
	Budget    HarnessCostBudget `json:"budget"`
	Cost      MeasuredCost      `json:"cost"`
	Decision  EconomicsDecision `json:"decision"`
	ValueCase *ValueCase        `json:"value_case,omitempty"`
}

// SnapshotID is the content address of a recorded economics snapshot, REUSING S01/S02's
// Canonicalize + Hash (never forked). The recorder (aidos CLI, via a ChangeSet) hashes
// the canonical body and stores it as the row's id; the property mirror pins
// snapshot.id == Hash(Canonicalize(body)).
func SnapshotID(b HarnessCostBudget, c MeasuredCost, d EconomicsDecision, vc *ValueCase) (string, error) {
	raw, err := json.Marshal(snapshotBody{Budget: b, Cost: c, Decision: d, ValueCase: vc})
	if err != nil {
		return "", fmt.Errorf("economics: marshal snapshot body: %w", err)
	}
	canon, err := krec.Canonicalize(raw)
	if err != nil {
		return "", fmt.Errorf("economics: canonicalize snapshot body: %w", err)
	}
	return krec.Hash(canon), nil
}
