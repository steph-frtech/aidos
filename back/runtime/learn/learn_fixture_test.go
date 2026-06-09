// S107 fixture mirror — the state→command→events proof of the `/learn` LOOP-CLOSURE
// (ROADMAP-app-builder §S107, KRD §53/§67/§42/§98): an incident (RealityMirror,
// provenance=incident) re-enters idée→grill→goal ; on human approval a NEW mirror is
// attached, the operation/policy HASH CHANGES, and a TARGETED red wave becomes the worklist.
//
// mirror record: reflects=learn "incident → new mirror → red wave" ·
//
//	test_kind=fixture · cert_language=fixture · authority=above · liveness=alive
//
// The canonical S107 done journey: a createOrder out-of-stock incident → a draft idea
// (provenance=incident, wrote no kernel) → [human /goal] an APPROVED mirror
// "out-of-stock-during-checkout" → the createOrder operation hash BUMPS → a targeted red wave
// (mirror-first) becomes the worklist. The wall (reality→kernel) is ALWAYS refused; the loop
// never learns its own fitness. This fixture is a MEANS-test toward the human/reality red.
package learn_test

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/learn"
	"github.com/steph-frtech/aidos/back/runtime/reality"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// outOfStockIncident is the canonical S107 incident: createOrder fails 30% on out-of-stock —
// a case no fixture covered. Observed by S43 reality.Observe, provenance=incident.
func outOfStockIncident(t *testing.T) reality.Incident {
	t.Helper()
	inc, err := reality.Observe(reality.ObserveInput{
		Ref: "#1042",
		Signal: reality.Signal{
			Operation:  "createOrder",
			Error:      "30% fail: out-of-stock between add-to-cart and pay",
			Recurrence: 3,
		},
		CauseSketch: "stock can deplete during checkout; createOrder should refuse when out-of-stock",
		Taint:       []firewall.Taint{firewall.TaintIncidentDerived},
	})
	if err != nil {
		t.Fatalf("Observe: %v", err)
	}
	return inc
}

// createOrderTarget is the operation the incident teaches a lesson about, at its current head.
func createOrderTarget() learn.Target {
	return learn.Target{
		Kind:     learn.TargetOperation,
		ID:       "op-createOrder",
		Version:  "v1",
		SpecBody: json.RawMessage(`{"kind":"operation","name":"createOrder","steps":["reserve","charge"]}`),
	}
}

// approvedOutOfStockMirror is the OUTCOME of the human's /goal — a NEW mirror frozen above the
// wall (the only judgment), reflecting the createOrder operation it bumps.
func approvedOutOfStockMirror(target learn.Target) learn.ApprovedMirror {
	return learn.ApprovedMirror{
		MirrorID: "mir-out-of-stock-during-checkout",
		Reflects: target.Ref(),
	}
}

// Scenario 1 — THE done journey: incident → draft idea → approved mirror → red wave.
func TestFixture_Journey_IncidentToDraftIdeaToApprovedMirrorToRedWave(t *testing.T) {
	inc := outOfStockIncident(t)
	target := createOrderTarget()
	mir := approvedOutOfStockMirror(target)

	// The mirror reflection edge (mirror-first) + a projection edge pinned to the OLD head.
	edges := []redwave.Edge{
		{
			Link: links.Link{
				Kind: links.KindMirrors,
				From: links.Ref{ID: "mir-out-of-stock-during-checkout", Version: "v1"},
				To:   links.Ref{ID: "op-createOrder", Version: "v1"},
			},
			LoadBearing: true,
			Layer:       redwave.LayerMirror,
		},
		{
			Link: links.Link{
				Kind: links.KindProjectsTo,
				From: links.Ref{ID: "handler-createOrder", Version: "v1"},
				To:   links.Ref{ID: "op-createOrder", Version: "v1"},
			},
			LoadBearing: true,
			Layer:       redwave.LayerProjection,
		},
	}
	// heads AFTER the bump: createOrder advanced to v2 (its mirror+projection now resolve stale).
	heads := links.Heads{"op-createOrder": "v2"}

	out, err := learn.Close(inc, mir, target, edges, heads)
	if err != nil {
		t.Fatalf("Close: %v", err)
	}

	// (a) the draft idea carries provenance=incident.
	if out.Candidate.Idea.Provenance.Source != ideas.ProvenanceIncident {
		t.Errorf("draft idea provenance: got %q want incident", out.Candidate.Idea.Provenance.Source)
	}
	if out.Candidate.Idea.Provenance.Detail != "#1042" {
		t.Errorf("draft idea provenance detail: got %q want #1042", out.Candidate.Idea.Provenance.Detail)
	}
	// (b) the loop wrote no kernel.
	if out.Candidate.WroteKernel || out.WroteKernel {
		t.Error("the /learn loop must write NO kernel (anti-circularity)")
	}
	// (c) the operation hash BUMPED.
	if !out.Bump.Moved {
		t.Error("attaching the approved mirror MUST move the operation's content address")
	}
	if out.Bump.Before == out.Bump.After {
		t.Errorf("before==after after a real reflection: %s", out.Bump.Before)
	}
	// (d) a targeted red wave became the worklist, mirror-first.
	if out.Wave.IsEmpty() {
		t.Fatal("a moved bump MUST seed a targeted red wave (the worklist)")
	}
	if out.Wave.Items[0].Layer != redwave.LayerMirror {
		t.Errorf("the wave is mirror-first: got %q first", out.Wave.Items[0].Layer)
	}
	// (e) the wall held: reality never declares truth.
	if out.Wall.Code != blockreason.CodeRealityCannotDeclareTruth {
		t.Errorf("wall verdict: got %q want REALITY_CANNOT_DECLARE_TRUTH", out.Wall.Code)
	}
}

