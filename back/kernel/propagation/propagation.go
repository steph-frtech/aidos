// Package propagation is the pure, weighted, thresholded RED-PROPAGATION engine of the AIDOS
// Kernel (KRD §112, §114; ADR 0018). It makes the red wave along `composes` (the 7th link, S18)
// WEIGHTED and THRESHOLDED instead of a blind cascade: each composes edge carries a DECLARED
// weight, each composite carries a DECLARED activation_threshold, and a parent's emergent
// invariant only re-opens (RED) when the cumulative activation of CHANGED children crosses the
// threshold — so a COSMETIC change does not redden the parent while a LOAD-BEARING one does
// ("épingle un défaut, pas un changement"). It builds on the S18 composes substrate
// (back/kernel/composes — same Ref/Weight/threshold shape) without forking it: this package adds
// the named §112 "fire" verdict and the `critical` admission discipline.
//
// THREE DECLARED WEIGHT TIERS (KRD §112 pair + the ADR 0018 extension):
//   - cosmetic     — a change stays below threshold (activation 0); it does not reopen the whole.
//   - load-bearing — a defect reopens the whole's emergent invariant (activation 1).
//   - critical     — the STRONGEST tier (activation 2), an above-the-line commitment that is
//     REJECTED at admission unless it carries WEIGHT EVIDENCE (a recorded provenance reference,
//     e.g. an incident id). This is the §2463 backprop discipline: a link is re-weighted upward
//     only on recorded evidence (a prod incident), never on a hunch.
//
// Weights and thresholds are DECLARED above the line, NEVER learned, NEVER defaulted silently
// (CLAUDE.md §8). This engine READS only the declared values handed in; it never writes truth (the
// wall). The activation values (0/1/2) and the `critical`-needs-evidence rule are pinned in ADR
// 0018 as above-the-line decisions, not invented in passing.
//
// PURE (CLAUDE.md §6 determinism-first): no DB, no clock, no rng, no I/O. FireParent and
// ValidateWeight are total, deterministic functions of their input — same input ⇒ same verdict —
// so the weighted red wave is replayable. The rapid property mirror pins totality/determinism, the
// cosmetic-does-not-redden invariant, the no-critical-without-evidence invariant, and the monotone
// tier ordering.
package propagation

import "fmt"

// Weight is the DECLARED weight of a composes edge (KRD §112 + ADR 0018). It is a CLOSED set of
// three: cosmetic, load-bearing, and critical. Weights are declared by the human, never learned.
type Weight string

const (
	// WeightCosmetic — a change to this part stays below threshold; it does not reopen the whole.
	WeightCosmetic Weight = "cosmetic"
	// WeightLoadBearing — a defect in this part reopens the whole's emergent invariant.
	WeightLoadBearing Weight = "load-bearing"
	// WeightCritical — the STRONGEST tier; an above-the-line commitment requiring weight evidence.
	WeightCritical Weight = "critical"
)

// Weights returns the three declared weight tiers in canonical (ascending activation) order, so
// the set of tiers is never invented downstream (the Workbench legend, the validator).
func Weights() []Weight { return []Weight{WeightCosmetic, WeightLoadBearing, WeightCritical} }

// Activation maps a DECLARED weight to its §112 activation contribution (ADR 0018, monotone, never
// learned): cosmetic = 0 < load-bearing = 1 < critical = 2. An unknown weight contributes 0 (it
// cannot reach a positive threshold — a malformed weight never silently reddens a parent; the
// validator rejects it separately).
func Activation(w Weight) float64 {
	switch w {
	case WeightCritical:
		return 2.0
	case WeightLoadBearing:
		return 1.0
	default: // cosmetic or unknown
		return 0.0
	}
}

// Verdict is a parent's aggregate verdict — exactly one of two. GREEN is the only healthy verdict;
// RED reopens the emergent invariant (the rapid invariant pins totality to this two-set).
type Verdict string

const (
	// VerdictGreen — the cumulative activation of changed children is below the parent's threshold.
	VerdictGreen Verdict = "GREEN"
	// VerdictRed — the cumulative activation reaches the parent's threshold; the invariant reopens.
	VerdictRed Verdict = "RED"
)

// Ref is a PINNED layer reference: an id plus the concrete version it points at (id@version) — the
// same pinning rule as S17's links and S18's composes (both ends pinned by version).
type Ref struct {
	ID      string `json:"id"`
	Version string `json:"version"`
}

// String renders the ref as the canonical "id@version" form.
func (r Ref) String() string { return r.ID + "@" + r.Version }

// Link is a composes edge as a value, carrying the DECLARED weight and (for `critical` only) the
// WEIGHT EVIDENCE — a recorded provenance reference (e.g. an incident id "INC-2026-014"). It mirrors
// the S18 composes.Composes shape plus the evidence field this step introduces (ADR 0018).
type Link struct {
	// Parent is the composite (the whole), pinned id@version.
	Parent Ref `json:"parent"`
	// Child is the part (the contained layer), pinned id@version.
	Child Ref `json:"child"`
	// Weight is the DECLARED edge weight (cosmetic | load-bearing | critical), KRD §112 + ADR 0018.
	Weight Weight `json:"weight"`
	// WeightEvidence is a recorded provenance reference, REQUIRED iff Weight == critical (§2463).
	WeightEvidence string `json:"weight_evidence,omitempty"`
}

