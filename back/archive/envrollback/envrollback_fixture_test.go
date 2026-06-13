package envrollback_test

// S98 — ENVIRONMENTS + ROLLBACK-TO-PHASE WORKFLOW mirror (fixture, state → command → events). N2.
// reflects=archive.envrollback · test_kind=fixture · liveness=live.
//
// The fixture pins the env/rollback workflows: PROMOTE a stable phase into prod, then ROLLBACK to
// an earlier stable phase — the env serves the RE-EMITTED app of N-1 (a fresh re-projection, never
// a stale sandbox artifact), the decision is provenanced (actor/reason), nothing deleted. And the
// REFUSAL workflows: promoting a NON-STABLE phase (ENV_PROMOTE_NOT_STABLE), rolling back to the
// SAME phase / to a NON-ANCESTOR / to a RED target (ROLLBACK_NOT_EARLIER or ENV_PROMOTE_NOT_STABLE).
// The events are the Promotion / RollbackDecision (app hash, stack, reconciliation, provenance) — a
// deterministic function of the input state.

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/envrollback"
	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/datamigrate"
	"github.com/steph-frtech/aidos/back/runtime/deploy"
	"github.com/steph-frtech/aidos/back/runtime/preview"
)

// --- builders. ---

// stablePhaseN builds a STABLE phase whose cut pins constraint id `id` at version `v` (distinct
// (id,v) ⇒ distinct phase hash), every sensor green ⇒ stable (no reasons).
func stablePhaseN(id, v string) envrollback.PhaseInput {
	return envrollback.PhaseInput{
		Phase: phases.IsStable(
			phases.Cut{id: v}, nil, nil,
			[]phases.SensorStatus{{ID: id + ".fixture", Pass: true}},
		),
		Gate:    deploy.Gate{MutationScore: 0.9, MutationThreshold: 0.8, MonsterCount: 0},
		Surface: surfaceFor("shop", v),
	}
}

// redPhaseN builds a NON-STABLE phase (a red sensor ⇒ unstable, named in Reasons).
func redPhaseN(id, v string) envrollback.PhaseInput {
	p := stablePhaseN(id, v)
	p.Phase = phases.IsStable(
		phases.Cut{id: v}, nil, nil,
		[]phases.SensorStatus{{ID: id + ".fixture", Pass: false}},
	)
	return p
}

// surfaceFor builds a complete emitted surface keyed by a version tag, so two phases re-emit to
// DIFFERENT app hashes (the rollback actually swaps the served artifact).
func surfaceFor(project, tag string) preview.EmittedSurface {
	return preview.EmittedSurface{
		Project:          project,
		ServerBundleHash: "srv-" + tag,
		FrontBundleHash:  "fnt-" + tag,
		InfraHash:        "inf-" + tag,
		DatastoreHash:    "dat-" + tag,
	}
}

// validScope is a DataTruthScope that declares a backfill (expand-contract) — required for a
// breaking reconciliation migration to be admitted (else BREAKING_MIGRATION_NO_BACKFILL).
func validScope() *db.DataTruthScope {
	return &db.DataTruthScope{
		AppliesTo: []db.AppliesTo{db.AppliesExistingRecords},
		Migration: db.Migration{Required: true, Strategy: db.StrategyExpandContract},
		Audit:     db.Audit{PreserveOldTruth: true},
	}
}

// renameReconcile is a valid inverse data reconciliation (expand→backfill→contract).
func renameReconcile() datamigrate.Change {
	return datamigrate.Change{
		Project: "shop", Kind: datamigrate.KindRename,
		Rename: &datamigrate.RenameChange{Entity: "order", From: "reference", To: "ref", Type: "text"},
		Scope:  validScope(),
	}
}

func phaseHashOf(t *testing.T, p envrollback.PhaseInput) string {
	t.Helper()
	h, err := p.Phase.Version()
	if err != nil {
		t.Fatalf("phase hash: %v", err)
	}
	return h
}

// --- the fixture table. ---

