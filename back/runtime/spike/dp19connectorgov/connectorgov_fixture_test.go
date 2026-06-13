// connectorgov_fixture_test.go — the T0 MIRROR of the DP19 spike (zone /spike, ratchet
// OFF). It MEASURES the four DONE-CRITERIA and asserts the COMPUTED verdict. The verdict
// is a MEASURE, never an LLM-judge (CLAUDE.md §8). This test IS the red→green proof.
//
//	(a)  RW Slack write WITHOUT runtime approval ⇒ REFUSED (CONNECTOR_WRITE_NOT_APPROVED)
//	(a') RW Slack write WITH    runtime approval ⇒ ADMITTED + ledger entry
//	(b)  AI→DB DIRECT            ⇒ REFUSED with AI_DIRECT_DB_ACCESS_FORBIDDEN (A3)
//	(b') AI→DB via Postgres-RO   ⇒ ADMITTED (the only legal AI→DB path)
//	(c)  RO Postgres-RO read     ⇒ ADMITTED
//	(c') RO Postgres-RO write    ⇒ REFUSED (CONNECTOR_SCOPE_READ_ONLY)
//	(d)  EVERY action            ⇒ a verifiable Merkle ledger entry, Verify().OK
package dp19connectorgov

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentrun"
)

// The governed implementation MUST be valid — a bad fixture would mask the verdict.
func TestSpike_GovernedImpl_IsValid(t *testing.T) {
	if err := GovernedImpl().Valid(); err != nil {
		t.Fatalf("the governed spike implementation must be valid (it carries the wall): %v", err)
	}
}

// (a) RW Slack write WITHOUT a fresh runtime approval ⇒ REFUSED (A2 HITL door closed).
func TestSpike_A_RWConnector_NoRuntimeApproval_Refused(t *testing.T) {
	f := GovernedImpl()
	out := GateConnectorAction(f.Impl, slackRW(), OpWrite, nil)
	if out.Admitted {
		t.Fatalf("(a) an RW connector write with NO runtime approval must be refused (A2)")
	}
	if out.Code != CodeConnectorWriteNotApproved {
		t.Fatalf("(a) want %q, got %q", CodeConnectorWriteNotApproved, out.Code)
	}
}

// (a') RW Slack write WITH a fresh GRANTED runtime approval ⇒ ADMITTED.
func TestSpike_A_RWConnector_WithRuntimeApproval_Admitted(t *testing.T) {
	f := GovernedImpl()
	grant := []ConnectorRuntimeApproval{{Connector: "slack", Op: OpWrite, Granted: true, By: "human:spike"}}
	out := GateConnectorAction(f.Impl, slackRW(), OpWrite, grant)
	if !out.Admitted {
		t.Fatalf("(a') an RW connector write WITH a granted runtime approval must be admitted, got code %q", out.Code)
	}
}

// (b) A direct AI→DB call ⇒ REFUSED with the load-bearing A3 invariant code.
func TestSpike_B_AIDirectDB_Forbidden(t *testing.T) {
	f := GovernedImpl()
	out := GateAIDataAccess(f.Impl, nil, AIDirectDBTarget, OpRead, nil)
	if out.Admitted {
		t.Fatalf("(b) a direct AI→DB access must be refused (A3, load-bearing invariant)")
	}
	if out.Code != CodeAIDirectDBForbidden {
		t.Fatalf("(b) want %q, got %q", CodeAIDirectDBForbidden, out.Code)
	}
}

// (b') The AI reaching the DB through the controlled Postgres-RO connector ⇒ ADMITTED.
func TestSpike_B_AIViaControlledConnector_Admitted(t *testing.T) {
	f := GovernedImpl()
	ro := postgresRO()
	out := GateAIDataAccess(f.Impl, &ro, "store.query", OpRead, nil)
	if !out.Admitted {
		t.Fatalf("(b') the AI must reach the DB through a controlled RO connector, got code %q", out.Code)
	}
}

// (c) RO Postgres-RO read ⇒ ADMITTED.
func TestSpike_C_ROConnector_Read_Admitted(t *testing.T) {
	f := GovernedImpl()
	out := GateConnectorAction(f.Impl, postgresRO(), OpRead, nil)
	if !out.Admitted {
		t.Fatalf("(c) an RO connector read must be admitted, got code %q", out.Code)
	}
}

// (c') RO Postgres-RO write ⇒ REFUSED (scope RO has no write door).
func TestSpike_C_ROConnector_Write_Refused(t *testing.T) {
	f := GovernedImpl()
	out := GateConnectorAction(f.Impl, postgresRO(), OpWrite, nil)
	if out.Admitted {
		t.Fatalf("(c') a write through an RO connector must be refused (scope RO)")
	}
	if out.Code != CodeConnectorScopeReadOnly {
		t.Fatalf("(c') want %q, got %q", CodeConnectorScopeReadOnly, out.Code)
	}
}

// Capacity-axis (REUSED ToolAllowed): an UNBOUND connector capability ⇒ REFUSED.
func TestSpike_UnboundCapability_Refused(t *testing.T) {
	f := GovernedImpl()
	unbound := Connector{Name: "rogue", Server: "rogue", ReadTool: "read", Scope: ScopeRO, Plane: PlaneInternal}
	out := GateConnectorAction(f.Impl, unbound, OpRead, nil)
	if out.Admitted {
		t.Fatalf("an unbound connector capability must be refused (capacity axis, ToolAllowed)")
	}
	if out.Code != CodeConnectorToolNotBound {
		t.Fatalf("want %q, got %q", CodeConnectorToolNotBound, out.Code)
	}
}