// Parent is the minimal read-model of a composite layer the engine needs: its id@version and its
// DECLARED activation_threshold (KRD §112). The full Layer AST lives in the kernel schema; this is
// the projection the engine reads (the wall: read-only).
type Parent struct {
	LayerID             string  `json:"layer_id"`
	Version             string  `json:"version"`
	ActivationThreshold float64 `json:"activation_threshold"`
}

// Graph is the pure input FireParent reads: the composite parents keyed by layer id, the declared
// composes edges, and the set of children changed this cut (drives §112 activation). Where it comes
// from (the kernel join, the DAG head resolution) is owned by other steps and handed in, so
// FireParent stays a pure function.
type Graph struct {
	Parents map[string]Parent `json:"parents"`
	Edges   []Link            `json:"edges"`
	Changed []string          `json:"changed,omitempty"`
}

// BlockCode is the actionable reason a weight admission was refused (KRD §44.5).
type BlockCode string

const (
	// CodeCriticalWeightWithoutEvidence — a `critical` link was declared without weight_evidence;
	// the §2463 discipline refuses it (re-weight upward only on recorded evidence, never a hunch).
	CodeCriticalWeightWithoutEvidence BlockCode = "CRITICAL_WEIGHT_WITHOUT_EVIDENCE"
	// CodeUnknownWeight — the weight is outside the declared closed set {cosmetic|load-bearing|critical}.
	CodeUnknownWeight BlockCode = "UNKNOWN_WEIGHT"
)

// BlockReason is the actionable refusal (KRD §44.5: code, severity, explanation, how_to_fix[])
// returned by ValidateWeight. A wall without a fix path is a prison; every block names the door
// (how_to_fix non-empty). Same shape as the kernel's other BlockReasons (authority, completeness).
type BlockReason struct {
	Code        BlockCode `json:"code"`
	Severity    string    `json:"severity"`
	Explanation string    `json:"explanation"`
	HowToFix    []string  `json:"how_to_fix"`
}

// ValidateWeight enforces the §112 / ADR 0018 admission discipline for a single composes edge:
//   - a `critical` weight WITHOUT weight_evidence is REJECTED with CRITICAL_WEIGHT_WITHOUT_EVIDENCE
//     (the §2463 backprop discipline — re-weight upward only on recorded evidence);
//   - cosmetic / load-bearing need NO evidence (accepted);
//   - a `critical` weight WITH a non-empty evidence reference is accepted (the strongest tier,
//     admitted on evidence);
//   - a weight outside the declared closed set is rejected with UNKNOWN_WEIGHT.
//
// It returns nil when the link is admissible, or a *BlockReason naming the door otherwise. It
// validates the PRESENCE of an evidence reference, not its truth — verifying the referenced
// incident actually exists is a later provenance-lookup step (ADR 0018 OpenQuestion). PURE.
func ValidateWeight(l Link) *BlockReason {
	switch l.Weight {
	case WeightCosmetic, WeightLoadBearing:
		return nil
	case WeightCritical:
		if l.WeightEvidence == "" {
			return &BlockReason{
				Code:     CodeCriticalWeightWithoutEvidence,
				Severity: "error",
				Explanation: "a `critical` composes weight is an above-the-line commitment (KRD §112, " +
					"§2463): it is admitted only on recorded weight evidence (e.g. a prod incident id), " +
					"never on a hunch — this link declares `critical` with no weight_evidence.",
				HowToFix: []string{"attach_incident_evidence", "downgrade_to_load_bearing"},
			}
		}
		return nil
	default:
		return &BlockReason{
			Code:        CodeUnknownWeight,
			Severity:    "error",
			Explanation: fmt.Sprintf("weight %q is outside the declared closed set {cosmetic|load-bearing|critical} (KRD §112 + ADR 0018).", l.Weight),
			HowToFix:    []string{"declare_one_of_cosmetic_load_bearing_critical"},
		}
	}
}

// FireParent implements the §112 weighted, thresholded fire (KRD §112, §114): over the children
// CHANGED this cut, activation ← Σ Activation(weight(edge)); if activation ≥ the parent's DECLARED
// activation_threshold the parent aggregate goes RED (its emergent invariant re-opens), else it
// stays GREEN. A cosmetic change (activation 0) below a positive threshold leaves the parent GREEN
// — "épingle un défaut, pas un changement".
//
// A zero (or negative) declared threshold means "any contributing change reopens": the parent
// reddens iff activation > 0. An absent parent (no declared threshold handed in) stays GREEN (the
// engine invents no threshold — an OpenQuestion is left to the caller, never silently reddened).
//
// PURE, TOTAL (always GREEN | RED), DETERMINISTIC, never panics. Reads only declared
// edges/weights/thresholds — it invents nothing.
func FireParent(g Graph, parentID string) Verdict {
	parent, ok := g.Parents[parentID]
	if !ok {
		return VerdictGreen
	}
	act := activationOf(g, parentID)
	if parent.ActivationThreshold <= 0 {
		if act > 0 {
			return VerdictRed
		}
		return VerdictGreen
	}
	if act >= parent.ActivationThreshold {
		return VerdictRed
	}
	return VerdictGreen
}

// activationOf computes Σ Activation(weight) over the declared composes edges of `parentID` whose
// child is in the Changed set (KRD §112). Pure; reads only declared weights/edges.
func activationOf(g Graph, parentID string) float64 {
	changed := make(map[string]bool, len(g.Changed))
	for _, id := range g.Changed {
		changed[id] = true
	}
	var sum float64
	for _, e := range g.Edges {
		if e.Parent.ID == parentID && changed[e.Child.ID] {
			sum += Activation(e.Weight)
		}
	}
	return sum
}
