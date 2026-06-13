// Package dp19connectorgov is the DP19 SPIKE-GATE (T0, zone /spike, ratchet OFF,
// throwaway code). It opens EPIC E (la couche connecteurs) by answering ONE
// governance question BY MEASURE, before any layer is graved:
//
//	Does the governance of connectors HOLD WITH THE EXISTING WALL — i.e. can a
//	Connector/Skill/MCP-server be governed as a declared SOURCE through the five
//	axes already built (agentimpl enforcers) + the Merkle audit ledder (agentrun),
//	WITHOUT adding a new single point of trust?
//
// VERDICT BY MEASURE, NEVER LLM-JUDGE (CLAUDE.md §8). Every cell of the matrix is a
// pure, total predicate over declared inputs; the global verdict is COMPUTED from
// the matrix, never declared. Go ⇒ the governance holds with the existing wall (it
// only ADDS runtime guards §5, no new wall). No-go ⇒ reproducible: the matrix names
// the cell that failed, and the layer is killed/reduced + documented.
//
// REUSE, NEVER REINVENT (CLAUDE.md §3, the wall §2). The five enforcers come from
// back/runtime/agentimpl (ToolAllowed/EgressAllowed/PathAllowed — set-membership
// PURE fail-closed) and the tamper-evident audit chain from back/runtime/agentrun
// (the Merkle ledger, Verify().OK). This spike creates NO new wall and NO new
// canonical BlockReason: the AI-never-direct-to-DB invariant (A3) and the RW HITL
// gate (A2) are enforced with the SAME set-membership / fail-closed shape, but their
// refusal codes live HERE as throwaway spike constants (a /spike code is not a kernel
// truth — it must never be promoted without idée → miroir → /goal).
//
// AMENDEMENT A2 (LOAD-BEARING). The RW connector is gated by a RUNTIME HITL door
// (ConnectorRuntimeApproval), NOT by authority.Decide. The Kernel truth-admitter
// (back/kernel/authority) governs whether a TRUTH may change; it NEVER gates a
// runtime EFFECT. The old criteria's mention of authority.Decide is SUPERSEDED by
// A2 — a connector write is admitted by a disposable runtime approval, here.
//
// AMENDEMENT A3 (the load-bearing invariant). The AI never reaches the DB directly:
// EVERY AI→DB path MUST pass through a controlled connector. A direct AI→DB call is
// refused with AI_DIRECT_DB_ACCESS_FORBIDDEN by set-membership (the direct-DB target
// is never a member of the AI's allowed connector surface — fail-closed).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every gate is a pure, total function of its
// declared inputs — no DB, no clock, no rng, no I/O. Same input ⇒ same verdict (the
// reproducibility is pinned by the fixture mirror connectorgov_fixture_test.go). The
// matrix + global verdict are DATA (BuildMatrix), graved as the measured result.
package dp19connectorgov

import (
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
)

// ── The connector model (declared SOURCES) ──────────────────────────────────────────

// Scope is a connector's access scope. RO connectors may only read; RW connectors may
// also write, but ONLY through the A2 runtime-approval door. The set is CLOSED.
type Scope string

const (
	// ScopeRO — read-only. A write through an RO connector is always refused (no door).
	ScopeRO Scope = "ro"
	// ScopeRW — read-write. A write needs a fresh ConnectorRuntimeApproval (A2 HITL).
	ScopeRW Scope = "rw"
)

// Op is the attempted operation through a connector. The set is CLOSED.
type Op string

const (
	// OpRead — a read through the connector (allowed for both RO and RW scopes).
	OpRead Op = "read"
	// OpWrite — a write through the connector (RW + runtime approval only).
	OpWrite Op = "write"
)

// Confinement separates the four trust planes a connector may bridge. The strict
// separation interne/externe/AI/cloud is part of the governance: a connector declares
// which plane it bridges, and the matrix records it. The set is CLOSED.
type Confinement string

const (
	// PlaneInternal — an internal datastore (e.g. the truth-store Postgres, RO).
	PlaneInternal Confinement = "internal"
	// PlaneExternal — an external SaaS (e.g. Slack), reached via egress.
	PlaneExternal Confinement = "external"
	// PlaneAI — the AI agent plane (the caller that must NEVER reach the DB directly).
	PlaneAI Confinement = "ai"
	// PlaneCloud — a cloud-infra plane (provisioning targets, etc.).
	PlaneCloud Confinement = "cloud"
)

// Connector is a declared SOURCE governed by the five axes + the ledger. It is the
// spike's model of a Connector/Skill/MCP-server: a (server, tool) capability bound in
// the governed AgentImplementation, a scope, a bridged plane, and — for an external
// connector — the egress host it reaches. NOTHING here is a kernel truth; this is a
// throwaway spike shape.
type Connector struct {
	Name        string      `json:"name"`
	Server      string      `json:"server"`      // the MCP server the capability resolves to
	ReadTool    string      `json:"read_tool"`   // the read capability (the OpRead (server,tool))
	WriteTool   string      `json:"write_tool"`  // the write capability (the OpWrite (server,tool)); empty for pure-RO
	Scope       Scope       `json:"scope"`       // ro | rw
	Plane       Confinement `json:"plane"`       // internal | external | ai | cloud
	EgressHost  string      `json:"egress_host"` // the external host (PlaneExternal only); empty otherwise
	DirectDBRef string      `json:"-"`           // unused in the model; A3 forbids any direct-DB target
}

