// Package facetwire is FK08 (ROADMAP-fke, FKE-1.3 — les 6 tables de facettes): it WIRES the
// five non-functional facets (S/R/V/M/X) as PARALLEL COLUMNS of the same six-pair skeleton,
// each column read under its facet's angle and each pair backed by an EXISTING sensor (no new
// judge — reuse, ADR 0007). FK04 (facetcomplete) decides whether a facet's required proof
// pair is PRESENT; FK08 says, per facet, WHICH six pairs the skeleton enumerates, WHICH sensor
// proves each, and runs the same docmirror-style STRUCTURAL set-comparison so that breaking a
// pair reddens THAT facet's column (and only that one — the facets are orthogonal, FKE-1.4).
//
// THE SIX-PAIR SKELETON (FKE-1.3). Every facet — functional or not — is the same anatomy read
// through a different question. The six rungs (the same s-numbers the doc-mirror uses, FK07):
//
//	1 Spec        — the intent half (s1): what this facet PROMISES (e.g. "no secret leaks").
//	2 Behaviour   — the named behaviour the facet constrains (e.g. "createOrder authorizes").
//	3 Scenarios   — the executable examples (the Given/When/Then the facet's sensor runs).
//	4 Model       — the facet's contract shape (the policy, the budget, the migration plan…).
//	5 Contract    — the declared ↔ proven boundary (what the sensor asserts).
//	6 Evidence    — the sensor VERDICT (the proof pair's living half: green/red/absent).
//
// THE FIVE NON-FUNCTIONAL COLUMNS (FKE-1.3, each REUSES an existing sensor):
//
//	S Sécurité    — tests sécurité + police/scans (REUSE GV/gosec/gitleaks/policy evals).
//	R Fiabilité   — chaos / fault-injection / failover / restore / disjoncteurs / outbox.
//	V Évolutivité — migration expand-contract / backfill / restore (REUSE S95/migrate).
//	M Maintenab.  — arch-fitness, le 2ᵉ cliquet §47 (REUSE S102/FN02 go-arch-lint/depguard).
//	X Expérience  — ExperienceClaim §13.6, SOFT: informs, never hard-blocks (advisory column).
//
// THE COLUMN VERDICT IS A STRUCTURAL SET-COMPARISON (the judge, §8). For a facet column, the
// DECLARED rungs (the intent — what the skeleton says must be proven) are compared against the
// PROVEN rungs (the sensor side — what a living mirror/sensor actually asserts), by the SAME
// symmetric set-difference docmirror uses. A rung declared but not proven (the sensor missing
// or red) is a one-sided structural divergence → the column is RED. A rung proven but never
// declared is the symmetric divergence (also structural). PROSE never enters — only structure.
//
// X IS SOFT (FKE-1.3 / §13.6, the load-bearing asymmetry of this step). The X column runs the
// IDENTICAL structural comparison and SURFACES its divergences as ADVISORIES — but they NEVER
// flip a Verdict to red. Breaking an X pair informs (an advisory divergence) and DOES NOT
// CLICK THE RATCHET HARD. The symmetric error (§13.4 — over-constraining UX) is forbidden.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). WireColumn and WireSkeleton are PURE, TOTAL functions:
// no DB, no clock, no rng, no I/O, no LLM. Same column input ⇒ same Verdict, same divergences,
// same content hash; invariant under rung-ordering on both sides. The reproducibility property
// mirror is facetwire_property_test.go. THE WALL (§2): READS declared+proven rungs, writes
// NOTHING — the Skeleton report is a projection below the waterline, never a truth.
package facetwire

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Rung is one of the six skeleton rungs, the same anatomy every facet column shares (FKE-1.3).
// It is a CLOSED set — the rung index is the stable identifier, never invented at runtime.
type Rung string

