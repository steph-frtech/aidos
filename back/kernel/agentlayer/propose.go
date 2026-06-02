package agentlayer

import (
	"errors"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// ProposalStatus is the lifecycle status of an agent's proposal. There are exactly
// two states a CoucheAgent can SEE: `proposed` (what Propose yields) and `admitted`
// (what only a HUMAN authority, S16, can reach). An agent NEVER reaches `admitted`
// on its own — that is the circularity the wall forbids (CLAUDE.md §8).
type ProposalStatus string

const (
	// StatusProposed — the agent has PROPOSED; the proposal is un-admitted. This is
	// the ONLY status Propose ever returns.
	StatusProposed ProposalStatus = "proposed"
	// StatusAdmitted — a HUMAN authority (S16 AuthorityGraph) has admitted the
	// proposal. An agent can never set this for itself.
	StatusAdmitted ProposalStatus = "admitted"
)

// Proposal is a BDD-writer agent's proposed scenario/truth. It is NEVER a truth: it
// must route through idea → mirror → /goal → AuthorityGraph admission (S16/S27/S29)
// and acquire a HUMAN approver before it can be admitted. RequiresAuthority names the
// human approver(s) it must pass — it is never empty (an agent never self-admits).
type Proposal struct {
	Scenario          string           `json:"scenario"`           // the proposed scenario prose / candidate-truth
	ProposedBy        string           `json:"proposed_by"`        // the CoucheAgent that proposed it
	Status            ProposalStatus   `json:"status"`             // ALWAYS "proposed" out of Propose
	RequiresAuthority []authority.Role `json:"requires_authority"` // the HUMAN approver(s) it must pass (S16)
	Route             []string         `json:"route"`              // the door it must walk: idea → mirror → /goal → approbation
}

// ErrAgentCannotPropose — Propose was called on a CoucheAgent that may not propose a
// truth/mirror (neither PeutProposerVerite nor PeutModifierMiroir is set).
var ErrAgentCannotPropose = errors.New("agentlayer: agent has no propose right (peut_proposer_verite / peut_modifier_miroir)")

// canonicalRoute is the only door a proposal walks (KRD §2): idea → mirror → /goal →
// approbation. Declared, never invented per call.
var canonicalRoute = []string{"idea", "mirror", "goal", "approbation"}

// Propose is the PURE proposal gesture for a BDD-writer agent. A CoucheAgent with a
// propose right (PeutProposerVerite or PeutModifierMiroir) yields a Proposal with
// Status == "proposed" (NEVER "admitted") and RequiresAuthority == the layer's S16
// approvers — the HUMAN authority that must admit it. It writes NOTHING (no kernel,
// no mirror): the scenario must route idea → mirror → /goal → approbation (S27/S29/
// S16). An agent NEVER self-admits — Propose has no path to "admitted". Pure, total,
// deterministic. Returns ErrAgentCannotPropose if the agent has no propose right.
func Propose(c CoucheAgent, scenario string) (Proposal, error) {
	if !c.Spec.PeutProposerVerite && !c.Spec.PeutModifierMiroir {
		return Proposal{}, ErrAgentCannotPropose
	}
	return Proposal{
		Scenario:          scenario,
		ProposedBy:        c.Spec.Role,
		Status:            StatusProposed,
		RequiresAuthority: append([]authority.Role{}, c.Autorite.Approvers...),
		Route:             append([]string{}, canonicalRoute...),
	}, nil
}

// ApproveDecision is the verdict of an admission attempt on a proposal. There are
// exactly two outcomes: admitted (only by a HUMAN approver in the graph) or blocked.
type ApproveDecision struct {
	Status      ProposalStatus           `json:"status"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// Approve is the PURE admission gate over a proposal. The approver must be a HUMAN
// authority in the proposing layer's S16 AuthorityGraph approvers — and must NOT be
// the proposing agent itself (an agent is NEVER an authority; self-approval is the
// circularity the wall forbids, CLAUDE.md §8). A self-approve attempt (approver ==
// the proposing agent's role, or any role not in the approver set) is BLOCKED with
// AGENT_WRITE_ABOVE_WATERLINE and the proposal stays `proposed`. Only a human
// approver in the graph admits. Pure, total, deterministic.
func Approve(c CoucheAgent, p Proposal, approver authority.Role) ApproveDecision {
	// An agent is never an authority — it can never approve its own (or any) proposal.
	if string(approver) == p.ProposedBy || string(approver) == c.Spec.Role || string(approver) == c.Spec.Nom {
		br := blockreason.For(blockreason.CodeAgentWriteAboveWaterline)
		return ApproveDecision{Status: StatusProposed, BlockReason: &br}
	}
	// Only a HUMAN approver named in the S16 graph admits.
	for _, a := range c.Autorite.Approvers {
		if a == approver {
			return ApproveDecision{Status: StatusAdmitted}
		}
	}
	// Any other approver is not in the graph — blocked, still proposed.
	br := blockreason.For(blockreason.CodeAgentWriteAboveWaterline)
	return ApproveDecision{Status: StatusProposed, BlockReason: &br}
}
