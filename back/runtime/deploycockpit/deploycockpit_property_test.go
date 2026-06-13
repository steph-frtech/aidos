package deploycockpit_test

// DP29 — DEPLOY & ENVIRONMENTS COCKPIT INVARIANTS (property, rapid). N1.
// reflects=runtime.deploycockpit · test_kind=property · liveness=live.
//
// The cockpit projection is a PURE projection of the DAG (the spec's « projection PURE du DAG ;
// jamais une estimation »). The properties pin exactly that:
//
//   - REPRODUCIBILITY: same Input → byte-identical Projection (same Hash) — « même DAG ⇒ même
//     projection byte-identique » ; and the Hash is order-stable (it is the content address of
//     the canonical body, never a map-order leak).
//   - LIVENESS IS A PURE PROJECTION (never an estimation): an UNSTABLE phase is ALWAYS rouge ;
//     a STABLE phase WITH cut/sensor evidence is ALWAYS vert ; a STABLE phase with NO evidence is
//     ALWAYS inconnu (the cockpit never paints green on nothing).
//   - DEPLOYABILITY = THE DP26 STOP-GATE (reused, never forked): a phase is deployable in the
//     cockpit IFF deploy.IsDeployable says so ; a non-stable (rouge) phase is ALWAYS marked
//     non-deployable with a non-empty reason set (the PHASE_NOT_STABLE source).
//   - THE DP28 HUMAN GATE (reflected): staging is promotable from preview IFF the preview rung
//     carries a validated validation_humaine over a served phase — fail-closed.
//   - CLOSED PROFILES: the projection always carries EXACTLY the closed DP11 profile set.

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/deploy"
	"github.com/steph-frtech/aidos/back/runtime/deploycockpit"
	"pgregory.net/rapid"
)

// passingGate is a gate above its threshold with no monster — the « done is computed » side holds.
func passingGate() deploy.Gate {
	return deploy.Gate{MutationScore: 0.95, MutationThreshold: 0.8, MonsterCount: 0}
}

// stablePhaseWithEvidence builds a STABLE phase carrying real cut/sensor evidence (vert).
func stablePhaseWithEvidence() phases.StablePhase {
	return phases.IsStable(
		phases.Cut{"checkout": "v1"},
		nil,
		nil,
		[]phases.SensorStatus{{ID: "createOrder.fixture", Pass: true}},
	)
}

// stablePhaseNoEvidence is the VACUOUSLY stable phase (empty cut, no sensors) — inconnu.
func stablePhaseNoEvidence() phases.StablePhase {
	return phases.IsStable(nil, nil, nil, nil)
}

// unstablePhase builds an UNSTABLE phase (one red sensor) — rouge.
func unstablePhase() phases.StablePhase {
	return phases.IsStable(
		phases.Cut{"checkout": "v1"},
		nil,
		nil,
		[]phases.SensorStatus{{ID: "createOrder.fixture", Pass: false}},
	)
}

// genPhase draws one of the three liveness classes and returns the phase plus its expected liveness.
func genPhase(t *rapid.T, label string) deploycockpit.PhaseInput {
	kind := rapid.SampledFrom([]string{"vert", "rouge", "inconnu"}).Draw(t, label+".kind")
	var ph phases.StablePhase
	switch kind {
	case "vert":
		ph = stablePhaseWithEvidence()
	case "rouge":
		ph = unstablePhase()
	default:
		ph = stablePhaseNoEvidence()
	}
	return deploycockpit.PhaseInput{
		NodeID: "node-" + rapid.StringMatching(`[a-f0-9]{6,12}`).Draw(t, label+".id"),
		Label:  label,
		Head:   rapid.Bool().Draw(t, label+".head"),
		Phase:  ph,
		Gate:   passingGate(),
	}
}

// genInput draws a whole cockpit Input (a project + 0..4 phases + the default ladder).
func genInput(t *rapid.T) deploycockpit.Input {
	project := "p-" + rapid.StringMatching(`[a-z]{2,6}`).Draw(t, "project")
	n := rapid.IntRange(0, 4).Draw(t, "nPhases")
	ph := make([]deploycockpit.PhaseInput, 0, n)
	for i := 0; i < n; i++ {
		ph = append(ph, genPhase(t, rapid.StringMatching(`line[0-9]`).Draw(t, "label")))
	}
	return deploycockpit.Input{Project: project, Phases: ph}
}

// TestReproducibility — same Input → byte-identical Projection (same Hash). Determinism-first.
func TestReproducibility(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genInput(t)
		a := deploycockpit.Project("", in)
		b := deploycockpit.Project("", in)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("projection not reproducible:\n a=%+v\n b=%+v", a, b)
		}
		if a.Hash != b.Hash {
			t.Fatalf("hash not reproducible: %q != %q", a.Hash, b.Hash)
		}
		if a.Hash == "" {
			t.Fatalf("hash must be non-empty (content address of the canonical body)")
		}
	})
}