const (
	RungSpec      Rung = "1-spec"      // s1: the facet's promise (intent half).
	RungBehaviour Rung = "2-behaviour" // s4: the named behaviour the facet constrains.
	RungScenarios Rung = "3-scenarios" // s5: the executable examples the sensor runs.
	RungModel     Rung = "4-model"     // the facet's contract shape (policy/budget/plan).
	RungContract  Rung = "5-contract"  // the declared↔proven boundary the sensor asserts.
	RungEvidence  Rung = "6-evidence"  // the sensor verdict (the proof pair's living half).
)

// rungOrder is the canonical 1→6 enumeration of the skeleton. DECLARED, never derived from map
// iteration — content-addressing and the column render depend on it being stable.
var rungOrder = []Rung{RungSpec, RungBehaviour, RungScenarios, RungModel, RungContract, RungEvidence}

// Rungs returns the six skeleton rungs in canonical order. Used so the skeleton is never
// invented and a column is always read under the full six-pair anatomy.
func Rungs() []Rung {
	out := make([]Rung, len(rungOrder))
	copy(out, rungOrder)
	return out
}

// facetSensor names the EXISTING sensor each non-functional facet REUSES (ADR 0007 — reuse,
// never reinvent). DECLARED, never learned. The functional facet F is handled by the doc-mirror
// (FK07) and the test_kind law (S06); FK08 wires the five non-functional columns.
var facetSensor = map[facets.Facet]string{
	facets.FacetSecurity:        "gv-gosec-gitleaks-policy", // S: GV scans + policy/injection evals.
	facets.FacetReliability:     "chaos-failover-restore-breaker-outbox",
	facets.FacetEvolvability:    "migrate-expand-contract-backfill-restore", // V: reuse S95/migrate.
	facets.FacetMaintainability: "arch-fitness-go-arch-lint-depguard",       // M: 2nd ratchet §47, S102/FN02.
	facets.FacetExperience:      "experience-claim",                         // X: §13.6, SOFT.
}

// SensorFor returns the existing sensor a non-functional facet reuses, and whether the facet is
// one of the five FK08 wires. F (and I, proven by the invariant plane) are not FK08 columns.
func SensorFor(f facets.Facet) (string, bool) {
	s, ok := facetSensor[f]
	return s, ok
}

// NonFunctionalColumns returns the five facets FK08 wires as parallel columns, in canonical
// octuor order (S, R, V, M, X). DECLARED — the closed set of non-functional lenses.
func NonFunctionalColumns() []facets.Facet {
	var out []facets.Facet
	for _, f := range facets.Facets() {
		if _, ok := facetSensor[f]; ok {
			out = append(out, f)
		}
	}
	return out
}

// RungState is the two-sided state of one skeleton rung in a facet column: whether the rung is
// DECLARED (the intent says it must be proven) and whether it is PROVEN (a living sensor/mirror
// actually asserts it — green). A rung Declared-but-not-Proven is the broken pair that reddens
// the column; Proven-but-not-Declared is the symmetric structural divergence.
type RungState struct {
	Rung Rung `json:"rung"`
	// Declared — the skeleton says this rung is part of the facet's required proof.
	Declared bool `json:"declared"`
	// Proven — the facet's existing sensor asserts this rung and is LIVING+green.
	Proven bool `json:"proven"`
}

// Column is one non-functional facet's six-pair skeleton instance for a kernel: the facet, the
// sensor it reuses, and the state of its six rungs. The caller (FK04 join / a runner) fills
// Declared from the FK02 facet-set + Proven from the living sensor verdicts; FK08 only JUDGES.
type Column struct {
	// KernelID — the cell this column belongs to (for the panel; not part of the column signature).
	KernelID string `json:"kernel_id,omitempty"`
	// Facet — which non-functional lens this column is (S/R/V/M/X).
	Facet facets.Facet `json:"facet"`
	// Rungs — the state of the six skeleton rungs. Order-independent (WireColumn canonicalizes).
	Rungs []RungState `json:"rungs"`
}

// DivergenceKind names why a rung is a structural divergence in a column.
type DivergenceKind string

