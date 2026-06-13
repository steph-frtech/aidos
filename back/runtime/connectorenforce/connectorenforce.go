// Package connectorenforce is the DP21 RUNTIME connector-scope enforcer (EPIC E). It
// PROMOTES the DP19 spike's GateConnectorAction (back/runtime/spike/dp19connectorgov,
// verdict go) into a NON-throwaway runtime gate over the DP20 connector.ConnectorSource
// (back/kernel/connector), governing a connector EFFECT by the FIVE EXISTING agentlayer
// axes RESERRÉES by the connector's declared scope — it adds NO new permission model and
// FORKS no axis:
//
//	« un connecteur read_only qui tente une écriture ⇒ REFUSE CONNECTOR_READ_ONLY ;
//	  un connecteur read_write sans approbation runtime ⇒ REFUSE CONNECTOR_RW_NEEDS_APPROVAL ;
//	  un egress hors allow-list ⇒ EGRESS_NOT_ALLOWED ;
//	  un connecteur ai vers un datastore ⇒ AI_DIRECT_DB_ACCESS_FORBIDDEN. »
//
// AMENDEMENT A2 — DEUX PORTES DISTINCTES (load-bearing). (1) the DECLARATION of a
// connector (source/scope) is admitted ABOVE the line (propose → ChangeSet → approbation,
// S85/S110, connector.Validate) — NOT this package's concern. (2) the EXECUTION of a write
// is a RUNTIME, below-the-line, human-in-the-loop authorisation (ConnectorRuntimeApproval),
// NEVER authority.Decide. The Kernel truth-admitter (back/kernel/authority) governs whether
// a TRUTH may change; it NEVER gates a runtime EFFECT. This enforcer therefore consults the
// runtime approval, never the S16 graph, to admit a write.
//
// AMENDEMENT A3 — the load-bearing invariant, enforced AT RUNTIME as set-membership:
// egress_hosts(ai) ∩ {hosts classified datastore} = ∅. An `ai`-classified connector toward
// a DATASTORE host (the DECLARED closed set kernel/connector.DatastoreHosts) is refused with
// AI_DIRECT_DB_ACCESS_FORBIDDEN — the AI never reaches the DB directly, EVERY AI→DB path
// passes through a controlled non-ai connector. It is the RUNTIME twin of the DP20
// connector.Validate DECLARATION invariant.
//
// THE WALL (CLAUDE.md §2). RO reads are below-the-line (lecture libre dans le scope). RW
// writes are gated by the runtime approval (A2). This package writes NO truth and consults
// NO truth-store: it is a PURE function over the declared source + the runtime action.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). EnforceConnectorAction is a PURE, TOTAL, fail-closed
// function — set-membership over closed sets, NEVER a judgment. No DB, no clock, no rng, no
// I/O. Same input ⇒ same verdict (the reproducibility mirror connectorenforce_property_test.go
// pins it). The five axes are functions, never an LLM.
//
// REUSE, NEVER REINVENT (CLAUDE.md §3). The egress host allow-list is the EXISTING
// agentimpl.EgressAllowed (set-membership, fail-closed) — NOT forked, only fed the connector
// source's declared EgressHosts. The datastore-host set is kernel/connector.IsDatastoreHost
// (the DECLARED closed set). The refusal vocabulary is the canonical blockreason registry.
package connectorenforce

