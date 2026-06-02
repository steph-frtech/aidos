// Package context is the pure ContextRouter of the AIDOS Runtime (KRD §141–§145). It
// compiles the MINIMAL, branch-aware ContextPack a red goal needs to be worked: only the
// load-bearing kernel nodes, the red mirrors that define the stop condition, the contracts
// that cross a bounded-context boundary, and the scoped memory — never the whole project.
//
// THE LAW (KRD §141): "trop de contexte détruit le contexte" — overload makes the agent
// invent; "on ne donne pas le projet à l'agent, on compile un pack depuis le graphe de
// vérité affecté". The router is an ALGORITHM, not a prompt and not a RAG (KRD §144,
// CLAUDE.md determinism-first): the pack is DERIVED from compute_red_set(goal) (S22, reused,
// NEVER recomputed) → affected_subgraph (§142), then filtered by declared inclusion/exclusion
// rules. The pack is content-addressed (`hash`) and reproducible: same (goal, branch, graph
// snapshot) ⇒ byte-identical pack and identical hash (it reuses the S01/S02 Canonicalize/Hash
// scheme, never forked).
//
// BRANCH-AWARE (§143): the valid cut depends on the version branch — changing the branch can
// change the cut, but a node from another branch NEVER leaks into the pack.
//
// BOUNDED-CONTEXT-AWARE (§145): a neighbor bounded context appears ONLY as its crossed PUBLIC
// contract, never as internal layers/mirrors — a checkout goal does NOT receive billing
// internals.
//
// PROGRESSIVE DISCLOSURE (§119.3): the router NEVER gives the whole brain to the model;
// forbidden: [stale, out_of_scope, unapproved]. Stale memory is excluded; out-of-scope
// (different bounded context) memory is excluded; unapproved memory is excluded.
//
// THE WALL (CLAUDE.md §2): the pack ALWAYS renders /kernel/** and /mirror/** as forbidden
// paths regardless of the goal — the router never emits a pack that grants a truth-write
// path. The router READS the ContextGraph view handed in; it writes NO truth. PURE: no DB, no
// clock, no rng, no I/O, no LLM — the MCP server does the read-only graph reads, the algorithm
// is a total function of its argument.
package context

// Confidence is a MemoryRecord's declared confidence tier (KRD §119/§144). Memory arrives
// PRE-SCORED in the graph view (the scoring belongs to the Archive /brain step); the router
// only FILTERS by it: a record is included only when confidence ≥ repeated.
type Confidence string

const (
	// ConfidenceOnce — observed once; below the activation threshold (excluded).
	ConfidenceOnce Confidence = "once"
	// ConfidenceRepeated — observed repeatedly; the inclusion threshold (KRD §144).
	ConfidenceRepeated Confidence = "repeated"
	// ConfidenceEstablished — an established lesson (included, above repeated).
	ConfidenceEstablished Confidence = "established"
)

// AtLeastRepeated reports whether the confidence meets the inclusion threshold (≥ repeated,
// KRD §144). Exported so the property mirror can assert the eligibility rule.
func (c Confidence) AtLeastRepeated() bool { return c.rank() >= ConfidenceRepeated.rank() }

// rank orders confidence tiers so "≥ repeated" is a simple comparison. An unknown tier ranks
// below `once` so a malformed record is excluded, never crashes.
func (c Confidence) rank() int {
	switch c {
	case ConfidenceOnce:
		return 1
	case ConfidenceRepeated:
		return 2
	case ConfidenceEstablished:
		return 3
	default:
		return 0
	}
}

// MemoryKind classifies a MemoryRecord for the pack's memory section (KRD §143
// memory{relevant_lessons, recent_incidents, glossary_terms}).
type MemoryKind string

const (
	// MemoryLesson — a procedural/semantic lesson → pack.memory.relevant_lessons.
	MemoryLesson MemoryKind = "lesson"
	// MemoryIncident — a recent incident → pack.memory.recent_incidents.
	MemoryIncident MemoryKind = "incident"
	// MemoryGlossary — a glossary/ubiquitous-language term → pack.memory.glossary_terms.
	MemoryGlossary MemoryKind = "glossary"
)

// ExclusionReason is the CLOSED set of WHY a node was kept out of the pack — rendered on the
// /context-pack Excluded panel so the boundary is visible (KRD §119.3, §145).
type ExclusionReason string

const (
	// ReasonCrossBC — the node belongs to a neighbor bounded context (billing internals for a
	// checkout goal); only its crossed PUBLIC contract is admitted, never its internals.
	ReasonCrossBC ExclusionReason = "cross-BC"
	// ReasonStale — a stale MemoryRecord (KRD §119.3 forbidden).
	ReasonStale ExclusionReason = "stale"
	// ReasonOutOfScope — a MemoryRecord whose scope does not overlap the goal (KRD §119.3 forbidden).
	ReasonOutOfScope ExclusionReason = "out-of-scope"
	// ReasonUnapproved — an unapproved MemoryRecord (KRD §119.3 forbidden).
	ReasonUnapproved ExclusionReason = "unapproved"
	// ReasonCosmeticBelowThreshold — a cosmetic sibling below the activation threshold (memory
	// below confidence ≥ repeated, or a non-load-bearing layer).
	ReasonCosmeticBelowThreshold ExclusionReason = "cosmetic-below-threshold"
)