const (
	// PairBroken — a rung is DECLARED (required) but NOT PROVEN: the facet's proof pair is
	// missing or the sensor is red. This is the broken pair that reddens the column (FKE-1.3
	// conséquence 5: a security hole, a perf/chaos regression, a lossy migration, an unsound
	// arch are monsters). Advisory on the soft X column.
	PairBroken DivergenceKind = "pair_broken"
	// PairUndeclared — a rung is PROVEN but NOT DECLARED: the sensor asserts something the
	// skeleton never required (the symmetric set-difference). Structural, never prose.
	PairUndeclared DivergenceKind = "pair_undeclared"
)

// Divergence is one structural rung-level divergence in a column. It is rendered deterministically.
type Divergence struct {
	Facet facets.Facet   `json:"facet"`
	Rung  Rung           `json:"rung"`
	Kind  DivergenceKind `json:"kind"`
	// Advisory — true iff the facet is soft (X): the divergence INFORMS, never blocks (§13.6).
	Advisory bool `json:"advisory"`
}

// ColumnReport is the verdict of one facet column: green/red, its sensor, and the structural
// rung divergences (sorted, deterministic). For a HARD facet (S/R/V/M) Verdict is red iff any
// PairBroken/PairUndeclared exists; for the SOFT facet X the divergences are advisory and the
// Verdict is ALWAYS green (it informs, never clicks the ratchet hard). A projection, never truth.
type ColumnReport struct {
	Facet       facets.Facet `json:"facet"`
	Sensor      string       `json:"sensor"`
	Soft        bool         `json:"soft"`
	Divergences []Divergence `json:"divergences"`
	// Advisories carries the SAME divergences as advisory copies when the facet is soft (X),
	// so the panel can SHOW them without them entering the Verdict. Empty for hard facets.
	Advisories []Divergence `json:"advisories,omitempty"`
	Verdict    string       `json:"verdict"` // "green" | "red"
}

// Green reports whether the column passes.
func (c ColumnReport) Green() bool { return c.Verdict == "green" }

// Advisory reports whether this column's findings are advisory (the soft X regime) — i.e. its
// divergences inform but never flip the verdict to red.
func (c ColumnReport) Advisory() bool { return c.Soft }

// WireColumn runs ONE facet column's structural set-comparison (the FK08 judge). It is PURE +
// TOTAL: it canonicalizes the rungs, takes the symmetric set-difference of DECLARED vs PROVEN,
// and renders a deterministic ColumnReport. For a HARD facet a structural divergence reddens
// the column; for the SOFT facet X the identical divergences are surfaced as ADVISORIES and the
// column stays GREEN (it informs, never blocks — §13.6). An unknown / functional facet (not one
// of the five FK08 columns) is reported green with no sensor (FK08 wires only S/R/V/M/X).
func WireColumn(col Column) ColumnReport {
	sensor, isNonFunc := SensorFor(col.Facet)
	soft := col.Facet.IsSoft()
	rep := ColumnReport{Facet: col.Facet, Sensor: sensor, Soft: soft}
	if !isNonFunc {
		// Not an FK08 column (F is the doc-mirror's; I is the invariant plane's). Nothing to wire.
		rep.Verdict = "green"
		return rep
	}

	// Index the rung states (last-wins on duplicates → total over any input).
	state := map[Rung]RungState{}
	for _, rs := range col.Rungs {
		state[rs.Rung] = rs
	}

	var divs []Divergence
	for _, r := range rungOrder {
		rs := state[r] // zero value (Declared=false, Proven=false) for an absent rung.
		switch {
		case rs.Declared && !rs.Proven:
			divs = append(divs, Divergence{Facet: col.Facet, Rung: r, Kind: PairBroken, Advisory: soft})
		case !rs.Declared && rs.Proven:
			divs = append(divs, Divergence{Facet: col.Facet, Rung: r, Kind: PairUndeclared, Advisory: soft})
		}
	}
	sortDivergences(divs)

	if soft {
		// X: the divergences inform, never block. Verdict stays green; advisories carry them.
		rep.Advisories = divs
		rep.Verdict = "green"
		return rep
	}
	rep.Divergences = divs
	if len(divs) > 0 {
		rep.Verdict = "red"
	} else {
		rep.Verdict = "green"
	}
	return rep
}

