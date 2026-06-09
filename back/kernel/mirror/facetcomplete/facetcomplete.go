// Package facetcomplete is FK04 — the completeness law made FACET-AWARE (KRD FKE-1.3
// conséquence 5). It EXTENDS S12's bicephalous law ("vérité ↔ miroir vivant", over
// test_kind) to the full octuor: for EVERY instantiated facet of EVERY layer, the
// required PROOF PAIR (a living mirror carrying that facet) must be present and not
// diverge. A required pair missing or diverging on ANY instantiated facet is a MONSTER
// — a security hole (S), a perf regression (B), a data-losing migration (V), an unproven
// invariant (I), an unsound architecture (M) are monsters, EXACTLY like a missing
// functional test (F). The soft facet X is the sole exception: its missing pair is
// ADVISORY (informs, never hard-blocks — §13.6).
//
// THE GENERALISED MONSTER. S06 (records) hunts the monster over the FUNCTIONAL test_kind
// plane (a layer with no living mirror of a required test_kind; an orphan mirror). FK04
// hunts it over the ORTHOGONAL facet axis (FKE-1.4): a layer that DECLARES it instantiates
// a facet (HasIntent) but carries no LIVING mirror proving that facet is a monster on that
// facet's plane. The two laws COMPOSE: FK04 RE-USES records.ComputeCompleteness verbatim
// for the test_kind plane and ADDS the per-facet plane — it never re-derives or weakens the
// S06 verdict (additive, anti-overwrite §9). A kernel that S06 accepts and that instantiates
// only F (with its functional pair living) stays accepted: FK04 invalidates no conforming
// kernel.
//
// THE COLLAPSED KERNEL (anti-explosion, FKE-1.3). A kernel instantiates a facet ONLY if it
// carries that nature of truth. A pure sort function declares F+I+M, not S/B/V/R/X — and
// FK04 demands a pair ONLY for the facets it DECLARED. A "collapsed" legal kernel (F alone,
// its pair living) PASSES (done-criterion). FK04 never demands a pair for a facet the kernel
// did not instantiate — that would be the symmetric error (over-constraint, §13.4).
//
// DIVERGENCE (FKE-1.3 conséquence 5: "manquante/divergente"). A facet's pair is satisfied by
// a mirror that (a) reflects this exact layer @version, (b) carries this facet, and (c) is
// LIVING (records.Mirror.IsLiving — alive ∧ executable cert_language, KRD §805). A mirror
// that names the facet but is DEAD or non-executable is a DIVERGENT pair — the proof is
// claimed but does not run — and is a monster exactly like a missing one (it does not count).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). ComputeFacetCompleteness is a PURE, TOTAL function of
// (layers, mirrors): no DB, no clock, no rng, no I/O, no LLM. Same cut ⇒ same monster set,
// same verdict (sorted, deterministic). It returns the monster set, never a boolean it then
// satisfies (anti-Goodhart). The reproducibility property mirror pins same-input ⇒ same-output.
//
// THE WALL (CLAUDE.md §2). PURE and READ-ONLY over a projection of `mirrors ⋈ kernel ⋈
// facets` (passed in). It writes NOTHING above the waterline. The instantiated facet-set of a
// layer is set by the privileged transition at the legal door (FK02 record), never hand-posed
// here; FK04 only READS it and reports.
package facetcomplete

import (
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
)

// FacetLayer is the FK04 read-model of a kernel layer: the S06 layer projection PLUS the
// COLLAPSIBLE facet-set the layer instantiates (FK02). The facet-set carries, per facet, the
// declared intent (HasIntent) — the proof pair is satisfied not by the Instance's own
// HasProofPair flag but by a LIVING mirror carrying the facet (FK04 reads the pair from the
// `mirrors` join, not the self-declaration: the proof must RUN, not be claimed).
type FacetLayer struct {
	// Layer — the S06 layer projection (id, version, kind). Re-used verbatim.
	Layer records.Layer `json:"layer"`
	// Facets — the COLLAPSIBLE facet-set the layer instantiates (FK02). Only the facets
	// whose HasIntent is true are "instantiated" and demand a pair; the others are absent.
	Facets facets.FacetSet `json:"facets"`
}