// Layer is a kernel/source node in the ContextGraph (§142). BoundedContext is the BC it
// belongs to; Branch is the version branch it exists on; LoadBearing is the declared composes
// weight (S18/S19 §112) — a cosmetic sibling below the threshold is excluded.
type Layer struct {
	ID             string `json:"id"`
	BoundedContext string `json:"bounded_context"`
	Branch         string `json:"branch"`
	LoadBearing    bool   `json:"load_bearing"`
}

// Mirror is a mirror node in the ContextGraph (§142, reuses the S06 Mirror record shape). Red
// reports whether it currently defines a stop condition (a red mirror is in the goal's red-set
// or an invariant the pack must carry).
type Mirror struct {
	ID             string `json:"id"`
	BoundedContext string `json:"bounded_context"`
	Red            bool   `json:"red"`
}

// Contract is a cross-cell contract node (§142, Pact between cells). Public marks it as the
// PUBLIC contract of its bounded context — only PUBLIC contracts cross the BC boundary into a
// neighbor's pack; internal contracts never do.
type Contract struct {
	ID             string `json:"id"`
	BoundedContext string `json:"bounded_context"`
	Public         bool   `json:"public"`
}

// MemoryRecord is a scored memory node (§142/§144). It arrives PRE-SCORED (scope, confidence,
// stale, approved) — the router only FILTERS it. Scope is the bounded context it pertains to;
// a record is in-scope iff its scope overlaps the goal's bounded context.
type MemoryRecord struct {
	ID         string     `json:"id"`
	Kind       MemoryKind `json:"kind"`
	Scope      string     `json:"scope"`
	Confidence Confidence `json:"confidence"`
	Stale      bool       `json:"stale"`
	Approved   bool       `json:"approved"`
}

// Goal is the red goal the pack is compiled for (§143). RedSet is the S22 red-set, REUSED here
// (the layer ids the goal reddens); it is NEVER recomputed by the router. BoundedContext is
// the goal's BC (a neighbor BC is admitted only as a crossed PUBLIC contract). AllowedPaths is
// the goal's working tree (e.g. /src/checkout/**).
type Goal struct {
	ID             string   `json:"id"`
	BoundedContext string   `json:"bounded_context"`
	RedSet         []string `json:"red_set"`
	AllowedPaths   []string `json:"allowed_paths"`
}

// ContextGraph is the read-only ContextGraph VIEW the router compiles over (§142). It is the
// derived `context` schema's projection, handed to the router; the router never fetches it and
// never writes it. Memory arrives pre-scored. Skills/Tools are the §149 gestures/tools the
// goal may use.
type ContextGraph struct {
	Layers    []Layer        `json:"layers"`
	Mirrors   []Mirror       `json:"mirrors"`
	Contracts []Contract     `json:"contracts"`
	Memory    []MemoryRecord `json:"memory"`
	Skills    []string       `json:"skills"`
	Tools     []string       `json:"tools"`
}

// ActiveKernel is the load-bearing kernel slice of the pack (§143): the red mirrors that
// define the stop condition, the invariants the pack must carry, and the crossed contracts.
type ActiveKernel struct {
	Mirrors    []string `json:"mirrors"`
	Invariants []string `json:"invariants"`
	Contracts  []string `json:"contracts"`
}

// Boundaries is the wall + working-tree boundary of the pack (§143, §2). ForbiddenPaths ALWAYS
// contains /kernel/** and /mirror/** — the wall rendered as a boundary.
type Boundaries struct {
	BoundedContext string   `json:"bounded_context"`
	AllowedPaths   []string `json:"allowed_paths"`
	ForbiddenPaths []string `json:"forbidden_paths"`
}

// PackMemory is the scoped, filtered memory section of the pack (§143).
type PackMemory struct {
	RelevantLessons []string `json:"relevant_lessons"`
	RecentIncidents []string `json:"recent_incidents"`
	GlossaryTerms   []string `json:"glossary_terms"`
}

// Excluded is one node kept OUT of the pack, tagged with WHY (rendered on the Excluded panel).
type Excluded struct {
	ID     string          `json:"id"`
	Reason ExclusionReason `json:"reason"`
}

// ContextPack is the compiled, minimal, branch-aware artifact (KRD §143) — "the antidote to
// context drift: where you are, what to do, what you cannot touch, how you know you are done".
// It is content-addressed (Hash) and reproducible. Excluded carries the boundary made visible.
type ContextPack struct {
	Goal           string       `json:"goal"`
	Branch         string       `json:"branch"`
	AffectedLayers []string     `json:"affected_layers"`
	ActiveKernel   ActiveKernel `json:"active_kernel"`
	Boundaries     Boundaries   `json:"boundaries"`
	Memory         PackMemory   `json:"memory"`
	Skills         []string     `json:"skills"`
	Tools          []string     `json:"tools"`
	StopCondition  string       `json:"stop_condition"`
	Excluded       []Excluded   `json:"excluded"`
	Hash           string       `json:"hash"`
}

// The wall paths every pack forbids (KRD §2 rendered as a boundary). Declared, never invented
// per-goal; the router emits these on every pack regardless of the goal.
var wallForbiddenPaths = []string{"/kernel/**", "/mirror/**"}

// The canonical stop condition every pack carries (§143, §8 — done is computed: red set →
// green ∧ prior green intact ∧ aggregate complete).
const stopCondition = "red_set_green AND previous_green_intact AND aggregate_complete"

// inSet reports membership in a string slice.
func inSet(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
