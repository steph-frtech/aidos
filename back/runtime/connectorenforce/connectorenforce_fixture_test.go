// connectorenforce_fixture_test.go — the DP21 N2 MIRROR (fixture: state → command →
// events), written BEFORE the implementation (RED → GREEN). It promotes the DP19
// GateConnectorAction spike into a NON-throwaway runtime enforcer over the DP20
// connector.ConnectorSource, governed by the five EXISTING agentlayer axes RESERRÉES by
// the connector scope — NO new permission model, NO forked axis.
//
// reflects=runtime.connectorenforce · test_kind=fixture (N2 state→cmd→events) ·
// cert_language=go-fixture · liveness=live · authority=below (the enforcement is a pure
// computational property of the EXISTING axes; the connector GOVERNANCE rule itself is
// the human's, above the line, graved through idée → miroir → /goal — the agent has no
// GRANT to write a Connector INSTANCE, only the runtime enforcer code §2).
//
// The five verdicts (the DP21 done-criteria) — a fixture row each is
//
//	state(connector RO)  + cmd(write)              → event REFUSE CONNECTOR_READ_ONLY
//	state(connector RW)  + cmd(write, no approval) → event REFUSE CONNECTOR_RW_NEEDS_APPROVAL
//	state(connector RW)  + cmd(write, approval)    → event PERMIT (effet permis)
//	state(connector ext) + cmd(egress off-list)    → event REFUSE EGRESS_NOT_ALLOWED
//	state(connector ai)  + cmd(read, datastore)    → event REFUSE AI_DIRECT_DB_ACCESS_FORBIDDEN
//
// THE WALL (CLAUDE.md §2 + AMENDEMENT A2): the DECLARATION of a read_write connector is
// above-the-line (propose → ChangeSet → approbation, S85/S110, connector.Validate); the
// EXECUTION of a write is a RUNTIME below-the-line authorisation (ConnectorRuntimeApproval),
// NEVER authority.Decide. RO reads are below-the-line (free read within scope). The
// enforcement is the SAME set-membership / fail-closed shape as the existing agentimpl
// enforcers — DETERMINISTIC, never an LLM (§6/§8).
package connectorenforce

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/connector"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// fixtureRow is one N2 fixture: a (connector source, action) STATE+COMMAND and the EXPECTED
// resulting EVENT (admitted, or a refusal carrying a specific BlockReason code).
type fixtureRow struct {
	name           string
	source         connector.ConnectorSource
	action         ConnectorAction
	expectAdmitted bool
	expectCode     blockreason.Code // "" when admitted
}

// fixtureRows is the closed table of the five DONE-CRITERIA verdicts + the RW-with-approval
// permitted case (a fixture is data; the five rows ARE the red set).
func fixtureRows() []fixtureRow {
	return []fixtureRow{
		{
			name:           "RO connector + write ⇒ CONNECTOR_READ_ONLY",
			source:         roPostgres(),
			action:         ConnectorAction{Op: OpWrite, Host: "store.query"},
			expectAdmitted: false,
			expectCode:     blockreason.CodeConnectorReadOnly,
		},
		{
			name:           "RW connector + write, NO runtime approval ⇒ CONNECTOR_RW_NEEDS_APPROVAL",
			source:         rwSlack(),
			action:         ConnectorAction{Op: OpWrite, Host: "slack.com"},
			expectAdmitted: false,
			expectCode:     blockreason.CodeConnectorRWNeedsApproval,
		},
		{
			name:   "RW connector + write WITH runtime approval ⇒ PERMIT (effet permis)",
			source: rwSlack(),
			action: ConnectorAction{
				Op:       OpWrite,
				Host:     "slack.com",
				Approval: &ConnectorRuntimeApproval{Connector: "slack", Op: OpWrite, Granted: true, By: "human:dp21"},
			},
			expectAdmitted: true,
		},
		{
			name:           "external connector + egress OFF the allow-list ⇒ EGRESS_NOT_ALLOWED",
			source:         rwSlack(),
			action:         ConnectorAction{Op: OpRead, Host: "evil.example.com"},
			expectAdmitted: false,
			expectCode:     blockreason.CodeEgressNotAllowed,
		},
		{
			name:           "ai connector toward a datastore host ⇒ AI_DIRECT_DB_ACCESS_FORBIDDEN",
			source:         aiConnector(),
			action:         ConnectorAction{Op: OpRead, Host: "postgres://truth-store/direct"},
			expectAdmitted: false,
			expectCode:     blockreason.CodeAIDirectDBAccessForbidden,
		},
	}
}