// Scenario 2 — the bump is a DETERMINISTIC content-address delta (the hash truly changes).
func TestFixture_BumpHash_ChangesTheOperationAddress(t *testing.T) {
	target := createOrderTarget()
	mir := approvedOutOfStockMirror(target)

	bump, err := learn.BumpHash(target, mir)
	if err != nil {
		t.Fatalf("BumpHash: %v", err)
	}
	if !bump.Moved || bump.Before == bump.After {
		t.Errorf("the reflection must change the address: before=%s after=%s", bump.Before, bump.After)
	}
	if bump.TargetID != "op-createOrder" {
		t.Errorf("bump target: got %q", bump.TargetID)
	}
}

// Scenario 3 — a NO-OP re-reflection (the mirror already attached) yields NO bump and an EMPTY
// wave: a cosmetic re-reflection is not a new tooth.
func TestFixture_NoOpReReflection_NoBumpNoWave(t *testing.T) {
	mir := learn.ApprovedMirror{
		MirrorID: "mir-already-there",
		Reflects: links.Ref{ID: "op-x", Version: "v1"},
	}
	// The body ALREADY carries the reflection — attaching it again is a no-op.
	target := learn.Target{
		Kind:     learn.TargetOperation,
		ID:       "op-x",
		Version:  "v1",
		SpecBody: json.RawMessage(`{"_reflections":["mir-already-there"],"kind":"operation","name":"x"}`),
	}
	bump, err := learn.BumpHash(target, mir)
	if err != nil {
		t.Fatalf("BumpHash: %v", err)
	}
	if bump.Moved {
		t.Error("a re-reflection of an already-attached mirror must NOT move the address")
	}
	wave := learn.TargetedWave(bump, nil, links.Heads{})
	if !wave.IsEmpty() {
		t.Error("no bump ⇒ empty wave (no tooth, no worklist)")
	}
}

// Scenario 4 — the wall ALWAYS refuses the direct Incident→Kernel edge, regardless of recurrence.
func TestFixture_Wall_AlwaysRefusesRealityToKernel(t *testing.T) {
	inc := outOfStockIncident(t)
	br := learn.WallVerdict(inc)
	if br == nil {
		t.Fatal("WallVerdict must NEVER be nil — reality cannot declare truth")
	}
	if br.Code != blockreason.CodeRealityCannotDeclareTruth {
		t.Errorf("wall code: got %q want REALITY_CANNOT_DECLARE_TRUTH", br.Code)
	}
}

// Scenario 5 — a mirror that reflects the WRONG target is refused (no cross-attachment): a learned
// mirror must reflect the very target it bumps.
func TestFixture_ReflectMismatch_Refused(t *testing.T) {
	target := createOrderTarget()
	wrong := learn.ApprovedMirror{
		MirrorID: "mir-elsewhere",
		Reflects: links.Ref{ID: "op-other", Version: "v1"},
	}
	if _, err := learn.BumpHash(target, wrong); err == nil {
		t.Fatal("a mirror reflecting a different target must be refused")
	}
}
