package connectoraudit_test

// connectoraudit_fixture_test.go — the ACCEPTANCE (Godog-class, state→command→events)
// mirror for DP22 (connector-action audit ledger, EPIC E, piste DP). It proves the headline
// done-criteria as deterministic Given/When/Then fixtures (CLAUDE.md §6 bootstrap exception:
// the mirrors Postgres schema persists this later; the test IS the red→green proof now).
// DETERMINISTIC: no clock, no RNG — the chain is folded by HASH (S02), never by timestamp.
//
//	Given une suite des CINQ formes d'action de connecteur, enforcées par DP21
//	When  on AUDITE chaque action (AuditConnectorAction)
//	Then  chaque action produit UNE entrée du ledger Merkle GV03 vérifiable (Verify().OK) ;
//	      le DecisionBOM capture les inputs load-bearing (connecteur @version, scope, identité,
//	      target/host, résultat permis|refusé + BlockReason) ; ET — propriété capitale —
//	      toute suppression / réordre / altération d'une entrée passée ⇒ Verify().OK=false
//	      avec le bon TamperKind (le ledger est la source d'audit, tamper-evident).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/connector"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/connectorenforce"
	"github.com/steph-frtech/aidos/back/runtime/connectorenforce/connectoraudit"
)

// fiveActions returns the canonical five enforced connector-action shapes the ledger must
// record — one admitted RO read, one admitted RW write, and the three refusals.
func fiveActions() []connectoraudit.AuditedAction {
	rwAuth := authority.AuthorityGraph{Domain: "connectors", TruthKind: "behavioral", Approvers: []authority.Role{"security"}}
	gmailRO := connector.ConnectorSource{
		Layer: connector.LayerAbove, Kind: connector.KindConnector, Name: "gmail-ro",
		Classification: connector.ClassExternal, Scope: connector.ScopeReadOnly,
		EgressHosts: []string{"gmail.googleapis.com"}, Target: connector.TargetGmail, Version: "v-gmail-ro",
	}
	driveRW := connector.ConnectorSource{
		Layer: connector.LayerAbove, Kind: connector.KindConnector, Name: "drive-rw",
		Classification: connector.ClassExternal, Scope: connector.ScopeReadWrite, Authority: rwAuth,
		EgressHosts: []string{"www.googleapis.com"}, Target: connector.TargetDrive, Version: "v-drive-rw",
	}
	aiToDB := connector.ConnectorSource{
		Layer: connector.LayerAbove, Kind: connector.KindConnector, Name: "ai-agent",
		Classification: connector.ClassAI, Scope: connector.ScopeReadOnly,
		EgressHosts: []string{"postgres://truth-store"}, Target: connector.TargetPostgresRO, Version: "v-ai",
	}
	id := connectoraudit.Identity{Subject: "alice@corp"}
	return []connectoraudit.AuditedAction{
		// 1. RO read — admitted.
		{Source: gmailRO, Identity: id, Action: connectorenforce.ConnectorAction{Op: connectorenforce.OpRead, Host: "gmail.googleapis.com"}},
		// 2. RW write with a fresh granted approval — admitted.
		{Source: driveRW, Identity: id, Action: connectorenforce.ConnectorAction{Op: connectorenforce.OpWrite, Host: "www.googleapis.com",
			Approval: &connectorenforce.ConnectorRuntimeApproval{Connector: "drive-rw", Op: connectorenforce.OpWrite, Granted: true, By: "human"}}},
		// 3. RW write, no approval — refused CONNECTOR_RW_NEEDS_APPROVAL.
		{Source: driveRW, Identity: id, Action: connectorenforce.ConnectorAction{Op: connectorenforce.OpWrite, Host: "www.googleapis.com"}},
		// 4. egress off the allow-list — refused EGRESS_NOT_ALLOWED.
		{Source: gmailRO, Identity: id, Action: connectorenforce.ConnectorAction{Op: connectorenforce.OpRead, Host: "evil.example"}},
		// 5. ai → datastore — refused AI_DIRECT_DB_ACCESS_FORBIDDEN.
		{Source: aiToDB, Identity: id, Action: connectorenforce.ConnectorAction{Op: connectorenforce.OpRead, Host: "postgres://truth-store"}},
	}
}

func buildFixtureLedger(t *testing.T) []connectoraudit.LedgerEntry {
	t.Helper()
	var ledger []connectoraudit.LedgerEntry
	for i, a := range fiveActions() {
		grown, err := connectoraudit.AuditConnectorAction(ledger, a.Source, a.Identity, a.Action)
		if err != nil {
			t.Fatalf("AuditConnectorAction[%d]: %v", i, err)
		}
		ledger = grown
	}
	return ledger
}

