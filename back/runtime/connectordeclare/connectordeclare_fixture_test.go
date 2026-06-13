package connectordeclare_test

// connectordeclare_fixture_test.go — the DP24 N2 MIRROR (fixture: state → command →
// events), written BEFORE the implementation (RED → GREEN). It pins the connector-cockpit
// PROPOSE path: a connector DECLARATION (the command) over a clean phase (the state) yields
// a ChangeSet event whose status is DRAFT / proposed, NEVER applied (the wall, CLAUDE.md §2 —
// the agent has no GRANT). It promotes the DP20 connector source into a transactional
// envelope via the S20 changeset engine, REUSING both, forking neither.
//
// reflects=runtime.connectordeclare · test_kind=fixture (N2 state→cmd→events) ·
// cert_language=go-fixture · liveness=live · authority=above (the connector GOVERNANCE rule
// is the human's, graved through idée → miroir → /goal; this fixture only proves the propose
// door opens a DRAFT and STOPS there — the agent never applies).
//
// The done-criteria (the DP24 backend rows) — a fixture row each is
//
//	state(clean phase) + cmd(declare valid RO connector)  → event ChangeSet{status: DRAFT, applied_at: nil}
//	state(clean phase) + cmd(declare valid RW connector)  → event ChangeSet{status: DRAFT, applied_at: nil}
//	state(clean phase) + cmd(declare ai→DB connector)     → event REFUSE AI_DIRECT_DB_ACCESS_FORBIDDEN (no DRAFT)
//	state(clean phase) + cmd(declare RW, no authority)    → event REFUSE CONNECTOR_RW_REQUIRES_AUTHORITY (no DRAFT)
//	state(proposed DRAFT) + cmd(inspect status)           → status == proposed, NEVER applied (the wall)
//
// THE WALL (CLAUDE.md §2). ProposeConnectorDeclaration only OPENS a DRAFT; it has no path to
// changeset.Apply. The proposed envelope is committable IFF a human applies it through the
// gate (S20). The fixture ASSERTS the envelope is COMPLETE (a spec_delta carries its
// mirror_delta) so it WOULD pass the completeness gate — but stays DRAFT here.

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/connector"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/connectordeclare"
)

func prodFRScope() scope.TruthScope {
	return scope.TruthScope{Region: scope.RegionFR, Environment: scope.EnvProd}
}

func secAuthority() authority.AuthorityGraph {
	return authority.AuthorityGraph{
		Domain:    "connectors",
		TruthKind: "behavioral",
		Approvers: []authority.Role{"security"},
	}
}

// gmailRO — a canonical valid read-only external connector source.
func gmailRO() connector.ConnectorSource {
	return connector.ConnectorSource{
		Layer:          connector.LayerAbove,
		Kind:           connector.KindConnector,
		Name:           "gmail-read",
		Classification: connector.ClassExternal,
		Scope:          connector.ScopeReadOnly,
		EgressHosts:    []string{"gmail.googleapis.com"},
		Target:         connector.TargetGmail,
		DataTruthScope: db.DataTruthScope{AppliesTo: []db.AppliesTo{db.AppliesNewRecords}},
		TruthScope:     prodFRScope(),
	}
}

// slackRW — a canonical valid read-write external connector source (declared S16 authority).
func slackRW() connector.ConnectorSource {
	return connector.ConnectorSource{
		Layer:          connector.LayerAbove,
		Kind:           connector.KindMCPServer,
		Name:           "slack-post",
		Classification: connector.ClassExternal,
		Scope:          connector.ScopeReadWrite,
		EgressHosts:    []string{"slack.com"},
		Target:         connector.TargetSlack,
		DataTruthScope: db.DataTruthScope{AppliesTo: []db.AppliesTo{db.AppliesNewRecords}},
		Authority:      secAuthority(),
		TruthScope:     prodFRScope(),
	}
}

// aiToDB — an ai connector whose egress reaches a datastore host: the load-bearing refusal.
func aiToDB() connector.ConnectorSource {
	c := gmailRO()
	c.Classification = connector.ClassAI
	c.EgressHosts = []string{"postgres://truth-store/direct"}
	c.Target = connector.TargetPostgresRO
	return c
}

// rwNoAuthority — a read_write connector with NO authority: refused at declaration.
func rwNoAuthority() connector.ConnectorSource {
	c := slackRW()
	c.Authority = authority.AuthorityGraph{}
	return c
}

