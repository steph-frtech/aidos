package besoin

// metadata.go — EL04: attach the FOUR per-truth metadata to every LevelNode, REUSING the THREE
// distinct kernel packages that own them (never truthtyping alone, never a forked enum):
//
//   - truth_kind + verifiability (+ the derived allowed_mode) ← back/kernel/truthtyping
//     (7 TruthKind, 5 VerifiabilityLevel, 4 AllowedMode). The CANONICAL truth_kind of a LevelNode
//     is truthtyping.TruthKind — the single enum source.
//   - scope (TruthScope) ← back/kernel/scope (regions/targets/segments/environments + the explicit
//     global "*" escape hatch). The active-truth rule is read for the NEED here: a resolved/drafting
//     node is "active" for scope purposes.
//   - authority (AuthorityGraph) ← back/kernel/authority. authority.TruthKind is only a WRAPPER that
//     delegates membership to truthtyping.IsKnownKind (verified in authority.go) — so the LevelNode's
//     truth_kind is coherent across the truthtyping classification and the authority admission: ONE
//     enum source. The skill classify-truth orchestrates the three; this code is the deterministic
//     authority the agent defers to (CLAUDE.md §6/§8 determinism-first).
//
// THE GATE OUTPUT is CertifyMetadata(node) → MetadataVerdict{complete, missing[], routing, ...}. It is
// a PURE TOTAL function of the three packages: no DB, no clock, no rng, no I/O, no LLM. Same node →
// same verdict (the reproducibility mirror metadata_property_test.go pins it). The four red fixtures
// (one per missing metadata) go GREEN exactly when the matching metadata is present/certifiable:
//
//   1. a node with NO truth_kind             → incomplete (CodeMissingTruthKind).
//   2. verifiability == unverifiable          → routed /spike (allowed_mode != kernel), NOT complete-to-kernel.
//   3. an ACTIVE node with NO scope (¬global) → incomplete (CodeMissingScope, scope.Validate).
//   4. a regulatory node with NO legal authority → incomplete (CodeMissingAuthorityApproval,
//      reusing authority.Decide's regulatory-without-legal done case).
//
// THE WALL (CLAUDE.md §2 + ROADMAP EL04). This file WRITES NOTHING above the line. The /spike routing
// it computes is advisory: it tells the caller a node must travel idea_capture(draft) → idea_grill →
// idea_spike (never a direct capture in "spiking"). A LevelNode still carries NO Version and NO Mirror
// (the double absence, EL03) — these metadata qualify a NEED, they do not freeze it into a truth.

import (
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
)

// Metadata is the FOUR per-truth metadata attached to a LevelNode, each a TYPED value of its owning
// kernel package (never free text). The truth_kind is truthtyping.TruthKind — the single canonical
// enum source; authority keys on the SAME enum (authority.TruthKind wraps truthtyping.IsKnownKind).
type Metadata struct {
	// TruthKind is the epistemic kind (truthtyping §13.4) — the CANONICAL enum, shared with authority.
	// Empty == absent (a not-yet-typed node).
	TruthKind truthtyping.TruthKind `json:"truth_kind,omitempty"`
	// Verifiability is the §13.5 verifiability level; its allowed_mode decides /spike routing. Empty
	// == absent.
	Verifiability truthtyping.VerifiabilityLevel `json:"verifiability,omitempty"`
	// Scope is the §13.7 where/when/for-whom qualifier. Zero value == absent (the active-truth rule
	// then rejects an active node that is not explicitly global).
	Scope scope.TruthScope `json:"scope,omitempty"`
	// Authority is the §13.8 admission graph; Granted are the roles that have granted approval/veto.
	// Both empty == no authority assigned (a regulatory node then routes MISSING_AUTHORITY_APPROVAL).
	Authority *authority.AuthorityGraph `json:"authority,omitempty"`
	// Granted are the approval/veto roles granted for the node's authority graph (read, never fetched).
	Granted []authority.Role `json:"granted,omitempty"`
}

// MetaCode is the EL04-local kebab-case incompleteness code (NOT a member of the frozen
// runtime/blockreason.Code enum — CLAUDE.md §9 forbids inventing members there). Each names exactly
// one missing-metadata case, surfaced verbatim by the mirror + the /compound-besoin-metadata panel.
type MetaCode string

