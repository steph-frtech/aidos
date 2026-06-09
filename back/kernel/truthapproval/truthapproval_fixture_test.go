package truthapproval

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/authority"
)

// appliedAt is a fixed timestamp — the flow is pure (no time.Now()), so the test passes a constant.
var appliedAt = time.Date(2026, 6, 9, 12, 0, 0, 0, time.UTC)

// graph is the {checkout, behaviour} AuthorityGraph used by the fixtures: two required approvers,
// one veto role, one escalation role.
func graph() authority.AuthorityGraph {
	return authority.AuthorityGraph{
		Domain:     "checkout",
		TruthKind:  "behaviour",
		Approvers:  []authority.Role{"product_owner", "security"},
		Veto:       []authority.Role{"legal"},
		Escalation: []authority.Role{"architecture_board"},
	}
}

func mirrorDelta() *changeset.Delta {
	return &changeset.Delta{Kind: "add", Target: "Order.discount.mirror", Body: json.RawMessage(`{"gherkin":"..."}`)}
}
func specDelta() *changeset.Delta {
	return &changeset.Delta{Kind: "add", Target: "Order.discount", Body: json.RawMessage(`{"ast":"..."}`)}
}

func baseProposal(actor Actor, head string, granted []authority.Role) Proposal {
	return Proposal{
		Actor:   actor,
		Truth:   authority.Truth{Domain: "checkout", TruthKind: "behaviour"},
		Head:    head,
		Granted: granted,
		Label:   "add order discount",
		Spec:    specDelta(),
		Mirror:  mirrorDelta(),
	}
}

// FIXTURE (done criterion): un veto bloque une approbation — la vérité n'atterrit pas.
func TestFixture_VetoBlocksApproval(t *testing.T) {
	p := baseProposal("alice", "head-0", []authority.Role{"product_owner", "security", "legal"})
	d := Approve(graph(), p, "head-0", appliedAt, nil)
	if d.Outcome != OutcomeBlocked {
		t.Fatalf("veto must block the approval; got %s", d.Outcome)
	}
	if d.Admission.BlockReason == nil || d.Admission.BlockReason.Code != authority.CodeVetoed {
		t.Fatalf("expected a VETOED BlockReason, got %+v", d.Admission.BlockReason)
	}
	if d.NewHead != "" {
		t.Fatalf("a vetoed write must not move the head; got NewHead=%q", d.NewHead)
	}
}

// FIXTURE (done criterion): un override est enregistré avec provenance (changeset + ADR + actor).
func TestFixture_OverrideIsRecordedWithProvenance(t *testing.T) {
	p := baseProposal("alice", "head-0", []authority.Role{"product_owner", "security", "legal"})
	ovr := &OverrideRecord{By: "cto", Reason: "incident hotfix, legal cleared verbally", ADR: "ADR-0016"}
	d := Approve(graph(), p, "head-0", appliedAt, ovr)
	if d.Outcome != OutcomeApplied {
		t.Fatalf("a fully-recorded override must let the write land; got %s", d.Outcome)
	}
	if d.Override == nil || !d.Override.IsRecorded() {
		t.Fatalf("the override must be recorded with provenance; got %+v", d.Override)
	}
	if d.Override.By != "cto" || d.Override.ADR != "ADR-0016" {
		t.Fatalf("override provenance wrong: %+v", d.Override)
	}
	if d.NewHead == "" || d.Envelope.Status != changeset.StatusApplied {
		t.Fatalf("the overridden write must produce an APPLIED envelope + new head; got %+v", d.Envelope)
	}
}

// FIXTURE: an override missing its ADR is a silent bypass — REFUSED (the block stands).
func TestFixture_OverrideWithoutADRIsRefused(t *testing.T) {
	p := baseProposal("alice", "head-0", []authority.Role{"product_owner", "security", "legal"})
	ovr := &OverrideRecord{By: "cto", Reason: "hotfix"} // no ADR
	d := Approve(graph(), p, "head-0", appliedAt, ovr)
	if d.Outcome != OutcomeBlocked {
		t.Fatalf("an unrecorded override must not bypass the veto; got %s", d.Outcome)
	}
	if d.Override != nil {
		t.Fatalf("an unrecorded override must not be attached; got %+v", d.Override)
	}
}

// FIXTURE: missing approval (no approver granted) blocks with MISSING_AUTHORITY_APPROVAL.
func TestFixture_MissingApprovalBlocks(t *testing.T) {
	p := baseProposal("alice", "head-0", nil)
	d := Approve(graph(), p, "head-0", appliedAt, nil)
	if d.Outcome != OutcomeBlocked {
		t.Fatalf("no approval must block; got %s", d.Outcome)
	}
	if d.Admission.BlockReason == nil || d.Admission.BlockReason.Code != authority.CodeMissingAuthorityApproval {
		t.Fatalf("expected MISSING_AUTHORITY_APPROVAL; got %+v", d.Admission.BlockReason)
	}
}