func TestPromoteFixtures(t *testing.T) {
	stable := stablePhaseN("createOrder", "v2")
	// DP28 — the dev/preview → staging hop is now GATED by a human validation of the EXACT phase.
	// A stable phase still promotes to staging, now WITH the human gate satisfied (the behaviour is
	// preserved under the new law; the prod/preview hops are not gated).
	stableHash := phaseHashOf(t, stable)
	stableDevValidation := envrollback.RecordHumanValidation(envrollback.HumanValidationInput{
		Env: envrollback.EnvPreview, PhaseHash: stableHash, Validated: true, By: "alice",
	})
	cases := []struct {
		name     string
		in       envrollback.PromoteInput
		wantOK   bool
		wantCode blockreason.Code
	}{
		{
			name:   "stable phase promotes to prod",
			in:     envrollback.PromoteInput{Env: envrollback.EnvProd, Project: "shop", Phase: stable},
			wantOK: true,
		},
		{
			name:   "stable phase promotes to staging (DP28: with the dev human validation)",
			in:     envrollback.PromoteInput{Env: envrollback.EnvStaging, Project: "shop", Phase: stable, DevValidation: &stableDevValidation},
			wantOK: true,
		},
		{
			name:     "non-stable phase refused ENV_PROMOTE_NOT_STABLE",
			in:       envrollback.PromoteInput{Env: envrollback.EnvProd, Project: "shop", Phase: redPhaseN("createOrder", "v2")},
			wantOK:   false,
			wantCode: blockreason.CodeEnvPromoteNotStable,
		},
		{
			name:     "unknown env refused OUT_OF_SCOPE",
			in:       envrollback.PromoteInput{Env: envrollback.Environment("qa"), Project: "shop", Phase: stable},
			wantOK:   false,
			wantCode: blockreason.CodeOutOfScope,
		},
		{
			name:     "no project refused OUT_OF_SCOPE",
			in:       envrollback.PromoteInput{Env: envrollback.EnvProd, Project: "", Phase: stable},
			wantOK:   false,
			wantCode: blockreason.CodeOutOfScope,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			prom, br := envrollback.Promote(c.in)
			if c.wantOK {
				if br != nil {
					t.Fatalf("promote refused: %v", br.Explanation)
				}
				if prom.ID == "" || prom.EmittedAppHash == "" {
					t.Fatalf("promotion incomplete: %+v", prom)
				}
				if !strings.HasPrefix(prom.StackName, string(c.in.Env)+"-shop-d-") {
					t.Fatalf("stack %q not per-env", prom.StackName)
				}
				return
			}
			if br == nil {
				t.Fatalf("expected refusal %s, got plan %+v", c.wantCode, prom)
			}
			if br.Code != c.wantCode {
				t.Fatalf("refusal code = %q, want %q", br.Code, c.wantCode)
			}
		})
	}
}

func TestRollbackFixtures(t *testing.T) {
	// N-1 (target, earlier, stable), N (served, incidented). The served phase need NOT be stable.
	prev := stablePhaseN("createOrder", "v1")
	curr := stablePhaseN("createOrder", "v2")
	prevHash := phaseHashOf(t, prev)
	currHash := phaseHashOf(t, curr)
	// curr's DAG lineage includes prev (prev precedes curr).
	lineage := []string{prevHash}

	base := envrollback.RollbackInput{
		Env: envrollback.EnvProd, Project: "shop",
		Current: curr, Target: prev, Lineage: lineage,
		Reconcile: renameReconcile(),
		Actor:     "alice", Reason: "incident in prod",
	}

	cases := []struct {
		name     string
		mutate   func(envrollback.RollbackInput) envrollback.RollbackInput
		wantOK   bool
		wantCode blockreason.Code
	}{
		{
			name:   "rollback to earlier stable phase succeeds",
			mutate: func(in envrollback.RollbackInput) envrollback.RollbackInput { return in },
			wantOK: true,
		},
		{
			name: "rollback to same phase refused ROLLBACK_NOT_EARLIER",
			mutate: func(in envrollback.RollbackInput) envrollback.RollbackInput {
				in.Target = curr // same as Current
				in.Lineage = []string{currHash}
				return in
			},
			wantOK:   false,
			wantCode: blockreason.CodeRollbackNotEarlier,
		},
		{
			name: "rollback to non-ancestor refused ROLLBACK_NOT_EARLIER",
			mutate: func(in envrollback.RollbackInput) envrollback.RollbackInput {
				in.Lineage = nil // target not in lineage
				return in
			},
			wantOK:   false,
			wantCode: blockreason.CodeRollbackNotEarlier,
		},
		{
			name: "rollback to red target refused ENV_PROMOTE_NOT_STABLE",
			mutate: func(in envrollback.RollbackInput) envrollback.RollbackInput {
				red := redPhaseN("createOrder", "v1")
				in.Target = red
				h, _ := red.Phase.Version()
				in.Lineage = []string{h}
				return in
			},
			wantOK:   false,
			wantCode: blockreason.CodeEnvPromoteNotStable,
		},
		{
			name: "no schema change ⇒ empty reconciliation",
			mutate: func(in envrollback.RollbackInput) envrollback.RollbackInput {
				in.Reconcile = datamigrate.Change{}
				return in
			},
			wantOK: true,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			in := c.mutate(base)
			dec, br := envrollback.Rollback(in)
			if c.wantOK {
				if br != nil {
					t.Fatalf("rollback refused: %v", br.Explanation)
				}
				if dec.ID == "" {
					t.Fatalf("decision has no id")
				}
				if dec.ToPhaseHash != prevHash || dec.FromPhaseHash != currHash {
					t.Fatalf("decision phases wrong: from=%q to=%q", dec.FromPhaseHash, dec.ToPhaseHash)
				}
				// The decision provenances the rollback (§9 — who/why).
				if dec.Provenance.Actor != "alice" || dec.Provenance.Reason != "incident in prod" {
					t.Fatalf("provenance not recorded: %+v", dec.Provenance)
				}
				// The re-projection property: the served app = a fresh re-emit of N-1, never stale.
				ok, pbr := envrollback.RollbackProducesReProjection(dec, in.Target, dec.ReProjectedAppHash)
				if !ok {
					t.Fatalf("re-projection property failed: %v", pbr)
				}
				return
			}
			if br == nil {
				t.Fatalf("expected refusal %s, got decision %+v", c.wantCode, dec)
			}
			if br.Code != c.wantCode {
				t.Fatalf("refusal code = %q, want %q", br.Code, c.wantCode)
			}
		})
	}
}

