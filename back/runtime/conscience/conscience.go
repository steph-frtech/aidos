// Package conscience implements FK09 (ROADMAP-fke, FKE-6.3): the CONSCIENCE — a PURE,
// DETERMINISTIC AGGREGATOR that composes the verdicts of the EXISTING judges (the mirror
// runner, the completeness/monster law, SemanticDiff, the RealityMirror, the sensors, the
// ledger) into ONE ConsciousnessReport per kernel + the DECISION CARDS (FKE-31). It is the
// load-bearing rule of this step (FKE-6.3, grill 2026-06-07): the conscience is an
// AGGREGATOR, NOT A NEW JUDGE. An active evaluator-organ would be "the second agent that
// validates", which the Tome refuses as proof (§8). So Reconcile NEVER re-judges anything:
// it READS sourced verdicts and ROUTES them; every line of the report carries the source
// judge that produced it. A verdict the conscience itself invents is forbidden.
//
// WHAT IT COMPOSES (FKE-6.3 — "les juges existants"). The conscience reconciles the four
// dimensions the Tome's pipeline already proves, pair by pair, over EVERY instantiated facet:
//
//   - le RUNNER de miroirs        — the functional doc-mirror verdict (FK07 docmirror.Report)
//   - any extra mirror-pair verdicts the runner hands in.
//   - la COMPLÉTUDE / le monstre  — the facet-aware completeness monsters (FK04, surfaced as
//     a pair whose required proof is missing/divergent).
//   - les FACETTES                — the five non-functional facet columns (FK08
//     facetwire.SkeletonReport): S/R/V/M each a hard pair, X soft.
//   - SemanticDiff / RealityMirror / les SENSEURS / le LEDGER — sourced verdicts the caller
//     hands in (the conscience composes, never re-derives them).
//
// THE PAIR IS THE UNIT (FKE-6.3, §3747: "la conscience est le comparateur de toutes les paires
// instanciées"). Each input verdict becomes a PairVerdict — a (source, facet, pair) carrying a
// sourced verdict (green/red/advisory) and, when red, its divergence. The report is the sorted,
// content-addressed set of pair verdicts; the overall verdict is red iff any HARD pair is red.
// The SOFT facet X NEVER flips the overall verdict (§13.6) — its divergence is advisory.
//
// THE DECISION CARD (FKE-31). Every HARD divergence (a red pair) produces ONE DecisionCard: a
// deterministic, content-addressed card carrying the gap, its source, the drift class, the blast
// radius, and the §FKE-30 routing options (fix_below_wall · change_above_wall · ask_user_decision
// · block · keep_experimental · deprecate). The card is the actionable surface the cockpit renders
// — the e2e done-criterion: "une divergence produit sa decision card actionnable". A SOFT (X)
// advisory produces an advisory card (informs, never blocks). An ALIGNED kernel produces NO card.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Reconcile is PURE + TOTAL: no DB, no clock, no rng, no
// I/O, no LLM. Same input verdicts ⇒ same report, same cards, same content hash; invariant under
// input ordering. The reproducibility property mirror is conscience_property_test.go. The card
// IDs are content-addressed (records.Hash over the canonical gap), never a sequence/clock — so
// the same gap always yields the same card ID.
//
// THE WALL (CLAUDE.md §2). Reconcile READS sourced verdicts and writes NOTHING — the report and
// the cards are projections below the waterline, never a truth. A red conscience is a SIGNAL the
// cockpit surfaces; acting on a card goes idea → mirror → /goal → human decision (the card's
// options route there). REUSE, DON'T REINVENT (ADR 0007): it composes facetwire/docmirror
// verdicts verbatim and reuses kernel/records for the content-addressed hash. No new judge.
package conscience

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/mirror/facetwire"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Source names which EXISTING judge produced a verdict. The conscience composes these; it is
// NEVER itself a Source (it adds no judgment of its own — FKE-6.3). A CLOSED set.
type Source string

const (
	// SourceRunner — the mirror runner (the functional doc-mirror + acceptance/property runs).
	SourceRunner Source = "runner"
	// SourceCompleteness — the facet-aware completeness/monster law (FK04).
	SourceCompleteness Source = "completeness"
	// SourceFacet — the non-functional facet columns (FK08 facetwire).
	SourceFacet Source = "facet"
	// SourceSemanticDiff — the SemanticDiff verdict (a contract/rule change).
	SourceSemanticDiff Source = "semantic_diff"
	// SourceRealityMirror — the RealityMirror divergence (prod telemetry vs mirror).
	SourceRealityMirror Source = "reality_mirror"
	// SourceSensor — a sensor verdict (a budget/scan handed in).
	SourceSensor Source = "sensor"
	// SourceLedger — the Merkle ledger (an audit/integrity verdict).
	SourceLedger Source = "ledger"
)