// Given the five actions / When audited / Then each yields a verifiable entry with the right BOM.
func TestFixture_FiveActions_EachVerifiableWithBOM(t *testing.T) {
	ledger := buildFixtureLedger(t)
	if len(ledger) != 5 {
		t.Fatalf("want 5 ledger entries, got %d", len(ledger))
	}
	if v := connectoraudit.Verify(ledger); !v.OK {
		t.Fatalf("the five-action ledger must verify, got tamper=%q at %d", v.Tamper, v.AtIndex)
	}

	// Entry 0 — RO read, admitted, no code.
	b0 := ledger[0].BOM
	if b0.Connector != "gmail-ro" || b0.ConnectorVersion != "v-gmail-ro" || b0.Scope != "read_only" ||
		b0.Identity != "alice@corp" || b0.Target != "gmail" || b0.Host != "gmail.googleapis.com" {
		t.Fatalf("entry 0 BOM load-bearing fields wrong: %+v", b0)
	}
	if !b0.Permitted || b0.BlockReasonCode != "" {
		t.Fatalf("entry 0 must be permitted with no code: %+v", b0)
	}

	// Entry 1 — RW write approved, admitted.
	if !ledger[1].BOM.Permitted || ledger[1].BOM.Scope != "read_write" {
		t.Fatalf("entry 1 (RW approved) must be permitted read_write: %+v", ledger[1].BOM)
	}

	// Entries 2..4 — the three refusals carry exactly their BlockReason codes.
	wantCodes := []blockreason.Code{
		blockreason.CodeConnectorRWNeedsApproval,
		blockreason.CodeEgressNotAllowed,
		blockreason.CodeAIDirectDBAccessForbidden,
	}
	for k, want := range wantCodes {
		bom := ledger[2+k].BOM
		if bom.Permitted {
			t.Fatalf("entry %d must be refused: %+v", 2+k, bom)
		}
		if bom.BlockReasonCode != string(want) {
			t.Fatalf("entry %d code: want %q got %q", 2+k, want, bom.BlockReasonCode)
		}
	}
}

// Given a verified ledger / When a past entry is ALTERED / Then Verify red with entry_hash_mismatch.
func TestFixture_Alter_TurnsRed_EntryHashMismatch(t *testing.T) {
	ledger := buildFixtureLedger(t)
	tampered := make([]connectoraudit.LedgerEntry, len(ledger))
	copy(tampered, ledger)
	tampered[1].BOM.Host = "attacker.example" // forge entry 1's host, keep its stale hashes
	v := connectoraudit.Verify(tampered)
	if v.OK || v.Tamper != connectoraudit.TamperEntryHash {
		t.Fatalf("altered entry must be entry_hash_mismatch, got ok=%v tamper=%q", v.OK, v.Tamper)
	}
}

// Given a verified ledger / When a non-tail entry is DELETED / Then the chain breaks (Verify red).
func TestFixture_Delete_TurnsRed(t *testing.T) {
	ledger := buildFixtureLedger(t)
	spliced := make([]connectoraudit.LedgerEntry, 0, len(ledger)-1)
	spliced = append(spliced, ledger[:2]...)
	spliced = append(spliced, ledger[3:]...) // drop entry 2 (a non-tail row)
	v := connectoraudit.Verify(spliced)
	if v.OK {
		t.Fatalf("deleting a non-tail entry must break the chain (Verify red), got ok")
	}
	if v.Tamper != connectoraudit.TamperIndex && v.Tamper != connectoraudit.TamperPriorRoot {
		t.Fatalf("deletion must surface index_mismatch or prior_root_break, got %q", v.Tamper)
	}
}

// Given a verified ledger / When two entries are REORDERED / Then Verify red.
func TestFixture_Reorder_TurnsRed(t *testing.T) {
	ledger := buildFixtureLedger(t)
	swapped := make([]connectoraudit.LedgerEntry, len(ledger))
	copy(swapped, ledger)
	swapped[0], swapped[1] = swapped[1], swapped[0]
	if v := connectoraudit.Verify(swapped); v.OK {
		t.Fatalf("reordering entries 0/1 must fail verification")
	}
}

// Given the same five actions twice / Then the tip root is reproducible (chained by hash, not time).
func TestFixture_Reproducible_TipRoot(t *testing.T) {
	a := buildFixtureLedger(t)
	b := buildFixtureLedger(t)
	if connectoraudit.Root(a) != connectoraudit.Root(b) {
		t.Fatalf("tip root must be reproducible: %s vs %s", connectoraudit.Root(a), connectoraudit.Root(b))
	}
	if connectoraudit.Root(a) == connectoraudit.GenesisRoot {
		t.Fatalf("a non-empty ledger root must not be genesis")
	}
}
