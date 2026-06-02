// Package adoption is the AIDOS Runtime AdoptionStage ladder (step S47): the pure,
// read-only function that names the SMALLEST RATCHET THAT CLICKS NEXT for an adopter
// installing KRD progressively (KRD §82.5 — "install the smallest ratchet that
// clicks, then extend by scars"). It COMPUTES a ladder; it never installs, mutates,
// or writes truth.
//
// FIVE DECLARED TIERS, NEVER INVENTED (CLAUDE.md honesty rule). The ladder is EXACTLY
// five tiers T0..T4 — mapped from KRD §82.5's stage0..stage5, REUSED not re-coined:
//
//   - T0 — existing tests + mutation (the floor every project already has).
//   - T1 — one KRD cell (the first verticale: idea → mirror → goal → green).
//   - T2 — kernel + mirror (the truth-store + its bicephalous proof plane).
//   - T3 — ContextGraph + Memory (the branch-aware context router + the brain).
//   - T4 — evolve + QualityDiversity (the medium loop in its EvolutionSandbox).
//
// Each tier carries a DECLARED requires/grants over Capabilities. A tier is
// SATISFIABLE iff every capability it requires is live in the passed-in view.
//
// THREE LOAD-BEARING GATING FACTS (the done criteria, KRD-pinned):
//   - T1 does NOT require QualityDiversity — QD is an ADVANCED capability (KRD §82.6,
//     not in the mandatory_minimum); asserting it at T1 is a monster.
//   - T2 REQUIRES a live RealityMirror — the external-world mirror (KRD Livre XX) must
//     ground a cell before it may enter the catastrophic tier.
//   - T4 REQUIRES a live EvolutionSandbox — the /evolve quarantine (KRD §66.1) must
//     exist before evolution may be turned on.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Plan is a pure, total function of capabilities
// alone — no DB, no I/O, no time.Now(), no RNG: same inputs ⇒ same plan. Parsing /
// gating / smallest-next-tier selection is code, never an LLM. The reproducibility
// property mirror pins it.
//
// THE WALL (CLAUDE.md §2). This package is PURE and READ-ONLY over a capability view
// (passed in). It writes NOTHING. Plan returns the report, never a boolean it then
// satisfies (anti-Goodhart). Turning on a capability (a RealityMirror, an
// EvolutionSandbox, QD) is a PRIOR/OTHER step's truth, CONSUMED here, never produced.
package adoption

// Capability is one capability an adopter may have live in the truth-store. These are
// CONSUMED facts (live or not) — this package never builds or turns one on. The set is
// declared (the gating predicates reference exactly these); the rapid property pins
// that no tier requires a capability outside the declared map.
type Capability string

const (
	// CapTests — an existing test suite (the floor; T0's grant).
	CapTests Capability = "tests"
	// CapMutation — mutation testing over those tests (T0's grant).
	CapMutation Capability = "mutation"
	// CapOneKRDCell — one full KRD cell wired (idea → mirror → goal → green); T1's grant.
	CapOneKRDCell Capability = "one_krd_cell"
	// CapKernel — the kernel truth-store (DSL ASTs in Postgres); T2's grant.
	CapKernel Capability = "kernel"
	// CapMirror — the mirrors plane (the bicephalous proof); T2's grant.
	CapMirror Capability = "mirror"
	// CapRealityMirrorLive — a LIVE RealityMirror (the external-world mirror, KRD
	// Livre XX). T2's load-bearing requirement: no catastrophic tier without reality
	// grounding. CONSUMED, never built here.
	CapRealityMirrorLive Capability = "reality_mirror_live"
	// CapContextGraph — the branch-aware ContextGraph/router; T3's grant.
	CapContextGraph Capability = "context_graph"
	// CapMemory — the brain (pgvector memory); T3's grant.
	CapMemory Capability = "memory"
	// CapEvolutionSandbox — a live EvolutionSandbox (the /evolve quarantine, KRD
	// §66.1). T4's load-bearing requirement: no evolution before its sandbox exists.
	// CONSUMED, never built here.
	CapEvolutionSandbox Capability = "evolution_sandbox"
	// CapEvolve — the /evolve medium loop turned on; T4's grant.
	CapEvolve Capability = "evolve"
	// CapQualityDiversity — QD search. KRD §82.6: ADVANCED, NOT in the mandatory
	// minimum — it is T4's grant and is NEVER a T1 requirement (the monster guard).
	CapQualityDiversity Capability = "quality_diversity"
)