// knownSources is the CLOSED set of judges the conscience composes. A verdict from an unknown
// source is REJECTED (the conscience composes only sourced verdicts — anti-fabrication).
var knownSources = map[Source]struct{}{
	SourceRunner: {}, SourceCompleteness: {}, SourceFacet: {}, SourceSemanticDiff: {},
	SourceRealityMirror: {}, SourceSensor: {}, SourceLedger: {},
}

// sourceOrder is the canonical render order of sources (DECLARED, never map iteration).
var sourceOrder = []Source{
	SourceRunner, SourceCompleteness, SourceFacet, SourceSemanticDiff,
	SourceRealityMirror, SourceSensor, SourceLedger,
}

// Verdict is the three-valued state a sourced verdict carries. The conscience COPIES it from the
// source judge — it never re-computes it. A CLOSED set.
type Verdict string

const (
	// VerdictGreen — the pair is aligned (the source judge passed it).
	VerdictGreen Verdict = "green"
	// VerdictRed — the pair diverges on a HARD facet (the source judge failed it). Blocking.
	VerdictRed Verdict = "red"
	// VerdictAdvisory — the pair diverges on the SOFT facet X (§13.6): informs, never blocks.
	VerdictAdvisory Verdict = "advisory"
)

// DriftKind is the §FKE-30 drift class a divergence carries. SOURCED — set by the source judge
// (the conscience copies it), never invented here.
type DriftKind string

const (
	DriftSemantic        DriftKind = "semantic_drift"
	DriftContract        DriftKind = "contract_drift"
	DriftSecurity        DriftKind = "security_drift"
	DriftPerformance     DriftKind = "performance_drift"
	DriftDocumentation   DriftKind = "documentation_drift"
	DriftTestGap         DriftKind = "test_gap"
	DriftEvidenceGap     DriftKind = "evidence_gap"
	DriftReliability     DriftKind = "reliability_drift"
	DriftEvolvability    DriftKind = "evolvability_drift"
	DriftMaintainability DriftKind = "maintainability_drift"
	DriftExperience      DriftKind = "experience_advisory"
	DriftIncompleteness  DriftKind = "incompleteness"
)

// BlastRadius is the §FKE-29 impact tier a divergence carries. SOURCED (the source judge or the
// caller declares it), never invented. A CLOSED ladder low→critical.
type BlastRadius string

const (
	BlastLow      BlastRadius = "low"
	BlastMedium   BlastRadius = "medium"
	BlastHigh     BlastRadius = "high"
	BlastCritical BlastRadius = "critical"
)

// SourcedVerdict is ONE verdict produced by an EXISTING judge, handed to the conscience to
// compose. It is the conscience's only input unit (besides the facet skeleton it reads directly):
// the conscience copies it into a PairVerdict and, when red/advisory, routes it to a card. The
// conscience adds NO judgment — every field here comes FROM a source judge.
type SourcedVerdict struct {
	// Source — which existing judge produced this verdict (must be in knownSources).
	Source Source `json:"source"`
	// Facet — the facet plane this verdict belongs to (F for the doc-mirror/runner, etc.).
	Facet facets.Facet `json:"facet"`
	// Pair — the pair identifier the verdict is about (e.g. "s2↔s9", "6-evidence", a behaviour ID).
	Pair string `json:"pair"`
	// Verdict — green/red/advisory, COPIED from the source judge (never re-computed).
	Verdict Verdict `json:"verdict"`
	// Drift — the §FKE-30 drift class (when red/advisory). Empty for green.
	Drift DriftKind `json:"drift,omitempty"`
	// Detail — the human-readable observed gap, verbatim from the source (e.g. "31 jours vs 30").
	Detail string `json:"detail,omitempty"`
	// Blast — the §FKE-29 blast radius the source/caller declared (defaults to low if empty).
	Blast BlastRadius `json:"blast,omitempty"`
}

