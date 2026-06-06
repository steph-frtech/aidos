package compound

// CE03 — the /compound gesture. At a goal's CLOSE, it CAPITALISES the durable motif graven by
// CE02 (and proven by the CE01 spike): the GESTURE pattern becomes a KindProcedural memory
// write-input (S31, /brain fuel below the line), and the SPEC pattern becomes a DRAFT
// behavior-candidate idea proposed through the ONLY legal door, firewall.ViaIdea (idée → miroir →
// /goal → approbation humaine).
//
// THE WALL (CLAUDE.md §2). Compound WRITES NOTHING — it returns VALUES: a memory.WriteInput the
// /brain store would later append (below the waterline) and an firewall.IdeaCandidate whose
// WroteKernel is ALWAYS false. There is no path from this gesture to the kernel/mirrors/fitness;
// the capitalisation never edits a weight or a criterion (CAPITALISATION ≠ APPRENTISSAGE DE
// CRITÈRES, the CE02 frontier). The capture happens ONLY for a GREEN, closed goal — an in-flight
// or failed goal capitalises NOTHING.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Compound is a PURE, TOTAL function — no DB, no clock, no
// rng, no I/O, never panics. Same GoalClose ⇒ same events (the content-addressed ids are stable
// because the captured bodies are deterministic). The reproducibility mirror
// compound_property_test.go pins it. No LLM sits in the capture loop: WHAT to capitalise is the
// DECLARED CE02 table (capitalisation.go), not a judgment.