// AdoptionStage is the typed ladder tier — EXACTLY five, declared, never invented.
// Mapped from KRD §82.5's stage0..stage5 (REUSED, not re-coined). The rapid property
// pins AdoptionStage ∈ { T0,T1,T2,T3,T4 }.
type AdoptionStage string

const (
	// T0 — existing tests + mutation (KRD §82.5 stage0).
	T0 AdoptionStage = "T0"
	// T1 — one KRD cell (stage1). Does NOT require QualityDiversity (§82.6).
	T1 AdoptionStage = "T1"
	// T2 — kernel + mirror (stage2). Requires a live RealityMirror (Livre XX).
	T2 AdoptionStage = "T2"
	// T3 — ContextGraph + Memory (stage3).
	T3 AdoptionStage = "T3"
	// T4 — evolve + QualityDiversity (stage4). Requires a live EvolutionSandbox (§66.1).
	T4 AdoptionStage = "T4"
)

// Stages returns the five tiers in ladder order (T0 first). Used by Plan and by the
// Workbench projection so the set of tiers is never invented.
func Stages() []AdoptionStage { return []AdoptionStage{T0, T1, T2, T3, T4} }

// stageRank orders the tiers for the monotone ladder (lower tier first). A tier is
// proposable only once every lower tier is satisfied.
var stageRank = map[AdoptionStage]int{T0: 0, T1: 1, T2: 2, T3: 3, T4: 4}

// IsStage reports whether s is one of the five declared tiers.
func IsStage(s AdoptionStage) bool { _, ok := stageRank[s]; return ok }

// tierSpec is the DECLARED requires/grants of one tier (above the line — declared,
// never learned). requires is the closed set a tier needs live to be satisfiable;
// grants is what installing the tier turns on. The three load-bearing facts live in
// these declarations: T1.requires has NO QualityDiversity, T2.requires has the
// RealityMirror, T4.requires has the EvolutionSandbox.
type tierSpec struct {
	requires []Capability
	grants   []Capability
}

// specs is the declared ladder. The mapping is KRD §82.5's stage0..stage5 — REUSED.
// Each tier requires its OWN new capabilities (the cumulative lower-tier requirements
// are enforced by the monotone-ladder rule in Plan, not duplicated here).
var specs = map[AdoptionStage]tierSpec{
	// T0 — the floor: existing tests + mutation. Requires nothing (every project has it).
	T0: {requires: nil, grants: []Capability{CapTests, CapMutation}},
	// T1 — one KRD cell. Requires the floor + one wired cell. Does NOT require QD (§82.6).
	T1: {requires: []Capability{CapTests, CapMutation, CapOneKRDCell}, grants: []Capability{CapOneKRDCell}},
	// T2 — kernel + mirror + a LIVE RealityMirror (Livre XX — the load-bearing fact).
	T2: {requires: []Capability{CapKernel, CapMirror, CapRealityMirrorLive}, grants: []Capability{CapKernel, CapMirror}},
	// T3 — ContextGraph + Memory.
	T3: {requires: []Capability{CapContextGraph, CapMemory}, grants: []Capability{CapContextGraph, CapMemory}},
	// T4 — evolve + QD, gated on a live EvolutionSandbox (§66.1 — the load-bearing fact).
	T4: {requires: []Capability{CapEvolutionSandbox, CapEvolve, CapQualityDiversity}, grants: []Capability{CapEvolve, CapQualityDiversity}},
}

// Requires returns the declared requirements of a tier (defensive copy — the input
// declaration is never exposed for mutation). Used by the panel and the property test
// (T1.requires never contains QualityDiversity).
func Requires(s AdoptionStage) []Capability {
	r := specs[s].requires
	out := make([]Capability, len(r))
	copy(out, r)
	return out
}

// Grants returns the declared grants of a tier (defensive copy).
func Grants(s AdoptionStage) []Capability {
	g := specs[s].grants
	out := make([]Capability, len(g))
	copy(out, g)
	return out
}

// Gap is one missing capability blocking a tier — it names the EXACT capability the
// view lacks (never an invented requirement) and the tier it blocks, in the ubiquitous
// language. The honesty rule: a Gap always traces to a declared requires entry.
type Gap struct {
	Stage   AdoptionStage `json:"stage"`
	Missing Capability    `json:"missing"`
	Reason  string        `json:"reason"`
}

