package connector_test

// DP20 CONNECTOR-SOURCE FIXTURE — canonical example sources pinning the gravure of a
// Connector / Skill / MCP-server as a declared, content-addressed Kernel SOURCE.
// reflects = kernel.connector_source · test_kind = fixture · authority = above (the
// closed sets + the AI-never-direct-to-DB invariant are the human's rule, graved through
// idée → miroir → /goal; this fixture only ENFORCES it on named instances). It is the
// example twin of the property mirror connector_property_test.go.
//
// The done invariants (DP19 spike promoted):
//   - a canonical RO connector (Gmail) and a canonical RW connector (Slack, with a
//     declared S16 authority) round-trip as content-addressed sources (stable id);
//   - a classification/scope outside the closed sets ⇒ UNKNOWN_CONNECTOR_CLASS / _SCOPE;
//   - an ai connector with a datastore egress ⇒ AI_DIRECT_DB_ACCESS_FORBIDDEN;
//   - a read_write connector with no authority ⇒ CONNECTOR_RW_REQUIRES_AUTHORITY;
//   - ToRecord lands the source under the S02 content-address (records.Validate-clean).

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/connector"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
)

// secAuthority is the canonical S16 graph admitting a connector source (security owns it).
func secAuthority() authority.AuthorityGraph {
	return authority.AuthorityGraph{
		Domain:    "connectors",
		TruthKind: "behavioral",
		Approvers: []authority.Role{"security"},
	}
}

func prodFRScope() scope.TruthScope {
	return scope.TruthScope{Region: scope.RegionFR, Environment: scope.EnvProd}
}

// gmailRO — a canonical read-only external connector (no authority needed).
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

// slackRW — a canonical read-write external connector (carries a declared S16 authority).
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

func TestFixture_CanonicalSources_Validate(t *testing.T) {
	if err := connector.Validate(gmailRO()); err != nil {
		t.Fatalf("gmail RO source should validate, got %v", err)
	}
	if err := connector.Validate(slackRW()); err != nil {
		t.Fatalf("slack RW source should validate, got %v", err)
	}
}

func TestFixture_RoundTrip_ContentAddressed(t *testing.T) {
	c := slackRW()
	id := connector.ContentID(c)
	// Byte-stable: re-hash is identical.
	if again := connector.ContentID(c); again != id {
		t.Fatalf("ContentID not stable: %q vs %q", id, again)
	}
	// Egress order does not change the id (the canonical body sorts the allow-list).
	c2 := slackRW()
	c2.EgressHosts = []string{"slack.com", "files.slack.com"}
	c3 := slackRW()
	c3.EgressHosts = []string{"files.slack.com", "slack.com"}
	if connector.ContentID(c2) != connector.ContentID(c3) {
		t.Fatalf("ContentID depends on egress order (must not)")
	}
	// ToRecord lands it under the S02 content-address, records.Validate-clean.
	rec, err := connector.ToRecord(c)
	if err != nil {
		t.Fatalf("ToRecord: %v", err)
	}
	if rec.Kind != records.KindLayer {
		t.Fatalf("ToRecord kind = %q, want layer", rec.Kind)
	}
	if rec.ID != id || rec.Version != id {
		t.Fatalf("ToRecord id/version %q/%q != ContentID %q", rec.ID, rec.Version, id)
	}
	if err := records.Validate(rec); err != nil {
		t.Fatalf("ToRecord record fails records.Validate: %v", err)
	}
}

func TestFixture_UnknownClassification(t *testing.T) {
	c := gmailRO()
	c.Classification = "partner" // outside {internal,external,ai,cloud}
	if err := connector.Validate(c); !errors.Is(err, connector.ErrUnknownClassification) {
		t.Fatalf("want UNKNOWN_CONNECTOR_CLASS, got %v", err)
	}
}

func TestFixture_UnknownScope(t *testing.T) {
	c := gmailRO()
	c.Scope = "append_only" // outside {read_only,read_write}
	if err := connector.Validate(c); !errors.Is(err, connector.ErrUnknownScope) {
		t.Fatalf("want UNKNOWN_CONNECTOR_SCOPE, got %v", err)
	}
}

func TestFixture_AIDirectDBForbidden(t *testing.T) {
	// An ai connector that egresses to the truth-store directly is refused.
	c := connector.ConnectorSource{
		Layer:          connector.LayerAbove,
		Kind:           connector.KindConnector,
		Name:           "ai-rogue",
		Classification: connector.ClassAI,
		Scope:          connector.ScopeReadOnly,
		EgressHosts:    []string{"postgres://truth-store/direct"},
		Target:         connector.TargetPostgresRO,
		TruthScope:     prodFRScope(),
	}
	if err := connector.Validate(c); !errors.Is(err, connector.ErrAIDirectDBForbidden) {
		t.Fatalf("ai+datastore egress must be AI_DIRECT_DB_ACCESS_FORBIDDEN, got %v", err)
	}
	// The legal AI→DB path: an ai connector egressing to a controlled NON-datastore host
	// (a gateway/MCP surface) passes.
	c.EgressHosts = []string{"mcp.gateway.internal.svc"}
	if err := connector.Validate(c); errors.Is(err, connector.ErrAIDirectDBForbidden) {
		t.Fatalf("ai connector via a controlled non-datastore host wrongly refused: %v", err)
	}
}

func TestFixture_RWRequiresAuthority(t *testing.T) {
	c := slackRW()
	c.Authority = authority.AuthorityGraph{} // strip the authority
	if err := connector.Validate(c); !errors.Is(err, connector.ErrRWRequiresAuthority) {
		t.Fatalf("rw without authority must be CONNECTOR_RW_REQUIRES_AUTHORITY, got %v", err)
	}
}

// The closed sets are non-empty and exactly the declared members (the front reads these).
func TestFixture_ClosedSets(t *testing.T) {
	if got := len(connector.Kinds()); got != 3 {
		t.Fatalf("Kinds() len = %d, want 3", got)
	}
	if got := len(connector.Classifications()); got != 4 {
		t.Fatalf("Classifications() len = %d, want 4", got)
	}
	if got := len(connector.AccessScopes()); got != 2 {
		t.Fatalf("AccessScopes() len = %d, want 2", got)
	}
	if got := len(connector.Targets()); got != 9 {
		t.Fatalf("Targets() len = %d, want 9", got)
	}
	if !connector.IsDatastoreHost("postgres://x") || connector.IsDatastoreHost("gmail.googleapis.com") {
		t.Fatalf("IsDatastoreHost set-membership wrong")
	}
}