// TestFixture_FiveVerdicts drives each fixture row through the runtime enforcer and asserts
// the resulting EVENT (the verdict + its BlockReason code) exactly matches the expectation.
func TestFixture_FiveVerdicts(t *testing.T) {
	for _, row := range fixtureRows() {
		t.Run(row.name, func(t *testing.T) {
			dec, br := EnforceConnectorAction(row.source, row.action)
			if dec.Admitted != row.expectAdmitted {
				t.Fatalf("admitted: want %v, got %v (code=%v)", row.expectAdmitted, dec.Admitted, dec.Code)
			}
			if row.expectAdmitted {
				if br != nil {
					t.Fatalf("an admitted action must carry NO BlockReason, got %+v", br)
				}
				if dec.Code != "" {
					t.Fatalf("an admitted action must carry an empty code, got %q", dec.Code)
				}
				return
			}
			// Refused: the verdict carries the expected code AND an actionable BlockReason.
			if dec.Code != row.expectCode {
				t.Fatalf("refusal code: want %q, got %q", row.expectCode, dec.Code)
			}
			if br == nil {
				t.Fatalf("a refusal must carry an actionable BlockReason (the wall is not a prison, §44.5)")
			}
			if br.Code != row.expectCode {
				t.Fatalf("BlockReason code: want %q, got %q", row.expectCode, br.Code)
			}
			if len(br.HowToFix) < 1 {
				t.Fatalf("a refusal BlockReason must name a non-empty how_to_fix door (no prison)")
			}
		})
	}
}

// TestFixture_RWWithApproval_OnlyForThatConnector — A2: a runtime approval is set-membership
// over (connector, op). An approval naming ANOTHER connector does NOT admit this write.
func TestFixture_RWWithApproval_OnlyForThatConnector(t *testing.T) {
	src := rwSlack()
	// Approval names a DIFFERENT connector — must NOT admit slack's write (fail-closed).
	act := ConnectorAction{
		Op:       OpWrite,
		Host:     "slack.com",
		Approval: &ConnectorRuntimeApproval{Connector: "other", Op: OpWrite, Granted: true},
	}
	dec, _ := EnforceConnectorAction(src, act)
	if dec.Admitted {
		t.Fatalf("an approval for another connector must NOT admit this write (A2 set-membership)")
	}
	if dec.Code != blockreason.CodeConnectorRWNeedsApproval {
		t.Fatalf("want %q, got %q", blockreason.CodeConnectorRWNeedsApproval, dec.Code)
	}
}

// TestFixture_RWWithDeniedApproval_Refused — A2: a PRESENT but DENIED approval is refused
// (Granted:false is not a grant — fail-closed).
func TestFixture_RWWithDeniedApproval_Refused(t *testing.T) {
	src := rwSlack()
	act := ConnectorAction{
		Op:       OpWrite,
		Host:     "slack.com",
		Approval: &ConnectorRuntimeApproval{Connector: "slack", Op: OpWrite, Granted: false},
	}
	dec, _ := EnforceConnectorAction(src, act)
	if dec.Admitted {
		t.Fatalf("a DENIED runtime approval must not admit the write (A2 fail-closed)")
	}
	if dec.Code != blockreason.CodeConnectorRWNeedsApproval {
		t.Fatalf("want %q, got %q", blockreason.CodeConnectorRWNeedsApproval, dec.Code)
	}
}

// TestFixture_ROReadWithinScope_Admitted — RO reads are below-the-line: a read within the
// connector's egress scope is freely admitted (the lecture libre dans le scope).
func TestFixture_ROReadWithinScope_Admitted(t *testing.T) {
	dec, br := EnforceConnectorAction(roPostgres(), ConnectorAction{Op: OpRead, Host: "store.query"})
	if !dec.Admitted {
		t.Fatalf("an RO read within scope must be admitted (read is free), got code %q", dec.Code)
	}
	if br != nil {
		t.Fatalf("an admitted read must carry no BlockReason")
	}
}

// TestFixture_ScopeBeatsEgress — the order is fixed and deterministic: an RO write whose host
// is ALSO off the allow-list is refused for CONNECTOR_READ_ONLY first (scope before egress),
// so the refusal is stable.
func TestFixture_ScopeBeatsEgress(t *testing.T) {
	src := roPostgres()
	dec, _ := EnforceConnectorAction(src, ConnectorAction{Op: OpWrite, Host: "evil.example.com"})
	if dec.Code != blockreason.CodeConnectorReadOnly {
		t.Fatalf("scope must be checked before egress: want %q, got %q", blockreason.CodeConnectorReadOnly, dec.Code)
	}
}