const (
	// CodeMissingTruthKind — the node declares no epistemic truth_kind (truthtyping §13.4).
	CodeMissingTruthKind MetaCode = "missing-truth-kind"
	// CodeUnknownTruthKind — the node declares a truth_kind outside the seven §13.4 members.
	CodeUnknownTruthKind MetaCode = "unknown-truth-kind"
	// CodeMissingVerifiability — the node declares no verifiability level (§13.5).
	CodeMissingVerifiability MetaCode = "missing-verifiability"
	// CodeUnknownVerifiability — the node declares a verifiability outside the five §13.5 members.
	CodeUnknownVerifiability MetaCode = "unknown-verifiability"
	// CodeMissingScope — an ACTIVE node carries no scope and is not explicitly global (scope §13.7).
	CodeMissingScope MetaCode = "missing-scope"
	// CodeMalformedScope — the node's scope carries an out-of-enum dimension (scope §13.7).
	CodeMalformedScope MetaCode = "malformed-scope"
	// CodeMissingAuthorityApproval — a node whose truth_kind requires an authority lacks its required
	// approval (authority §13.8; the regulatory-without-legal done case).
	CodeMissingAuthorityApproval MetaCode = "missing-authority-approval"
	// CodeMalformedAuthority — the node's authority graph is itself ill-formed (authority.Validate).
	CodeMalformedAuthority MetaCode = "malformed-authority"
)

// MetaGap is a single missing/ill-formed metadata, naming the door (how_to_fix) — never a prison.
type MetaGap struct {
	// Code is the EL04-local incompleteness code.
	Code MetaCode `json:"code"`
	// Field names the metadata that is missing/ill-formed (truth_kind|verifiability|scope|authority).
	Field string `json:"field"`
	// Explanation is the human-readable reason.
	Explanation string `json:"explanation"`
	// HowToFix is the actionable next step (CLAUDE.md §2 — a wall always names the door).
	HowToFix []string `json:"how_to_fix"`
}

// MetadataVerdict is the PURE verdict of CertifyMetadata over a node's four metadata. It is the EL04
// "incomplete vs complete-with-routing" answer EL07's gate (e) and EL09's completeness consume.
type MetadataVerdict struct {
	// Complete is true iff all FOUR metadata are present + certifiable (the node may proceed to the
	// gate). false when any Gap is present.
	Complete bool `json:"complete"`
	// Gaps are the missing/ill-formed metadata (empty when Complete). Deterministically ordered:
	// truth_kind, verifiability, scope, authority.
	Gaps []MetaGap `json:"gaps,omitempty"`
	// Routing is the truthtyping zone the node's verifiability routes it to (only meaningful once the
	// truth_kind + verifiability are known). ZoneKernel == may freeze later (via /goal, below the
	// wall); any other zone routes it away — most notably ZoneSpike for an unverifiable node.
	Routing truthtyping.Zone `json:"routing,omitempty"`
	// RouteToSpike is true iff Routing is /spike — the node must travel idea_capture(draft) →
	// idea_grill → idea_spike (NEVER a direct capture in "spiking"). Advisory; this file writes nothing.
	RouteToSpike bool `json:"route_to_spike"`
}

// isActiveForScope reports whether a node is "active" for the scope active-truth rule. A resolved or
// drafting node is a live need that must declare where/when/for-whom it holds; an empty node is not.
func isActiveForScope(status NodeStatus) bool {
	return status == NodeResolved || status == NodeDrafting
}

// kindNeedsAuthority reports whether a node's truth_kind requires an explicit authority owner. EL04
// reuses authority's done case: a regulatory node without legal authority is incomplete (KRD §13.8 +
// authority.Decide). Other kinds do not REQUIRE an authority graph at the need stage (it is annexed
// later via /goal). The set is declared (CLAUDE.md §8), never learned.
func kindNeedsAuthority(k truthtyping.TruthKind) bool {
	return k == truthtyping.KindRegulatory
}