// Input is the full set of sourced verdicts for one kernel, PLUS the FK08 facet skeleton the
// conscience reads directly (so the facet columns are composed verbatim, not re-typed by the
// caller). The conscience composes Skeleton's columns AND the extra SourcedVerdicts.
type Input struct {
	// KernelID — the cell being reconciled.
	KernelID string `json:"kernel_id"`
	// Skeleton — the FK08 facet skeleton (S/R/V/M/X columns). Composed directly: each broken
	// pair becomes a SourceFacet PairVerdict. Optional (a kernel may instantiate no facet column).
	Skeleton *facetwire.SkeletonReport `json:"skeleton,omitempty"`
	// Verdicts — the extra sourced verdicts (runner, completeness, SemanticDiff, RealityMirror,
	// sensors, ledger). Each is composed verbatim.
	Verdicts []SourcedVerdict `json:"verdicts,omitempty"`
}

// PairVerdict is one reconciled pair in the report: a sourced verdict carried verbatim. The
// conscience NEVER changes the Verdict — it only sorts and renders. It is the unit FKE-6.3 calls
// "la paire instanciée".
type PairVerdict struct {
	Source  Source       `json:"source"`
	Facet   facets.Facet `json:"facet"`
	Pair    string       `json:"pair"`
	Verdict Verdict      `json:"verdict"`
	Drift   DriftKind    `json:"drift,omitempty"`
	Detail  string       `json:"detail,omitempty"`
	Blast   BlastRadius  `json:"blast,omitempty"`
	// Soft — true iff the facet is X (§13.6): a red would be advisory. Carried so the renderer
	// knows the verdict can never have been hard-red on this plane.
	Soft bool `json:"soft"`
}

// CardOption is one §FKE-31 routing option on a decision card. A CLOSED set (§FKE-30/§FKE-31).
type CardOption string

const (
	OptFixBelowWall     CardOption = "fix_below_wall"
	OptChangeAboveWall  CardOption = "change_above_wall"
	OptAskUserDecision  CardOption = "ask_user_decision"
	OptBlock            CardOption = "block"
	OptKeepExperimental CardOption = "keep_experimental"
	OptDeprecate        CardOption = "deprecate"
)

// DecisionCard is the §FKE-31 actionable card the conscience emits for a divergence: the gap, the
// source judge that produced it, the drift class, the blast radius, the routing options, and a
// recommendation. It is CONTENT-ADDRESSED (ID = records.Hash over the canonical gap) so the same
// gap always yields the same card. It carries NO judgment of the conscience's own — every field
// is sourced. A SOFT (X) divergence yields an ADVISORY card (Advisory=true) that informs, never
// blocks. The card is a projection (the wall); acting on it goes idea → mirror → /goal.
type DecisionCard struct {
	// ID — content-addressed over (kernel, source, facet, pair, drift). Deterministic, idempotent.
	ID       string       `json:"id"`
	KernelID string       `json:"kernel_id"`
	Source   Source       `json:"source"`
	Facet    facets.Facet `json:"facet"`
	Pair     string       `json:"pair"`
	// Drift — the §FKE-30 class. Detail — the observed gap verbatim.
	Drift  DriftKind   `json:"drift,omitempty"`
	Detail string      `json:"detail,omitempty"`
	Blast  BlastRadius `json:"blast"`
	// Options — the §FKE-31/§FKE-30 routing options. Recommendation — the default routing.
	Options        []CardOption `json:"options"`
	Recommendation CardOption   `json:"recommendation"`
	// Advisory — true iff this card is for a SOFT (X) divergence: it informs, never blocks (§13.6).
	Advisory bool `json:"advisory"`
}

// ConsciousnessReport is the FK09 verdict over a kernel: the reconciled pair verdicts (sorted,
// deterministic), the decision cards (one per divergence), and the overall verdict. Content-
// addressed (Bytes/Hash) for parity with the truth-store. The overall verdict is red iff any HARD
// pair is red; the SOFT facet X never flips it (§13.6). A projection, never a truth (the wall).
type ConsciousnessReport struct {
	KernelID string `json:"kernel_id"`
	// Pairs — the reconciled sourced verdicts, in canonical order.
	Pairs []PairVerdict `json:"pairs"`
	// Cards — the §FKE-31 decision cards, one per divergence (red ⇒ blocking card; X ⇒ advisory).
	Cards []DecisionCard `json:"cards"`
	// Verdict — "aligned" (every hard pair green) or "drift" (a hard pair red). The SOFT X is
	// excluded — an X advisory leaves the kernel "aligned" with advisory cards.
	Verdict string `json:"verdict"`
	// Counts — sourced tallies the cockpit renders (green/red/advisory pairs).
	Green    int `json:"green"`
	Red      int `json:"red"`
	Advisory int `json:"advisory"`
	// Bytes / Hash — the content-addressed byte-identity surface (records.Canonicalize+Hash).
	Bytes []byte `json:"-"`
	Hash  string `json:"-"`
}

