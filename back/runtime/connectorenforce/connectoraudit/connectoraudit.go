// Package connectoraudit is the DP22 connector-action AUDIT LEDGER (EPIC E, piste DP). It
// closes the OWASP-AAI09 "Untraceability & Repudiation" gap for connector EFFECTS: every
// enforced connector action (the DP21 connectorenforce verdict) — a read, a write, an egress,
// an ai→datastore attempt, permitted or refused — produces ONE entry of the GV03 tamper-evident
// Merkle ledger (back/runtime/agentrun/ledger.go). Alter / delete / reorder ANY past entry
// changes the tip root ⇒ Verify().OK=false with a TamperKind. The ledger is the SOURCE of audit:
//
//	« chaque action de connecteur ⇒ une entrée vérifiable ; toute altération ⇒ Verify rouge. »
//
// REUSE, NEVER REINVENT (CLAUDE.md §3, anti-duplication). The Merkle math is NOT forked: this
// package CHAINS its own load-bearing body through the EXACT GV03 primitives — agentrun.ContentHash
// (the per-row integrity address) + agentrun.ChainRoot (the prefix fold) + agentrun.GenesisRoot.
// The tamper vocabulary (TamperKind, VerifyResult) is RE-EXPORTED from agentrun (single-sourced —
// the same five kinds the GV03 chain reports). Only the BOM SHAPE differs: a connector decision's
// load-bearing inputs (connector @version, scope, identity, target/host, result + BlockReason),
// versus an agent run's. The chain semantics are identical, so the same tamper-evidence holds.
//
// THE WALL (CLAUDE.md §2). The ledger is a BELOW-the-line audit artefact — it carries NO version
// and NO mirror field of its own (a LedgerEntry is not a layer/truth), exactly like the AgentRun
// ledger and the AgentRun it records. It writes NO Kernel/mirrors/fitness truth. OTel (DP17) also
// traces these actions for exploitation observability, but OTel writes no truth — the ledger here
// is the audit source, the OTel span is a derived projection.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). DeriveConnectorBOM, AuditConnectorAction, Verify and Root
// are PURE, TOTAL functions — no clock, no rng, no I/O. The chain is folded by HASH (the S02
// content-address scheme, REUSED via agentrun.ContentHash), NEVER by timestamp. Same enforced
// action ⇒ same BOM (the BOM is DERIVED from the recorded fields, never a parallel claim — the
// drift-free property mirror pins it); same ordered actions ⇒ same tip root (reproducibility
// mirror); any tamper ⇒ a red Verify (tamper-evidence mirror). An agent "deciding if the ledger
// was tampered" would be a determinism gap — the chain decides, not an LLM.
package connectoraudit

import (
	"github.com/steph-frtech/aidos/back/kernel/connector"
	"github.com/steph-frtech/aidos/back/runtime/agentrun"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/connectorenforce"
)

// GenesisRoot is the empty-ledger root, RE-EXPORTED from the GV03 chain (single-sourced — the
// connector-action ledger chains FROM the same genesis the AgentRun ledger does).
const GenesisRoot = agentrun.GenesisRoot

// TamperKind names how a connector-action ledger failed verification. It is RE-EXPORTED from the
// GV03 chain (agentrun.TamperKind) — the same five actionable kinds, never a forked vocabulary.
type TamperKind = agentrun.TamperKind

// The tamper kinds, RE-EXPORTED from the GV03 chain (the same constants Verify reports).
const (
	// TamperNone — the ledger verifies: every row's index, entry-hash and root recompute exactly.
	TamperNone = agentrun.TamperNone
	// TamperIndex — a row's Index is not its position (a reordering/insertion/deletion artefact).
	TamperIndex = agentrun.TamperIndex
	// TamperEntryHash — a row's BOM was ALTERED (its recomputed entry-hash differs).
	TamperEntryHash = agentrun.TamperEntryHash
	// TamperPriorRoot — a row does not chain from the prior row's root (a deletion/reordering).
	TamperPriorRoot = agentrun.TamperPriorRoot
	// TamperRoot — a row's stored Root is not the recomputed chain root (a forged root).
	TamperRoot = agentrun.TamperRoot
)

// VerifyResult is the deterministic verdict of Verify, RE-EXPORTED from the GV03 chain
// (agentrun.VerifyResult) — OK or the first tamper found, with its position and roots.
type VerifyResult = agentrun.VerifyResult

// Identity is the actor a connector action is attributed to in the audit trail — WHO reached the
// connector. It is a load-bearing input of the audit BOM (the audit answers "who did what"). Pure
// data; the BOM consults only its Subject, never an inference.
type Identity struct {
	// Subject is the stable identity of the actor (user / agent / service principal). Recorded
	// verbatim into the BOM; never consulted for the verdict (the verdict is DP21's, already taken).
	Subject string `json:"subject"`
}