// CertifyMetadata is the PURE TOTAL EL04 verdict over a node's four metadata. It REUSES the three
// kernel packages (truthtyping classification, scope.Validate, authority.Validate/Decide) and never
// re-judges them. Deterministic: same node → same verdict (the property mirror pins it).
//
// Order of checks (deterministic): truth_kind → verifiability → scope → authority. Every missing or
// ill-formed metadata becomes a MetaGap; the node is Complete iff there is no gap. The verifiability
// routing (ZoneSpike for an unverifiable node) is computed from truthtyping.Classify so the /spike
// routing is the SAME verdict the kernel classifier produces (one enum source, no fork).
func CertifyMetadata(n LevelNode, m Metadata) MetadataVerdict {
	var v MetadataVerdict

	// 1. truth_kind — the canonical enum (truthtyping). Absent or out-of-enum is a gap.
	switch {
	case m.TruthKind == "":
		v.Gaps = append(v.Gaps, MetaGap{
			Code:        CodeMissingTruthKind,
			Field:       "truth_kind",
			Explanation: "Le nœud ne déclare aucun type de vérité épistémique (truthtyping §13.4).",
			HowToFix:    []string{"declare_truth_kind"},
		})
	case !truthtyping.IsKnownKind(m.TruthKind):
		v.Gaps = append(v.Gaps, MetaGap{
			Code:        CodeUnknownTruthKind,
			Field:       "truth_kind",
			Explanation: fmt.Sprintf("truth_kind %q hors des sept membres §13.4.", m.TruthKind),
			HowToFix:    []string{"use_known_truth_kind"},
		})
	}

	// 2. verifiability — its allowed_mode decides the routing. Absent or out-of-enum is a gap; an
	//    unverifiable node is COMPLETE-but-routed-to-/spike (allowed_mode != kernel), not a gap.
	switch {
	case m.Verifiability == "":
		v.Gaps = append(v.Gaps, MetaGap{
			Code:        CodeMissingVerifiability,
			Field:       "verifiability",
			Explanation: "Le nœud ne déclare aucun niveau de vérifiabilité (§13.5).",
			HowToFix:    []string{"declare_verifiability"},
		})
	case !truthtyping.IsKnownLevel(m.Verifiability):
		v.Gaps = append(v.Gaps, MetaGap{
			Code:        CodeUnknownVerifiability,
			Field:       "verifiability",
			Explanation: fmt.Sprintf("verifiability %q hors des cinq membres §13.5.", m.Verifiability),
			HowToFix:    []string{"use_known_verifiability"},
		})
	default:
		// Reuse truthtyping.Classify for the zone — same verdict the kernel classifier produces. The
		// truth_kind may still be missing here (Classify needs it); we only consult the zone when both
		// the kind and the level are known, so the routing is the SAME single-source verdict.
		if truthtyping.IsKnownKind(m.TruthKind) {
			routing, _ := truthtyping.Classify(truthtyping.Truth{
				TruthKind:          m.TruthKind,
				VerifiabilityLevel: m.Verifiability,
			})
			v.Routing = routing.Zone
			v.RouteToSpike = routing.Zone == truthtyping.ZoneSpike
		}
	}

	// 3. scope — the active-truth rule (scope §13.7) reused for the NEED. An active node (resolved or
	//    drafting) with an empty, non-global scope is incomplete; a malformed scope is a gap too.
	scopeRec := scope.Record{Scope: m.Scope}
	if isActiveForScope(n.Status) {
		scopeRec.Status = scope.StatusActive
	} else {
		scopeRec.Status = scope.StatusDeprecated // any non-active value: the rule passes for empty nodes.
	}
	if err := scope.Validate(scopeRec); err != nil {
		var rej *scope.RejectedError
		if scope.AsRejected(err, &rej) {
			v.Gaps = append(v.Gaps, MetaGap{
				Code:        CodeMissingScope,
				Field:       "scope",
				Explanation: "Un nœud actif doit porter un TruthScope (region/target/segment/env) ou être explicitement global (region \"*\").",
				HowToFix:    []string{"declare_scope", "or_set_region_global"},
			})
		} else {
			v.Gaps = append(v.Gaps, MetaGap{
				Code:        CodeMalformedScope,
				Field:       "scope",
				Explanation: err.Error(),
				HowToFix:    []string{"fix_scope_dimension"},
			})
		}
	}

	// 4. authority — only required for kinds that need it (regulatory reuses authority's done case). A
	//    required-but-missing authority is incomplete; a malformed authority graph is a gap; a present
	//    graph whose granted set does not admit (blocked/MISSING_AUTHORITY_APPROVAL) is incomplete.
	if kindNeedsAuthority(m.TruthKind) {
		switch {
		case m.Authority == nil:
			v.Gaps = append(v.Gaps, MetaGap{
				Code:        CodeMissingAuthorityApproval,
				Field:       "authority",
				Explanation: "Une vérité réglementaire sans autorité juridique explicite est incomplète (AuthorityGraph §13.8).",
				HowToFix:    []string{"assign_authority", "obtain_legal_approval"},
			})
		default:
			if err := authority.Validate(*m.Authority); err != nil {
				v.Gaps = append(v.Gaps, MetaGap{
					Code:        CodeMalformedAuthority,
					Field:       "authority",
					Explanation: err.Error(),
					HowToFix:    []string{"fix_authority_graph"},
				})
				break
			}
			dec := authority.Decide(
				*m.Authority,
				authority.Truth{Domain: m.Authority.Domain, TruthKind: m.Authority.TruthKind},
				m.Granted,
			)
			if dec.Decision == authority.DecisionBlocked {
				var fix []string
				if dec.BlockReason != nil {
					fix = dec.BlockReason.HowToFix
				}
				v.Gaps = append(v.Gaps, MetaGap{
					Code:        CodeMissingAuthorityApproval,
					Field:       "authority",
					Explanation: "L'autorité ne peut admettre la vérité : approbation requise manquante (authority.Decide §13.8).",
					HowToFix:    fix,
				})
			}
		}
	}

	v.Complete = len(v.Gaps) == 0
	return v
}

// TruthKindIsCoherent reports whether a truth_kind is consistently a member of the SINGLE enum source
// across truthtyping (the canonical owner) AND authority (the wrapper that delegates to it). It is the
// determinism-first property: there is no second enum — authority.IsKnownTruthKind delegates to
// truthtyping.IsKnownKind, so the two never disagree. Pure, total.
func TruthKindIsCoherent(k truthtyping.TruthKind) bool {
	return truthtyping.IsKnownKind(k) == authority.IsKnownTruthKind(authority.TruthKind(k))
}
