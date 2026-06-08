// Package approval is the S85 Runtime/Auth seam — "vérité proposée par l'agent gatée au
// mur + approbation humaine UI" (ROADMAP-app-builder EPIC 8, S85). It closes the build
// loop's only legal path to a TRUTH:
//
//	build-loop work implies a truth  →  PROPOSE a ChangeSet (proposed, NEVER admitted)
//	                                  →  surfaced in a per-project APPROVAL INBOX with its mirror
//	                                  →  a HUMAN holding the scope's authority approves it (S52 + S63)
//	                                  →  ONLY THEN does the truth land (admitted)
//
// THE TWO DONE-CRITERIA THIS PACKAGE PINS (the step's mirrors):
//
//  1. AN AGENT WRITE ABOVE THE WATERLINE IS REFUSED (AGENT_WRITE_ABOVE_WATERLINE). When
//     the build loop's work implies a truth, the loop may NOT write it directly: ProposeTruth
//     REFUSES a direct above-waterline write (it never reaches the kernel/mirrors/fitness) and
//     instead yields a `proposed` ChangeSet. The wall (S04/S52) holds: the agent owns
//     implementation, never truth (CLAUDE.md §2).
//
//  2. A PROPOSED TRUTH REQUIRES HUMAN APPROVAL BEFORE IT LANDS. A proposal is born `proposed`
//     and STAYS proposed until a REAL human holding the scope's authority admits it (Decide,
//     reusing S63 authoritybinding.DecideProposal over the S16 AuthorityGraph). The agent can
//     NEVER reach `admitted` on its own — that is the circularity §8 forbids. A forged
//     `admitted` in memory is re-derived away: Decide computes admission from the authority
//     graph + the roles the real member actually holds, never the self-asserted status.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8 — "the judge is deterministic"). Every function here is
// PURE and TOTAL: no DB, no clock, no rng, no I/O, no LLM. ProposeTruth, Decide, the inbox
// projection are deterministic functions of their arguments — same input ⇒ same verdict (the
// reproducibility property mirror pins it). Whether a build-loop write IMPLIES a truth is a
// pure predicate over the write target (the S04 waterline classifier, agentlayer.MayWrite),
// never a judgment. The proposal id is content-addressed (records.Hash), so re-proposing the
// same truth is idempotent.
//
// THE WALL (CLAUDE.md §2). This package WRITES NOTHING above the line and returns VALUES: the
// proposal, the admission Decision, the inbox. The downstream kernel write stays the aidos CLI
// role through /goal once a human admits. The agent here only PROPOSES and the human only
// DECIDES — neither this code nor the loop ever lands a truth by itself.
package approval

import (
	"encoding/json"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/authoritybinding"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/membership"
)

// ProposalStatus is the lifecycle status of an agent-emitted truth proposal. There are
// exactly two states (REUSING the S52 agentlayer vocabulary): `proposed` — what ProposeTruth
// ever yields — and `admitted` — what ONLY a human authority (S63) can reach via Decide. An
// agent NEVER reaches `admitted` on its own (the circularity the wall forbids, §8).
type ProposalStatus string

const (
	// StatusProposed — the build loop has PROPOSED a truth; the ChangeSet is un-admitted.
	// This is the ONLY status ProposeTruth ever returns.
	StatusProposed ProposalStatus = "proposed"
	// StatusAdmitted — a REAL human holding the scope's authority (S63) has admitted the
	// proposal through Decide. The loop can never set this for itself.
	StatusAdmitted ProposalStatus = "admitted"
)

