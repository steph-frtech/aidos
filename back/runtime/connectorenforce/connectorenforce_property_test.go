// connectorenforce_property_test.go — the DP21 ∀ MIRROR (property: rapid), written
// BEFORE the implementation (RED → GREEN). It pins the load-bearing invariant:
//
//	ENFORCEMENT = set-membership PUR fail-closed, DÉTERMINISTE.
//
// reflects=runtime.connectorenforce · test_kind=property · cert_language=rapid ·
// liveness=live · authority=below (the invariant is a computational property of the
// pure EnforceConnectorAction reusing the EXISTING agentlayer axes; the governance RULE
// is the human's, above the line).
//
// The invariants (DP19 spike promoted + CLAUDE.md §6/§8 + KRD §44.3):
//
//  1. TOTAL — EnforceConnectorAction never panics on ANY combination of the closed
//     scope/classification/op sets and an arbitrary host.
//  2. DETERMINISTIC — same (source, action) ⇒ byte-identical verdict + code (reproducibility).
//  3. CLOSED VERDICT — every refusal carries a code ∈ the four DP21 codes; an admission
//     carries the empty code and NO BlockReason; a refusal carries an actionable one.
//  4. FAIL-CLOSED RO — a write through a read_only connector is ALWAYS refused
//     CONNECTOR_READ_ONLY (the scope axis has no write door).
//  5. FAIL-CLOSED RW-APPROVAL — a write through a read_write connector with NO granted
//     approval for (connector, write) is ALWAYS refused CONNECTOR_RW_NEEDS_APPROVAL.
//  6. AI∩DATASTORE=∅ — an `ai` connector toward a datastore host (the DECLARED closed
//     set) is ALWAYS refused AI_DIRECT_DB_ACCESS_FORBIDDEN (A3, set-membership).
package connectorenforce

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/connector"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"pgregory.net/rapid"
)

// dp21Codes is the closed set of refusal codes the enforcer may emit (no code invented).
var dp21Codes = map[blockreason.Code]bool{
	blockreason.CodeConnectorReadOnly:         true,
	blockreason.CodeConnectorRWNeedsApproval:  true,
	blockreason.CodeEgressNotAllowed:          true,
	blockreason.CodeAIDirectDBAccessForbidden: true,
}

// drawHost draws either a member of the declared datastore-host set or a benign host.
func drawHost(rt *rapid.T) string {
	ds := connector.DatastoreHosts()
	hosts := append([]string{}, ds...)
	hosts = append(hosts, "slack.com", "store.query", "evil.example.com", "api.github.com", "")
	return hosts[rapid.IntRange(0, len(hosts)-1).Draw(rt, "host")]
}

// drawSource draws an arbitrary VALID-shaped connector source over the closed sets. The
// egress allow-list always carries the chosen host's benign neighbours so the egress axis
// is exercised both ways.
func drawSource(rt *rapid.T) connector.ConnectorSource {
	scopes := connector.AccessScopes()
	classes := connector.Classifications()
	return connector.ConnectorSource{
		Layer:          connector.LayerAbove,
		Kind:           connector.KindConnector,
		Name:           "c" + rapid.StringMatching(`[a-z]{1,6}`).Draw(rt, "name"),
		Classification: classes[rapid.IntRange(0, len(classes)-1).Draw(rt, "class")],
		Scope:          scopes[rapid.IntRange(0, len(scopes)-1).Draw(rt, "scope")],
		EgressHosts:    []string{"slack.com", "store.query"},
		Target:         connector.TargetSlack,
	}
}

