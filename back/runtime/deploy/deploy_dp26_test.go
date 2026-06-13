package deploy_test

// DP26 — THE COMPLETE DEPLOY ORDER mirror (fixture + property). EPIC F, extends S96.
// reflects=runtime.deploy · test_kind=fixture+property · liveness=live.
//
// DP26 cables the FULL deploy ORDER onto the S96 deploy plan: the deploy RE-EMITS the stack
// from the phase (DP05 EmitStack), then orders the deterministic sequence
//
//	network → volumes → datastore-provision (DP15) → migration (S95, forward-only,
//	DataTruthScope-gated) → bootstrap (DP12, ordered) → healthcheck → URL
//
// THE WALL inherited, NEVER a new gate (DP26): a NON-STABLE phase is refused PHASE_NOT_STABLE
// via the EXISTING IsDeployable Stop-gate (no separate deploy-approval gate); a breaking
// migration with no backfill is refused via the EXISTING S95 DataTruthScope gate; a
// re-projected artifact equals the phase (hash artefact = hash phase, DeployedMatchesPhase).
//
// ADDITIVE (CLAUDE.md §9): the DP26 order section is OPT-IN — an Input with no Manifest is
// exactly the S96 plan (no Order), every S96 test stays byte-identical green. Supplying a
// Manifest+Env opts into the DP15 datastore provision + DP12 bootstrap ordering, NEVER
// altering the EmittedAppHash/URL/StackName (they never read the manifest).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/datamigrate"
	"github.com/steph-frtech/aidos/back/runtime/deploy"
	"pgregory.net/rapid"
)

// --- a DP02 manifest pinned in the deploy phase, so EmitStack can re-emit it. ---

func dp26Manifest() stackmanifest.StackManifest {
	return stackmanifest.StackManifest{
		AppName: "shop",
		Services: []stackmanifest.Service{
			{Name: "web", Role: stackmanifest.RoleServer, Image: "shop:latest", InternalPort: 3000, Profile: stackmanifest.ProfileCore, Healthcheck: "curl -f localhost:3000/health"},
			{Name: "edge", Role: stackmanifest.RoleObservability, Image: "traefik:v3", InternalPort: 8080, Profile: stackmanifest.ProfileCore, Healthcheck: "wget -q localhost:8080/ping"},
		},
		Network: stackmanifest.Network{Name: "traefik_default", External: true},
	}
}

// dp26Phase is a stable phase that PINS the DP26 manifest (EmitStack re-emits exactly what the
// phase pinned). The manifest's content address is the cut's pinned version.
func dp26Phase(t interface{ Fatalf(string, ...any) }) phases.StablePhase {
	h, err := stackmanifest.HashManifest(dp26Manifest())
	if err != nil {
		t.Fatalf("hash manifest: %v", err)
	}
	return phases.IsStable(
		phases.Cut{stackmanifest.KindStackManifest + "/shop": h},
		nil, nil,
		[]phases.SensorStatus{{ID: "shop.stack.fixture", Pass: true}},
	)
}

// dp26Input is a deployable Input WITH the DP26 order section (manifest + env + secret store).
func dp26Input(t interface{ Fatalf(string, ...any) }) deploy.Input {
	in := okInput()
	in.Phase = dp26Phase(t)
	in.Manifest = dp26Manifest()
	in.Env = scope.EnvProd
	// No connector scope ⇒ no required secret ⇒ the bootstrap secrets-check passes.
	return in
}

