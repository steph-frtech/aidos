package connectoraudit_test

// Property mirror (∀) for the DP22 connector-action AUDIT LEDGER (EPIC E, piste DP).
// reflects=runtime.connector_ledger · test_kind=property · cert_language=rapid · liveness=live ·
// authority=below. The ledger is runtime audit telemetry, never a layer/truth (the wall, §2).
//
// The invariants (the DP22 done-criterion: every connector action ⇒ a verifiable Merkle entry;
// a TAMPER turns Verify RED with the right TamperKind; the BOM is drift-free; reproducible):
//  1. REPRODUCIBILITY — same ordered actions ⇒ same tip root; a freshly built ledger Verifies OK
//     (Append/Root/Verify deterministic + total, chained by HASH never timestamp; no clock/rng).
//  2. EVERY-ACTION-VERIFIABLE — auditing ANY enforced connector action (RO read, RW approuvé,
//     RW refusé, egress refusé, ai→datastore refusé) yields a chain whose Verify().OK is true.
//  3. TAMPER — ALTER one BOM field of one past entry ⇒ Verify().OK=false with entry_hash_mismatch.
//  4. TAMPER — DELETE one past entry ⇒ tamper-evident (tip root changes, or the in-band chain
//     breaks — prior_root_break/index_mismatch). A silent invisible deletion is the audit hole DP22 forbids.
//  5. TAMPER — REORDER two adjacent entries ⇒ Verify().OK=false (the cross-row chain catches it).
//  6. DRIFT-FREE — DeriveConnectorBOM is a faithful PROJECTION of (source, action, decision):
//     same enforced action ⇒ same BOM (no parallel claim); the BOM carries exactly the
//     load-bearing fields (connector @version, scope, identity, target/host, result + code).
//  7. APPEND-ONLY purity — AuditConnectorAction never mutates the caller's slice nor a past entry.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/connector"
	"github.com/steph-frtech/aidos/back/runtime/connectorenforce"
	"github.com/steph-frtech/aidos/back/runtime/connectorenforce/connectoraudit"
	"pgregory.net/rapid"
)

// okAuthority is a well-formed S16 graph a read_write connector source must carry (the
// DECLARATION door). The runtime enforcer never consults it (A2).
func okAuthority() authority.AuthorityGraph {
	return authority.AuthorityGraph{
		Domain:    "connectors",
		TruthKind: "behavioral",
		Approvers: []authority.Role{"security"},
	}
}

// roSource is a minimal, valid read_only connector source (egress to a SaaS host).
func roSource(name, host string) connector.ConnectorSource {
	return connector.ConnectorSource{
		Layer:          connector.LayerAbove,
		Kind:           connector.KindConnector,
		Name:           name,
		Classification: connector.ClassExternal,
		Scope:          connector.ScopeReadOnly,
		EgressHosts:    []string{host},
		Target:         connector.TargetGmail,
		Version:        "v-" + name,
	}
}

// drawAttempt draws ONE (source, action) attempt + its enforced verdict, spanning the five
// action shapes the DP22 ledger must record (RO read, RW approved, RW refused, egress refused,
// ai→datastore refused). It returns the load-bearing trio AuditConnectorAction consumes.
func drawAttempt(rt *rapid.T) (connector.ConnectorSource, connectoraudit.Identity, connectorenforce.ConnectorAction) {
	shape := rapid.IntRange(0, 4).Draw(rt, "shape")
	host := "api.saas." + rapid.StringN(1, 6, 6).Draw(rt, "host")
	id := connectoraudit.Identity{Subject: "u-" + rapid.StringN(1, 6, 6).Draw(rt, "subj")}
	switch shape {
	case 0: // RO read — admitted
		src := roSource("ro-"+rapid.StringN(1, 5, 5).Draw(rt, "n"), host)
		return src, id, connectorenforce.ConnectorAction{Op: connectorenforce.OpRead, Host: host}
	case 1: // RW write with a fresh granted approval — admitted
		src := roSource("rw-"+rapid.StringN(1, 5, 5).Draw(rt, "n"), host)
		src.Scope = connector.ScopeReadWrite
		src.Authority = okAuthority()
		ap := &connectorenforce.ConnectorRuntimeApproval{Connector: src.Name, Op: connectorenforce.OpWrite, Granted: true, By: "human"}
		return src, id, connectorenforce.ConnectorAction{Op: connectorenforce.OpWrite, Host: host, Approval: ap}
	case 2: // RW write, no approval — refused CONNECTOR_RW_NEEDS_APPROVAL
		src := roSource("rw-"+rapid.StringN(1, 5, 5).Draw(rt, "n"), host)
		src.Scope = connector.ScopeReadWrite
		src.Authority = okAuthority()
		return src, id, connectorenforce.ConnectorAction{Op: connectorenforce.OpWrite, Host: host}
	case 3: // egress off the allow-list — refused EGRESS_NOT_ALLOWED
		src := roSource("ro-"+rapid.StringN(1, 5, 5).Draw(rt, "n"), host)
		return src, id, connectorenforce.ConnectorAction{Op: connectorenforce.OpRead, Host: "elsewhere.example"}
	default: // ai → datastore — refused AI_DIRECT_DB_ACCESS_FORBIDDEN
		src := roSource("ai-"+rapid.StringN(1, 5, 5).Draw(rt, "n"), "postgres://truth-store")
		src.Classification = connector.ClassAI
		return src, id, connectorenforce.ConnectorAction{Op: connectorenforce.OpRead, Host: "postgres://truth-store"}
	}
}

