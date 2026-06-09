// collab_fixture_test.go — the S113 WORKFLOW mirror (fixture, state→command→events).
// reflects=runtime.collab.presence-and-stage · test_kind=workflow · cert_language=fixture ·
// authority=below · liveness=live.
//
// It pins the two fixture done-criteria DIRECTLY (pure, no DB — the deterministic judge):
//   - PRESENCE: two users present on the SAME canvas see each other's presence WITHOUT
//     overwriting — the second Join ADDS a presence, never replaces the first; and a
//     concurrent edit (lock claim) never silently clobbers a held lock.
//   - STAGE GATE: the per-project AdoptionStage ladder advances ONLY when the next dent's
//     gate is reached ("done is computed", §8) — a project missing a required capability
//     cannot advance.
package collab

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/adoption"
)

// ---- presence: two users without overwrite ---------------------------------------------

func TestFixture_TwoUsersPresentWithoutOverwrite(t *testing.T) {
	const proj, canvas = "proj-alpha", "canvas-7"
	alice := Actor{Identity: "alice", ProjectID: proj}
	bob := Actor{Identity: "bob", ProjectID: proj}

	// state: empty canvas → command: alice joins.
	c0 := Canvas{CanvasID: canvas, ProjectID: proj}
	c1, d1 := c0.Join(alice)
	if d1.Verdict != VerdictAllow {
		t.Fatalf("alice join must allow, got %s", d1.Verdict)
	}
	if c1.PresentCount() != 1 || !c1.IsPresent("alice") {
		t.Fatalf("after alice join: want [alice], got %+v", c1.Present)
	}

	// command: bob joins the SAME canvas. event: BOTH present (no overwrite).
	c2, d2 := c1.Join(bob)
	if d2.Verdict != VerdictAllow {
		t.Fatalf("bob join must allow, got %s", d2.Verdict)
	}
	if c2.PresentCount() != 2 || !c2.IsPresent("alice") || !c2.IsPresent("bob") {
		t.Fatalf("after bob join: want [alice,bob] both present, got %+v", c2.Present)
	}
	// the FIRST canvas value is unchanged (pure, no mutation) — alice never lost.
	if c1.PresentCount() != 1 {
		t.Fatalf("Join must not mutate the prior canvas: got %+v", c1.Present)
	}

	// re-joining alice is idempotent (still two distinct presences).
	c3, _ := c2.Join(alice)
	if c3.PresentCount() != 2 {
		t.Fatalf("re-join must be idempotent, got %d present", c3.PresentCount())
	}
}

func TestFixture_ConcurrentEditNeverClobbers(t *testing.T) {
	const proj, canvas = "proj-alpha", "canvas-7"
	alice := Actor{Identity: "alice", ProjectID: proj}
	bob := Actor{Identity: "bob", ProjectID: proj}

	c, _ := Canvas{CanvasID: canvas, ProjectID: proj}.Join(alice)
	c, _ = c.Join(bob)

	// alice claims the edit lock (explicit, recorded).
	cAlice, dA := c.ClaimLock(alice)
	if dA.Verdict != VerdictAllow || cAlice.LockHolder != "alice" {
		t.Fatalf("alice must hold the lock, got %s holder=%q", dA.Verdict, cAlice.LockHolder)
	}
	// bob tries to edit concurrently — REFUSED, alice keeps the lock (no silent overwrite).
	cBob, dB := cAlice.ClaimLock(bob)
	if dB.Verdict != VerdictDeny {
		t.Fatalf("bob's concurrent claim must be DENIED, got %s", dB.Verdict)
	}
	if cBob.LockHolder != "alice" {
		t.Fatalf("the held lock must stay with alice, got %q", cBob.LockHolder)
	}
	// alice releases → bob can now claim.
	cReleased := cAlice.ReleaseLock(alice)
	cBob2, dB2 := cReleased.ClaimLock(bob)
	if dB2.Verdict != VerdictAllow || cBob2.LockHolder != "bob" {
		t.Fatalf("after release bob must claim, got %s holder=%q", dB2.Verdict, cBob2.LockHolder)
	}
}

// ---- stage gate: advance only when the gate is reached ---------------------------------

func TestFixture_StageAdvancesOnlyWhenGateReached(t *testing.T) {
	const proj = "proj-alpha"

	// A project with NO capabilities sits at the floor and cannot advance to T1 (its gate
	// — the T1-required capabilities — is unmet). "Done is computed."
	bare := StageFor(proj, nil)
	ok, reason := bare.CanAdvance()
	if ok {
		t.Fatalf("a bare project must NOT advance (gate unmet), got CanAdvance=true")
	}
	if reason == nil || reason.Code != CodeStageGateUnmet {
		t.Fatalf("expected STAGE_GATE_UNMET with how_to_fix, got %+v", reason)
	}
	if len(reason.HowToFix) == 0 {
		t.Fatalf("the gate refusal must name the missing capabilities, got none")
	}

	// A project that HAS T0's grants reaches T1's gate → may advance. The grants of the
	// current floor satisfy the next dent's requirements.
	t0Grants := adoption.Grants(adoption.T0)
	ready := StageFor(proj, t0Grants)
	// If T1 requires exactly what T0 grants, CanAdvance is true; otherwise the gate names
	// the remaining gap. Either way the verdict is COMPUTED from the gaps, never declared.
	okReady, reasonReady := ready.CanAdvance()
	if okReady {
		if reasonReady != nil {
			t.Fatalf("advance allowed but a reason was returned: %+v", reasonReady)
		}
	} else {
		if reasonReady == nil || len(reasonReady.HowToFix) == 0 {
			t.Fatalf("advance denied but no actionable gate reason: %+v", reasonReady)
		}
	}

	// A project that satisfies the WHOLE ladder is at the top and cannot advance further.
	var all []adoption.Capability
	for _, s := range adoption.Stages() {
		all = append(all, adoption.Requires(s)...)
	}
	top := StageFor(proj, all)
	if okTop, _ := top.CanAdvance(); top.Plan.AllSatisfied && okTop {
		t.Fatalf("a fully-satisfied project is at the top and must NOT advance further")
	}
}

func TestFixture_PerProjectStageSurfacesCurrentAndNext(t *testing.T) {
	const proj = "proj-alpha"
	ps := StageFor(proj, nil)
	if ps.ProjectID != proj {
		t.Fatalf("stage must carry the project id, got %q", ps.ProjectID)
	}
	// A bare project surfaces a Next dent (the smallest ratchet that clicks) with its gaps.
	if ps.NextStage() == "" {
		t.Fatalf("a non-complete project must surface a NEXT dent")
	}
	if len(ps.Plan.NextGaps) == 0 {
		t.Fatalf("the next dent must surface its blocking gaps")
	}
}