// FacetMirror is the FK04 read-model of a mirror: the S06 mirror projection PLUS the facet it
// proves (the lens it carries). A mirror always belongs to exactly one facet plane (FK02): a
// Gherkin acceptance mirror proves F, a gosec/policy mirror proves S, a k6 budget mirror
// proves B, a rapid invariant mirror proves I, an Atlas migration mirror proves V, etc.
type FacetMirror struct {
	// Mirror — the S06 mirror projection (reflects, test_kind, cert_language, liveness…).
	Mirror records.Mirror `json:"mirror"`
	// Facet — the facet plane this mirror proves (FK02). Out-of-octuor ⇒ it proves no facet.
	Facet facets.Facet `json:"facet"`
}

// FacetMonsterReason names why a (layer, facet) is a monster on the facet plane (FK04).
type FacetMonsterReason string

const (
	// ReasonNoFacetPair — a layer DECLARES it instantiates a facet (HasIntent) but carries
	// no LIVING mirror proving that facet. The facet's required proof pair is missing OR
	// divergent (the mirror is dead / non-executable). This is the generalised monster: a
	// security hole, a perf regression, a lossy migration, an unproven invariant. Advisory
	// only for the soft facet X (§13.6).
	ReasonNoFacetPair FacetMonsterReason = "no_facet_pair"
)

// FacetMonster is one violation of the facet-aware completeness law: a declared facet of a
// layer that lacks its living proof pair. Advisory iff the facet is soft (X) — it informs the
// verdict but does not flip it to red (the symmetric error §13.4 is never over-blocking X).
type FacetMonster struct {
	Reason   FacetMonsterReason `json:"reason"`
	LayerID  string             `json:"layer_id"`
	Version  string             `json:"version"`
	Kind     string             `json:"kind,omitempty"`
	Facet    facets.Facet       `json:"facet"`
	Advisory bool               `json:"advisory"`
}

// Verdict is the facet-aware completeness verdict for a cut (FK04). COMPLETE iff there is no
// HARD monster (advisory soft-X monsters do not flip it — they inform).
type Verdict string

const (
	// VerdictComplete — no hard monster on the test_kind plane (S06) NOR on any instantiated
	// facet plane. The bicephalous law holds across the whole octuor.
	VerdictComplete Verdict = "COMPLETE"
	// VerdictRedMonster — at least one hard monster (S06 or facet-plane). The law is red.
	VerdictRedMonster Verdict = "RED_MONSTER"
)

// Result is the computed facet-aware completeness over a cut. It carries BOTH planes apart so
// the cockpit can show them: the S06 test_kind monsters (re-used verbatim) and the FK04
// per-facet monsters (sorted, deterministic). Advisory enumerates the soft-X informational
// findings (not counted in the hard verdict).
type Result struct {
	Verdict  Verdict           `json:"verdict"`
	TestKind []records.Monster `json:"test_kind_monsters"`
	Facet    []FacetMonster    `json:"facet_monsters"`
	Advisory []FacetMonster    `json:"advisory,omitempty"`
}

