// matrix.go — the GRAVED VERDICT as DATA (DP19). BuildMatrix runs the four DONE-CRITERIA
// measures over the two probed connectors (a RO Postgres-RO and an RW Slack, both
// disposable) and the AI-direct-DB attempt, and turns each into a MatrixRow. The global
// verdict is COMPUTED from the rows (every expected refusal measured ∧ every expected
// admission measured ∧ the ledger Verify().OK) — never declared (CLAUDE.md §8). The
// matrix is the front twin's data shape (front/web/lib/connector-governance.ts).
package dp19connectorgov

import "github.com/steph-frtech/aidos/back/runtime/agentrun"

// MatrixRow is one graved measurement: {connector, scope, plane, op, approval-required,
// expected vs measured outcome, ledger entry produced}. It is the durable evidence a
// reader audits — and the exact shape the front twin renders.
type MatrixRow struct {
	Case           string      `json:"case"`              // the DONE-CRITERION label
	Connector      string      `json:"connector"`         // the probed connector (or "ai-direct-db")
	Scope          Scope       `json:"scope"`             // ro | rw
	Plane          Confinement `json:"plane"`             // internal | external | ai | cloud
	Op             Op          `json:"op"`                // read | write
	ApprovalReqd   bool        `json:"approval_required"` // does this op need A2 runtime approval?
	ExpectAdmitted bool        `json:"expect_admitted"`   // the SPEC: should this be admitted?
	MeasuredAdmit  bool        `json:"measured_admitted"` // the MEASURE: was it admitted?
	MeasuredCode   SpikeCode   `json:"measured_code"`     // the refusal code measured (empty on admit)
	LedgerEntry    bool        `json:"ledger_entry"`      // did this action produce a verifiable ledger entry?
	Pass           bool        `json:"pass"`              // measure == spec (the cell verdict)
}

// Verdict is the global gate of the spike — go iff EVERY row passed ∧ the ledger Verify().OK.
type Verdict string

const (
	// VerdictGo — the governance HOLDS with the existing wall: every refusal/admission
	// measured as specified, and the Merkle ledger verifies. The layer may be graved (it
	// only ADDS runtime guards §5 — A2 approval + A3 invariant — no new wall).
	VerdictGo Verdict = "go"
	// VerdictNoGo — the governance does NOT hold without a new single point of trust. The
	// matrix names the failing cell; the layer is killed/reduced + documented.
	VerdictNoGo Verdict = "no-go"
)

// Matrix is the complete graved result: the rows, the ledger tip-root + Verify verdict,
// and the COMPUTED global verdict. This whole struct is the front twin's data.
type Matrix struct {
	Rows         []MatrixRow `json:"rows"`
	LedgerRoot   string      `json:"ledger_root"`   // the tip root of the connector-action ledger
	LedgerOK     bool        `json:"ledger_ok"`     // agentrun.Verify(ledger).OK
	LedgerLength int         `json:"ledger_length"` // number of verifiable entries
	Verdict      Verdict     `json:"verdict"`       // COMPUTED: go iff all rows pass ∧ ledger ok
}

// probeStep is one (connector, op, approvals, spec) measurement to run + record.
type probeStep struct {
	label     string
	connector Connector
	op        Op
	approvals []ConnectorRuntimeApproval
	ai        bool       // route through GateAIDataAccess (A3) instead of GateConnectorAction?
	aiVia     *Connector // the controlled connector the AI passes through (nil = direct attempt)
	aiTarget  string     // the AI's data target (AIDirectDBTarget = the direct attempt)
	expect    bool       // SPEC: should this be admitted?
}

// disposable probed connectors — a RO Postgres-RO (internal) and an RW Slack (external).
func postgresRO() Connector {
	return Connector{
		Name:     "postgres-ro",
		Server:   "store",
		ReadTool: "query",
		// No WriteTool: a pure read-only connector — a write has no door at all.
		Scope: ScopeRO,
		Plane: PlaneInternal,
	}
}

func slackRW() Connector {
	return Connector{
		Name:       "slack",
		Server:     "slack",
		ReadTool:   "list_channels",
		WriteTool:  "post_message",
		Scope:      ScopeRW,
		Plane:      PlaneExternal,
		EgressHost: "slack.com",
	}
}

