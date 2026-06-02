package lawcoverage

import "github.com/steph-frtech/aidos/back/kernel/mirror/records"

// matrix.go is the S45 LAW-COVERAGE MATRIX — the materialized form of the BDD
// mirror conceptually stored in the `mirrors` schema (reflects:
// cmd/aidos.{check,impact,stable,diff,explain}; test_kind: fixture;
// cert_language: operation-dsl/go; authority: below). For EACH registered law it
// declares exactly one RED fragment (a truth-graph that VIOLATES the law) and one
// GREEN fragment (a graph that SATISFIES it). The fixtures are MEANS-TESTS toward
// the human red (the KRD §82.1/§29 laws as written) — never a new law the agent
// invents and then grades (CLAUDE.md §8).
//
// The §29 completeness law reuses the S06 fixture vocabulary (records.Mirror /
// records.Layer). The RED fragment is a layer with no living mirror (a monster);
// the GREEN fragment is a layer carrying its required mirror.

// Cell is one law's red+green fixtures. Both are the law-specific fragment type the
// law's Detect asserts.
type Cell struct {
	Law   LawID
	Red   any // a graph fragment that violates the law (Detect → *Breach)
	Green any // a graph fragment that satisfies the law (Detect → nil)
}

// completeness fixtures (reuse the S06 records vocabulary).
var completenessRedLayers = []records.Layer{{LayerID: "checkout", Kind: "operation"}}
var completenessRedMirrors []records.Mirror // none → the layer is a monster

var completenessGreenLayers = []records.Layer{{LayerID: "checkout", Kind: "operation"}}
var completenessGreenMirrors = []records.Mirror{
	{
		MirrorID:     "checkout.fixture",
		Reflects:     records.LayerRef{LayerID: "checkout"},
		TestKind:     records.TestKindFixture,
		CertLanguage: records.CertFixture,
		Liveness:     records.LivenessAlive,
	},
}

// matrix is the CLOSED coverage matrix, one Cell per registered law, in registry
// order. The totality property asserts: every registered law appears exactly once,
// every cell maps to a registered law (no orphan fixture = no monster), each Red
// fragment yields a Breach for its law and each Green fragment yields none.
var matrix = []Cell{
	{
		Law:   LawTruthWithoutKind,
		Red:   TruthFrag{TruthKind: "", VerifiabilityLevel: "deterministic"},
		Green: TruthFrag{TruthKind: "behavioral", VerifiabilityLevel: "deterministic"},
	},
	{
		Law:   LawMirrorIncompatible,
		Red:   MirrorFrag{LayerKind: "operation", TestKind: "schema"},  // operation wants a fixture, not a schema
		Green: MirrorFrag{LayerKind: "operation", TestKind: "fixture"}, // compatible form
	},
	{
		Law:   LawScopeAbsent,
		Red:   ScopeFrag{},                          // no dimension at all
		Green: ScopeFrag{Region: "eu", Target: "*"}, // a declared perimeter
	},
	{
		Law:   LawAuthorityAbsent,
		Red:   AuthorityFrag{Domain: "checkout", TruthKind: "behavioral", Approvers: []string{"product"}, Granted: nil},
		Green: AuthorityFrag{Domain: "checkout", TruthKind: "behavioral", Approvers: []string{"product"}, Granted: []string{"product"}},
	},
	{
		Law:   LawMemoryWithoutGoal,
		Red:   MemoryFrag{ViaGoal: false}, // direct Memory→Kernel edge
		Green: MemoryFrag{ViaGoal: true},  // Memory→ContextPack→Idea→Mirror→Goal→Kernel
	},
	{
		Law:   LawPhaseNotStable,
		Red:   PhaseFrag{Stable: false, Reasons: []string{"createOrder.fixture rouge"}},
		Green: PhaseFrag{Stable: true},
	},
	{
		Law:   LawComposesWeight,
		Red:   ComposesFrag{ChildOwnMirror: "RED", Weight: "load-bearing", Justified: false},
		Green: ComposesFrag{ChildOwnMirror: "RED", Weight: "load-bearing", Justified: true},
	},
	{
		Law:   LawMutationScore,
		Red:   MutationFrag{Score: 0.40, Threshold: 0.70},
		Green: MutationFrag{Score: 0.85, Threshold: 0.70},
	},
	{
		Law:   LawInvariantTooGlobal,
		Red:   ScopeFrag{IsInvariant: true, Region: "*"},  // global "*"
		Green: ScopeFrag{IsInvariant: true, Region: "eu"}, // narrow
	},
	{
		Law:   LawContextDecisionUntst,
		Red:   ContextDecisionFrag{Tested: false},
		Green: ContextDecisionFrag{Tested: true},
	},
	{
		Law:   LawCompleteness,
		Red:   CompletenessFrag{Mirrors: completenessRedMirrors, Layers: completenessRedLayers},
		Green: CompletenessFrag{Mirrors: completenessGreenMirrors, Layers: completenessGreenLayers},
	},
}

// Matrix returns the closed coverage matrix in registry order.
func Matrix() []Cell {
	out := make([]Cell, len(matrix))
	copy(out, matrix)
	return out
}

// LookupCell returns the coverage cell for a law id.
func LookupCell(id LawID) (Cell, bool) {
	for _, c := range matrix {
		if c.Law == id {
			return c, true
		}
	}
	return Cell{}, false
}