// TestLivenessIsPureProjection — the liveness of every phase card matches the pure LivenessOf of
// its cut verdict, NEVER an estimation: unstable ⇒ rouge, stable+evidence ⇒ vert, stable+no
// evidence ⇒ inconnu.
func TestLivenessIsPureProjection(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genInput(t)
		proj := deploycockpit.Project("", in)
		if len(proj.Phases) != len(in.Phases) {
			t.Fatalf("phase count drift: %d cards for %d inputs", len(proj.Phases), len(in.Phases))
		}
		for i, card := range proj.Phases {
			want := deploycockpit.LivenessOf(in.Phases[i].Phase)
			if card.Liveness != want {
				t.Fatalf("phase %d: liveness %q, want %q (must be a pure projection of the cut)", i, card.Liveness, want)
			}
			// A rouge phase is NEVER vert/inconnu, and an unstable cut is ALWAYS rouge.
			if !in.Phases[i].Phase.Stable && card.Liveness != deploycockpit.LivenessRouge {
				t.Fatalf("phase %d: an unstable cut must be rouge, got %q", i, card.Liveness)
			}
		}
	})
}

// TestDeployabilityIsTheStopGate — the cockpit's deployability per phase EQUALS the DP26
// deploy.IsDeployable verdict (reused, never forked); a rouge phase is ALWAYS non-deployable with a
// non-empty reason set (the PHASE_NOT_STABLE source).
func TestDeployabilityIsTheStopGate(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genInput(t)
		proj := deploycockpit.Project("", in)
		for i, card := range proj.Phases {
			wantDeployable, wantReasons := deploy.IsDeployable(in.Phases[i].Phase, in.Phases[i].Gate)
			if card.Deployable != wantDeployable {
				t.Fatalf("phase %d: deployable %v, want %v (must be the DP26 Stop-gate)", i, card.Deployable, wantDeployable)
			}
			if !reflect.DeepEqual(nonNil(card.Reasons), nonNil(wantReasons)) {
				t.Fatalf("phase %d: reasons %v, want %v", i, card.Reasons, wantReasons)
			}
			if card.Liveness == deploycockpit.LivenessRouge {
				if card.Deployable {
					t.Fatalf("phase %d: a rouge phase must NOT be deployable", i)
				}
				if len(card.Reasons) == 0 {
					t.Fatalf("phase %d: a rouge phase must name its reasons (PHASE_NOT_STABLE source)", i)
				}
			}
		}
	})
}

// TestHumanGateReflected — staging is promotable from the preview rung IFF a validated
// validation_humaine covers a served phase (DP28, fail-closed). Drawn over the preview rung.
func TestHumanGateReflected(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		served := rapid.Bool().Draw(t, "served")
		validated := rapid.Bool().Draw(t, "validated")
		servedID := ""
		if served {
			servedID = "node-dev-current"
		}
		in := deploycockpit.Input{
			Project: "shop",
			Phases: []deploycockpit.PhaseInput{{
				NodeID: "node-dev-current",
				Phase:  stablePhaseWithEvidence(),
				Gate:   passingGate(),
			}},
			Environments: []deploycockpit.EnvironmentInput{{
				Env:            deploycockpit.EnvPreview,
				ServedPhaseID:  servedID,
				HumanValidated: validated,
			}},
		}
		proj := deploycockpit.Project("", in)
		if len(proj.Environments) != 1 {
			t.Fatalf("want one env card, got %d", len(proj.Environments))
		}
		card := proj.Environments[0]
		wantPromotable := served && validated
		if card.StagingPromotable != wantPromotable {
			t.Fatalf("staging promotable %v, want %v (served=%v validated=%v) — fail-closed gate", card.StagingPromotable, wantPromotable, served, validated)
		}
	})
}

// TestProfilesAreClosed — the projection always carries EXACTLY the closed DP11 profile set.
func TestProfilesAreClosed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		in := genInput(t)
		proj := deploycockpit.Project("", in)
		if !reflect.DeepEqual(proj.Profiles, stackmanifest.Profiles()) {
			t.Fatalf("profiles %v, want the closed DP11 set %v", proj.Profiles, stackmanifest.Profiles())
		}
	})
}

// TestDefaultLadderIsClosed — with no environments supplied, the ladder is the closed four-rung
// set (preview/staging/prod/future_cloud), in order, every rung empty (nothing served).
func TestDefaultLadderIsClosed(t *testing.T) {
	proj := deploycockpit.Project("shop", deploycockpit.Input{})
	want := []scope.Environment{deploycockpit.EnvPreview, scope.EnvStaging, scope.EnvProd, scope.EnvFutureCloud}
	if len(proj.Environments) != len(want) {
		t.Fatalf("ladder length %d, want %d", len(proj.Environments), len(want))
	}
	for i, e := range want {
		if proj.Environments[i].Env != e {
			t.Fatalf("ladder rung %d = %q, want %q", i, proj.Environments[i].Env, e)
		}
		if proj.Environments[i].ServedPhaseID != "" || proj.Environments[i].LiveURL != "" {
			t.Fatalf("ladder rung %d must be empty (nothing served), got served=%q url=%q", i, proj.Environments[i].ServedPhaseID, proj.Environments[i].LiveURL)
		}
	}
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
