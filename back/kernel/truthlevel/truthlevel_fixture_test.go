package truthlevel_test

// Fixture mirror (N2 workflow) for FK01 — the seven-rung ladder of FKE-5 read as
// `signals (state) → Compute (transition) → level (event)`. reflects=kernel.truthlevel,
// test_kind=fixture, cert_language=table, liveness=live, authority=below.
//
// Each row is the exact KRD FKE-5 door, climbed one rung at a time — the canonical
// Raw→Reconciled walk. It pins that the transition is the SOLE writer of the level (no
// row hand-poses a rung; each is the Compute of its doors) and that the parity mirror is
// GREEN on every honoured rung.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/truthlevel"
)

// ladderRow is one rung of the FKE-5 walk: a name, the signals that hold at that rung,
// and the level Compute must return.
type ladderRow struct {
	name   string
	sig    truthlevel.Signals
	expect truthlevel.Level
}

// the canonical monotone walk: each rung adds exactly one door on top of the prior.
func ladder() []ladderRow {
	raw := truthlevel.Signals{HasRawSignal: true}
	interp := raw
	interp.HasIdea = true
	prop := interp
	prop.HasProposal = true
	acc := prop
	acc.IsAccepted = true
	proj := acc
	proj.HasProjection = true
	obs := proj
	obs.HasObservation = true
	recon := obs
	recon.IsReconciled = true
	return []ladderRow{
		{"nothing", truthlevel.Signals{}, truthlevel.LevelUnknown},
		{"raw", raw, truthlevel.LevelRaw},
		{"interpreted", interp, truthlevel.LevelInterpreted},
		{"proposed", prop, truthlevel.LevelProposed},
		{"accepted", acc, truthlevel.LevelAccepted},
		{"projected", proj, truthlevel.LevelProjected},
		{"observed", obs, truthlevel.LevelObserved},
		{"reconciled", recon, truthlevel.LevelReconciled},
	}
}

// TestLadderWalk — the transition climbs the seven rungs in order, and parity is GREEN
// on each (stored = the transition's own output).
func TestLadderWalk(t *testing.T) {
	for _, row := range ladder() {
		t.Run(row.name, func(t *testing.T) {
			got := truthlevel.Compute(row.sig)
			if got != row.expect {
				t.Fatalf("Compute(%s) = %s, want %s", row.name, got, row.expect)
			}
			// The stored level is the transition's output: parity must be GREEN.
			res, err := truthlevel.CheckParity(got, row.sig)
			if err != nil || !res.Aligned {
				t.Fatalf("parity RED on honoured rung %s: %v %+v", row.name, err, res)
			}
		})
	}
}

// TestHandPosedDivergence — a hand-posed level that is NOT the computed one is RED. This
// is the FKE-5 guard: the level is written ONLY by the transition; a manual rung diverges.
func TestHandPosedDivergence(t *testing.T) {
	// Signals say "raw" (nothing but a raw signal), but someone hand-posed "accepted".
	sig := truthlevel.Signals{HasRawSignal: true}
	res, err := truthlevel.CheckParity(truthlevel.LevelAccepted, sig)
	if err == nil {
		t.Fatalf("hand-posed accepted over raw signals must be RED, got aligned=%v", res.Aligned)
	}
	if res.Stored != truthlevel.LevelAccepted || res.Computed != truthlevel.LevelRaw {
		t.Fatalf("parity result mis-sourced: %+v", res)
	}
}

// TestLevelsEnumeration — the seven real levels are exposed in canonical order, with
// stable rungs and names (the panel filter relies on this set never being invented).
func TestLevelsEnumeration(t *testing.T) {
	got := truthlevel.Levels()
	want := []truthlevel.Level{
		truthlevel.LevelRaw, truthlevel.LevelInterpreted, truthlevel.LevelProposed,
		truthlevel.LevelAccepted, truthlevel.LevelProjected, truthlevel.LevelObserved,
		truthlevel.LevelReconciled,
	}
	if len(got) != len(want) {
		t.Fatalf("Levels() len = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("Levels()[%d] = %s, want %s", i, got[i], want[i])
		}
		if int(got[i]) != i+1 {
			t.Fatalf("level %s rung = %d, want %d", got[i], int(got[i]), i+1)
		}
	}
	if truthlevel.LevelReconciled.Name() != "reconciled" {
		t.Fatalf("Reconciled name = %q", truthlevel.LevelReconciled.Name())
	}
}