// TestPromoteToStagingHumanGateFixtures is the DP28 PORTE DE VALIDATION HUMAINE in fixture form
// (state → command → events): the human SEES the live dev deployment (DP25) then validates|refuses
// it; the promotion preview/dev → staging is GATED by a validation_humaine validated=true of the
// EXACT phase. NO validation, a validation of ANOTHER phase, or validated=false ⇒ fail-closed
// DEV_NOT_HUMAN_VALIDATED. The validation is a HITL-runtime decision (qui/quand/quelle phase),
// NEVER authority.Decide.
func TestPromoteToStagingHumanGateFixtures(t *testing.T) {
	target := stablePhaseN("createOrder", "v2")
	targetHash := phaseHashOf(t, target)
	other := stablePhaseN("createOrder", "v7")
	otherHash := phaseHashOf(t, other)

	validation := func(phaseHash string, validated bool) *envrollback.HumanValidation {
		v := envrollback.RecordHumanValidation(envrollback.HumanValidationInput{
			Env: envrollback.EnvPreview, PhaseHash: phaseHash, Validated: validated, By: "alice",
		})
		return &v
	}

	cases := []struct {
		name     string
		dev      *envrollback.HumanValidation
		wantOK   bool
		wantCode blockreason.Code
	}{
		{
			name:     "no validation ⇒ DEV_NOT_HUMAN_VALIDATED (fail-closed)",
			dev:      nil,
			wantOK:   false,
			wantCode: blockreason.CodeDevNotHumanValidated,
		},
		{
			name:   "validation of the EXACT phase validated=true ⇒ permitted",
			dev:    validation(targetHash, true),
			wantOK: true,
		},
		{
			name:     "validation of ANOTHER phase ⇒ DEV_NOT_HUMAN_VALIDATED (per-phase)",
			dev:      validation(otherHash, true),
			wantOK:   false,
			wantCode: blockreason.CodeDevNotHumanValidated,
		},
		{
			name:     "validation of the exact phase validated=false ⇒ DEV_NOT_HUMAN_VALIDATED (fail-closed)",
			dev:      validation(targetHash, false),
			wantOK:   false,
			wantCode: blockreason.CodeDevNotHumanValidated,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			prom, br := envrollback.Promote(envrollback.PromoteInput{
				Env: envrollback.EnvStaging, Project: "shop", Phase: target, DevValidation: c.dev,
			})
			if c.wantOK {
				if br != nil {
					t.Fatalf("staging promotion refused: %v", br.Explanation)
				}
				if prom.ID == "" || prom.Env != envrollback.EnvStaging {
					t.Fatalf("staging promotion incomplete: %+v", prom)
				}
				return
			}
			if br == nil {
				t.Fatalf("expected refusal %s, got plan %+v", c.wantCode, prom)
			}
			if br.Code != c.wantCode {
				t.Fatalf("refusal code = %q, want %q", br.Code, c.wantCode)
			}
		})
	}
}

