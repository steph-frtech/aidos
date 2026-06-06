package compound_test

// CE05 — the REUSE ROUTER fixture mirror (RED FIRST). It pins the done-criteria: a SUBSEQUENT
// similar goal REUSES a behavior/procédure captured by an earlier goal (CE03/CE04), so its
// effort/tokens drop. The capitalisation loop CLOSES here — capture (CE03) → expansion (CE04) →
// REUSE (CE05).
//
//	state (a CAPITALISATION CORPUS — the procedural memories + behavior-macro candidates a prior
//	       green goal captured) + a NEXT goal (its required work-units)
//	  → command (/compound reuse: route the next goal's units against the corpus)
//	  → events (a ReusePlan: each unit ROUTED to recall_procedural / expand_behavior / derive_fresh,
//	            with the token delta vs deriving everything from scratch)
//
// The load-bearing assertions of the done-criteria:
//   - a next goal SIMILAR to a captured one reuses ≥1 captured unit ⇒ EffortAfter < EffortBefore
//     (tokens ▼) — the compound payoff;
//   - the routing is BY MATCH against the DECLARED corpus (a router/algorithm, never an LLM) —
//     a unit only reuses when its name matches a captured shareable unit;
//   - THE WALL: routing READS the corpus + recalls below the line; it WRITES NO truth
//     (WroteKernel false). Reusing a behavior still goes via /goal to ever freeze.
//
// A DISSIMILAR next goal (no shared unit) reuses NOTHING — EffortAfter == EffortBefore (the
// anti-false-positive frontier, CE01's dissimilar control). Determinism-first: Reuse is a PURE
// function — same (corpus, next) ⇒ same plan (reuse_property_test.go pins it).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/compound"
)

// corpusFixture is the capitalisation corpus a prior green goal (goal-order-archive) captured via
// CE03: its gesture units became a procedural recall, its spec units a behavior-macro candidate.
// REPLAY_COST is what each unit costs to REPLAY (recall/expand) instead of DERIVE_COST to derive.
func corpusFixture() compound.Corpus {
	return compound.Corpus{
		Procedural: []compound.CapturedUnit{
			{Name: "load_context_pack", Channel: compound.ChannelProceduralMemory},
			{Name: "scaffold_package", Channel: compound.ChannelProceduralMemory},
			{Name: "project_go_ts", Channel: compound.ChannelProceduralMemory},
			{Name: "wire_ui_control", Channel: compound.ChannelProceduralMemory},
			{Name: "run_sensors", Channel: compound.ChannelProceduralMemory},
		},
		Behavior: []compound.CapturedUnit{
			{Name: "derive_mirror", Channel: compound.ChannelBehaviorMacro},
			{Name: "write_fixture", Channel: compound.ChannelBehaviorMacro},
			{Name: "cross_contract", Channel: compound.ChannelBehaviorMacro},
		},
		SourceGoal: "goal-order-archive",
	}
}

// similarNextGoal is goal-invoice-archive — the SAME shape as order-archive (the §24.6 / CE01
// canonical similar pair). It reuses every captured unit + pays full for its one intrinsic unit.
func similarNextGoal() compound.NextGoal {
	return compound.NextGoal{
		GoalID: "goal-invoice-archive",
		Required: []string{
			// shared gesture units (procedural recall)
			"load_context_pack", "scaffold_package", "project_go_ts", "wire_ui_control", "run_sensors",
			// shared spec units (behavior expansion)
			"derive_mirror", "write_fixture", "cross_contract",
			// the intrinsic unit — unique to this goal, never reused (paid full)
			"invoice_specific_rule",
		},
	}
}