// Skeleton is the full FK08 read of a kernel: its five non-functional facet columns, judged in
// parallel. The columns are ORTHOGONAL (FKE-1.4) — a broken pair reddens its OWN column and no
// other.
type Skeleton struct {
	KernelID string   `json:"kernel_id,omitempty"`
	Columns  []Column `json:"columns"`
}

// SkeletonReport is the FK08 verdict over a kernel's five non-functional columns: the per-column
// reports (in canonical octuor order) and the overall Verdict. Verdict is red iff any HARD column
// (S/R/V/M) is red; the SOFT X column NEVER flips the overall verdict (its findings are advisory).
// Content-addressed (Bytes/Hash) like the doc-mirror Report, for parity with the truth-store.
type SkeletonReport struct {
	KernelID string         `json:"kernel_id,omitempty"`
	Columns  []ColumnReport `json:"columns"`
	// Verdict is "green" iff every HARD column is green. The soft X column is excluded.
	Verdict string `json:"verdict"`
	// Bytes / Hash — the content-addressed byte-identity surface (records.Canonicalize+Hash).
	Bytes []byte `json:"-"`
	Hash  string `json:"-"`
}

// Green reports whether the whole skeleton passes (every hard column green).
func (s SkeletonReport) Green() bool { return s.Verdict == "green" }

// WireSkeleton judges all five non-functional columns of a kernel (the FK08 squeleton 6-paires
// read across the facets). PURE + TOTAL: it judges each column, sorts the reports into canonical
// octuor order, and computes the overall verdict — red iff any HARD column is red, the soft X
// excluded. Same skeleton ⇒ byte-identical report. The reproducibility mirror pins it.
func WireSkeleton(sk Skeleton) SkeletonReport {
	rep := SkeletonReport{KernelID: sk.KernelID}
	// Judge each provided column; index by facet so we can emit in canonical order.
	byFacet := map[facets.Facet]ColumnReport{}
	for _, col := range sk.Columns {
		byFacet[col.Facet] = WireColumn(col)
	}
	hardRed := false
	for _, f := range NonFunctionalColumns() {
		cr, ok := byFacet[f]
		if !ok {
			continue // a column the kernel does not instantiate is not judged (anti over-constraint §13.4).
		}
		rep.Columns = append(rep.Columns, cr)
		if !cr.Soft && !cr.Green() {
			hardRed = true
		}
	}
	if hardRed {
		rep.Verdict = "red"
	} else {
		rep.Verdict = "green"
	}
	rep.Bytes, rep.Hash = canonicalReport(rep)
	return rep
}

// sortDivergences imposes the canonical total order on a column's divergences: by rung (the 1→6
// skeleton order), then kind. Stable so the report is byte-identical regardless of input order.
func sortDivergences(ds []Divergence) {
	rank := map[Rung]int{}
	for i, r := range rungOrder {
		rank[r] = i
	}
	sort.SliceStable(ds, func(i, j int) bool {
		if ds[i].Rung != ds[j].Rung {
			return rank[ds[i].Rung] < rank[ds[j].Rung]
		}
		return ds[i].Kind < ds[j].Kind
	})
}

// canonicalReport renders the SkeletonReport (sans Bytes/Hash) to canonical JSON and hashes it —
// the content-addressed byte-identity surface, parity with the truth-store (records.Hash). PURE.
func canonicalReport(r SkeletonReport) ([]byte, string) {
	raw, err := json.Marshal(r)
	if err != nil {
		panic(fmt.Sprintf("facetwire: marshal report: %v", err))
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		panic(fmt.Sprintf("facetwire: canonicalize report: %v", err))
	}
	return canon, records.Hash(canon)
}