// TruthWrite is the minimal projection of the truth a build-loop turn implies: the write
// TARGET (the schema/path that resolves above or below the waterline — the wall classifier
// reads this), the kernel DOMAIN + TruthKind (the S16 AuthorityGraph keys on these), and the
// MIRROR that proves it (a truth without a living mirror is a monster, §1/§5 — the inbox
// surfaces the mirror with the proposal so the human approves WHAT IS PROVEN). A TruthWrite
// is the input ProposeTruth gates; it is pure data, no clock, no judgment.
type TruthWrite struct {
	// Target is the write target the wall classifier (agentlayer.MayWrite) inspects: a target
	// resolving above the waterline (kernel / mirrors / fitness) is a truth the agent may not
	// write directly — it must be PROPOSED. Non-empty for a real truth write.
	Target string `json:"target"`
	// Domain is the kernel domain the truth belongs to (the S16 AuthorityGraph.Domain the
	// scope's approver authority keys on, e.g. "checkout"). Non-empty for a real proposal.
	Domain string `json:"domain"`
	// TruthKind is the epistemic kind of the truth (one of the seven KRD §13.4 kinds the
	// AuthorityGraph keys on). Carried verbatim into the admission decision.
	TruthKind authority.TruthKind `json:"truth_kind"`
	// Mirror is the content-address (or ref) of the mirror that PROVES this truth — surfaced
	// in the inbox with the proposal (no monster: the human approves a truth WITH its proof).
	// Non-empty: a proposal with no mirror is refused MISSING_MIRROR (a monster never lands).
	Mirror string `json:"mirror"`
	// DiffHash is the content-hash of the code diff the build loop produced this turn (the
	// AgentRun iteration's diff hash, S52). It links the proposal back to the green build.
	DiffHash string `json:"diff_hash,omitempty"`
}

// AgentTruthProposal is the build loop's PROPOSED ChangeSet for a truth its work implied. It
// is NEVER a truth: it is born `proposed` and must walk idea → mirror → /goal → human
// approval (S52 + S63) before it lands. It is content-addressed (id = records.Hash of the
// canonical body), so re-proposing the byte-identical truth is idempotent (the same id). It
// carries the agent that proposed it (provenance, never a human — the agent owns
// implementation), the truth it proposes, the mirror that proves it, and the canonical route.
type AgentTruthProposal struct {
	// ID is the content address of the proposal body (S01/S02 records.Hash scheme).
	ID string `json:"id"`
	// Status is ALWAYS StatusProposed out of ProposeTruth (never admitted).
	Status ProposalStatus `json:"status"`
	// Project scopes the proposal to its project (S53). Surfaced in the per-project inbox.
	Project string `json:"project"`
	// ProposedByAgent is the build-loop agent identity that proposed it (provenance — the
	// agent, NEVER a human; a human only APPROVES). Non-empty.
	ProposedByAgent string `json:"proposed_by_agent"`
	// Truth is the projection of the truth being proposed (target / domain / kind / mirror).
	Truth TruthWrite `json:"truth"`
	// Route is the door the proposal must walk: idea → mirror → /goal → approbation.
	Route []string `json:"route"`
	// AgentRun is the content-address of the AgentRun (S52) whose green build produced this
	// proposal (the audit link from "the loop reached green" to "here is the truth it implies").
	AgentRun string `json:"agent_run,omitempty"`
}

// canonicalRoute is the only door a proposal walks (KRD §2): idea → mirror → /goal →
// approbation. Declared, never invented per call (mirrors agentlayer.canonicalRoute).
var canonicalRoute = []string{"idea", "mirror", "goal", "approbation"}

