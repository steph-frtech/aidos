// propose.go — S85 WIRING: when a build-loop turn reaches GREEN over a truth-implying goal,
// the loop PROPOSES a ChangeSet (proposed, never admitted) instead of writing the truth. This
// is the buildloop side of the S85 seam (back/runtime/buildloop/approval owns the gate); here
// we only project a green TurnOutput into the truth-write the loop's work implied, and hand it
// to approval.ProposeTruth.
//
// THE WALL (CLAUDE.md §2). ProposeOnGreen NEVER writes a truth. It returns a `proposed`
// proposal (or a BlockReason on a guard). The loop's direct write to a truth target was already
// refused in Drive (agentrun.ApplyWall stamps Autorisee=false, AGENT_WRITE_ABOVE_WATERLINE);
// THIS function is the legal alternative — propose, then a human admits (approval.Decide).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). ProposeOnGreen is a PURE, TOTAL function of its inputs —
// it only inspects the turn's verdict and projects the (declared) implied truth. No clock, no
// rng, no I/O, no LLM. Same input ⇒ same proposal (the approval property mirror pins the
// downstream determinism).
package buildloop

import (
	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/buildloop/approval"
)

// authorityTruthKind converts the declared kind string into the authority TruthKind the
// approval gate keys on (a typed conversion, no validation — the AuthorityGraph match handles
// an unknown kind deterministically). Pure.
func authorityTruthKind(kind string) authority.TruthKind { return authority.TruthKind(kind) }

// ImpliedTruth is the truth a build-loop turn's GREEN work implies — declared by the goal it
// drove, NEVER inferred by the LLM. It carries the kernel target the truth would write, its
// domain + epistemic kind (for the S16/S63 authority decision), and the mirror that proves it
// (the green mirror the loop just made pass). It is the structural bridge from "the loop reached
// green" to "here is the truth, with its proof, to propose".
type ImpliedTruth struct {
	Target    string `json:"target"`     // the above-waterline kernel target the truth writes
	Domain    string `json:"domain"`     // the kernel domain (the AuthorityGraph scope)
	TruthKind string `json:"truth_kind"` // the epistemic kind (one of the seven §13.4)
	Mirror    string `json:"mirror"`     // the green mirror that proves the truth
}

// ProposeOnGreen is the S85 wiring: given a build-loop turn that terminated GREEN over a
// truth-implying goal, it PROPOSES the implied truth as a `proposed` ChangeSet (never admitted),
// content-addressed and carrying the AgentRun that produced it. It returns (nil-proposal, nil)
// when the turn is NOT green (a non-green turn implies no truth to land — nothing to propose
// yet), or a BlockReason when the proposal is refused (a monster / a non-truth target — the
// approval guards). It writes NOTHING: a human admits the returned proposal via approval.Decide.
//
// `spec` is the SAME governed agent spec Drive stamped its actions with (so the wall verdict is
// identical). Pure, total, deterministic.
func ProposeOnGreen(spec agentlayer.AgentSpec, project string, out TurnOutput, truth ImpliedTruth) (*approval.AgentTruthProposal, *blockreason.BlockReason) {
	// A non-green turn implies no truth to land — there is nothing to propose yet.
	if out.Decision.Verdict != VerdictGreen {
		return nil, nil
	}
	p, br := approval.ProposeTruth(spec, project, out.Run.ID, approval.TruthWrite{
		Target:    truth.Target,
		Domain:    truth.Domain,
		TruthKind: authorityTruthKind(truth.TruthKind),
		Mirror:    truth.Mirror,
		DiffHash:  lastDiffHash(out.History),
	})
	if br != nil {
		return nil, br
	}
	return &p, nil
}

// lastDiffHash returns the diff-hash of the most recent iteration (the green turn's diff), or
// "" for an empty history. Pure.
func lastDiffHash(h History) string {
	if len(h) == 0 {
		return ""
	}
	return h[len(h)-1].DiffHash
}