// BuildMatrix runs the four DONE-CRITERIA measures against the supplied governed
// implementation and computes the global verdict. It is PURE, TOTAL — same impl ⇒ same
// matrix (the fixture mirror pins it). The impl is the EXISTING agentimpl projection
// (the governed tool surface + egress allow-list); the spike supplies it bound to exactly
// the two connectors' capabilities and slack.com egress (a no-go would surface if the
// governance could not be expressed within that existing surface).
func BuildMatrix(impl ImplFixture) Matrix {
	ro := postgresRO()
	rw := slackRW()
	grant := []ConnectorRuntimeApproval{{Connector: "slack", Op: OpWrite, Granted: true, By: "human:spike"}}

	steps := []probeStep{
		// (a) RW Slack WITHOUT approval ⇒ REFUSE; (a') WITH approval ⇒ admit.
		{label: "a) connecteur RW (Slack) écriture SANS approbation runtime", connector: rw, op: OpWrite, approvals: nil, expect: false},
		{label: "a') connecteur RW (Slack) écriture AVEC approbation runtime", connector: rw, op: OpWrite, approvals: grant, expect: true},
		// (b) AI→DB DIRECT ⇒ REFUSE AI_DIRECT_DB_ACCESS_FORBIDDEN; (b') AI via RO connector ⇒ admit.
		{label: "b) appel IA→DB DIRECT", ai: true, aiVia: nil, aiTarget: AIDirectDBTarget, op: OpRead, expect: false},
		{label: "b') appel IA→DB via connecteur Postgres-RO contrôlé", ai: true, aiVia: &ro, aiTarget: "store.query", op: OpRead, expect: true},
		// (c) RO Postgres-RO read ⇒ admit; (c') RO write ⇒ REFUSE (scope RO).
		{label: "c) connecteur RO (Postgres-RO) lecture", connector: ro, op: OpRead, expect: true},
		{label: "c') connecteur RO (Postgres-RO) écriture", connector: ro, op: OpWrite, expect: false},
	}

	var rows []MatrixRow
	var runs []agentrun.AgentRun

	for i, s := range steps {
		var outcome GateOutcome
		var conn Connector
		if s.ai {
			outcome = GateAIDataAccess(impl.Impl, s.aiVia, s.aiTarget, s.op, s.approvals)
			if s.aiVia != nil {
				conn = *s.aiVia
			} else {
				conn = Connector{Name: "ai-direct-db", Scope: ScopeRW, Plane: PlaneAI}
			}
		} else {
			outcome = GateConnectorAction(impl.Impl, s.connector, s.op, s.approvals)
			conn = s.connector
		}

		// (d) EVERY action ⇒ a ledger entry. Record the (admitted-or-refused) action.
		run, err := agentrun.Record(ActionToRun(conn, s.op, outcome, itoa(i)))
		ledgerEntry := err == nil
		if ledgerEntry {
			runs = append(runs, run)
		}

		approvalReqd := s.op == OpWrite && conn.Scope == ScopeRW
		rows = append(rows, MatrixRow{
			Case:           s.label,
			Connector:      conn.Name,
			Scope:          conn.Scope,
			Plane:          conn.Plane,
			Op:             s.op,
			ApprovalReqd:   approvalReqd,
			ExpectAdmitted: s.expect,
			MeasuredAdmit:  outcome.Admitted,
			MeasuredCode:   outcome.Code,
			LedgerEntry:    ledgerEntry,
			Pass:           outcome.Admitted == s.expect && ledgerEntry,
		})
	}

	// (d) fold every action into the EXISTING Merkle ledger and Verify().OK.
	ledger, lerr := LedgerFor(runs)
	verify := agentrun.Verify(ledger)
	ledgerOK := lerr == nil && verify.OK

	// COMPUTE the global verdict — go iff every cell passed ∧ the ledger verifies.
	verdict := VerdictGo
	for _, r := range rows {
		if !r.Pass {
			verdict = VerdictNoGo
		}
	}
	if !ledgerOK {
		verdict = VerdictNoGo
	}

	return Matrix{
		Rows:         rows,
		LedgerRoot:   agentrun.Root(ledger),
		LedgerOK:     ledgerOK,
		LedgerLength: len(ledger),
		Verdict:      verdict,
	}
}

// itoa is a tiny dependency-free int→string for the run's disposable RedWorkItem suffix.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