// --- (4) THE ORDER is deterministic: network → volumes → datastore → migration → bootstrap →
// healthcheck → URL — a pure sequence derived from the phase. ---
func TestDeployOrderIsDeterministic(t *testing.T) {
	plan, br := deploy.BuildPlan(dp26Input(t))
	if br != nil {
		t.Fatalf("a stable phase with a pinned manifest must deploy: %s", br.Explanation)
	}
	if plan.Order == nil {
		t.Fatal("DP26: a deploy with a manifest must carry the complete deploy order")
	}
	wantStages := []deploy.DeployStageKind{
		deploy.StageNetwork,
		deploy.StageVolumes,
		deploy.StageDatastoreProvision,
		deploy.StageMigration,
		deploy.StageBootstrap,
		deploy.StageHealthcheck,
		deploy.StageURL,
	}
	if len(plan.Order.Stages) != len(wantStages) {
		t.Fatalf("DP26 order has %d stages, want %d: %+v", len(plan.Order.Stages), len(wantStages), plan.Order.Stages)
	}
	for i, want := range wantStages {
		got := plan.Order.Stages[i]
		if got.Kind != want {
			t.Fatalf("DP26 order stage %d = %q, want %q (network→volumes→datastore→migration→bootstrap→healthcheck→URL)", i, got.Kind, want)
		}
		if got.Seq != i+1 {
			t.Fatalf("DP26 order stage %d has Seq %d, want %d", i, got.Seq, i+1)
		}
	}
	// The migration stage in the order is the SAME forward-only S95 plan as the deploy's.
	if !deploy.MigrationIsForwardOnly(plan.Migration) {
		t.Fatalf("DP26 ordered migration is not forward-only: %+v", plan.Migration.Steps)
	}
}

// --- (1) a NON-STABLE phase is refused PHASE_NOT_STABLE — DP26 reuses the EXISTING Stop-gate,
// NEVER a new deploy-approval gate (even with the order section). ---
func TestDeployOrderInheritsStopGate(t *testing.T) {
	in := dp26Input(t)
	in.Phase = redPhase() // a red cut ⇒ non-stable
	plan, br := deploy.BuildPlan(in)
	if br == nil {
		t.Fatalf("a non-stable phase must be refused even with the DP26 order section, got plan %+v", plan)
	}
	if br.Code != blockreason.CodePhaseNotStable {
		t.Fatalf("DP26 must inherit the Stop-gate (PHASE_NOT_STABLE), got %s", br.Code)
	}
	if plan.ID != "" || plan.Order != nil {
		t.Fatal("a refused deploy must emit no plan and no order")
	}
}

// --- (2) the migration in the order runs FORWARD-ONLY; a destructive migration with no
// backfill is human-gated via the EXISTING DataTruthScope gate (S95), never a new gate. ---
func TestDeployOrderMigrationForwardOnlyAndGated(t *testing.T) {
	// Forward-only: the ordered migration is expand → backfill → contract.
	plan, br := deploy.BuildPlan(dp26Input(t))
	if br != nil {
		t.Fatalf("unexpected block: %s", br.Explanation)
	}
	want := []string{"expand", "backfill", "contract"}
	var got []string
	for _, s := range plan.Migration.Steps {
		got = append(got, s.Stage)
	}
	if len(got) != len(want) {
		t.Fatalf("ordered migration is not forward-only expand→backfill→contract: %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("ordered migration stage %d = %q, want %q", i, got[i], want[i])
		}
	}

	// Destructive (no backfill) is gated by the EXISTING DataTruthScope gate (DELEGATED to S95).
	in := dp26Input(t)
	c := renameChange()
	c.Scope = nil // breaking change, no declared backfill
	in.Change = c
	_, dbr := deploy.BuildPlan(in)
	if dbr == nil || dbr.Code != blockreason.CodeBreakingMigrationNoBackfill {
		t.Fatalf("a breaking migration with no backfill must be refused via the S95 DataTruthScope gate, got %+v", dbr)
	}
}

// --- (3) PROPERTY — the deployed artifact is RE-PROJECTED from the phase, never stale: the
// order's datastore/migration/bootstrap NEVER touch the EmittedAppHash (hash artefact = hash
// phase, ∀). ---
func TestDeployOrderNeverAltersAppHash(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// The SAME phase/surface, with vs without the order section, yields the SAME EmittedAppHash.
		base := okInput()
		base.Phase = dp26Phase(t)
		withOrder := base
		withOrder.Manifest = dp26Manifest()
		withOrder.Env = scope.EnvProd

		bp, bbr := deploy.BuildPlan(base)
		op, obr := deploy.BuildPlan(withOrder)
		if bbr != nil || obr != nil {
			t.Fatalf("both must deploy: %v / %v", bbr, obr)
		}
		if bp.EmittedAppHash != op.EmittedAppHash {
			t.Fatalf("DP26 order altered the EmittedAppHash: %q (S96) vs %q (DP26)", bp.EmittedAppHash, op.EmittedAppHash)
		}
		// The re-projection property holds: the order plan's app hash IS the phase's app hash.
		if ok, blk := deploy.DeployedMatchesPhase(op, op.EmittedAppHash); !ok {
			t.Fatalf("the phase's own app hash must match the order plan: %v", blk)
		}
		if ok, blk := deploy.DeployedMatchesPhase(op, op.EmittedAppHash+"x"); ok || blk == nil {
			t.Fatal("a stale served hash must be refused even with the order section")
		}
	})
}