import (
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/archive/brain/memory"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// GoalClose is the input to /compound: a goal that has just reached its stop condition, plus its
// captured motif split into the two CE02 channels. Green gates the whole capture (capitalisation
// is a CLOSE event); GoalID + Branch make the captured memory branch-aware and traceable.
type GoalClose struct {
	// GoalID is the closed goal's id — carried into provenance ("who wanted what", KRD §119).
	GoalID string
	// Branch is the DAG branch the goal closed on; the captured memory is branch-aware (S31).
	Branch string
	// Green is true iff the goal closed GREEN (its red set went green ∧ prior green intact ∧
	// mutation ≥ threshold ∧ no monster, CLAUDE.md §8). Only a green goal capitalises.
	Green bool
	// GesturePattern is the ordered list of reusable GESTURE units (load the ContextPack, scaffold
	// the package, project Go/TS, wire the control, run the sensors). It becomes ONE KindProcedural
	// memory recall (the ChannelProceduralMemory sink of the CE02 table).
	GesturePattern []string
	// SpecPattern is the ordered list of reusable SPEC units (derive the mirror, write the fixture,
	// cross the contract). It becomes ONE candidate behavior-macro proposed via firewall.ViaIdea
	// (the ChannelBehaviorMacro sink). Its expansion (CE04) is a pure dry-run, never learning.
	SpecPattern []string
}

// Capture is the result of /compound — the events the gesture emits. It is VALUES only: the
// procedural memory write-inputs the /brain store would append, and the behavior-candidate ideas
// proposed via the wall. NOTHING here is a kernel write (WroteKernel proves it).
type Capture struct {
	// ProceduralWrites are the KindProcedural memory.WriteInput entries (≤ 1 — one motif per goal).
	// They are write-INPUTS, not writes: persistence rides the agent's grant on brain.* later.
	ProceduralWrites []memory.WriteInput
	// BehaviorCandidates are the DRAFT ideas proposed through firewall.ViaIdea (≤ 1). Each carries
	// no version and no mirror; it must STILL acquire its mirror via /goal to ever reach the kernel.
	BehaviorCandidates []firewall.IdeaCandidate
}

// WroteKernel reports whether ANY emitted event wrote kernel truth. It is ALWAYS false — the field
// exists so the wall guarantee is explicit and testable (every behavior candidate carries the
// firewall's WroteKernel=false; this gesture has no other sink that could write truth).
func (c Capture) WroteKernel() bool {
	for _, b := range c.BehaviorCandidates {
		if b.WroteKernel {
			return true
		}
	}
	return false
}

// Compound runs the /compound gesture over a closed goal. PURE, TOTAL.
//
//   - A non-green goal capitalises NOTHING (empty Capture, no error).
//   - A green goal with a gesture pattern emits ONE KindProcedural memory write-input.
//   - A green goal with a spec pattern emits ONE DRAFT behavior-candidate idea via firewall.ViaIdea
//     (Status=draft, the "proposed" candidate; WroteKernel=false — the wall).
//
// What flows through which channel is the DECLARED CE02 table (CapitalisationDecisions), never an
// LLM judgment — determinism-first.
func Compound(g GoalClose) (Capture, error) {
	var out Capture
	if !g.Green {
		// Capitalisation is a CLOSE event; an in-flight or failed goal yields nothing.
		return out, nil
	}

	// Channel: gesture_pattern → procedural_memory (CE02). One memory captures the whole motif.
	if len(g.GesturePattern) > 0 {
		out.ProceduralWrites = append(out.ProceduralWrites, memory.WriteInput{
			Kind:       memory.KindProcedural,
			Content:    proceduralContent(g),
			Provenance: provenance(g),
			Confidence: 1.0,
			Taint:      []memory.Taint{memory.TaintUnverified},
			Branch:     g.Branch,
		})
	}

	// Channel: spec_pattern → behavior_macro (CE02), proposed via the ONLY legal door.
	if len(g.SpecPattern) > 0 {
		mem := firewall.MemoryItem{
			Content:    behaviorContent(g),
			Provenance: provenance(g),
			Confidence: 1.0,
			Taint:      []firewall.Taint{firewall.TaintUnverified},
			Branch:     g.Branch,
		}
		canon, err := mem.CanonicalBody()
		if err != nil {
			return Capture{}, fmt.Errorf("compound: address behavior memory: %w", err)
		}
		// The firewall computes the idea's content-address from this captured memory; we set the id
		// so ViaIdea's provenance ("memory:<id>") is stable and deterministic.
		mem.ID = records.Hash(canon)
		cand, err := firewall.ViaIdea(mem)
		if err != nil {
			return Capture{}, fmt.Errorf("compound: propose behavior candidate: %w", err)
		}
		out.BehaviorCandidates = append(out.BehaviorCandidates, cand)
	}

	return out, nil
}

// proceduralContent renders the captured GESTURE motif as the memory's recall fuel — deterministic
// (ordered units, KRD terms verbatim). It is what the router (CE05/MatchRole) recalls to replay a
// similar goal's gestures instead of re-deriving them.
func proceduralContent(g GoalClose) string {
	return fmt.Sprintf(
		"Motif de gestes capitalisé du goal %q (KindProcedural) : %s. Rejoué pour abaisser l'effort du goal suivant similaire ; la mémoire propose, le noyau déclare le vrai.",
		g.GoalID, strings.Join(g.GesturePattern, " · "),
	)
}

// behaviorContent renders the captured SPEC motif as the behavior-candidate's intent — the sketch
// the firewall hands to the S27 idea-intake as a DRAFT idea (its mirror is acquired later via
// /goal; its expansion in CE04 is a pure dry-run, never learning).
func behaviorContent(g GoalClose) string {
	return fmt.Sprintf(
		"Behavior-macro candidate (§24.6) capitalisée du goal %q : %s. À expanser (CE04, fonction pure idempotente) puis figer via /goal — aucune écriture kernel hors du mur.",
		g.GoalID, strings.Join(g.SpecPattern, " · "),
	)
}

// provenance is the audit string carried into every captured event — "who wanted what, when, why"
// (KRD §119): the capitalised motif always traces back to the goal that closed.
func provenance(g GoalClose) string {
	return "compound:" + g.GoalID
}
