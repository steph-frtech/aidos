package ideas

import (
	"fmt"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// The §75 gestures as PURE lifecycle transitions over an Idea. Each takes an Idea
// and returns the advanced Idea (and an error on an ILLEGAL transition — the mirror
// blocks the illegal move, KRD §118). None mutates its input; none does I/O; none
// panics. The id is preserved across transitions: grilling/harvesting the same
// sketch does not change its content-addressed identity (Status is metadata, not
// part of the address).

// ErrIllegalTransition is returned by a gesture invoked from a status it is not
// legal from (e.g. spike from draft, harvest from draft). The lifecycle state
// machine refuses it — the illegal move is blocked, never silently performed.
var ErrIllegalTransition = fmt.Errorf("ideas: illegal lifecycle transition")

// Capture records a candidate-truth from a human utterance or an incident →
// draft (KRD §117/§118). It is the entry on-ramp. The returned Idea has version
// (none — unrepresentable) and mirror (none — unrepresentable) absent by type, and
// its id is the content hash of the sketch. now is not needed (purely structural);
// the DB stamps created_at on insert.
func Capture(proposes Proposes, intent string, prov Provenance) (Idea, error) {
	return Hashed(Idea{
		Proposes:   proposes,
		Intent:     intent,
		Provenance: prov,
		Status:     StatusDraft,
	})
}

// Grill challenges a draft idea against the domain model → grilled (the /grill
// gesture). Legal only from draft.
func Grill(i Idea) (Idea, error) {
	if i.Status != StatusDraft {
		return Idea{}, fmt.Errorf("%w: grill from %q (want draft)", ErrIllegalTransition, i.Status)
	}
	i.Status = StatusGrilled
	return i, nil
}

// Spike enters exploration with the ratchet OFF → spiking (the /spike gesture, the
// "floue ?" branch, KRD §118). Legal only from grilled. A spiking idea is probed,
// not graduated — it must still be harvested.
func Spike(i Idea) (Idea, error) {
	if i.Status != StatusGrilled {
		return Idea{}, fmt.Errorf("%w: spike from %q (want grilled)", ErrIllegalTransition, i.Status)
	}
	i.Status = StatusSpiking
	return i, nil
}

// Harvest extracts the discovered truth → harvested (the /harvest gesture). Legal
// from grilled (the clear branch — straight to harvest) OR from spiking (the
// floue branch — explored, then harvested). A harvested-via-spike idea and a
// harvested-direct idea are INDISTINGUISHABLE for promotion: both still need the
// mirror (the wall holds for every idea).
func Harvest(i Idea) (Idea, error) {
	if i.Status != StatusGrilled && i.Status != StatusSpiking {
		return Idea{}, fmt.Errorf("%w: harvest from %q (want grilled or spiking)", ErrIllegalTransition, i.Status)
	}
	i.Status = StatusHarvested
	return i, nil
}

// Reject traces a bad idea → rejected (append-only; the idea is KEPT, never
// deleted — KRD §118). Legal from any non-terminal status (draft, grilled,
// spiking, harvested); rejecting an already-rejected idea is a no-op refusal. The
// reason is recorded verbatim.
func Reject(i Idea, reason string) (Idea, error) {
	if i.Status == StatusRejected {
		return Idea{}, fmt.Errorf("%w: reject from %q (already rejected)", ErrIllegalTransition, i.Status)
	}
	i.Status = StatusRejected
	i.RejectReason = reason
	return i, nil
}

// Promotion is the legal outcome of promoting an idea: a kernel truth created via
// the /goal flow, whose provenance points back to the idea. It is NOT written here
// (the agent has no grant — the aidos CLI role writes the kernel through /goal);
// this is the proposal the gate ALLOWS through. ProvenanceIdeaID is the back-link
// (KRD §119: every frozen truth points back to the idea that engendered it).
type Promotion struct {
	// IdeaID is the promoted idea's content-addressed id.
	IdeaID string `json:"idea_id"`
	// MirrorRef is the handle to the idea's mirror (the test-as-goal). It is a
	// REFERENCE the human supplies at /goal — not a mirror this package authored
	// (that circularity is the wall, CLAUDE.md §8). The gate checks it is non-empty.
	MirrorRef string `json:"mirror_ref"`
	// ProvenanceIdeaID is the back-link the new kernel truth will carry — the idea
	// this promotion came from (KRD §119).
	ProvenanceIdeaID string `json:"provenance_idea_id"`
}

// Promote is the GATE — the only door into the kernel (KRD §116/§44.5). It refuses
// unless (a) the idea is harvested AND (b) a non-empty mirror reference is supplied.
//
//   - No mirror (mirrorRef == "") ⇒ the actionable NO_MIRROR_NO_KERNEL BlockReason,
//     and the idea STAYS harvested (no kernel write). This is THE done case: you
//     cannot write an idea into the kernel directly; promotion requires a mirror.
//   - A non-empty mirror ⇒ a Promotion proposal whose provenance points back to the
//     idea. The actual kernel freeze is the aidos CLI role via /goal, NOT here.
//
// Promote is PURE and TOTAL: it never writes, never panics, and the (Promotion,
// *BlockReason) result is a deterministic function of (idea, mirrorRef). Exactly
// one of the two is non-nil.
func Promote(i Idea, mirrorRef string) (*Promotion, *blockreason.BlockReason) {
	if i.Status != StatusHarvested {
		br := blockreason.For(blockreason.CodeNoMirrorNoKernel)
		return nil, &br
	}
	if mirrorRef == "" {
		// The wall: no mirror ⇒ no kernel. The idea stays harvested (the caller
		// keeps its unchanged status — Promote never mutates it).
		br := blockreason.For(blockreason.CodeNoMirrorNoKernel)
		return nil, &br
	}
	return &Promotion{
		IdeaID:           i.ID,
		MirrorRef:        mirrorRef,
		ProvenanceIdeaID: i.ID,
	}, nil
}