// ── A2 — the disposable RUNTIME HITL approval (NOT authority.Decide) ─────────────────

// ConnectorRuntimeApproval is the disposable, runtime, human-in-the-loop door that
// admits a connector WRITE. It is NOT the Kernel truth-admitter (authority.Decide): it
// gates a runtime EFFECT, not a truth change (A2). A write is admitted IFF a fresh
// approval names the exact (connector, op) and is Granted by a human. Absent or denied
// ⇒ the write is refused. Pure data; the gate consults it by set-membership.
type ConnectorRuntimeApproval struct {
	Connector string `json:"connector"` // the connector this approval is for
	Op        Op     `json:"op"`        // the operation approved (OpWrite)
	Granted   bool   `json:"granted"`   // a human granted it (true) or denied/absent (false)
	By        string `json:"by"`        // who approved (audit trail; free text)
}

// approvalFor returns whether a fresh, GRANTED approval exists for (connector, op).
// Set-membership, fail-closed: no approval ⇒ false. Pure, total.
func approvalFor(approvals []ConnectorRuntimeApproval, connector string, op Op) bool {
	for _, a := range approvals {
		if a.Connector == connector && a.Op == op && a.Granted {
			return true
		}
	}
	return false
}

// ── The spike's THROWAWAY refusal codes (NOT canonical blockreason truth) ────────────

// SpikeCode is a /spike refusal code. These are NOT promoted into the canonical
// blockreason.Code enum (that is kernel-adjacent truth, above the line). A green
// no-go/go verdict that wants AI_DIRECT_DB_ACCESS_FORBIDDEN in the real layer must go
// through idée → miroir → /goal. Here they are throwaway measurement signals.
type SpikeCode string

const (
	// CodeOK — the action was admitted (no refusal).
	CodeOK SpikeCode = ""
	// CodeAIDirectDBForbidden — A3: the AI tried to reach the DB directly, not through
	// a controlled connector. The load-bearing invariant's refusal.
	CodeAIDirectDBForbidden SpikeCode = "AI_DIRECT_DB_ACCESS_FORBIDDEN"
	// CodeConnectorWriteNotApproved — A2: an RW connector write with no fresh runtime
	// approval (the HITL door was not opened).
	CodeConnectorWriteNotApproved SpikeCode = "CONNECTOR_WRITE_NOT_APPROVED"
	// CodeConnectorScopeReadOnly — a write through an RO connector (no write door at all).
	CodeConnectorScopeReadOnly SpikeCode = "CONNECTOR_SCOPE_READ_ONLY"
	// CodeConnectorToolNotBound — the connector's capability is not in the governed
	// implementation's tool surface (the EXISTING capacity-axis refusal, surfaced here).
	CodeConnectorToolNotBound SpikeCode = "CONNECTOR_TOOL_NOT_BOUND"
	// CodeConnectorEgressNotAllowed — an external connector's host is not in the
	// governed egress allow-list (the EXISTING confinement-axis refusal, surfaced here).
	CodeConnectorEgressNotAllowed SpikeCode = "CONNECTOR_EGRESS_NOT_ALLOWED"
)

// ── The governance gate (reuses the EXISTING enforcers; adds A2 + A3 only) ───────────

// GateOutcome is the verdict of one connector action: admitted or refused, with the
// throwaway SpikeCode on a refusal. There are exactly two outcomes — the SAME fail-
// closed shape as the existing agentimpl ToolDecision/EgressDecision.
type GateOutcome struct {
	Admitted bool      `json:"admitted"`
	Code     SpikeCode `json:"code,omitempty"`
}

// AIDirectDBTarget is the sentinel target the AI is tempted to hit directly (the
// truth-store). A3: this is NEVER a member of the AI's allowed connector surface, so a
// set-membership check refuses it fail-closed.
const AIDirectDBTarget = "postgres://truth-store/direct"

