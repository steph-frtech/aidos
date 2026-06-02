// Package reality implements the AIDOS RealityMirror (KRD §53/§67/§117/§1099,
// LIVRE on the external loop) — the EXTERNAL loop (boucle ③) that turns a prod
// incident or telemetry signal into an `Idea` DRAFT, so reality becomes a SENSOR
// that injects ideas:
//
//	Incident → Learn → Idea (draft, provenance incident:#NNNN) → [human] Mirror → Goal → Kernel
//
// "Le système a appris du MONDE, pas de lui-même." An Incident is REALITY — a
// recurring failure / a breached budget that NO existing fixture covers (the kernel
// was incomplete, "faux par omission", KRD §67/§1316). It carries a cause_SKETCH (a
// root-cause HYPOTHESIS, never an asserted truth) and the incident_derived taint; and
// — BY CONSTRUCTION — it has NO version-freeze and NO mirror. That double absence is
// EXACTLY what makes it reality and not a truth: an incident PROPOSES a mirror, it is
// not one. The Incident type makes both unrepresentable (there is no Version and no
// Mirror field).
//
// The RealityMirror is four pure functions over the external loop:
//
//   - Observe(in) → Incident — record a recurring failure / budget breach as a
//     content-addressed incident (reality, below the wall); the taint travels.
//   - Learn(incident) → IdeaCandidate — map the incident into the SHAPE of an S27
//     idea (proposes/intent/provenance:incident:#NNNN). `proposes` is inferred ONLY
//     when the signal pins it, else left UNSET with an OpenQuestion (never guessed).
//   - ToIdea(candidate) → ideas.Idea — the ONLY outward edge: hand the candidate to
//     the S27 idea-intake as a `draft` idea. ToIdea performs NO kernel write.
//   - ToKernel(incident) → *BlockReason — the GATE: it ALWAYS refuses the direct edge
//     Incident → Kernel, returning REALITY_CANNOT_DECLARE_TRUTH — judging that the
//     world disagrees with the kernel is a TRUTH DECISION, above the line (KRD §1099).
//
// THE WALL (CLAUDE.md §2): this package writes NOTHING — every function returns
// VALUES. Persistence of an incidents.incident row rides the agent's INSERT/SELECT
// grant on incidents.* (reality is BELOW the waterline); the idea capture rides the
// S27 ideas.* grant; the kernel write at the far end of the flow is the aidos CLI
// role via /goal, never this package and never an incident.
//
// REUSE, DON'T REINVENT: the content address reuses S01/S02's records.Hash/
// Canonicalize (never forked); the BlockReason is S13's blockreason.BlockReason; the
// taint vocabulary is S30's firewall.Taint; the idea handoff targets S27's ideas.Idea
// (the lifecycle/promotion-gate are NOT re-implemented here).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every function is PURE and TOTAL — no DB, no
// clock, no rng, no I/O, never panics. Same input ⇒ same output; the reproducibility
// mirror reality_property_test.go pins it.
package reality