import (
	"github.com/steph-frtech/aidos/back/kernel/connector"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Op is the attempted operation through a connector — the CLOSED two-member set
// {read, write}. It mirrors the DP19 spike's Op (promoted, no longer throwaway).
type Op string

const (
	// OpRead — a read through the connector (free for both read_only and read_write scopes).
	OpRead Op = "read"
	// OpWrite — a write through the connector (read_write + runtime approval only, A2).
	OpWrite Op = "write"
)

// ConnectorRuntimeApproval is the A2 disposable, RUNTIME, human-in-the-loop authorisation
// that admits a connector WRITE. It is NOT the Kernel truth-admitter (authority.Decide): it
// gates a runtime EFFECT (qui / quand / quel-effet), not a truth change. A write is admitted
// IFF a fresh approval names the exact (connector, op) and is Granted by a human. Absent,
// denied, or for another connector/op ⇒ the write is refused (fail-closed set-membership).
// Pure data; the enforcer consults it by set-membership, never by inference.
type ConnectorRuntimeApproval struct {
	// Connector is the connector name this approval is for (must match the source's Name).
	Connector string `json:"connector"`
	// Op is the operation approved (OpWrite — a read needs no approval).
	Op Op `json:"op"`
	// Granted is true IFF a human granted it; false (or absent) is not a grant.
	Granted bool `json:"granted"`
	// By records who approved it (audit trail; free text — never consulted for the verdict).
	By string `json:"by,omitempty"`
}

// covers reports whether this approval is a fresh, GRANTED authorisation for (connector, op).
// Set-membership, fail-closed. Pure, total.
func (a *ConnectorRuntimeApproval) covers(connector string, op Op) bool {
	return a != nil && a.Connector == connector && a.Op == op && a.Granted
}

// ConnectorAction is the attempted RUNTIME effect through a connector: the operation, the
// egress host it reaches, and — for a write — the optional A2 runtime approval. NOTHING here
// is a truth; it is the runtime command the enforcer judges against the declared source.
type ConnectorAction struct {
	// Op is the attempted operation (read | write).
	Op Op `json:"op"`
	// Host is the egress host the action reaches (checked against the source's allow-list,
	// and against the datastore set for the A3 ai-invariant).
	Host string `json:"host"`
	// Approval is the A2 runtime authorisation for a write (nil for a read, or an absent grant).
	Approval *ConnectorRuntimeApproval `json:"approval,omitempty"`
}

// Decision is EnforceConnectorAction's verdict: admitted or refused, with the DP21
// BlockReason code on a refusal. There are exactly two outcomes — the SAME fail-closed
// SHAPE as agentimpl.ToolDecision/EgressDecision (the existing axes), here connector-scoped.
type Decision struct {
	// Admitted is true IFF the action is permitted (the effect may proceed).
	Admitted bool `json:"admitted"`
	// Code is the refusal code on a deny; empty on an admission (the closed DP21 set).
	Code blockreason.Code `json:"code,omitempty"`
}

// EnforceConnectorAction is the PURE, TOTAL, fail-closed connector-scope runtime enforcer.
// It governs a connector EFFECT by the FIVE EXISTING axes RESERRÉES by the source's declared
// scope — it adds NO new wall and FORKS no axis. The order is fixed so the refusal is
// DETERMINISTIC (the property mirror pins it):
//
//  1. A3 (AI∩DATASTORE=∅) — an `ai`-classified source whose action reaches a DATASTORE host
//     (kernel/connector.IsDatastoreHost, the DECLARED closed set) is refused with
//     AI_DIRECT_DB_ACCESS_FORBIDDEN. Checked first: the AI never reaches the DB directly,
//     whatever the scope or approval (the load-bearing invariant).
//  2. SCOPE — a write through a read_only source is refused with CONNECTOR_READ_ONLY (no
//     write door at all). Checked before egress so the scope refusal is stable.
//  3. EGRESS — the action's host MUST be in the source's egress allow-list. It REUSES
//     agentimpl.EgressAllowed verbatim (set-membership, fail-closed — an EMPTY allow-list
//     denies EVERY host); a host off the list is refused EGRESS_NOT_ALLOWED.
//  4. A2 RUNTIME APPROVAL — a write through a read_write source needs a fresh GRANTED
//     ConnectorRuntimeApproval for (connector, write). Absent ⇒ refused
//     CONNECTOR_RW_NEEDS_APPROVAL. (NEVER authority.Decide — A2.)
//
// A read needs only (1)+(3). It returns (Decision, *BlockReason): the BlockReason is nil on
// an admission and the canonical actionable reason on a refusal (the wall is not a prison,
// §44.5). Pure: no DB, no clock, no rng, no I/O. Same input ⇒ same verdict.
func EnforceConnectorAction(source connector.ConnectorSource, action ConnectorAction) (Decision, *blockreason.BlockReason) {
	// (1) A3 — the AI never reaches a datastore host directly (set-membership, fail-closed).
	if source.Classification == connector.ClassAI && connector.IsDatastoreHost(action.Host) {
		return refuse(blockreason.CodeAIDirectDBAccessForbidden)
	}

	// (2) SCOPE — a write through a read_only source has no door (refuse before egress).
	if action.Op == OpWrite && source.Scope == connector.ScopeReadOnly {
		return refuse(blockreason.CodeConnectorReadOnly)
	}

	// (3) EGRESS — REUSE the EXISTING agentimpl.EgressAllowed (set-membership, fail-closed).
	// The connector source's declared EgressHosts is the allow-list; the enforcer feeds it
	// to the existing axis verbatim, it does not re-implement the membership.
	probe := agentimpl.AgentImplementation{AllowedNetworkHosts: source.EgressHosts}
	if ed := agentimpl.EgressAllowed(probe, action.Host); !ed.Allowed {
		return refuse(blockreason.CodeEgressNotAllowed)
	}

	// (4) A2 — a write through a read_write source needs a fresh GRANTED runtime approval.
	if action.Op == OpWrite && source.Scope == connector.ScopeReadWrite {
		if !action.Approval.covers(source.Name, OpWrite) {
			return refuse(blockreason.CodeConnectorRWNeedsApproval)
		}
	}

	return Decision{Admitted: true}, nil
}

// refuse builds the fail-closed (Decision, *BlockReason) pair for a refusal code: the
// canonical actionable BlockReason from the registry (it panics on an unknown code — the
// codes here are the closed DP21 set, all registered). Pure, total.
func refuse(code blockreason.Code) (Decision, *blockreason.BlockReason) {
	br := blockreason.For(code)
	return Decision{Admitted: false, Code: code}, &br
}