func TestReuse_SimilarGoal_ReusesCapturedUnits_EffortDrops(t *testing.T) {
	plan, err := compound.Reuse(corpusFixture(), similarNextGoal())
	if err != nil {
		t.Fatalf("Reuse returned error: %v", err)
	}

	// The compound payoff: a similar goal costs LESS than deriving everything from scratch.
	if plan.EffortAfter >= plan.EffortBefore {
		t.Fatalf("expected reuse to LOWER effort: after=%d before=%d (tokens must ▼)", plan.EffortAfter, plan.EffortBefore)
	}
	if plan.SavedTokens <= 0 {
		t.Fatalf("expected SavedTokens > 0, got %d", plan.SavedTokens)
	}

	// 8 of 9 units reuse (5 procedural recall + 3 behavior expand); 1 intrinsic derives fresh.
	if plan.ReusedProcedural != 5 {
		t.Fatalf("ReusedProcedural = %d, want 5", plan.ReusedProcedural)
	}
	if plan.ReusedBehavior != 3 {
		t.Fatalf("ReusedBehavior = %d, want 3", plan.ReusedBehavior)
	}
	if plan.DerivedFresh != 1 {
		t.Fatalf("DerivedFresh = %d, want 1 (the intrinsic unit)", plan.DerivedFresh)
	}

	// THE WALL: reuse wrote no truth.
	if plan.WroteKernel {
		t.Fatal("WALL VIOLATION: Reuse wrote kernel truth; reuse READS the corpus + recalls below the line")
	}

	// Per-unit routing is explicit and ordered (the router's decision, auditable).
	if len(plan.Routes) != 9 {
		t.Fatalf("expected 9 routed units, got %d", len(plan.Routes))
	}
	if plan.Routes[0].Origin != compound.OriginReusedProcedural {
		t.Fatalf("first unit origin = %q, want reused_procedural", plan.Routes[0].Origin)
	}
	last := plan.Routes[len(plan.Routes)-1]
	if last.Name != "invoice_specific_rule" || last.Origin != compound.OriginDerivedFresh {
		t.Fatalf("intrinsic unit must derive fresh, got name=%q origin=%q", last.Name, last.Origin)
	}
}

func TestReuse_DissimilarGoal_ReusesNothing_NoFalsePositive(t *testing.T) {
	dissimilar := compound.NextGoal{
		GoalID:   "goal-pricing-engine",
		Required: []string{"compute_tax", "apply_discount", "round_currency"},
	}
	plan, err := compound.Reuse(corpusFixture(), dissimilar)
	if err != nil {
		t.Fatalf("Reuse returned error: %v", err)
	}
	// No shared unit ⇒ reuse NOTHING ⇒ effort unchanged (the anti-false-positive frontier).
	if plan.EffortAfter != plan.EffortBefore {
		t.Fatalf("a dissimilar goal must reuse nothing: after=%d before=%d", plan.EffortAfter, plan.EffortBefore)
	}
	if plan.ReusedProcedural != 0 || plan.ReusedBehavior != 0 {
		t.Fatalf("a dissimilar goal must reuse 0/0, got procedural=%d behavior=%d", plan.ReusedProcedural, plan.ReusedBehavior)
	}
	if plan.DerivedFresh != 3 {
		t.Fatalf("a dissimilar goal derives every unit fresh, got %d", plan.DerivedFresh)
	}
}

func TestReuse_BehaviorReuseStillGoesViaWall(t *testing.T) {
	plan, err := compound.Reuse(corpusFixture(), similarNextGoal())
	if err != nil {
		t.Fatalf("Reuse returned error: %v", err)
	}
	// Every behavior-expand route is marked ViaWall — reusing a captured behavior recalls its
	// shape, but freezing it into the kernel STILL goes idée → miroir → /goal (CE04 expansion is
	// a dry-run). A procedural recall is below the line (no wall door needed).
	for _, r := range plan.Routes {
		if r.Origin == compound.OriginReusedBehavior && !r.ViaWall {
			t.Fatalf("behavior reuse %q must be ViaWall (freeze still via /goal)", r.Name)
		}
		if r.Origin == compound.OriginReusedProcedural && r.ViaWall {
			t.Fatalf("procedural recall %q is below the line — not a wall door", r.Name)
		}
	}
}

func TestReuse_EmptyCorpus_AllFresh(t *testing.T) {
	plan, err := compound.Reuse(compound.Corpus{}, similarNextGoal())
	if err != nil {
		t.Fatalf("Reuse returned error: %v", err)
	}
	if plan.ReusedProcedural != 0 || plan.ReusedBehavior != 0 {
		t.Fatal("an empty corpus reuses nothing")
	}
	if plan.EffortAfter != plan.EffortBefore {
		t.Fatal("an empty corpus leaves effort unchanged")
	}
}

func TestReuse_EmptyGoal_TypedError(t *testing.T) {
	if _, err := compound.Reuse(corpusFixture(), compound.NextGoal{}); err == nil {
		t.Fatal("a next goal with no id/units must be rejected (typed error, no guessed plan)")
	}
}