// TierStatus is the computed status of one tier against the capability view: whether it
// is satisfiable, and the Gaps blocking it when not. Read-only; computed, never declared.
type TierStatus struct {
	Stage       AdoptionStage `json:"stage"`
	Requires    []Capability  `json:"requires"`
	Grants      []Capability  `json:"grants"`
	Satisfiable bool          `json:"satisfiable"`
	Gaps        []Gap         `json:"gaps,omitempty"`
}

// AdoptionPlan is the typed ladder report: every tier's status, the CURRENT tier (the
// highest contiguously-satisfied tier from the floor), and the NEXT smallest installable
// tier (the smallest ratchet that clicks) with its blocking gaps. Computed purely from
// the capability view; never declared.
type AdoptionPlan struct {
	Tiers   []TierStatus  `json:"tiers"`
	Current AdoptionStage `json:"current"`
	// Next is the smallest unsatisfied tier whose lower tiers are all satisfied — the
	// next ratchet that clicks. Empty when every tier is already satisfied.
	Next     AdoptionStage `json:"next,omitempty"`
	NextGaps []Gap         `json:"next_gaps,omitempty"`
	// AllSatisfied is true when every tier T0..T4 is satisfiable in the view.
	AllSatisfied bool `json:"all_satisfied"`
}

// reasonFor names a missing capability in the ubiquitous language. The three
// load-bearing facts get a KRD-pinned reason; the rest a uniform one.
func reasonFor(s AdoptionStage, c Capability) string {
	switch c {
	case CapRealityMirrorLive:
		return "bloqué jusqu'à ce qu'un RealityMirror soit vivant (le miroir du monde extérieur, KRD Livre XX — pas de palier catastrophique sans ancrage dans le réel)"
	case CapEvolutionSandbox:
		return "bloqué jusqu'à ce que l'EvolutionSandbox existe (la quarantaine de /evolve, KRD §66.1 — pas d'évolution avant son bac à sable)"
	default:
		return string(s) + " requiert la capacité « " + string(c) + " » : absente de la vue (CONSOMMÉE, jamais inventée)"
	}
}

// satisfiable reports whether every capability the tier requires is live in have, and
// returns the ordered Gaps (one per missing requirement) when not. Pure over the view.
func (ts tierSpec) status(s AdoptionStage, have map[Capability]bool) TierStatus {
	var gaps []Gap
	for _, c := range ts.requires {
		if !have[c] {
			gaps = append(gaps, Gap{Stage: s, Missing: c, Reason: reasonFor(s, c)})
		}
	}
	return TierStatus{
		Stage:       s,
		Requires:    append([]Capability(nil), ts.requires...),
		Grants:      append([]Capability(nil), ts.grants...),
		Satisfiable: len(gaps) == 0,
		Gaps:        gaps,
	}
}

// Plan computes the AdoptionPlan from the live capability view (the smallest ratchet
// that clicks next). Pure and total — no DB, no I/O, no time.Now(), no RNG; same
// capabilities ⇒ same plan (the determinism property). It NEVER installs, mutates the
// input, or writes truth (the wall). Malformed/unknown capabilities in the view are
// ignored (never panic) — only the declared ones gate.
//
// The CURRENT tier is the highest tier such that every tier from T0 up to it is
// satisfiable (the contiguous floor). The NEXT tier is the smallest unsatisfied tier
// whose lower tiers are all satisfied — the monotone-ladder rule (no jumping to T2+
// while T1 is unmet).
func Plan(capabilities []Capability) AdoptionPlan {
	have := make(map[Capability]bool, len(capabilities))
	for _, c := range capabilities {
		have[c] = true // unknown capabilities are simply present-but-ungating.
	}

	stages := Stages()
	tiers := make([]TierStatus, 0, len(stages))
	for _, s := range stages {
		tiers = append(tiers, specs[s].status(s, have))
	}

	plan := AdoptionPlan{Tiers: tiers}

	// Walk the ladder from the floor: current = the highest contiguously-satisfied
	// tier; next = the first unsatisfied tier reached (lower tiers all satisfied).
	plan.Current = ""
	allSat := true
	nextSet := false
	for i, ts := range tiers {
		if ts.Satisfiable {
			if !nextSet { // still on the contiguous satisfied floor → advance current.
				plan.Current = stages[i]
			}
			continue
		}
		allSat = false
		if !nextSet {
			plan.Next = ts.Stage
			plan.NextGaps = append([]Gap(nil), ts.Gaps...)
			nextSet = true
		}
	}
	plan.AllSatisfied = allSat
	return plan
}