// FIXTURE: partial approval (1 of 2 approvers) escalates, head unmoved.
func TestFixture_PartialApprovalEscalates(t *testing.T) {
	p := baseProposal("alice", "head-0", []authority.Role{"product_owner"})
	d := Approve(graph(), p, "head-0", appliedAt, nil)
	if d.Outcome != OutcomeEscalated {
		t.Fatalf("partial approval must escalate; got %s", d.Outcome)
	}
	if d.NewHead != "" {
		t.Fatalf("an escalated write must not move the head")
	}
}

// GODOG (done criterion): deux membres proposent concurremment au MÊME head ; aucune écriture
// n'écrase silencieusement l'autre (anti-overwrite §9) — le SECOND apply est refusé STALE_HEAD,
// jamais last-write-wins. Le conflit se résout en re-rejouant les miroirs (merge-semantic, S25).
func TestGodog_TwoConcurrentProposalsNoOverwrite(t *testing.T) {
	granted := []authority.Role{"product_owner", "security"}
	alice := baseProposal("alice", "head-0", granted)
	bob := baseProposal("bob", "head-0", granted)
	bob.Label = "bob changes the same discount" // a DIFFERENT envelope, SAME head + target

	decisions := ApplyConcurrent(graph(), "head-0", []Proposal{alice, bob}, appliedAt)
	if len(decisions) != 2 {
		t.Fatalf("expected 2 recorded decisions, got %d", len(decisions))
	}
	// The FIRST lands.
	if decisions[0].Outcome != OutcomeApplied || decisions[0].NewHead == "" {
		t.Fatalf("the first concurrent apply must land; got %+v", decisions[0])
	}
	// The SECOND is refused — never last-write-wins.
	if decisions[1].Outcome != OutcomeStaleHead {
		t.Fatalf("the second concurrent apply must be refused STALE_HEAD (anti-overwrite §9); got %s", decisions[1].Outcome)
	}
	if decisions[1].StaleAgainst != decisions[0].NewHead {
		t.Fatalf("the stale proposal must point at the new head to re-run its mirrors; got %q want %q",
			decisions[1].StaleAgainst, decisions[0].NewHead)
	}
	// THE anti-overwrite invariant: exactly ONE write landed.
	if AppliedCount(decisions) != 1 {
		t.Fatalf("exactly one concurrent write may land (no overwrite); got %d", AppliedCount(decisions))
	}
	stale := StaleProposals(decisions)
	if len(stale) != 1 || stale[0] != "bob" {
		t.Fatalf("bob must be the member who re-runs the mirrors; got %v", stale)
	}
}

// GODOG: the refused member re-proposes against the NEW head and now lands (the conflict resolved
// by re-running against the moved head, merge-semantic having decided the merge is clean).
func TestGodog_StaleProposalRelandsAgainstNewHead(t *testing.T) {
	granted := []authority.Role{"product_owner", "security"}
	alice := baseProposal("alice", "head-0", granted)
	d1 := Approve(graph(), alice, "head-0", appliedAt, nil)
	if d1.Outcome != OutcomeApplied {
		t.Fatalf("alice must land; got %s", d1.Outcome)
	}
	newHead := d1.NewHead

	// bob was stale against head-0; he re-runs his mirrors against newHead and re-proposes.
	bob := baseProposal("bob", newHead, granted)
	bob.Label = "bob re-applies against the new head"
	d2 := Approve(graph(), bob, newHead, appliedAt, nil)
	if d2.Outcome != OutcomeApplied {
		t.Fatalf("the re-run proposal against the fresh head must land; got %s (stale=%q)", d2.Outcome, d2.StaleAgainst)
	}
	if d2.NewHead == newHead || d2.NewHead == "" {
		t.Fatalf("bob's landed write must move the head again; got %q", d2.NewHead)
	}
}

// FIXTURE: a spec-without-mirror envelope is refused by the completeness gate even when admitted
// and fresh — the wall's completeness law (KRD §98), surfaced as Blocked.
func TestFixture_SpecWithoutMirrorBlockedByCompleteness(t *testing.T) {
	p := baseProposal("alice", "head-0", []authority.Role{"product_owner", "security"})
	p.Mirror = nil // a spec with no mirror — a monster
	d := Approve(graph(), p, "head-0", appliedAt, nil)
	if d.Outcome != OutcomeBlocked {
		t.Fatalf("a spec-without-mirror write must be blocked by completeness; got %s", d.Outcome)
	}
}