// ConnectorDecisionBOM is the Bill-Of-Materials of one ENFORCED connector action: the
// load-bearing inputs that, together, an auditor must reproduce the decision from — the connector
// @version (the DP20 content-id), its declared scope (RO/RW), the identity that reached it, the
// target + egress host the action touched, and the closed result (permitted | refused + the DP21
// BlockReason code). It is a PROJECTION of (source, identity, action, decision) — DeriveConnectorBOM
// reads only fields already on those, so the BOM can never DRIFT from the recorded action (no
// parallel claim). Pure data; no clock, no I/O. It is the connector twin of agentrun.DecisionBOM.
type ConnectorDecisionBOM struct {
	Connector        string `json:"connector"`         // the connector source's Name
	ConnectorVersion string `json:"connector_version"` // the DP20 content-address (ConnectorSource.Version)
	Scope            string `json:"scope"`             // the declared access scope (read_only | read_write)
	Classification   string `json:"classification"`    // the trust-plane (internal | external | ai | cloud)
	Identity         string `json:"identity"`          // WHO reached the connector (Identity.Subject)
	Op               string `json:"op"`                // the attempted op (read | write)
	Target           string `json:"target"`            // the bound concrete system (gmail | drive | …)
	Host             string `json:"host"`              // the egress host the action reached
	Permitted        bool   `json:"permitted"`         // the closed verdict — true iff the effect was admitted
	BlockReasonCode  string `json:"block_reason_code"` // the DP21 refusal code on a deny; empty on an admission
}

// DeriveConnectorBOM projects the Decision-BOM of an enforced connector action. PURE, TOTAL —
// same (source, identity, action, decision) ⇒ same BOM. It reads only fields already on the
// inputs, so the BOM is a faithful, drift-free summary of the decision (the property mirror pins
// it). The BlockReason argument is the DP21 actionable reason on a refusal (nil on an admission):
// the BOM records its Code verbatim, never re-derives it (the verdict was DP21's, already taken).
func DeriveConnectorBOM(
	source connector.ConnectorSource,
	identity Identity,
	action connectorenforce.ConnectorAction,
	decision connectorenforce.Decision,
	reason *blockreason.BlockReason,
) ConnectorDecisionBOM {
	code := ""
	if !decision.Admitted {
		// The verdict's Code is the single source; the BlockReason (when present) carries the
		// identical code (DP21 builds both from refuse()). We read the verdict's Code so the BOM
		// never depends on whether the caller passed the reason — drift-free.
		code = string(decision.Code)
		_ = reason // the actionable reason is the auditor-facing rendering; the code is the truth.
	}
	return ConnectorDecisionBOM{
		Connector:        source.Name,
		ConnectorVersion: source.Version,
		Scope:            string(source.Scope),
		Classification:   string(source.Classification),
		Identity:         identity.Subject,
		Op:               string(action.Op),
		Target:           string(source.Target),
		Host:             action.Host,
		Permitted:        decision.Admitted,
		BlockReasonCode:  code,
	}
}

// LedgerEntry is one Merkle-chained connector-audit row: the Decision-BOM of an enforced action,
// the prior chain root it chains FROM, and the new root it produces. The chaining is IDENTICAL to
// the GV03 AgentRun ledger (it reuses agentrun.ContentHash + agentrun.ChainRoot) — only BOM's
// SHAPE differs. EntryHash content-addresses (index ‖ bom); Root content-addresses
// (prior_root ‖ entry_hash) — folding the ENTIRE ordered prefix into one hash, so a reorder or
// deletion is detectable. Index is the 0-based position, pinned into the address.
type LedgerEntry struct {
	Index     int                  `json:"index"`      // 0-based position in the append-only ledger
	BOM       ConnectorDecisionBOM `json:"bom"`        // the connector Decision-BOM recorded at this position
	PriorRoot string               `json:"prior_root"` // the chain root this entry chains FROM
	EntryHash string               `json:"entry_hash"` // content-address of (index ‖ bom)
	Root      string               `json:"root"`       // content-address of (prior_root ‖ entry_hash)
}

// AuditedAction bundles the inputs of one connector action to audit: the declared source, the
// actor identity, and the attempted runtime action. The enforcement verdict is RE-COMPUTED inside
// AuditConnectorAction via connectorenforce.EnforceConnectorAction (the single source of the
// verdict — the audit never re-implements the wall). Pure data.
type AuditedAction struct {
	Source   connector.ConnectorSource        `json:"source"`
	Identity Identity                         `json:"identity"`
	Action   connectorenforce.ConnectorAction `json:"action"`
}

// entryHash content-addresses (index ‖ bom): the per-row integrity address. It REUSES the GV03
// primitive agentrun.ContentHash (the S01/S02 scheme) — NOT a forked hash. Pure, total.
func entryHash(index int, bom ConnectorDecisionBOM) (string, error) {
	return agentrun.ContentHash(map[string]any{"index": index, "bom": bom})
}