// Aligned reports whether the kernel is reconciled (every hard pair green — no blocking drift).
func (r ConsciousnessReport) Aligned() bool { return r.Verdict == "aligned" }

// Reconcile is the FK09 conscience: a PURE, TOTAL, DETERMINISTIC aggregator that composes the
// sourced verdicts (the facet skeleton + the extra SourcedVerdicts) into a ConsciousnessReport +
// its decision cards. It ADDS NO JUDGMENT — it copies every verdict verbatim from its source,
// sorts the pairs canonically, emits one card per divergence, and computes the overall verdict
// (red iff any HARD pair is red; the SOFT facet X never flips it — §13.6). Same input ⇒ byte-
// identical report. An unknown source is dropped (the conscience composes only sourced verdicts).
func Reconcile(in Input) ConsciousnessReport {
	rep := ConsciousnessReport{KernelID: in.KernelID}

	var pairs []PairVerdict

	// (1) Compose the FK08 facet skeleton DIRECTLY — each non-functional column becomes pair
	// verdicts. A hard column's broken pair is a red PairVerdict (SourceFacet); the soft X
	// column's divergences are advisory. A column with no divergence is one green facet pair.
	if in.Skeleton != nil {
		for _, col := range in.Skeleton.Columns {
			soft := col.Soft
			divs := col.Divergences
			if soft {
				divs = col.Advisories
			}
			if len(divs) == 0 {
				// A clean column is one green facet pair (the facet is proven aligned).
				pairs = append(pairs, PairVerdict{
					Source: SourceFacet, Facet: col.Facet, Pair: "skeleton",
					Verdict: VerdictGreen, Soft: soft,
				})
				continue
			}
			for _, d := range divs {
				v := VerdictRed
				if soft {
					v = VerdictAdvisory
				}
				pairs = append(pairs, PairVerdict{
					Source: SourceFacet, Facet: col.Facet, Pair: string(d.Rung),
					Verdict: v, Drift: facetDrift(col.Facet), Detail: string(d.Kind), Soft: soft,
				})
			}
		}
	}

	// (2) Compose the extra sourced verdicts (runner, completeness, SemanticDiff, RealityMirror,
	// sensors, ledger). Each is copied verbatim. An unknown source is dropped (anti-fabrication).
	for _, sv := range in.Verdicts {
		if _, ok := knownSources[sv.Source]; !ok {
			continue
		}
		soft := sv.Facet.IsSoft()
		v := sv.Verdict
		// A red on the SOFT facet X is downgraded to advisory (§13.6 — X never clicks hard).
		if soft && v == VerdictRed {
			v = VerdictAdvisory
		}
		blast := sv.Blast
		if blast == "" {
			blast = BlastLow
		}
		pairs = append(pairs, PairVerdict{
			Source: sv.Source, Facet: sv.Facet, Pair: sv.Pair, Verdict: v,
			Drift: sv.Drift, Detail: sv.Detail, Blast: blast, Soft: soft,
		})
	}

	sortPairs(pairs)
	rep.Pairs = pairs

	// (3) Tally + decision cards: one card per divergence (red ⇒ blocking; advisory ⇒ advisory).
	var cards []DecisionCard
	hardRed := false
	for _, p := range pairs {
		switch p.Verdict {
		case VerdictGreen:
			rep.Green++
		case VerdictRed:
			rep.Red++
			hardRed = true
			cards = append(cards, cardFor(in.KernelID, p))
		case VerdictAdvisory:
			rep.Advisory++
			cards = append(cards, cardFor(in.KernelID, p))
		}
	}
	sortCards(cards)
	rep.Cards = cards

	if hardRed {
		rep.Verdict = "drift"
	} else {
		rep.Verdict = "aligned"
	}

	rep.Bytes, rep.Hash = canonicalReport(rep)
	return rep
}

// facetDrift maps a non-functional facet to its §FKE-30 drift class. DECLARED (a closed table),
// never invented — the conscience copies the facet's nature, it judges nothing.
func facetDrift(f facets.Facet) DriftKind {
	switch f {
	case facets.FacetSecurity:
		return DriftSecurity
	case facets.FacetReliability:
		return DriftReliability
	case facets.FacetEvolvability:
		return DriftEvolvability
	case facets.FacetMaintainability:
		return DriftMaintainability
	case facets.FacetExperience:
		return DriftExperience
	default:
		return DriftSemantic
	}
}

