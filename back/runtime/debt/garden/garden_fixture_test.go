package garden_test

// S112 BDD MIRROR — FIXTURE (N2: state → command → events), conceptually stored in
// the `mirrors` schema (reflects: runtime/debt/garden.Tend + .SuggestGardenTrim,
// test_kind: fixture, cert_language: operation-dsl/go, authority: below — the garden
// is a read-only diagnostic). These ARE the S112 done-criteria (§82.4, « jardinage du
// KernelDebt + /trim par projet ») :
//
//   - the garden surfaces the FIVE rots — orphan mirror, stale fixture, surviving
//     mutant (CONSUMED from S41), PLUS the two S112 adds: DEAD LIVENESS (a mirror
//     declared dead that still pins a live truth — a dead proof) and a LOW-VALUE
//     CONSTRAINT (a cell over its HarnessCostBudget without a justified ValueCase —
//     CONSUMED from S51 economics.Evaluate);
//   - the garden is SCOPED BY PROJECT (§82.4) — a scan of project A never surfaces
//     project B's debt;
//   - /trim PROPOSES reductions and DELETES NOTHING — accepting a proposal OPENS an
//     idea → mirror → /goal → human approval (the only door, never a direct removal);
//   - a clean project yields an empty garden and an empty plan (no false positive);
//   - the input snapshot is READ-ONLY throughout — nothing mutated or deleted.

import (
	"bytes"
	"encoding/json"
	"testing"

	mrec "github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"github.com/steph-frtech/aidos/back/runtime/debt"
	"github.com/steph-frtech/aidos/back/runtime/debt/garden"
	"github.com/steph-frtech/aidos/back/runtime/economics"
)

const fixedNow int64 = 1_700_000_000

// projectSnap builds a minimal, single-project garden snapshot for the fixtures.
func projectSnap(project string) garden.ProjectSnapshot {
	return garden.ProjectSnapshot{
		ProjectRef: project,
		Snapshot: debt.Snapshot{
			KernelHead: "head-1",
			Truths:     []debt.TruthRow{{ID: "truth-1", Version: "v1", Live: true}},
			Mirrors:    []debt.MirrorRow{},
			Mutation:   []debt.MutationRow{},
		},
		Budgets: []garden.CellBudget{},
	}
}

// fixture: a DEAD-LIVENESS mirror (declared dead, still pins a LIVE truth) is surfaced
// as garden debt — a dead proof. This is one of the two S112 adds (THE done crit).
func TestFixture_DeadLivenessSurfaced_NothingDeleted(t *testing.T) {
	snap := projectSnap("proj-A")
	snap.Snapshot.Mirrors = []debt.MirrorRow{
		// reflects a live truth (truth-1@v1) but its liveness is DEAD → never-runs
		// proof, a dead mirror sitting on live truth.
		{ID: "mir-dead", Reflects: mrec.LayerRef{LayerID: "truth-1", Version: "v1"}, TestKind: "property", Liveness: mrec.LivenessDead},
	}
	before := deepCopy(t, snap)

	g := garden.Tend(snap, fixedNow)

	item := findByTarget(g.Items, "mir-dead")
	if item == nil {
		t.Fatalf("expected a dead_liveness DebtItem for mir-dead, got %+v", g.Items)
	}
	if item.Kind != garden.KindDeadLiveness {
		t.Fatalf("expected kind dead_liveness, got %q", item.Kind)
	}
	if item.ProjectRef != "proj-A" {
		t.Fatalf("debt item must carry its project ref (project-scoped, §82.4), got %q", item.ProjectRef)
	}
	if !contains(item.Reason, "morte") {
		t.Fatalf("reason should name the dead (morte) liveness, got %q", item.Reason)
	}
	if !bytes.Equal(before, deepCopy(t, snap)) {
		t.Fatalf("Tend mutated the input snapshot — the wall: it must be read-only")
	}
}