// Append adds a connector Decision-BOM to the ledger as a new chained entry, returning the grown
// ledger. APPEND-ONLY: it never mutates a prior entry; it appends one row chaining from the
// current tip root (GenesisRoot for an empty ledger). The fold REUSES agentrun.ChainRoot (the
// GV03 prefix fold) — one Merkle implementation, no parallel hash. PURE, TOTAL, DETERMINISTIC —
// no clock, no rng, no I/O; same (ledger, bom) ⇒ same grown ledger.
func Append(ledger []LedgerEntry, bom ConnectorDecisionBOM) ([]LedgerEntry, error) {
	prior := GenesisRoot
	if n := len(ledger); n > 0 {
		prior = ledger[n-1].Root
	}
	index := len(ledger)
	eh, err := entryHash(index, bom)
	if err != nil {
		return nil, err
	}
	root, err := agentrun.ChainRoot(prior, eh)
	if err != nil {
		return nil, err
	}
	entry := LedgerEntry{Index: index, BOM: bom, PriorRoot: prior, EntryHash: eh, Root: root}
	// Copy-on-grow: never alias/mutate the caller's slice (append-only, anti-overwrite §9).
	out := make([]LedgerEntry, len(ledger), len(ledger)+1)
	copy(out, ledger)
	return append(out, entry), nil
}

// AuditConnectorAction is the DP22 door: it enforces the connector action (DP21
// connectorenforce.EnforceConnectorAction — the single source of the verdict), DERIVES the
// load-bearing Decision-BOM (drift-free), and Appends it to the Merkle ledger as one verifiable
// entry. It returns the grown ledger (Verify().OK on the chain). PURE, TOTAL, DETERMINISTIC — the
// verdict and the BOM are functions of the inputs; the chain is folded by HASH (S02), never by
// timestamp. It writes NO truth (the ledger is below-the-line audit telemetry, §2).
func AuditConnectorAction(
	ledger []LedgerEntry,
	source connector.ConnectorSource,
	identity Identity,
	action connectorenforce.ConnectorAction,
) ([]LedgerEntry, error) {
	decision, reason := connectorenforce.EnforceConnectorAction(source, action)
	bom := DeriveConnectorBOM(source, identity, action, decision, reason)
	return Append(ledger, bom)
}

// BuildLedger folds a sequence of audited connector actions into a verified Merkle ledger — the
// convenience the audit panel and the MCP tool call to materialize a ledger from recorded actions.
// PURE, TOTAL. Each action is re-enforced (the verdict is single-sourced) and chained in order.
func BuildLedger(audited []AuditedAction) ([]LedgerEntry, error) {
	var ledger []LedgerEntry
	for _, a := range audited {
		grown, err := AuditConnectorAction(ledger, a.Source, a.Identity, a.Action)
		if err != nil {
			return nil, err
		}
		ledger = grown
	}
	return ledger, nil
}

// Root returns the current tip root of the ledger — the content-address of the WHOLE ordered
// ledger. GenesisRoot for an empty ledger. PURE, TOTAL.
func Root(ledger []LedgerEntry) string {
	if n := len(ledger); n > 0 {
		return ledger[n-1].Root
	}
	return GenesisRoot
}

// Verify recomputes the Merkle chain over the connector-action ledger and reports whether it is
// INTACT — the deterministic JUDGE of tamper-evidence. For each row it re-derives the entry-hash
// from the BOM (via the GV03 agentrun.ContentHash) and the chain root from the prior root (via
// agentrun.ChainRoot), and checks the stored index, prior_root and root match. ANY alteration,
// deletion, reordering or insertion changes a recomputed hash and Verify goes red (OK=false) at
// the first broken row, with the matching TamperKind. PURE, TOTAL — no clock, no I/O; same
// ledger ⇒ same verdict. An intact ledger ⇒ OK=true. The Verify LOGIC mirrors the GV03 chain
// (the same five tamper kinds) but operates on the connector BOM shape (it cannot call
// agentrun.Verify directly — that one is typed to the AgentRun BOM; the chain MATH is reused).
func Verify(ledger []LedgerEntry) VerifyResult {
	prior := GenesisRoot
	for i, e := range ledger {
		if e.Index != i {
			return VerifyResult{OK: false, Tamper: TamperIndex, AtIndex: i, ExpectedRoot: Root(ledger), StoredRoot: Root(ledger)}
		}
		eh, err := entryHash(i, e.BOM)
		if err != nil || eh != e.EntryHash {
			return VerifyResult{OK: false, Tamper: TamperEntryHash, AtIndex: i, ExpectedRoot: Root(ledger), StoredRoot: Root(ledger)}
		}
		if e.PriorRoot != prior {
			return VerifyResult{OK: false, Tamper: TamperPriorRoot, AtIndex: i, ExpectedRoot: Root(ledger), StoredRoot: Root(ledger)}
		}
		root, err := agentrun.ChainRoot(prior, eh)
		if err != nil || root != e.Root {
			return VerifyResult{OK: false, Tamper: TamperRoot, AtIndex: i, ExpectedRoot: root, StoredRoot: e.Root}
		}
		prior = e.Root
	}
	return VerifyResult{OK: true, Tamper: TamperNone, AtIndex: -1, ExpectedRoot: prior, StoredRoot: prior}
}