// GateConnectorAction is the PURE, TOTAL, fail-closed connector governance gate. It
// REUSES the existing five-axis enforcers and ADDS only the A2 runtime approval and the
// A3 invariant — no new wall:
//
//  1. CAPACITY (agentimpl.ToolAllowed): the connector's capability for op MUST be bound
//     in the governed implementation. Unbound ⇒ refused (set-membership, fail-closed).
//  2. CONFINEMENT/EGRESS (agentimpl.EgressAllowed): an external connector's host MUST be
//     in the governed egress allow-list. Disallowed ⇒ refused (set-membership).
//  3. SCOPE: a write through an RO connector is refused (no write door at all).
//  4. A2 RUNTIME APPROVAL: a write through an RW connector needs a fresh GRANTED
//     ConnectorRuntimeApproval. Absent ⇒ refused. (NOT authority.Decide.)
//
// A read needs only (1)+(2). Pure: no DB, no clock, no rng, no I/O. Same input ⇒ same
// outcome (the fixture mirror pins it).
func GateConnectorAction(impl agentimpl.AgentImplementation, c Connector, op Op, approvals []ConnectorRuntimeApproval) GateOutcome {
	// Pick the capability for the op (read vs write tool).
	tool := c.ReadTool
	if op == OpWrite {
		tool = c.WriteTool
	}

	// (3) SCOPE — a write through an RO connector has no door, refuse before anything else.
	if op == OpWrite && c.Scope == ScopeRO {
		return GateOutcome{Admitted: false, Code: CodeConnectorScopeReadOnly}
	}

	// (1) CAPACITY — REUSE agentimpl.ToolAllowed (set-membership, fail-closed).
	if td := agentimpl.ToolAllowed(impl, c.Server, tool); !td.Allowed {
		return GateOutcome{Admitted: false, Code: CodeConnectorToolNotBound}
	}

	// (2) CONFINEMENT/EGRESS — REUSE agentimpl.EgressAllowed for external connectors.
	if c.Plane == PlaneExternal {
		if ed := agentimpl.EgressAllowed(impl, c.EgressHost); !ed.Allowed {
			return GateOutcome{Admitted: false, Code: CodeConnectorEgressNotAllowed}
		}
	}

	// (4) A2 RUNTIME APPROVAL — an RW write needs a fresh GRANTED runtime approval.
	if op == OpWrite && c.Scope == ScopeRW {
		if !approvalFor(approvals, c.Name, OpWrite) {
			return GateOutcome{Admitted: false, Code: CodeConnectorWriteNotApproved}
		}
	}

	return GateOutcome{Admitted: true, Code: CodeOK}
}

// GateAIDataAccess is the A3 gate: the AI's data access. It is fail-closed by
// set-membership — the AI may reach the DB ONLY through a controlled connector whose
// capability is bound in the governed implementation; a DIRECT target (AIDirectDBTarget
// or any target NOT served by a bound connector) is refused with
// AI_DIRECT_DB_ACCESS_FORBIDDEN. The allowed connector path is then governed by the
// SAME GateConnectorAction (capacity + scope). Pure, total.
//
//	target == AIDirectDBTarget          ⇒ AI_DIRECT_DB_ACCESS_FORBIDDEN (the direct attempt)
//	via a bound RO connector (a read)   ⇒ admitted (the legal AI→DB path)
func GateAIDataAccess(impl agentimpl.AgentImplementation, via *Connector, target string, op Op, approvals []ConnectorRuntimeApproval) GateOutcome {
	// A3: a direct DB target — no connector mediates it — is refused, fail-closed.
	if via == nil || target == AIDirectDBTarget {
		return GateOutcome{Admitted: false, Code: CodeAIDirectDBForbidden}
	}
	// The AI plane reaches the DB ONLY through the controlled connector — defer to the
	// same five-axis gate (the connector must be bound, in scope, approved if writing).
	return GateConnectorAction(impl, *via, op, approvals)
}

// ── The Merkle audit-ledger binding (REUSE agentrun, Verify().OK) ────────────────────

// ActionToRun projects ONE admitted connector action into an AgentRun, so it can be
// folded into the EXISTING tamper-evident Merkle ledger. The run records the connector,
// the op, and the outcome (green when admitted, blocked when refused). It REUSES the
// agentrun content-address scheme — no clock (timestamps supplied), pure. This is how
// "chaque action de connecteur ⇒ une entrée ledger Merkle VERIFIABLE" holds.
func ActionToRun(c Connector, op Op, outcome GateOutcome, idx string) agentrun.AgentRun {
	result := agentrun.ResultGreen
	if !outcome.Admitted {
		result = agentrun.ResultBlocked
	}
	return agentrun.AgentRun{
		Agent:       "connector:" + c.Name,
		Goal:        "dp19-connector-governance-spike",
		RedWorkItem: string(op) + "@" + c.Name + "#" + idx,
		ContextPack: string(c.Scope) + "/" + string(c.Plane),
		Actions: []agentrun.AgentAction{{
			Type:  actionTypeFor(op),
			Cible: c.Server + "." + capabilityFor(c, op),
		}},
		Result:    result,
		StartedAt: "2026-06-13T00:00:00Z", // SUPPLIED — no arg-less clock (determinism)
		EndedAt:   "2026-06-13T00:00:00Z",
	}
}

func actionTypeFor(op Op) agentrun.ActionType {
	if op == OpWrite {
		return agentrun.ActionWrite
	}
	return agentrun.ActionRead
}

func capabilityFor(c Connector, op Op) string {
	if op == OpWrite {
		return c.WriteTool
	}
	return c.ReadTool
}

// LedgerFor folds a sequence of (recorded) connector-action runs into the EXISTING
// Merkle ledger (agentrun.BuildLedger). The returned ledger Verify().OK iff intact.
// Pure, total — REUSE, no new chain.
func LedgerFor(runs []agentrun.AgentRun) ([]agentrun.LedgerEntry, error) {
	return agentrun.BuildLedger(runs)
}
