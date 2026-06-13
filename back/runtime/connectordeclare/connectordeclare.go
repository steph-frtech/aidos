// Package connectordeclare is the DP24 PROPOSE path of a connector declaration (piste DP,
// CLÔT EPIC E — the connector cockpit). It is the ONE legal door by which the Workbench
// connectors cockpit graves a connector / skill / mcp-server as truth: it PROPOSES a
// ChangeSet (status DRAFT / proposed) wrapping the DP20 connector source — it NEVER applies
// it. The agent has NO GRANT to write truth (CLAUDE.md §2, the wall); a declaration moves
// only through idée → miroir → /goal → approbation by the aidos CLI writer role. This
// package is the runtime function the front calls via a server action; the legal MCP door
// it stages through is the S58 gateway's already-registered `changeset_open` tool (a
// below-the-line propose, never a raw kernel write).
//
// AMENDEMENT A2 — DEUX PORTES DISTINCTES (connectorenforce). (1) the DECLARATION of a
// connector source/scope is admitted ABOVE the line (propose → ChangeSet → approbation) —
// THIS package's concern. (2) the EXECUTION of a write effect is a RUNTIME, below-the-line
// authorisation (connectorenforce.ConnectorRuntimeApproval) — NOT this package's concern.
// ProposeConnectorDeclaration only opens the declaration door; the runtime gate is elsewhere.
//
// THE WALL (CLAUDE.md §2). ProposeConnectorDeclaration validates the source (DP20
// connector.Validate) then OPENS a DRAFT ChangeSet (S20 changeset.Open) whose spec_delta is
// the connector source's canonical body and whose mirror_delta is the connector's mirror
// reference (so the envelope is COMPLETE — a spec without its mirror is a monster, KRD §33).
// The returned ChangeSet is ALWAYS StatusDraft (the agent never reaches APPLIED — that is
// the human, through the aidos writer role). This package writes NO truth and consults NO
// truth-store: it is a PURE function of the declared source.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). ProposeConnectorDeclaration is a PURE, TOTAL function
// of its input — no DB, no clock, no rng, no I/O. The validation verdict is the DP20
// connector.Validate (set-membership over closed sets, never a judgment); the ChangeSet id
// is the S20 content-address (records.Hash via changeset.Open). Same source ⇒ same proposed
// ChangeSet (the reproducibility mirror connectordeclare_property_test.go pins it). NO LLM
// enters — the proposal is a pure composition of two existing pure engines.
//
// REUSE, NEVER REINVENT (CLAUDE.md §3). The connector model + its Validate + its content
// address is the DP20 kernel/connector package (composed, never forked). The transactional
// envelope is the S20 archive/changeset engine (changeset.Open / changeset.Delta / the
// DRAFT|APPLIED|REVERTED closed status set) — IMPORTED, never re-coined. DP24 adds only the
// glue: validate-then-open, and the connector mirror reference that keeps the envelope
// complete.
package connectordeclare

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/connector"
)

// ParentPhaseConnectors is the stable phase a connector-declaration ChangeSet branches from.
// Declared (not invented per call) so the proposed envelope is byte-stable across calls.
const ParentPhaseConnectors = "connectors"

// specDeltaTarget is the layer the spec_delta touches: a connector SOURCE (records.KindLayer).
const specDeltaTarget = "connector_source"

// mirrorReflects names the mirror the connector declaration reflects — the DP20 connector
// source validation (reproducibility mirror). It keeps the envelope COMPLETE (a spec_delta
// always carries its mirror_delta) so changeset.SpecHasMirror never refuses it as a monster.
const mirrorReflects = "kernel.connector-source"

// ErrInvalidConnector wraps the DP20 connector.Validate refusal — a malformed source is
// NEVER proposed (no DRAFT is opened for a source that could not be graved). The wrapped
// error carries the verbatim connector refusal (UNKNOWN_CONNECTOR_KIND, EMPTY_NAME,
// AI_DIRECT_DB_ACCESS_FORBIDDEN, CONNECTOR_RW_REQUIRES_AUTHORITY, …) so the screen surfaces
// the exact BlockReason.
var ErrInvalidConnector = errors.New("connectordeclare: the connector source is invalid — no declaration is proposed")