func drawAudited(rt *rapid.T) []connectoraudit.AuditedAction {
	n := rapid.IntRange(0, 6).Draw(rt, "n")
	out := make([]connectoraudit.AuditedAction, n)
	for i := range out {
		src, id, act := drawAttempt(rt)
		out[i] = connectoraudit.AuditedAction{Source: src, Identity: id, Action: act}
	}
	return out
}

// buildLedger folds drawn attempts into a connector-action ledger.
func buildLedger(rt *rapid.T, audited []connectoraudit.AuditedAction) []connectoraudit.LedgerEntry {
	var ledger []connectoraudit.LedgerEntry
	for _, a := range audited {
		grown, err := connectoraudit.AuditConnectorAction(ledger, a.Source, a.Identity, a.Action)
		if err != nil {
			rt.Fatalf("AuditConnectorAction: %v", err)
		}
		ledger = grown
	}
	return ledger
}

// 1+2. REPRODUCIBILITY + EVERY-ACTION-VERIFIABLE — same actions ⇒ same root; the ledger Verifies.
func TestConnectorLedger_Reproducible_And_Verifiable(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		audited := drawAudited(rt)
		a := buildLedger(rt, audited)
		b := buildLedger(rt, audited)
		if connectoraudit.Root(a) != connectoraudit.Root(b) {
			rt.Fatalf("non-deterministic root: %s vs %s", connectoraudit.Root(a), connectoraudit.Root(b))
		}
		if v := connectoraudit.Verify(a); !v.OK {
			rt.Fatalf("fresh connector ledger must verify, tamper=%q at %d", v.Tamper, v.AtIndex)
		}
		if len(audited) == 0 && connectoraudit.Root(a) != connectoraudit.GenesisRoot {
			rt.Fatalf("empty ledger root must be genesis, got %s", connectoraudit.Root(a))
		}
	})
}

// 3. TAMPER — ALTER one BOM field ⇒ Verify red with entry_hash_mismatch.
func TestConnectorLedger_Alter_TurnsRed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		audited := drawAudited(rt)
		if len(audited) == 0 {
			return
		}
		ledger := buildLedger(rt, audited)
		i := rapid.IntRange(0, len(ledger)-1).Draw(rt, "i")
		tampered := make([]connectoraudit.LedgerEntry, len(ledger))
		copy(tampered, ledger)
		tampered[i].BOM.Target = tampered[i].BOM.Target + "X" // silent forge: BOM changes, hashes stale
		v := connectoraudit.Verify(tampered)
		if v.OK {
			rt.Fatalf("altered row %d must fail verification", i)
		}
		if v.Tamper != connectoraudit.TamperEntryHash {
			rt.Fatalf("altered BOM must be entry_hash_mismatch, got %q at %d", v.Tamper, v.AtIndex)
		}
	})
}

