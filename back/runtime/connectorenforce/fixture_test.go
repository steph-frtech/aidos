// fixture_test.go — the disposable DP20 ConnectorSource fixtures the DP21 N2 mirror
// measures against. Each is a VALID-shaped source over the closed sets; the runtime
// enforcer resserre the existing five axes by these declared scopes.
package connectorenforce

import (
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/connector"
)

// rwAuthority is an S16 graph a read_write connector source must carry (declared above the
// line — the DECLARATION door, A2). The runtime enforcer does NOT consult it (A2: the
// EXECUTION gate is the runtime approval, never authority.Decide).
func rwAuthority() authority.AuthorityGraph {
	return authority.AuthorityGraph{
		Domain:    "connectors",
		TruthKind: "behavioral",
		Approvers: []authority.Role{"security"},
	}
}

// roPostgres is a read_only internal connector to the truth-store (Postgres-RO). A read is
// free within scope; a write has no door (CONNECTOR_READ_ONLY).
func roPostgres() connector.ConnectorSource {
	return connector.ConnectorSource{
		Layer:          connector.LayerAbove,
		Kind:           connector.KindConnector,
		Name:           "postgres-ro",
		Classification: connector.ClassInternal,
		Scope:          connector.ScopeReadOnly,
		EgressHosts:    []string{"store.query"},
		Target:         connector.TargetPostgresRO,
	}
}

// rwSlack is a read_write external connector to Slack. A write needs a fresh runtime
// approval (A2); an egress off slack.com is refused (EGRESS_NOT_ALLOWED).
func rwSlack() connector.ConnectorSource {
	return connector.ConnectorSource{
		Layer:          connector.LayerAbove,
		Kind:           connector.KindConnector,
		Name:           "slack",
		Classification: connector.ClassExternal,
		Scope:          connector.ScopeReadWrite,
		EgressHosts:    []string{"slack.com"},
		Target:         connector.TargetSlack,
		Authority:      rwAuthority(),
	}
}

// aiConnector is an `ai`-classified connector. The runtime A3 invariant forbids it from
// reaching a datastore host directly (AI_DIRECT_DB_ACCESS_FORBIDDEN).
func aiConnector() connector.ConnectorSource {
	return connector.ConnectorSource{
		Layer:          connector.LayerAbove,
		Kind:           connector.KindConnector,
		Name:           "ai-agent",
		Classification: connector.ClassAI,
		Scope:          connector.ScopeReadOnly,
		EgressHosts:    []string{"api.anthropic.com"},
		Target:         connector.TargetGmail,
	}
}