// fixture: a LOW-VALUE CONSTRAINT (a cell over its HarnessCostBudget without a
// justified ValueCase — CONSUMED from S51 economics.Evaluate) is surfaced as garden
// debt. The second S112 add (THE done crit).
func TestFixture_LowValueConstraintSurfaced(t *testing.T) {
	snap := projectSnap("proj-A")
	snap.Budgets = []garden.CellBudget{
		{
			Budget: economics.HarnessCostBudget{
				CellRef:               "cell-costly",
				MaxCIMinutes:          10,
				MaxLLMTokensPerGoal:   1000,
				ExpectedRiskReduction: economics.RiskLow,
			},
			// metered cost OVER the llm_tokens cap, and NO justified ValueCase →
			// over_budget_flagged → a low-value constraint.
			Cost:      economics.MeasuredCost{LLMTokens: 5000, CIMinutes: 2},
			ValueCase: nil,
		},
	}

	g := garden.Tend(snap, fixedNow)

	item := findByTarget(g.Items, "cell-costly")
	if item == nil || item.Kind != garden.KindLowValueConstraint {
		t.Fatalf("expected a low_value_constraint DebtItem for cell-costly, got %+v", g.Items)
	}
	if item.ProjectRef != "proj-A" {
		t.Fatalf("low-value constraint must carry its project ref, got %q", item.ProjectRef)
	}
	if !contains(item.Reason, "llm_tokens") {
		t.Fatalf("reason should name the over-budget axis (llm_tokens), got %q", item.Reason)
	}
}

// fixture: a JUSTIFIED costly constraint is NOT debt — it earned its keep (the §66.3
// rule the garden CONSUMES, never re-derives).
func TestFixture_JustifiedConstraintIsNotDebt(t *testing.T) {
	snap := projectSnap("proj-A")
	snap.Budgets = []garden.CellBudget{
		{
			Budget: economics.HarnessCostBudget{
				CellRef:               "cell-worth-it",
				MaxLLMTokensPerGoal:   1000,
				ExpectedRiskReduction: economics.RiskHigh,
			},
			Cost: economics.MeasuredCost{LLMTokens: 5000},
			ValueCase: &economics.ValueCase{
				Truth:        "cell-worth-it",
				RiskIfBroken: economics.RiskCritical,
				Decision:     economics.DecisionJustified,
			},
		},
	}

	g := garden.Tend(snap, fixedNow)

	if findByTarget(g.Items, "cell-worth-it") != nil {
		t.Fatalf("a justified costly constraint earned its keep — must NOT be garden debt, got %+v", g.Items)
	}
}

// fixture: the garden is SCOPED BY PROJECT (§82.4) — project A's scan never surfaces
// project B's debt (THE done crit: /trim par projet).
func TestFixture_ProjectScoped_NoCrossProjectLeak(t *testing.T) {
	a := projectSnap("proj-A")
	a.Snapshot.Mirrors = []debt.MirrorRow{
		{ID: "mir-A-dead", Reflects: mrec.LayerRef{LayerID: "truth-1", Version: "v1"}, TestKind: "property", Liveness: mrec.LivenessDead},
	}
	b := projectSnap("proj-B")
	b.Snapshot.Mirrors = []debt.MirrorRow{
		{ID: "mir-B-dead", Reflects: mrec.LayerRef{LayerID: "truth-1", Version: "v1"}, TestKind: "property", Liveness: mrec.LivenessDead},
	}

	gA := garden.Tend(a, fixedNow)
	if findByTarget(gA.Items, "mir-B-dead") != nil {
		t.Fatalf("project A's garden leaked project B's debt — scans must be project-scoped (§82.4)")
	}
	for _, it := range gA.Items {
		if it.ProjectRef != "proj-A" {
			t.Fatalf("project A's garden carries a non-A item %+v", it)
		}
	}
	if findByTarget(gA.Items, "mir-A-dead") == nil {
		t.Fatalf("project A's garden must still surface project A's own debt")
	}
}