// Confinement-axis (REUSED EgressAllowed): an external connector reaching an UN-allowed
// host ⇒ REFUSED, even with a bound capability and a granted approval.
func TestSpike_ExternalConnector_UnallowedHost_Refused(t *testing.T) {
	f := GovernedImpl()
	rogueHost := slackRW()
	rogueHost.EgressHost = "evil.example.com"
	grant := []ConnectorRuntimeApproval{{Connector: "slack", Op: OpWrite, Granted: true}}
	out := GateConnectorAction(f.Impl, rogueHost, OpWrite, grant)
	if out.Admitted {
		t.Fatalf("an external connector reaching an un-allowed host must be refused (confinement/egress axis)")
	}
	if out.Code != CodeConnectorEgressNotAllowed {
		t.Fatalf("want %q, got %q", CodeConnectorEgressNotAllowed, out.Code)
	}
}

// (d) + the GLOBAL verdict: BuildMatrix runs all six measures, every action produces a
// verifiable Merkle ledger entry, the ledger Verify().OK, and the computed verdict is GO.
func TestSpike_BuildMatrix_AllPass_LedgerVerifies_VerdictGo(t *testing.T) {
	m := BuildMatrix(GovernedImpl())

	if len(m.Rows) != 6 {
		t.Fatalf("expected 6 measured rows (the DONE-CRITERIA), got %d", len(m.Rows))
	}
	for _, r := range m.Rows {
		if !r.Pass {
			t.Fatalf("row %q failed: expect_admitted=%v measured_admitted=%v code=%q ledger_entry=%v",
				r.Case, r.ExpectAdmitted, r.MeasuredAdmit, r.MeasuredCode, r.LedgerEntry)
		}
		if !r.LedgerEntry {
			t.Fatalf("(d) row %q produced no verifiable ledger entry", r.Case)
		}
	}
	if !m.LedgerOK {
		t.Fatalf("(d) the Merkle ledger must Verify().OK; root=%q len=%d", m.LedgerRoot, m.LedgerLength)
	}
	if m.LedgerLength != 6 {
		t.Fatalf("(d) expected 6 ledger entries (one per action), got %d", m.LedgerLength)
	}
	if m.Verdict != VerdictGo {
		t.Fatalf("the global verdict must be COMPUTED as go (governance holds with the existing wall), got %q", m.Verdict)
	}
}

// Reproducibility (determinism-first): same impl ⇒ byte-identical matrix verdict + root.
func TestSpike_BuildMatrix_Deterministic(t *testing.T) {
	a := BuildMatrix(GovernedImpl())
	b := BuildMatrix(GovernedImpl())
	if a.Verdict != b.Verdict || a.LedgerRoot != b.LedgerRoot || a.LedgerLength != b.LedgerLength {
		t.Fatalf("BuildMatrix must be deterministic: a=(%q,%q,%d) b=(%q,%q,%d)",
			a.Verdict, a.LedgerRoot, a.LedgerLength, b.Verdict, b.LedgerRoot, b.LedgerLength)
	}
}

// No-go reproducibility: an UNGOVERNABLE surface (the implementation does NOT bind the
// connectors' capabilities) makes the expected-admission rows fail ⇒ the verdict flips to
// no-go, reproducibly. This proves the verdict is a MEASURE, not a foregone go.
func TestSpike_UngovernedSurface_VerdictNoGo(t *testing.T) {
	f := GovernedImpl()
	f.Impl.Tools = nil // strip the bound capabilities: nothing is reachable now (fail-closed)
	m := BuildMatrix(f)
	if m.Verdict != VerdictNoGo {
		t.Fatalf("an unbound surface must compute no-go (the expected admissions can't pass), got %q", m.Verdict)
	}
	// And it must still produce a verifiable ledger (refusals are logged too).
	if !m.LedgerOK {
		t.Fatalf("even on a no-go, every refused action must still produce a verifiable ledger entry")
	}
}

// The Merkle ledger goes RED if a recorded entry is tampered (REUSED agentrun.Verify) —
// proves criterion (d)'s tamper-evidence holds for connector actions too.
func TestSpike_LedgerTamper_GoesRed(t *testing.T) {
	m := BuildMatrix(GovernedImpl())
	if !m.LedgerOK {
		t.Fatalf("precondition: the clean ledger must verify")
	}
	// Rebuild the ledger and tamper one entry's BOM — Verify must go red.
	f := GovernedImpl()
	ro := postgresRO()
	out := GateConnectorAction(f.Impl, ro, OpRead, nil)
	run, err := agentrun.Record(ActionToRun(ro, OpRead, out, "0"))
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	ledger, err := LedgerFor([]agentrun.AgentRun{run})
	if err != nil {
		t.Fatalf("ledger: %v", err)
	}
	if !agentrun.Verify(ledger).OK {
		t.Fatalf("the clean connector-action ledger must verify")
	}
	// Tamper the recorded BOM (alter the goal) — the entry-hash recomputes differently.
	ledger[0].BOM.Goal = "TAMPERED"
	if agentrun.Verify(ledger).OK {
		t.Fatalf("a tampered connector-action ledger must NOT verify (Merkle tamper-evidence, REUSED)")
	}
}