// ComputeFacetCompleteness is the whole FK04 law in one pure call: it COMPOSES the S06
// test_kind law (records.ComputeCompleteness — re-used, never re-derived) with the per-facet
// proof-pair law over the octuor (FKE-1.3 conséquence 5). The verdict is COMPLETE iff there is
// no HARD monster on EITHER plane; the soft facet X contributes only ADVISORY findings.
// Pure and total — same (layers, mirrors) ⇒ same Result. Returns the monster sets, never a
// boolean it then satisfies (anti-Goodhart, CLAUDE.md §8).
func ComputeFacetCompleteness(layers []FacetLayer, mirrors []FacetMirror) Result {
	// ── Plane 1 (re-used verbatim): the S06 test_kind law over the projected base records. ──
	baseLayers := make([]records.Layer, 0, len(layers))
	for _, fl := range layers {
		baseLayers = append(baseLayers, fl.Layer)
	}
	baseMirrors := make([]records.Mirror, 0, len(mirrors))
	for _, fm := range mirrors {
		baseMirrors = append(baseMirrors, fm.Mirror)
	}
	s06 := records.ComputeCompleteness(baseMirrors, baseLayers)

	// ── Plane 2 (FK04): the per-facet proof-pair law over every instantiated facet. ──
	// Index the LIVING facet-mirrors per (layer @version) → set of facets proven by a mirror
	// that reflects that layer AND is living. A dead / non-executable mirror does NOT count
	// (a divergent pair), and an out-of-octuor facet on a mirror proves nothing.
	living := make(map[records.LayerRef]map[facets.Facet]bool)
	for _, fm := range mirrors {
		if !fm.Facet.IsCanonical() {
			continue // a mirror naming a non-facet proves no facet plane.
		}
		if !fm.Mirror.IsLiving() {
			continue // divergent: the proof is claimed but does not run (KRD §805).
		}
		set, ok := living[fm.Mirror.Reflects]
		if !ok {
			set = make(map[facets.Facet]bool)
			living[fm.Mirror.Reflects] = set
		}
		set[fm.Facet] = true
	}

	var hard []FacetMonster
	var advisory []FacetMonster
	for _, fl := range layers {
		ref := fl.Layer.Ref()
		proven := living[ref]
		// Walk the layer's DECLARED facets in canonical octuor order (deterministic). A facet
		// is "instantiated" iff its intent is declared (HasIntent) — only those demand a pair.
		for _, f := range facets.Facets() {
			inst, declared := instanceOf(fl.Facets, f)
			if !declared || !inst.HasIntent {
				continue // not instantiated → no pair demanded (anti over-constraint §13.4).
			}
			if proven[f] {
				continue // the living pair is present — the facet is proven.
			}
			m := FacetMonster{
				Reason:   ReasonNoFacetPair,
				LayerID:  fl.Layer.LayerID,
				Version:  fl.Layer.Version,
				Kind:     fl.Layer.Kind,
				Facet:    f,
				Advisory: f.IsSoft(),
			}
			if m.Advisory {
				advisory = append(advisory, m)
			} else {
				hard = append(hard, m)
			}
		}
	}

	sortFacetMonsters(hard)
	sortFacetMonsters(advisory)

	verdict := VerdictComplete
	if s06.Verdict == records.VerdictRedMonster || len(hard) > 0 {
		verdict = VerdictRedMonster
	}
	return Result{
		Verdict:  verdict,
		TestKind: s06.Monsters,
		Facet:    hard,
		Advisory: advisory,
	}
}

// instanceOf returns the LAST declared Instance for facet f in the set (the FK02 record is
// canonicalised, but FK04 is total over any input — duplicates resolve to the last, and an
// undeclared facet returns declared=false). PURE.
func instanceOf(fs facets.FacetSet, f facets.Facet) (facets.Instance, bool) {
	var found facets.Instance
	ok := false
	for _, in := range fs.Instances {
		if in.Facet == f {
			found = in
			ok = true
		}
	}
	return found, ok
}

// sortFacetMonsters orders the facet-monster set deterministically: by layer id, then version,
// then canonical facet rank (the octuor order F→X). Stable so the verdict is reproducible.
func sortFacetMonsters(ms []FacetMonster) {
	rank := facetRank()
	sort.Slice(ms, func(i, j int) bool {
		if ms[i].LayerID != ms[j].LayerID {
			return ms[i].LayerID < ms[j].LayerID
		}
		if ms[i].Version != ms[j].Version {
			return ms[i].Version < ms[j].Version
		}
		return rank[ms[i].Facet] < rank[ms[j].Facet]
	})
}

// facetRank is the canonical F→X rank of each facet (the octuor order). DECLARED, never learned.
func facetRank() map[facets.Facet]int {
	r := make(map[facets.Facet]int)
	for i, f := range facets.Facets() {
		r[f] = i
	}
	return r
}