// 4. TAMPER — DELETE one row ⇒ tamper-evident (tip root change OR chain break).
func TestConnectorLedger_Delete_TamperEvident(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		audited := drawAudited(rt)
		if len(audited) < 2 {
			return
		}
		ledger := buildLedger(rt, audited)
		rootBefore := connectoraudit.Root(ledger)
		i := rapid.IntRange(0, len(ledger)-1).Draw(rt, "i")
		spliced := make([]connectoraudit.LedgerEntry, 0, len(ledger)-1)
		spliced = append(spliced, ledger[:i]...)
		spliced = append(spliced, ledger[i+1:]...)
		rootChanged := connectoraudit.Root(spliced) != rootBefore
		verifyRed := !connectoraudit.Verify(spliced).OK
		if !rootChanged && !verifyRed {
			rt.Fatalf("deleting row %d must be tamper-evident (root change or red verify)", i)
		}
	})
}

// 5. TAMPER — REORDER two adjacent rows ⇒ Verify red.
func TestConnectorLedger_Reorder_TurnsRed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		audited := drawAudited(rt)
		ledger := buildLedger(rt, audited)
		j := -1
		for k := 0; k+1 < len(ledger); k++ {
			if ledger[k].BOM != ledger[k+1].BOM {
				j = k
				break
			}
		}
		if j < 0 {
			return
		}
		swapped := make([]connectoraudit.LedgerEntry, len(ledger))
		copy(swapped, ledger)
		swapped[j], swapped[j+1] = swapped[j+1], swapped[j]
		if v := connectoraudit.Verify(swapped); v.OK {
			rt.Fatalf("reordering rows %d/%d must fail verification", j, j+1)
		}
	})
}

// 6. DRIFT-FREE — DeriveConnectorBOM is a faithful, repeatable projection of the enforced action.
func TestConnectorLedger_BOM_DriftFree(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		src, id, act := drawAttempt(rt)
		dec, br := connectorenforce.EnforceConnectorAction(src, act)
		bom1 := connectoraudit.DeriveConnectorBOM(src, id, act, dec, br)
		bom2 := connectoraudit.DeriveConnectorBOM(src, id, act, dec, br)
		if bom1 != bom2 {
			rt.Fatalf("DeriveConnectorBOM not deterministic: %+v vs %+v", bom1, bom2)
		}
		// Load-bearing fields carried verbatim.
		if bom1.Connector != src.Name || bom1.ConnectorVersion != src.Version ||
			bom1.Scope != string(src.Scope) || bom1.Identity != id.Subject ||
			bom1.Target != string(src.Target) || bom1.Host != act.Host {
			rt.Fatalf("BOM dropped a load-bearing field: %+v (src %+v act %+v)", bom1, src, act)
		}
		// Result mirrors the verdict drift-free: Permitted iff Admitted; a refusal carries the code.
		if bom1.Permitted != dec.Admitted {
			rt.Fatalf("BOM result must mirror the verdict: permitted=%v admitted=%v", bom1.Permitted, dec.Admitted)
		}
		if !dec.Admitted && bom1.BlockReasonCode != string(dec.Code) {
			rt.Fatalf("refused BOM must carry the BlockReason code: bom=%q dec=%q", bom1.BlockReasonCode, dec.Code)
		}
		if dec.Admitted && bom1.BlockReasonCode != "" {
			rt.Fatalf("admitted BOM must carry no code, got %q", bom1.BlockReasonCode)
		}
	})
}

// 7. APPEND-ONLY — AuditConnectorAction never mutates the caller's slice nor a past entry.
func TestConnectorLedger_Append_IsAppendOnly(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		audited := drawAudited(rt)
		if len(audited) == 0 {
			return
		}
		ledger := buildLedger(rt, audited)
		before := make([]connectoraudit.LedgerEntry, len(ledger))
		copy(before, ledger)
		src, id, act := drawAttempt(rt)
		grown, err := connectoraudit.AuditConnectorAction(ledger, src, id, act)
		if err != nil {
			rt.Fatalf("AuditConnectorAction: %v", err)
		}
		if len(grown) != len(ledger)+1 {
			rt.Fatalf("audit must grow by one: %d -> %d", len(ledger), len(grown))
		}
		for i := range ledger {
			if ledger[i] != before[i] {
				rt.Fatalf("audit mutated the caller's slice at %d", i)
			}
			if grown[i] != before[i] {
				rt.Fatalf("audit changed the prefix at %d", i)
			}
		}
		if v := connectoraudit.Verify(grown); !v.OK {
			rt.Fatalf("grown ledger must verify, got %q at %d", v.Tamper, v.AtIndex)
		}
	})
}