// assertProposedDraft is the load-bearing wall assertion: the proposed ChangeSet is DRAFT,
// un-applied, complete (spec_delta carries mirror_delta), and content-addressed. NEVER applied.
func assertProposedDraft(t *testing.T, cs changeset.ChangeSet) {
	t.Helper()
	if cs.Status != changeset.StatusDraft {
		t.Fatalf("the proposed connector declaration MUST be DRAFT/proposed (the wall) — got %q", cs.Status)
	}
	if cs.Status == changeset.StatusApplied {
		t.Fatalf("the agent has NO GRANT — a declaration must NEVER be APPLIED")
	}
	if cs.AppliedAt != nil {
		t.Fatalf("a proposed (un-applied) ChangeSet carries no commit stamp — got applied_at=%v", cs.AppliedAt)
	}
	if cs.SpecDelta == nil {
		t.Fatalf("the declaration envelope must carry a spec_delta (the connector source body)")
	}
	if cs.MirrorDelta == nil {
		t.Fatalf("the envelope must carry a mirror_delta — a spec without its mirror is a monster (KRD §33/§98)")
	}
	if cs.ID == "" {
		t.Fatalf("the proposed ChangeSet must be content-addressed (a non-empty S20 id)")
	}
	// The envelope is COMPLETE — it WOULD pass the completeness gate (but stays DRAFT here:
	// the agent never applies; only a human, through /goal → approbation, may).
	if br := changeset.SpecHasMirror(cs); br != nil {
		t.Fatalf("the proposed envelope must be complete (no monster), got block %s", br.Code)
	}
}

func TestFixture_DeclareValidRO_ProposesDraft(t *testing.T) {
	cs, err := connectordeclare.ProposeConnectorDeclaration(gmailRO())
	if err != nil {
		t.Fatalf("a valid RO connector declaration should propose a DRAFT, got error %v", err)
	}
	assertProposedDraft(t, cs)
}

func TestFixture_DeclareValidRW_ProposesDraft(t *testing.T) {
	cs, err := connectordeclare.ProposeConnectorDeclaration(slackRW())
	if err != nil {
		t.Fatalf("a valid RW connector declaration should propose a DRAFT, got error %v", err)
	}
	assertProposedDraft(t, cs)
}

func TestFixture_DeclareAIToDB_RefusedNoDraft(t *testing.T) {
	cs, err := connectordeclare.ProposeConnectorDeclaration(aiToDB())
	if err == nil {
		t.Fatalf("an ai→datastore connector declaration MUST be refused (AI_DIRECT_DB_ACCESS_FORBIDDEN)")
	}
	if !errors.Is(err, connectordeclare.ErrInvalidConnector) {
		t.Fatalf("expected ErrInvalidConnector, got %v", err)
	}
	if !errors.Is(err, connector.ErrAIDirectDBForbidden) {
		t.Fatalf("the refusal must wrap the DP20 AI_DIRECT_DB_ACCESS_FORBIDDEN verdict, got %v", err)
	}
	if cs.Status != "" || cs.ID != "" {
		t.Fatalf("no DRAFT must be opened for an invalid source — got a non-empty ChangeSet %+v", cs)
	}
}

func TestFixture_DeclareRWNoAuthority_RefusedNoDraft(t *testing.T) {
	cs, err := connectordeclare.ProposeConnectorDeclaration(rwNoAuthority())
	if err == nil {
		t.Fatalf("a read_write connector with no authority MUST be refused (CONNECTOR_RW_REQUIRES_AUTHORITY)")
	}
	if !errors.Is(err, connectordeclare.ErrInvalidConnector) {
		t.Fatalf("expected ErrInvalidConnector, got %v", err)
	}
	if !errors.Is(err, connector.ErrRWRequiresAuthority) {
		t.Fatalf("the refusal must wrap the DP20 CONNECTOR_RW_REQUIRES_AUTHORITY verdict, got %v", err)
	}
	if cs.Status != "" || cs.ID != "" {
		t.Fatalf("no DRAFT must be opened for an invalid source — got a non-empty ChangeSet %+v", cs)
	}
}

// TestFixture_ProposedDraft_NeverApplies is the wall's direct assertion: the proposed
// envelope, fed to the same status-inspection the cockpit reads, is `proposed`/DRAFT —
// inspecting it never advances it (no side effect, the agent has no Apply path here).
func TestFixture_ProposedDraft_NeverApplies(t *testing.T) {
	cs, err := connectordeclare.ProposeConnectorDeclaration(slackRW())
	if err != nil {
		t.Fatalf("propose failed: %v", err)
	}
	// Inspecting the status twice never advances it (pure, no side effect).
	if cs.Status != changeset.StatusDraft {
		t.Fatalf("status read 1: want DRAFT, got %q", cs.Status)
	}
	if cs.Status != changeset.StatusDraft {
		t.Fatalf("status read 2: want DRAFT, got %q", cs.Status)
	}
	// The ONLY way to APPLIED is changeset.Apply (S20) — which this package never calls and
	// which Postgres GRANTs forbid the agent from committing (the wall). We prove the door
	// EXISTS for the human (the envelope is committable) without walking it.
	if br := changeset.SpecHasMirror(cs); br != nil {
		t.Fatalf("the proposed envelope is not committable (a monster): %s", br.Code)
	}
}