// TestProperty_TotalAndClosedVerdict — over the cross-product of closed sets + arbitrary
// hosts, EnforceConnectorAction never panics, every refusal carries a DP21 code with an
// actionable BlockReason, and every admission carries the empty code + no BlockReason.
func TestProperty_TotalAndClosedVerdict(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		src := drawSource(rt)
		op := Op(rapid.SampledFrom([]string{string(OpRead), string(OpWrite)}).Draw(rt, "op"))
		host := drawHost(rt)
		var approval *ConnectorRuntimeApproval
		if rapid.Bool().Draw(rt, "has_approval") {
			approval = &ConnectorRuntimeApproval{Connector: src.Name, Op: op, Granted: rapid.Bool().Draw(rt, "granted")}
		}
		dec, br := EnforceConnectorAction(src, ConnectorAction{Op: op, Host: host, Approval: approval})

		if dec.Admitted {
			if dec.Code != "" {
				rt.Fatalf("admitted but code=%q", dec.Code)
			}
			if br != nil {
				rt.Fatalf("admitted but carries a BlockReason")
			}
			return
		}
		if !dp21Codes[dec.Code] {
			rt.Fatalf("refusal carries a code outside the closed DP21 set: %q", dec.Code)
		}
		if br == nil || br.Code != dec.Code || len(br.HowToFix) < 1 {
			rt.Fatalf("refusal must carry an actionable BlockReason matching the code: %+v", br)
		}
	})
}

// TestProperty_Deterministic — same input ⇒ byte-identical verdict + code (reproducibility).
func TestProperty_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		src := drawSource(rt)
		op := Op(rapid.SampledFrom([]string{string(OpRead), string(OpWrite)}).Draw(rt, "op"))
		host := drawHost(rt)
		act := ConnectorAction{Op: op, Host: host}
		a, _ := EnforceConnectorAction(src, act)
		b, _ := EnforceConnectorAction(src, act)
		if a != b {
			rt.Fatalf("non-deterministic: a=%+v b=%+v", a, b)
		}
	})
}

// TestProperty_ROWriteAlwaysRefused — a write through a read_only connector is ALWAYS
// refused CONNECTOR_READ_ONLY, whatever the host (the scope axis has no write door).
func TestProperty_ROWriteAlwaysRefused(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		src := drawSource(rt)
		src.Scope = connector.ScopeReadOnly
		src.Classification = connector.ClassInternal // avoid the A3 short-circuit on an ai source
		host := drawHost(rt)
		dec, _ := EnforceConnectorAction(src, ConnectorAction{Op: OpWrite, Host: host})
		if dec.Admitted || dec.Code != blockreason.CodeConnectorReadOnly {
			rt.Fatalf("RO write must always refuse CONNECTOR_READ_ONLY, got admitted=%v code=%q", dec.Admitted, dec.Code)
		}
	})
}

// TestProperty_RWWriteNoApprovalAlwaysRefused — a write through a read_write connector with
// NO granted approval is ALWAYS refused CONNECTOR_RW_NEEDS_APPROVAL (host on the allow-list,
// non-ai, so neither egress nor A3 short-circuits first).
func TestProperty_RWWriteNoApprovalAlwaysRefused(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		src := drawSource(rt)
		src.Scope = connector.ScopeReadWrite
		src.Classification = connector.ClassExternal
		src.EgressHosts = []string{"slack.com"}
		dec, _ := EnforceConnectorAction(src, ConnectorAction{Op: OpWrite, Host: "slack.com"})
		if dec.Admitted || dec.Code != blockreason.CodeConnectorRWNeedsApproval {
			rt.Fatalf("RW write w/o approval must always refuse CONNECTOR_RW_NEEDS_APPROVAL, got admitted=%v code=%q", dec.Admitted, dec.Code)
		}
	})
}

// TestProperty_AIDatastoreAlwaysForbidden — an `ai` connector toward ANY declared datastore
// host is ALWAYS refused AI_DIRECT_DB_ACCESS_FORBIDDEN (A3 set-membership, the load-bearing
// invariant), for any op.
func TestProperty_AIDatastoreAlwaysForbidden(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		src := drawSource(rt)
		src.Classification = connector.ClassAI
		ds := connector.DatastoreHosts()
		host := ds[rapid.IntRange(0, len(ds)-1).Draw(rt, "datastore")]
		op := Op(rapid.SampledFrom([]string{string(OpRead), string(OpWrite)}).Draw(rt, "op"))
		dec, _ := EnforceConnectorAction(src, ConnectorAction{Op: op, Host: host})
		if dec.Admitted || dec.Code != blockreason.CodeAIDirectDBAccessForbidden {
			rt.Fatalf("ai→datastore must always refuse AI_DIRECT_DB_ACCESS_FORBIDDEN, got admitted=%v code=%q host=%q", dec.Admitted, dec.Code, host)
		}
	})
}