// TestPromoteToProdAndPreviewNotGatedByDevValidation — the human-validation gate is the dev→staging
// hop ONLY. A promotion to prod or to preview (the dev deployment itself) is NOT gated by it (a
// prod promotion is gated upstream by the staging→prod flow; the preview IS the dev the human sees).
func TestPromoteToProdAndPreviewNotGatedByDevValidation(t *testing.T) {
	ph := stablePhaseN("createOrder", "v2")
	for _, env := range []envrollback.Environment{envrollback.EnvPreview, envrollback.EnvProd} {
		prom, br := envrollback.Promote(envrollback.PromoteInput{
			Env: env, Project: "shop", Phase: ph,
		})
		if br != nil {
			t.Fatalf("promotion to %q refused (must not be gated by the dev validation): %v", env, br.Explanation)
		}
		if prom.ID == "" {
			t.Fatalf("promotion to %q incomplete", env)
		}
	}
}

// TestRecordHumanValidationIsAppendOnlyDecision — RecordHumanValidation builds an append-only,
// content-addressed HITL-runtime decision (qui/quand/quelle phase/validated), with provenance —
// NEVER authority.Decide. Its id is content-addressed and the body is self-contained.
func TestRecordHumanValidationIsAppendOnlyDecision(t *testing.T) {
	ph := stablePhaseN("createOrder", "v2")
	h := phaseHashOf(t, ph)
	v := envrollback.RecordHumanValidation(envrollback.HumanValidationInput{
		Env: envrollback.EnvPreview, PhaseHash: h, Validated: true, By: "alice",
	})
	if v.ID == "" {
		t.Fatalf("validation has no content address")
	}
	if v.PhaseHash != h || !v.Validated || v.By != "alice" || v.Env != envrollback.EnvPreview {
		t.Fatalf("validation does not preserve who/what/which-phase: %+v", v)
	}
	// A missing actor defaults to "human" (provenance §9 never invents an actor but is never empty).
	anon := envrollback.RecordHumanValidation(envrollback.HumanValidationInput{
		Env: envrollback.EnvPreview, PhaseHash: h, Validated: true,
	})
	if anon.By != "human" {
		t.Fatalf("missing actor must default to \"human\", got %q", anon.By)
	}
}

// TestRollbackServesReProjectionNotStale is the DP28 done-criterion in fixture form: after a
// rollback to N-1, the env serves a FRESH re-emit of N-1 — and a STALE sandbox artifact (the
// served hash of N) is REJECTED. Code judges the equality, never an agent.
func TestRollbackServesReProjectionNotStale(t *testing.T) {
	prev := stablePhaseN("createOrder", "v1")
	curr := stablePhaseN("createOrder", "v2")
	prevHash := phaseHashOf(t, prev)
	dec, br := envrollback.Rollback(envrollback.RollbackInput{
		Env: envrollback.EnvProd, Project: "shop",
		Current: curr, Target: prev, Lineage: []string{prevHash},
		Actor: "alice", Reason: "incident",
	})
	if br != nil {
		t.Fatalf("rollback refused: %v", br.Explanation)
	}
	// The fresh re-projection of N-1 is accepted.
	fresh, err := preview.EmittedAppHash(preview.PhaseRef{PhaseHash: prevHash}, prev.Surface)
	if err != nil {
		t.Fatalf("re-emit: %v", err)
	}
	if ok, _ := envrollback.RollbackProducesReProjection(dec, prev, fresh); !ok {
		t.Fatalf("fresh re-projection should be accepted")
	}
	// A STALE artifact (the OLD served app of N) is REJECTED — nothing restored as stale.
	currHash := phaseHashOf(t, curr)
	stale, _ := preview.EmittedAppHash(preview.PhaseRef{PhaseHash: currHash}, curr.Surface)
	if ok, sbr := envrollback.RollbackProducesReProjection(dec, prev, stale); ok || sbr == nil {
		t.Fatalf("a stale sandbox artifact must be REJECTED")
	}
}