// ProposeConnectorDeclaration is the PURE, TOTAL propose gesture of a connector declaration.
// It (1) VALIDATES the DP20 source (connector.Validate — set-membership over closed sets,
// the AI-never-direct-to-DB invariant, the RW-needs-authority rule), then (2) OPENS a DRAFT
// ChangeSet (S20 changeset.Open) wrapping the source's canonical body as the spec_delta and
// the connector mirror reference as the mirror_delta (so the envelope is COMPLETE — no
// monster). It RETURNS the proposed ChangeSet; it NEVER applies it (the agent has no GRANT —
// the wall). The returned ChangeSet always carries:
//
//   - Status == changeset.StatusDraft  (NEVER APPLIED — the human applies, via the aidos
//     writer role, through /goal → approbation) ;
//   - AppliedAt == nil                 (an un-applied envelope has no commit stamp) ;
//   - a non-nil SpecDelta (kind "add", target "connector_source", body = the source's S02
//     canonical body) AND a non-nil MirrorDelta (so SpecHasMirror passes — the envelope is
//     committable IF and only IF a human applies it through the gate) ;
//   - a content-addressed ID (the S20 hash of the canonical body — same source ⇒ same id).
//
// On an INVALID source it returns ErrInvalidConnector (wrapping the DP20 verdict) and an
// EMPTY ChangeSet — no DRAFT is opened for a source that could never be graved.
//
// Pure: no DB, no clock, no rng, no I/O. Same source ⇒ same proposed ChangeSet (the property
// mirror pins it). The label is derived deterministically from the source's kind + name.
func ProposeConnectorDeclaration(source connector.ConnectorSource) (changeset.ChangeSet, error) {
	// 1. VALIDATE (DP20) — a malformed source is never proposed (no DRAFT for a monster).
	// Both ErrInvalidConnector AND the verbatim DP20 verdict are wrapped (multi-%w) so the
	// screen can errors.Is on either — the actionable BlockReason is the DP20 one.
	if err := connector.Validate(source); err != nil {
		return changeset.ChangeSet{}, fmt.Errorf("%w: %w", ErrInvalidConnector, err)
	}

	// The spec_delta body is the connector source's S02 canonical body (the exact bytes the
	// aidos writer role would grave). REUSES connector.CanonicalBody — never re-coined.
	body, err := connector.CanonicalBody(source)
	if err != nil {
		// A validated source's body cannot fail to marshal (a fixed struct); treat as a bug.
		return changeset.ChangeSet{}, fmt.Errorf("connectordeclare: canonical body of a valid source failed: %w", err)
	}

	spec := &changeset.Delta{
		Kind:   "add", // a declaration ADDS a connector source (its inverse is "remove").
		Target: specDeltaTarget,
		Body:   json.RawMessage(body),
	}
	// The mirror_delta keeps the envelope COMPLETE (KRD §33/§98): a spec_delta without its
	// mirror is a monster the commit gate refuses. The body names the reflected mirror.
	mirrorBody, err := json.Marshal(map[string]string{"reflects": mirrorReflects, "test_kind": "invariant"})
	if err != nil {
		return changeset.ChangeSet{}, fmt.Errorf("connectordeclare: mirror_delta body marshal failed: %w", err)
	}
	mirror := &changeset.Delta{
		Kind:   "add",
		Target: mirrorReflects,
		Body:   json.RawMessage(mirrorBody),
	}

	// 2. OPEN a DRAFT ChangeSet (S20). Open ALWAYS yields StatusDraft — this package has no
	// path to Apply (the wall: the agent never applies a truth-write).
	cs, err := changeset.Open(declarationLabel(source), ParentPhaseConnectors, spec, mirror)
	if err != nil {
		return changeset.ChangeSet{}, fmt.Errorf("connectordeclare: opening the declaration changeset failed: %w", err)
	}
	return cs, nil
}

// declarationLabel renders the human label of a connector-declaration ChangeSet,
// deterministically from the source's kind + name (e.g. "declare connector: slack-notify").
// Pure — no clock, no rng; same source ⇒ same label (so the proposed id is byte-stable).
func declarationLabel(source connector.ConnectorSource) string {
	return fmt.Sprintf("declare %s: %s", source.Kind, source.Name)
}