// fixture: /trim is SUGGESTED, never executed — deletes nothing; accepting a proposal
// opens idea → mirror → /goal (THE done criterion of S112).
func TestFixture_TrimSuggestedNeverExecuted_OpensIdea(t *testing.T) {
	snap := projectSnap("proj-A")
	snap.Snapshot.Mirrors = []debt.MirrorRow{
		{ID: "mir-dead", Reflects: mrec.LayerRef{LayerID: "truth-1", Version: "v1"}, TestKind: "property", Liveness: mrec.LivenessDead},
	}
	snap.Budgets = []garden.CellBudget{
		{
			Budget:    economics.HarnessCostBudget{CellRef: "cell-costly", MaxLLMTokensPerGoal: 1000, ExpectedRiskReduction: economics.RiskLow},
			Cost:      economics.MeasuredCost{LLMTokens: 5000},
			ValueCase: nil,
		},
	}
	before := deepCopy(t, snap)

	g := garden.Tend(snap, fixedNow)
	plan := garden.SuggestGardenTrim(g)

	if len(plan.Suggestions) != len(g.Items) {
		t.Fatalf("every garden item gets exactly one suggestion, got %d for %d items", len(plan.Suggestions), len(g.Items))
	}
	for _, s := range plan.Suggestions {
		if !garden.IsGardenAction(s.ProposedAction) {
			t.Fatalf("suggestion proposed a non-open_idea action %q — /trim must only OPEN ideas", s.ProposedAction)
		}
		if s.Requires != garden.TheDoor {
			t.Fatalf("every suggestion REQUIRES the door %q, got %q", garden.TheDoor, s.Requires)
		}
		if s.ProjectRef == "" {
			t.Fatalf("a project-scoped suggestion must carry its project ref")
		}
	}
	// the door is the only path; accepting a proposal opens an idea (the OpenIdea
	// projection of a suggestion).
	for _, s := range plan.Suggestions {
		oi := garden.AcceptProposal(s)
		if !oi.OpensIdea {
			t.Fatalf("accepting a trim proposal MUST open an idea (never delete), got %+v", oi)
		}
		if oi.Door != garden.TheDoor {
			t.Fatalf("accepting a proposal routes through the door, got %q", oi.Door)
		}
		if oi.Deletes {
			t.Fatalf("accepting a proposal must NEVER delete — /trim suggests only")
		}
	}
	// read-only: the input snapshot is unchanged after scan + suggest + accept.
	if !bytes.Equal(before, deepCopy(t, snap)) {
		t.Fatalf("the garden mutated the input snapshot — it must be read-only (the wall)")
	}
}

// fixture: a clean project yields an empty garden and an empty plan (no false positive).
func TestFixture_CleanProjectEmptyGarden(t *testing.T) {
	snap := projectSnap("proj-A")
	g := garden.Tend(snap, fixedNow)
	if len(g.Items) != 0 {
		t.Fatalf("a clean project yields empty debt, got %+v", g.Items)
	}
	plan := garden.SuggestGardenTrim(g)
	if len(plan.Suggestions) != 0 {
		t.Fatalf("an empty garden yields an empty plan, got %+v", plan.Suggestions)
	}
}

// --- helpers ---

func findByTarget(items []garden.GardenItem, target string) *garden.GardenItem {
	for i := range items {
		if items[i].TargetRef == target {
			return &items[i]
		}
	}
	return nil
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && indexOf(s, sub) >= 0
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

// deepCopy snapshots the input by JSON round-trip so the equality compares VALUES, not
// slice nil-vs-empty identities — the read-only assertion is about content, not the
// distinction between a nil and an empty slice (both serialize identically).
func deepCopy(t *testing.T, s garden.ProjectSnapshot) []byte {
	t.Helper()
	b, err := json.Marshal(s)
	if err != nil {
		t.Fatalf("deepCopy marshal: %v", err)
	}
	return b
}