// --- (4 cont.) reproducibility — same phase ⇒ byte-identical DeployPlan (order included). ---
func TestDeployOrderReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Optionally carry no schema change (the migration stage then has empty steps but the
		// stage stays in the canonical order — the order is phase-derived, not change-derived).
		in := dp26Input(t)
		if rapid.Bool().Draw(t, "noChange") {
			in.Change = datamigrate.Change{}
		}
		a, abr := deploy.BuildPlan(in)
		b, bbr := deploy.BuildPlan(in)
		if abr != nil || bbr != nil {
			t.Fatalf("a stable input with the order section must deploy: %v / %v", abr, bbr)
		}
		if a.ID != b.ID {
			t.Fatalf("DP26 deploy plan not reproducible: %q vs %q", a.ID, b.ID)
		}
		if a.Order.Hash != b.Order.Hash {
			t.Fatalf("DP26 order not reproducible: %q vs %q", a.Order.Hash, b.Order.Hash)
		}
		// The order is byte-identical stage-for-stage.
		if len(a.Order.Stages) != len(b.Order.Stages) {
			t.Fatal("DP26 order length differs between runs")
		}
		for i := range a.Order.Stages {
			if a.Order.Stages[i].Kind != b.Order.Stages[i].Kind || a.Order.Stages[i].Detail != b.Order.Stages[i].Detail {
				t.Fatalf("DP26 order stage %d differs between runs", i)
			}
		}
	})
}

// --- the order CANONICAL sequence is the declared closed set, in the declared order. ---
func TestDeployOrderKindsAreClosedAndOrdered(t *testing.T) {
	kinds := deploy.OrderedDeployStages()
	want := []deploy.DeployStageKind{
		deploy.StageNetwork,
		deploy.StageVolumes,
		deploy.StageDatastoreProvision,
		deploy.StageMigration,
		deploy.StageBootstrap,
		deploy.StageHealthcheck,
		deploy.StageURL,
	}
	if len(kinds) != len(want) {
		t.Fatalf("OrderedDeployStages has %d kinds, want %d", len(kinds), len(want))
	}
	for i := range want {
		if kinds[i] != want[i] {
			t.Fatalf("OrderedDeployStages[%d] = %q, want %q", i, kinds[i], want[i])
		}
	}
}

// --- DP26 is ADDITIVE: an Input with no Manifest is exactly the S96 plan (no Order). ---
func TestDeployOrderIsOptIn(t *testing.T) {
	in := okInput() // the S96 shape — no manifest, no env
	plan, br := deploy.BuildPlan(in)
	if br != nil {
		t.Fatalf("the S96 shape must still deploy: %s", br.Explanation)
	}
	if plan.Order != nil {
		t.Fatal("DP26: an Input with no manifest must carry NO order (the S96 plan is preserved)")
	}
}

// --- a datastore-provision in prod omits doltgres (the DP06 gate delegated via DP15). The
// datastore stage details name the provisioned services in canonical order. ---
func TestDeployOrderDatastoreStageNamesServices(t *testing.T) {
	plan, br := deploy.BuildPlan(dp26Input(t))
	if br != nil {
		t.Fatalf("unexpected block: %s", br.Explanation)
	}
	var datastore *deploy.DeployStage
	for i := range plan.Order.Stages {
		if plan.Order.Stages[i].Kind == deploy.StageDatastoreProvision {
			datastore = &plan.Order.Stages[i]
		}
	}
	if datastore == nil {
		t.Fatal("DP26: the order must carry the datastore-provision stage")
	}
	// In prod, doltgres is omitted (DP06 gate, delegated to DP15) — postgres/valkey/pgbouncer
	// remain, named in deterministic SORTED order.
	if want := "pgbouncer, postgres, valkey"; datastore.Detail != want {
		t.Fatalf("DP26 datastore stage detail = %q, want %q (prod core fragments, doltgres omitted)", datastore.Detail, want)
	}
}
