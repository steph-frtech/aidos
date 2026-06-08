package envrollback_test

// S98 — ENVIRONMENTS + ROLLBACK-TO-PHASE INVARIANTS (property, rapid). N1.
// reflects=archive.envrollback · test_kind=property · liveness=live.
//
// Four properties:
//   - REPRODUCIBILITY: same input → byte-identical Promotion / RollbackDecision (same id, app
//     hash, stack, reconciliation, provenance). Same input → same output, never an LLM.
//   - RE-PROJECTION: the app the rollback serves EQUALS a FRESH re-emit of the TARGET phase
//     (preview.EmittedAppHash, S94) — never a stale sandbox artifact; RollbackProducesReProjection
//     accepts EXACTLY that hash and rejects every other (e.g. the served hash of N).
//   - STOP-GATE: promoting a NON-STABLE phase is ALWAYS refused ENV_PROMOTE_NOT_STABLE with no
//     promotion; a rollback to a target NOT in the lineage is ALWAYS refused ROLLBACK_NOT_EARLIER.
//   - CONTENT-ADDRESS SENSITIVITY: changing the target phase, the env, the actor or the reason
//     yields a different decision id (no collision) — every provenance is a distinct decision.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/envrollback"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/preview"
	"pgregory.net/rapid"
)

func genStablePhase(t *rapid.T, name string) envrollback.PhaseInput {
	v := rapid.StringMatching(`v[0-9]{1,4}`).Draw(t, name+"-v")
	return stablePhaseN("createOrder", v)
}

// TestPromoteReproducible — same PromoteInput → byte-identical Promotion (same id, app hash, stack).
func TestPromoteReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		env := rapid.SampledFrom(envrollback.Environments()).Draw(t, "env")
		ph := genStablePhase(t, "ph")
		in := envrollback.PromoteInput{Env: env, Project: "shop", Phase: ph}
		a, bra := envrollback.Promote(in)
		b, brb := envrollback.Promote(in)
		if bra != nil || brb != nil {
			t.Fatalf("stable promote refused: %v / %v", bra, brb)
		}
		if a != b {
			t.Fatalf("promotion not reproducible:\n %+v\n %+v", a, b)
		}
	})
}

// TestPromoteNonStableAlwaysRefused — a non-stable phase NEVER promotes (fail-closed).
func TestPromoteNonStableAlwaysRefused(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		v := rapid.StringMatching(`v[0-9]{1,4}`).Draw(t, "v")
		red := redPhaseN("createOrder", v)
		env := rapid.SampledFrom(envrollback.Environments()).Draw(t, "env")
		prom, br := envrollback.Promote(envrollback.PromoteInput{Env: env, Project: "shop", Phase: red})
		if br == nil {
			t.Fatalf("non-stable phase promoted: %+v", prom)
		}
		if br.Code != blockreason.CodeEnvPromoteNotStable {
			t.Fatalf("refusal code = %q, want ENV_PROMOTE_NOT_STABLE", br.Code)
		}
		if prom.ID != "" {
			t.Fatalf("a refused promotion must emit NO promotion")
		}
	})
}

// TestPromoteLiveURLDeterministicAndHTTPS — the cockpit live URL (S99/DP29) is reproducible,
// ALWAYS https (TLS inherited via ACME), carries the env + the per-phase subdomain, and ends with
// the linked domain (default or custom). Same env+phase+domain → same URL, never an LLM.
func TestPromoteLiveURLDeterministicAndHTTPS(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		env := rapid.SampledFrom(envrollback.Environments()).Draw(t, "env")
		ph := genStablePhase(t, "ph")
		custom := rapid.Bool().Draw(t, "custom")
		root := ""
		if custom {
			root = "shop.example.com"
		}
		in := envrollback.PromoteInput{Env: env, Project: "shop", Phase: ph, DomainRoot: root}
		a, bra := envrollback.Promote(in)
		b, brb := envrollback.Promote(in)
		if bra != nil || brb != nil {
			t.Fatalf("stable promote refused: %v / %v", bra, brb)
		}
		if a.LiveURL != b.LiveURL {
			t.Fatalf("live URL not reproducible: %q vs %q", a.LiveURL, b.LiveURL)
		}
		if len(a.LiveURL) < len("https://") || a.LiveURL[:len("https://")] != "https://" {
			t.Fatalf("live URL must be HTTPS (TLS inherited): %q", a.LiveURL)
		}
		wantRoot := envrollback.DefaultDomainRoot
		if custom {
			wantRoot = "shop.example.com"
		}
		if a.DomainRoot != wantRoot {
			t.Fatalf("domain root = %q, want %q", a.DomainRoot, wantRoot)
		}
		if want := envrollback.LiveURL(env, a.PhaseHash, wantRoot); a.LiveURL != want {
			t.Fatalf("live URL = %q, want %q", a.LiveURL, want)
		}
	})
}