import (
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Signal is the observed reality of an incident (KRD §67): the failing
// operation/journey reference, the error/breach observed, and the recurrence count.
// It is a faithful record of what the world DID — never a hypothesis (that is the
// CauseSketch) and never an asserted truth.
type Signal struct {
	// Operation is the failing operation / journey reference (e.g. "createOrder").
	Operation string `json:"operation"`
	// Error is the observed failure / breached budget (e.g. "30% fail", verbatim).
	Error string `json:"error"`
	// Recurrence is how many times the signal has been observed. Re-observing the
	// same incident increments it; it never shrinks (append-only).
	Recurrence int `json:"recurrence"`
}

// Incident is REALITY (KRD §67/§1316) — a recurring failure / breached budget that no
// existing fixture covers. It carries a Signal (what the world did), a CauseSketch (a
// root-cause HYPOTHESIS, never falsifiable), the incident_derived taint, and the DAG
// branches it relates to. It has NO Version (no freeze) and NO Mirror: those two
// absences are what distinguish an incident from a truth, and the type makes them
// UNREPRESENTABLE. The ID is the content hash of the canonical body (S01/S02). The
// IdeaID is set once /learn has handed the incident to the S27 door (the loop traced
// back); it is empty until then.
type Incident struct {
	// ID is the SHA-256 hex content hash of the canonical body (content-addressed, S01/S02).
	ID string `json:"id"`
	// Ref is the human incident reference "#NNNN" carried VERBATIM into the idea provenance.
	Ref string `json:"ref"`
	// Signal is the observed reality (operation / error / recurrence).
	Signal Signal `json:"signal"`
	// CauseSketch is a root-cause HYPOTHESIS in prose — NOT a falsifiable assertion, NOT a
	// truth (KRD §53: "une spéculative = hypothèse"). The missing mirror's assertion is the
	// human's to write at /goal, never invented here.
	CauseSketch string `json:"cause_sketch"`
	// Taint is the closed-enum provenance-quality marker set (S30). It always CONTAINS
	// incident_derived; it travels onto the idea's provenance reasoning.
	Taint []firewall.Taint `json:"taint"`
	// LinkedBranches are the DAG branches this incident relates to (KRD §927
	// incident_related_branches). May be empty.
	LinkedBranches []string `json:"linked_branches"`
	// IdeaID is the id of the draft idea /learn produced (the loop traced back). Empty
	// until /learn has run.
	IdeaID string `json:"idea_id,omitempty"`
}

// ObserveInput is the pure input to Observe. It mirrors the Incident fields minus the
// ID (which Observe computes as the content hash) and the IdeaID (set later by Learn).
type ObserveInput struct {
	Ref            string
	Signal         Signal
	CauseSketch    string
	Taint          []firewall.Taint
	LinkedBranches []string
}

// canonicalBody is the content-addressed JSONB shape of an incident. There is — by
// construction — NO "version" key and NO "mirror" key: an incident cannot carry the
// thing that would make it a truth. The ID and IdeaID are EXCLUDED from the address
// (the id IS the address; the idea_id is lifecycle metadata set after /learn — it does
// not change the incident's identity).
type canonicalBody struct {
	Kind           string           `json:"kind"` // always "incident" — namespaces the hash
	Ref            string           `json:"ref"`
	Signal         Signal           `json:"signal"`
	CauseSketch    string           `json:"cause_sketch"`
	Taint          []firewall.Taint `json:"taint"`
	LinkedBranches []string         `json:"linked_branches"`
}

// CanonicalBody returns the canonical JSON bytes whose hash is the incident id. It
// REUSES records.Canonicalize (key-sorted, deterministic) — never a forked hashing
// path. The body carries no version and no mirror key (the property mirror pins that).
func (i Incident) CanonicalBody() ([]byte, error) {
	taint := i.Taint
	if taint == nil {
		taint = []firewall.Taint{}
	}
	branches := i.LinkedBranches
	if branches == nil {
		branches = []string{}
	}
	raw, err := json.Marshal(canonicalBody{
		Kind:           "incident",
		Ref:            i.Ref,
		Signal:         i.Signal,
		CauseSketch:    i.CauseSketch,
		Taint:          taint,
		LinkedBranches: branches,
	})
	if err != nil {
		return nil, fmt.Errorf("reality: marshal canonical body: %w", err)
	}
	return records.Canonicalize(raw)
}

// Observe records a recurring failure / budget breach as a content-addressed Incident.
// The id is the content hash of the canonical body (S01/S02 reused). The incident_derived
// taint is GUARANTEED present (added if the caller omitted it). Pure: same input ⇒ same
// incident (same id). An observed incident has no version and no mirror — it is reality,
// not truth.
func Observe(in ObserveInput) (Incident, error) {
	inc := Incident{
		Ref:            in.Ref,
		Signal:         in.Signal,
		CauseSketch:    in.CauseSketch,
		Taint:          ensureIncidentDerived(in.Taint),
		LinkedBranches: append([]string(nil), in.LinkedBranches...),
	}
	canon, err := inc.CanonicalBody()
	if err != nil {
		return Incident{}, err
	}
	inc.ID = records.Hash(canon)
	return inc, nil
}

// ensureIncidentDerived returns a copy of taint that is guaranteed to contain
// incident_derived (KRD §67: a reality-sourced signal always carries the taint). The
// order of the caller's taints is preserved; incident_derived is appended only if absent.
func ensureIncidentDerived(taint []firewall.Taint) []firewall.Taint {
	out := append([]firewall.Taint(nil), taint...)
	for _, t := range out {
		if t == firewall.TaintIncidentDerived {
			return out
		}
	}
	return append(out, firewall.TaintIncidentDerived)
}

// IdeaCandidate is the result of mapping an incident through Learn: the SHAPE of an S27
// idea (proposes/intent/provenance), plus the OpenQuestion when `proposes` could not be
// inferred from the signal, and the explicit proof that NO kernel write occurred.
type IdeaCandidate struct {
	// Idea is the DRAFT candidate-truth (S27) the incident sketches. It carries no version
	// and no mirror (the ideas.Idea type makes both unrepresentable); it must STILL acquire
	// its mirror via /goal to ever reach the kernel.
	Idea ideas.Idea `json:"idea"`
	// ProposesPinned reports whether the signal PINNED the `proposes` kind. When false, the
	// idea's Proposes is left UNSET and OpenQuestion carries the honest "could not infer"
	// note — a kind is NEVER guessed (CLAUDE.md §8 honesty).
	ProposesPinned bool `json:"proposes_pinned"`
	// OpenQuestion is the recorded uncertainty when `proposes` is unpinned (else empty). It
	// is surfaced (provenance), never silently resolved by a guess.
	OpenQuestion string `json:"open_question,omitempty"`
	// WroteKernel is ALWAYS false — Learn performs no kernel write. The field exists so the
	// RealityMirror's no-kernel-write guarantee is explicit and testable.
	WroteKernel bool `json:"wrote_kernel"`
}

// InferProposes maps a signal to the S27 `proposes` kind ONLY when the signal pins it,
// returning (kind, true). When the signal does not pin a kind, it returns ("", false) —
// an unset proposes that Learn surfaces as an OpenQuestion (never a guess, CLAUDE.md §8).
//
// The conservative mapping: a failing OPERATION reference pins ProposesOperation (the
// missing mirror would target that operation's behaviour). Anything else is unpinned —
// we do NOT guess invariant/control/policy from an error string. This is deliberately
// minimal; widening the inference is a later /goal, not a guess here.
func InferProposes(sig Signal) (ideas.Proposes, bool) {
	if sig.Operation != "" {
		return ideas.ProposesOperation, true
	}
	return "", false
}

// Learn maps an incident into the SHAPE of an S27 idea (KRD §117: "la réalité injecte
// des IDÉES"). The idea is a DRAFT whose:
//   - provenance points back to the incident VERBATIM (source incident, detail = Ref),
//   - intent is the incident's cause SKETCH (a hypothesis the missing mirror would assert
//     — never invented as truth here),
//   - proposes is inferred ONLY when the signal pins it (InferProposes); else left UNSET
//     with an OpenQuestion.
//
// The idea is content-addressed by S27's scheme (ideas.Hashed). It carries no version and
// no mirror — it must STILL acquire its mirror via /goal to reach the kernel. Learn
// performs NO kernel write (WroteKernel == false). Pure: no DB, no clock, no rng.
func Learn(inc Incident) (IdeaCandidate, error) {
	proposes, pinned := InferProposes(inc.Signal)
	draft := ideas.Idea{
		Proposes: proposes, // unset ("") when unpinned — never guessed
		Intent:   inc.CauseSketch,
		Provenance: ideas.Provenance{
			Source: ideas.ProvenanceIncident,
			Detail: inc.Ref, // "#NNNN" carried verbatim
		},
		Status: ideas.StatusDraft,
	}
	hashed, err := ideas.Hashed(draft)
	if err != nil {
		return IdeaCandidate{}, fmt.Errorf("reality: learn: %w", err)
	}
	cand := IdeaCandidate{
		Idea:           hashed,
		ProposesPinned: pinned,
		WroteKernel:    false,
	}
	if !pinned {
		cand.OpenQuestion = fmt.Sprintf(
			"OQ: the signal for incident %s does not pin a `proposes` kind — left unset (not guessed). "+
				"The human decides the targeted layer when writing the mirror at /goal.", inc.Ref)
	}
	return cand, nil
}

// ToIdea is the ONLY outward edge from a RealityMirror: it returns the DRAFT idea the
// candidate sketches, ready to be handed to the S27 idea-intake door (idea_capture). It
// is the single seam to S27; there is no other outward edge (no path to kernel/mirrors).
// ToIdea performs NO kernel write. Pure.
func ToIdea(cand IdeaCandidate) ideas.Idea {
	return cand.Idea
}

// LearnedIncident returns inc with IdeaID set to the draft idea's id — the loop traced
// back (incident.idea_id == idea.id, KRD §67). It does NOT mutate the incident's content
// address: idea_id is lifecycle metadata excluded from the canonical body. Pure.
func LearnedIncident(inc Incident, cand IdeaCandidate) Incident {
	inc.IdeaID = cand.Idea.ID
	return inc
}

// ToKernel is the GATE (KRD §53/§1099): it ALWAYS refuses the direct edge
// Incident → Kernel, returning the actionable REALITY_CANNOT_DECLARE_TRUTH BlockReason —
// REGARDLESS of recurrence, taint, or how confident the cause sketch reads. There is no
// "high-recurrence" bypass: judging that the world disagrees with the kernel is a TRUTH
// DECISION, above the line, owned by human + reality, not the agent. It returns a
// *BlockReason (never nil) and NEVER a kernel write — this package has no grant and writes
// nothing. Pure, total.
func ToKernel(inc Incident) *blockreason.BlockReason {
	br := blockreason.For(blockreason.CodeRealityCannotDeclareTruth)
	return &br
}