// cardFor renders the §FKE-31 decision card for a divergent pair. The card ID is CONTENT-ADDRESSED
// over the canonical gap (kernel, source, facet, pair, drift) so the same gap always yields the
// same card. The routing options + recommendation are the §FKE-30 classification — DECLARED by the
// drift class, never an LLM judgment. A SOFT (X) divergence yields an ADVISORY card.
func cardFor(kernelID string, p PairVerdict) DecisionCard {
	blast := p.Blast
	if blast == "" {
		blast = BlastLow
	}
	opts, reco := routeOptions(p)
	c := DecisionCard{
		KernelID: kernelID, Source: p.Source, Facet: p.Facet, Pair: p.Pair,
		Drift: p.Drift, Detail: p.Detail, Blast: blast,
		Options: opts, Recommendation: reco, Advisory: p.Verdict == VerdictAdvisory,
	}
	c.ID = cardID(c)
	return c
}

// routeOptions is the §FKE-30 → §FKE-31 routing table: it maps a divergence to its options +
// recommendation, DECLARED by the drift class + the soft regime. A PURE table, never an LLM.
// A SOFT (X) advisory routes to keep_experimental (informs, never blocks — §13.6).
func routeOptions(p PairVerdict) ([]CardOption, CardOption) {
	if p.Verdict == VerdictAdvisory {
		// X / soft: the card INFORMS — it never blocks. Keep-experimental is the default.
		return []CardOption{OptKeepExperimental, OptChangeAboveWall, OptAskUserDecision}, OptKeepExperimental
	}
	switch p.Drift {
	case DriftSecurity:
		// Security divergence: block by default (a security hole is a monster, FKE-1.3).
		return []CardOption{OptBlock, OptFixBelowWall, OptAskUserDecision}, OptBlock
	case DriftContract, DriftSemantic:
		// A contract/semantic drift may be a hidden rule below OR a spec change above (§FKE-30).
		return []CardOption{OptFixBelowWall, OptChangeAboveWall, OptAskUserDecision}, OptAskUserDecision
	case DriftEvidenceGap, DriftTestGap, DriftIncompleteness:
		// A missing proof is fixed below the wall (write the mirror / sensor).
		return []CardOption{OptFixBelowWall, OptAskUserDecision, OptDeprecate}, OptFixBelowWall
	default:
		// Reliability / evolvability / maintainability / performance / doc drift.
		return []CardOption{OptFixBelowWall, OptChangeAboveWall, OptAskUserDecision}, OptAskUserDecision
	}
}

// sortPairs imposes the canonical total order: by source (declared order), then facet, then pair,
// then verdict. Stable so the report is byte-identical regardless of input order.
func sortPairs(ps []PairVerdict) {
	rank := map[Source]int{}
	for i, s := range sourceOrder {
		rank[s] = i
	}
	sort.SliceStable(ps, func(i, j int) bool {
		a, b := ps[i], ps[j]
		if a.Source != b.Source {
			return rank[a.Source] < rank[b.Source]
		}
		if a.Facet != b.Facet {
			return a.Facet < b.Facet
		}
		if a.Pair != b.Pair {
			return a.Pair < b.Pair
		}
		return a.Verdict < b.Verdict
	})
}

// sortCards orders the decision cards by their content-addressed ID (stable, deterministic).
func sortCards(cs []DecisionCard) {
	sort.SliceStable(cs, func(i, j int) bool { return cs[i].ID < cs[j].ID })
}

// cardID content-addresses a card over its canonical gap (everything but the ID itself), so the
// same gap always yields the same card ID — never a sequence or a clock (determinism-first).
func cardID(c DecisionCard) string {
	c.ID = ""
	raw, err := json.Marshal(c)
	if err != nil {
		panic(fmt.Sprintf("conscience: marshal card: %v", err))
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		panic(fmt.Sprintf("conscience: canonicalize card: %v", err))
	}
	return "DC-" + records.Hash(canon)[:12]
}

// canonicalReport renders the report (sans Bytes/Hash) to canonical JSON and hashes it — the
// content-addressed byte-identity surface (parity with the truth-store, records.Hash). PURE.
func canonicalReport(r ConsciousnessReport) ([]byte, string) {
	raw, err := json.Marshal(r)
	if err != nil {
		panic(fmt.Sprintf("conscience: marshal report: %v", err))
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		panic(fmt.Sprintf("conscience: canonicalize report: %v", err))
	}
	return canon, records.Hash(canon)
}
