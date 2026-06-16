// owasp_eval_property_test.go — ADR 0078 step 2 mirror (RED-first).
//
// RED-FIRST. Written before owasp_eval.go existed; the first run failed to compile (no
// DecisionContext / RiskChecks / EvalRisks / DeriveDecisionContexts / PolicyReproducesGate).
// That compile-red IS the goal. Green follows the OWASP evals being wired onto the REAL
// decision path (an actual agentloop.Drive run's gated actions, NOT a synthetic fixture
// Action) and a policy-as-data reproducing the SAME BlockReason as the bare enforcer.
//
// WHERE GV04 (compliance.go) RUNS EACH RISK AGAINST A HAND-WRITTEN fixture Action, this
// mirror routes the ten risks onto the ACTUAL decisions a Drive run took — the same point
// the gate is consulted in production (drive.go step 3). The judge is the existing
// GateAction itself (CLAUDE.md §6/§8 determinism-first — no LLM enters; every check is a
// pure function of the recorded decision context).
//
// THE ADR 0078 step-2 done-criteria, PINNED:
//
//   - REAL PATH — TestEval_RoutesOnRealDriveDecisions: DeriveDecisionContexts(Drive run)
//     yields one DecisionContext per gated turn, each carrying the REAL (Action, Decision)
//     the loop evaluated. EvalRisks over a governed run is ALL-PASS (the real path governs
//     every risk it exercises).
//
//   - PER-RISK PASS+FAIL — TestEval_EachRiskHasPassAndFail: for EACH of the ten risks the
//     eval distinguishes a governed decision (the forbidden action was DENIED on the real
//     path ⇒ pass) from a degraded decision (the same action ALLOWED ⇒ fail+reason). A
//     check that cannot fail proves nothing (a monster).
//
//   - POLICY EQUIVALENCE — TestPolicy_ReproducesGateBlockReason: the policy-as-data routed
//     at the SAME decision point produces the IDENTICAL BlockReason as the bare enforcer
//     (GateAction) for every action — the policy governs, it does not re-judge.
//
//   - DETERMINISTIC — TestEval_Deterministic: same run ⇒ same eval verdicts (no LLM, no
//     clock, no rng).
package governance

import (
	"testing"

	"pgregory.net/rapid"
)

// TestEval_RoutesOnRealDriveDecisions pins the load-bearing ADR-0078 claim: the evals run on
// the decisions of a REAL Drive run, and a governed run passes every applicable risk check.
func TestEval_RoutesOnRealDriveDecisions(t *testing.T) {
	ctxs := DeriveDecisionContexts(GovernedDriveScenario())
	if len(ctxs) == 0 {
		t.Fatal("a real Drive run must yield at least one gated decision context")
	}
	// Every context must carry the action it gated and the gate's verdict (the real point).
	for i, c := range ctxs {
		if c.Decision.Allowed && c.Decision.BlockReason != nil {
			t.Fatalf("ctx %d: an allowed decision carries no BlockReason", i)
		}
		if !c.Decision.Allowed && c.Decision.BlockReason == nil {
			t.Fatalf("ctx %d: a denied decision must carry its BlockReason", i)
		}
	}
	rep := EvalRisks(ctxs)
	if !rep.AllPass {
		t.Fatalf("a governed run must pass every applicable risk; failures: %+v", rep.Failures())
	}
	// All ten risks are present in the report (completeness — no risk silently dropped).
	if len(rep.Results) != len(Risks()) {
		t.Fatalf("eval must report all %d risks, got %d", len(Risks()), len(rep.Results))
	}
}

// TestEval_EachRiskHasPassAndFail pins that EVERY risk's check is load-bearing: it PASSES on
// a governed decision and FAILS (with a reason) on the degraded one. A check that cannot
// fail is a monster (it proves nothing).
func TestEval_EachRiskHasPassAndFail(t *testing.T) {
	for _, rc := range RiskChecks() {
		good, bad, ok := rc.WitnessContexts()
		if !ok {
			t.Fatalf("risk %s declares no witness decision contexts (pass+fail)", rc.Risk)
		}
		passing := rc.Check([]DecisionContext{good})
		if !passing.Pass {
			t.Errorf("risk %s: governed witness must PASS, got fail: %s", rc.Risk, passing.Reason)
		}
		failing := rc.Check([]DecisionContext{bad})
		if failing.Pass {
			t.Errorf("risk %s: degraded witness must FAIL (the violation escaped), but it passed", rc.Risk)
		}
		if !failing.Pass && failing.Reason == "" {
			t.Errorf("risk %s: a failing check must carry a non-empty reason", rc.Risk)
		}
	}
	// Completeness: exactly one check per OWASP risk, in canonical order.
	if len(RiskChecks()) != len(Risks()) {
		t.Fatalf("expected %d risk checks (one per OWASP risk), got %d", len(Risks()), len(RiskChecks()))
	}
	for i, rc := range RiskChecks() {
		if rc.Risk != Risks()[i] {
			t.Fatalf("risk check %d out of canonical order: %s != %s", i, rc.Risk, Risks()[i])
		}
	}
}

// TestPolicy_ReproducesGateBlockReason pins the GV05-on-the-real-path equivalence: the
// policy-as-data routed at the decision point produces the IDENTICAL verdict (Allowed,
// DeniedAxis, BlockReason.Code) as the bare GateAction enforcer — the policy governs, it
// does not re-judge. Proven over a generated action space (single-sourced through GateAction).
func TestPolicy_ReproducesGateBlockReason(t *testing.T) {
	pol, err := CompilePolicy(SamplePolicyYAML())
	if err != nil {
		t.Fatalf("reference policy must compile: %v", err)
	}
	ref := ReferenceImpl()
	rapid.Check(t, func(rt *rapid.T) {
		act := drawAction(rt)
		eq := PolicyReproducesGate(pol, ref, act)
		if !eq.Equivalent {
			rt.Fatalf("policy verdict diverged from the enforcer for %+v: %s", act, eq.Reason)
		}
	})
}

// TestEval_Deterministic pins determinism-first: the same real run yields the same eval.
func TestEval_Deterministic(t *testing.T) {
	a := EvalRisks(DeriveDecisionContexts(GovernedDriveScenario()))
	b := EvalRisks(DeriveDecisionContexts(GovernedDriveScenario()))
	if a.AllPass != b.AllPass || len(a.Results) != len(b.Results) {
		t.Fatalf("eval drifted between runs: %+v vs %+v", a, b)
	}
	for i := range a.Results {
		if a.Results[i] != b.Results[i] {
			t.Fatalf("eval result %d drifted: %+v vs %+v", i, a.Results[i], b.Results[i])
		}
	}
}