// ProposeTruth is the PURE gate the build loop calls when its work IMPLIES a truth. It folds
// the two done-criteria into one verdict:
//
//   - THE WALL (criterion 1). If the write target resolves ABOVE the waterline — i.e. the loop
//     is trying to write the truth DIRECTLY — agentlayer.MayWrite refuses it, and ProposeTruth
//     returns the AGENT_WRITE_ABOVE_WATERLINE BlockReason and NO proposal. The agent never
//     writes a truth; it may only PROPOSE one. (A target that is NOT above the waterline is not
//     a truth at all — ProposeTruth refuses it NOT_A_TRUTH_WRITE: the propose door is only for
//     real truths, so a below-the-line write is not silently wrapped as a fake proposal.)
//
//   - THE MIRROR (no monster, §1/§5). A truth with no mirror is a monster; ProposeTruth refuses
//     a proposal whose Truth.Mirror is empty with MISSING_MIRROR. The inbox always shows a
//     proposal WITH its proof.
//
//   - THE PROPOSAL (criterion 2, the happy path). Otherwise it yields a `proposed`
//     AgentTruthProposal (NEVER admitted), content-addressed, carrying the proposing agent,
//     the truth, its mirror, and the canonical route. It writes NOTHING.
//
// The agent spec is the GOVERNED build-loop spec (S52): the SAME spec the loop's ApplyWall
// stamps with, so the wall verdict here is identical to the one the loop records. Pure, total,
// deterministic — same input ⇒ same verdict (the property mirror pins it).
func ProposeTruth(spec agentlayer.AgentSpec, project, agentRunRef string, tw TruthWrite) (AgentTruthProposal, *blockreason.BlockReason) {
	// (1) THE WALL — the propose door exists BECAUSE the agent may not write a truth directly.
	// A target ABOVE the waterline is a truth: agentlayer.MayWrite REFUSES the direct write.
	dec := agentlayer.MayWrite(spec, tw.Target)
	if dec.Allowed {
		// The target is NOT above the waterline: it is not a truth. The propose door is for
		// truths only — a below-the-line write is never wrapped as a fake proposal.
		br := notATruthWriteReason(tw.Target)
		return AgentTruthProposal{}, br
	}
	// The wall refused the DIRECT write — exactly as it must (AGENT_WRITE_ABOVE_WATERLINE).
	// This refusal IS the reason the proposal path exists; we surface it on the criterion-1
	// fault path (a loop that tries to write directly is refused) AND continue to build the
	// legal proposal below. To distinguish the two callers, ProposeTruth's contract is: it
	// returns a PROPOSAL on the legal path; the direct-write refusal is exposed by
	// RefuseDirectWrite (the criterion-1 mirror) which returns the BlockReason explicitly.

	// (2) NO MONSTER — a truth with no mirror never lands.
	if strings.TrimSpace(tw.Mirror) == "" {
		return AgentTruthProposal{}, missingMirrorReason()
	}

	// (3) THE LEGAL PROPOSAL — proposed, never admitted, content-addressed.
	p := AgentTruthProposal{
		Status:          StatusProposed,
		Project:         strings.TrimSpace(project),
		ProposedByAgent: agentIdentity(spec),
		Truth:           tw,
		Route:           append([]string{}, canonicalRoute...),
		AgentRun:        strings.TrimSpace(agentRunRef),
	}
	id, err := p.contentAddress()
	if err != nil {
		return AgentTruthProposal{}, contentAddressReason(err)
	}
	p.ID = id
	return p, nil
}

// RefuseDirectWrite is the criterion-1 mirror: it asserts that a build loop attempting to
// write a truth DIRECTLY (an above-waterline target) is REFUSED with AGENT_WRITE_ABOVE_WATERLINE
// — the wall holds. It returns the BlockReason on a refused direct write, or nil when the
// target is below the line (no truth, nothing for the wall to refuse). It is the pure
// projection of agentlayer.MayWrite into the S13 BlockReason vocabulary. Pure, total.
func RefuseDirectWrite(spec agentlayer.AgentSpec, target string) *blockreason.BlockReason {
	dec := agentlayer.MayWrite(spec, target)
	if dec.Allowed {
		return nil
	}
	br := blockreason.For(blockreason.CodeAgentWriteAboveWaterline)
	return &br
}

// agentIdentity is the build-loop agent's stable identity for provenance. It prefers the
// spec ID, falling back to the role/name — never empty (a proposal always names its proposer,
// even though the proposer is an AGENT, never a human).
func agentIdentity(spec agentlayer.AgentSpec) string {
	if id := strings.TrimSpace(spec.ID); id != "" {
		return id
	}
	if r := strings.TrimSpace(spec.Role); r != "" {
		return r
	}
	if n := strings.TrimSpace(spec.Nom); n != "" {
		return n
	}
	return "agent"
}

// proposalBody is the deterministic JSON shape the content address hashes over. The status is
// DELIBERATELY excluded from the body: a proposal's identity is its TRUTH, not its lifecycle
// status — so an `admitted` proposal hashes identically to the `proposed` one it came from
// (admission is a transition over the SAME content-addressed proposal, never a new identity).
type proposalBody struct {
	Kind            string     `json:"kind"`
	Project         string     `json:"project"`
	ProposedByAgent string     `json:"proposed_by_agent"`
	Truth           TruthWrite `json:"truth"`
	AgentRun        string     `json:"agent_run"`
}

// ProposalBodyKind namespaces the proposal content address (a proposal and an idea/override
// never collide in the content store).
const ProposalBodyKind = "agent_truth_proposal"