// TestRollbackReproducibleAndReProjects — same RollbackInput → byte-identical decision, and the
// served app equals a fresh re-emit of the TARGET phase (never a stale sandbox artifact).
func TestRollbackReproducibleAndReProjects(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		prev := genStablePhase(t, "prev")
		curr := genStablePhase(t, "curr")
		prevHash, _ := prev.Phase.Version()
		currHash, _ := curr.Phase.Version()
		if prevHash == currHash {
			return // need two distinct phases for a real rollback.
		}
		actor := rapid.StringMatching(`[a-z]{3,8}`).Draw(t, "actor")
		reason := rapid.StringMatching(`[a-z ]{3,12}`).Draw(t, "reason")
		in := envrollback.RollbackInput{
			Env: envrollback.EnvProd, Project: "shop",
			Current: curr, Target: prev, Lineage: []string{prevHash},
			Actor: actor, Reason: reason,
		}
		a, bra := envrollback.Rollback(in)
		b, brb := envrollback.Rollback(in)
		if bra != nil || brb != nil {
			t.Fatalf("rollback refused: %v / %v", bra, brb)
		}
		// RollbackDecision carries slices/Plan; compare via the content-address id.
		if a.ID != b.ID {
			t.Fatalf("rollback id not reproducible: %q vs %q", a.ID, b.ID)
		}
		// RE-PROJECTION: the decision's app hash = a fresh re-emit of N-1.
		fresh, err := preview.EmittedAppHash(preview.PhaseRef{PhaseHash: prevHash}, prev.Surface)
		if err != nil {
			t.Fatalf("re-emit: %v", err)
		}
		if a.ReProjectedAppHash != fresh {
			t.Fatalf("re-projection mismatch: decision %q != fresh %q", a.ReProjectedAppHash, fresh)
		}
		ok, pbr := envrollback.RollbackProducesReProjection(a, prev, fresh)
		if !ok {
			t.Fatalf("re-projection property rejected the fresh re-emit: %v", pbr)
		}
		// A STALE artifact (the served app of N) is REJECTED.
		stale, _ := preview.EmittedAppHash(preview.PhaseRef{PhaseHash: currHash}, curr.Surface)
		if stale != fresh {
			if ok, _ := envrollback.RollbackProducesReProjection(a, prev, stale); ok {
				t.Fatalf("a stale sandbox artifact was accepted as the re-projection")
			}
		}
	})
}

// TestRollbackNonAncestorAlwaysRefused — a target NOT in the lineage NEVER rolls back.
func TestRollbackNonAncestorAlwaysRefused(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		prev := genStablePhase(t, "prev")
		curr := genStablePhase(t, "curr")
		prevHash, _ := prev.Phase.Version()
		currHash, _ := curr.Phase.Version()
		if prevHash == currHash {
			return
		}
		// Empty lineage ⇒ target is not an ancestor ⇒ ROLLBACK_NOT_EARLIER.
		dec, br := envrollback.Rollback(envrollback.RollbackInput{
			Env: envrollback.EnvProd, Project: "shop",
			Current: curr, Target: prev, Lineage: nil,
			Actor: "alice", Reason: "x",
		})
		if br == nil {
			t.Fatalf("non-ancestor rollback succeeded: %+v", dec)
		}
		if br.Code != blockreason.CodeRollbackNotEarlier {
			t.Fatalf("refusal code = %q, want ROLLBACK_NOT_EARLIER", br.Code)
		}
	})
}

// TestRollbackProvenanceSensitivity — a different actor/reason/env ⇒ a different decision id.
func TestRollbackProvenanceSensitivity(t *testing.T) {
	prev := stablePhaseN("createOrder", "v1")
	curr := stablePhaseN("createOrder", "v2")
	prevHash, _ := prev.Phase.Version()
	base := envrollback.RollbackInput{
		Env: envrollback.EnvProd, Project: "shop",
		Current: curr, Target: prev, Lineage: []string{prevHash},
		Actor: "alice", Reason: "incident",
	}
	d0, _ := envrollback.Rollback(base)

	other := base
	other.Reason = "different reason"
	d1, _ := envrollback.Rollback(other)
	if d0.ID == d1.ID {
		t.Fatalf("a different reason must yield a different decision id")
	}

	other2 := base
	other2.Actor = "bob"
	d2, _ := envrollback.Rollback(other2)
	if d0.ID == d2.ID {
		t.Fatalf("a different actor must yield a different decision id")
	}

	other3 := base
	other3.Env = envrollback.EnvStaging
	d3, _ := envrollback.Rollback(other3)
	if d0.ID == d3.ID {
		t.Fatalf("a different env must yield a different decision id")
	}
}