// contentAddress returns the content hash of the proposal's canonical body, REUSING the
// S01/S02 records.Hash / records.Canonicalize scheme (never a forked hashing path).
func (p AgentTruthProposal) contentAddress() (string, error) {
	raw, err := json.Marshal(proposalBody{
		Kind:            ProposalBodyKind,
		Project:         strings.TrimSpace(p.Project),
		ProposedByAgent: strings.TrimSpace(p.ProposedByAgent),
		Truth:           p.Truth,
		AgentRun:        strings.TrimSpace(p.AgentRun),
	})
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// ── DECIDE — the human-approval gate (criterion 2; reuses S52 + S63) ──────────────────────

// AdmissionDecision is Decide's verdict: the resulting proposal status (proposed | admitted),
// the underlying S63 ProposalDecision (the grounded authority verdict + the audit trail of
// the actor and the roles it held), and the S63 BlockReason when refused. A forged `admitted`
// status on the input is IGNORED — the result status is RE-DERIVED from the authority verdict.
type AdmissionDecision struct {
	// Status is the resulting status: StatusAdmitted ONLY when a real human holding the scope's
	// authority approved (the S63 verdict is `admitted`); StatusProposed otherwise (the proposal
	// stays proposed on any block / escalation). NEVER read from the input proposal's status.
	Status ProposalStatus `json:"status"`
	// Decision is the S63 grounded admission verdict (admission + actor + granted roles).
	Decision authoritybinding.ProposalDecision `json:"decision"`
	// BlockReason is the S63-grounded refusal (INSUFFICIENT_AUTHORITY / PLACEHOLDER_ACTOR) when
	// the proposal is not admitted (nil when admitted).
	BlockReason *authoritybinding.BlockReason `json:"block_reason,omitempty"`
}

// Decide is the PURE human-approval gate over a proposed truth — the only path from `proposed`
// to `admitted`. It RE-DERIVES the admission verdict (it NEVER trusts the proposal's
// self-asserted status — a buggy/malicious loop could forge `admitted` in memory): it runs the
// S63 authoritybinding.DecideProposal over the S16 AuthorityGraph, grounding the abstract
// "granted" authority set in the REAL human member (S62 membership × the declared
// AuthorityRoleBinding). The result is StatusAdmitted IFF a real human holding the scope's
// authority approved; otherwise the proposal STAYS StatusProposed with the S63 BlockReason
// (INSUFFICIENT_AUTHORITY when the actor holds none of the scope's authority,
// PLACEHOLDER_ACTOR when the actor is not a real human). An agent can never reach `admitted`:
// it is never a member, never holds authority — its self-approval is structurally impossible
// here. Pure, total, deterministic — same input ⇒ same verdict (the property mirror pins it).
func Decide(
	p AgentTruthProposal,
	graph authority.AuthorityGraph,
	actor authoritybinding.RealActor,
	m *membership.Membership,
	bindings []authoritybinding.AuthorityRoleBinding,
) AdmissionDecision {
	truth := authority.Truth{Domain: p.Truth.Domain, TruthKind: p.Truth.TruthKind}
	dec := authoritybinding.DecideProposal(graph, truth, actor, m, bindings)

	out := AdmissionDecision{Decision: dec, Status: StatusProposed}
	switch dec.Admission.Decision {
	case authority.DecisionAdmitted:
		// A REAL human holding the scope's authority approved — the truth may land.
		out.Status = StatusAdmitted
	default:
		// Blocked or escalated: the proposal STAYS proposed (it never lands without approval).
		out.Status = StatusProposed
		out.BlockReason = dec.BlockReason
	}
	return out
}

// Admitted applies an admission verdict to a proposal, returning the proposal with its status
// transitioned. It is the ONLY mutation of a proposal's status, and it goes ONE WAY: a
// non-admitted Decide leaves the proposal `proposed` (the truth does not land); an admitted
// Decide returns the proposal `admitted`. The content address is UNCHANGED (admission is a
// transition over the same proposal identity, never a new proposal). Pure.
func Admitted(p AgentTruthProposal, d AdmissionDecision) AgentTruthProposal {
	p.Status = d.Status
	return p
}

// ── THE APPROVAL INBOX (the per-project surface of pending agent proposals) ───────────────

// Inbox is the per-project APPROVAL INBOX: the list of agent-emitted truth proposals awaiting
// human approval, each with its mirror. It is a PURE PROJECTION over a set of proposals — the
// Workbench /build-approvals panel renders it. It carries only `proposed` proposals (an
// admitted truth has landed and is no longer pending); the projection is deterministic
// (proposals in stable, sorted-by-id order). It writes nothing.
type Inbox struct {
	// Project scopes the inbox (S53). A proposal from another project never appears here.
	Project string `json:"project"`
	// Pending are the `proposed` proposals awaiting human approval, in stable (sorted-by-id)
	// order, each carrying its mirror (no headless approval — the human approves WHAT IS
	// PROVEN). Admitted proposals are excluded (they have landed).
	Pending []AgentTruthProposal `json:"pending"`
}

// BuildInbox is the PURE inbox projection for a project: it filters the supplied proposals to
// the project's `proposed` ones (an admitted proposal has landed and is no longer pending) and
// returns them in stable, sorted-by-id order. Same proposals ⇒ same inbox (the property mirror
// pins it). Pure, total — a nil/empty input yields an empty inbox, never a panic.
func BuildInbox(project string, proposals []AgentTruthProposal) Inbox {
	project = strings.TrimSpace(project)
	pending := make([]AgentTruthProposal, 0, len(proposals))
	for _, p := range proposals {
		if strings.TrimSpace(p.Project) != project {
			continue
		}
		if p.Status != StatusProposed {
			continue
		}
		pending = append(pending, p)
	}
	sortProposals(pending)
	return Inbox{Project: project, Pending: pending}
}

// sortProposals sorts proposals lexicographically by id (deterministic projection order).
func sortProposals(ps []AgentTruthProposal) {
	for i := 1; i < len(ps); i++ {
		for j := i; j > 0 && ps[j].ID < ps[j-1].ID; j-- {
			ps[j], ps[j-1] = ps[j-1], ps[j]
		}
	}
}

// ── BlockReasons (S85, the §44.5 shape) ───────────────────────────────────────────────────
//
// The canonical S13 codes are REUSED verbatim from the closed registry (CLAUDE.md §9 forbids
// inventing members in blockreason.Code): MISSING_MIRROR (a monster) and
// AGENT_WRITE_ABOVE_WATERLINE (the wall). The two S85-specific cases that have NO closed-enum
// member carry an S85-LOCAL code (the authoritybinding pattern): NOT_A_TRUTH_WRITE and
// PROPOSAL_NOT_ADDRESSED. Each block names its door (how_to_fix non-empty — a wall without a
// fix path is a prison, §44.5). The local-coded reasons project into the canonical BlockReason
// SHAPE so every block site carries one shape.

// notATruthWriteReason — the propose door was called with a target that is NOT above the
// waterline: it is not a truth, so it cannot be PROPOSED as one (a below-the-line write acts
// directly, it never walks the propose→approval door). §44.5 shape, always actionable.
func notATruthWriteReason(target string) *blockreason.BlockReason {
	return &blockreason.BlockReason{
		Code:     blockreason.Code("NOT_A_TRUTH_WRITE"),
		Severity: blockreason.SeverityBlocking,
		Explanation: "La cible « " + target + " » ne résout PAS au-dessus de la ligne de flottaison : ce n'est pas " +
			"une vérité (kernel / mirrors / fitness). La porte propose→ChangeSet→approbation est réservée aux " +
			"vraies vérités ; une écriture below-the-line (archive / projections) agit directement, jamais via " +
			"cette porte (CLAUDE.md §2). Une écriture below-the-line emballée en fausse proposition serait un mensonge.",
		HowToFix: []string{
			"Pour une écriture below-the-line (archive / projection), agissez directement via le chemin store, sans proposition.",
			"Pour une vérité, visez une cible above-the-waterline (kernel / mirrors / fitness) ; la proposition est alors légitime.",
		},
	}
}

// missingMirrorReason — a proposed truth with no mirror is a monster (§1/§5): the inbox never
// surfaces a truth without its proof, and a truth with no living mirror can never land. REUSES
// the canonical MISSING_MIRROR registry entry verbatim (never re-typed).
func missingMirrorReason() *blockreason.BlockReason {
	br := blockreason.For(blockreason.CodeMissingMirror)
	return &br
}

// contentAddressReason — the proposal body could not be content-addressed (a malformed shape).
func contentAddressReason(err error) *blockreason.BlockReason {
	return &blockreason.BlockReason{
		Code:        blockreason.Code("PROPOSAL_NOT_ADDRESSED"),
		Severity:    blockreason.SeverityBlocking,
		Explanation: "la proposition n'a pas pu être adressée par contenu : " + err.Error(),
		HowToFix:    []string{"check_proposal_fields_are_valid"},
	}
}
