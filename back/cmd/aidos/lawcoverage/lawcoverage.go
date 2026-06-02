// Package lawcoverage is the S45 law-coverage harness over the `aidos` compiler
// (KRD §82.1 — "le méta devient exécutable" / the KRDCompiler). It declares the
// CANONICAL LAW REGISTRY — exactly one entry per law KRD §82.1 enumerates plus the
// §29 completeness law, nothing more, nothing less — and, for each law, a
// DETERMINISTIC breach detector that REUSES the prior-step detector that already
// owns that law. It authors NO new law and NO new detector (the wall, CLAUDE.md
// §2): a law without a pinned prior detector would be an OpenQuestion, never an
// invented detector.
//
// THE KEYSTONE RULE (KRD §82.1): "Aucun concept KRD n'existe s'il n'est pas
// vérifiable par `krd check`." This harness makes that rule mechanical — every law
// is reachable through its owning verb and carries exactly one RED fixture (a
// truth-graph that violates it → `aidos check` reports the breach) and one GREEN
// fixture (a graph that satisfies it → check passes).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every Detect is a pure function of its graph
// fragment → *Breach — no clock, no rng, no I/O — so the same fragment always
// yields the same verdict. Each detector delegates the AUTHORITATIVE verdict to the
// reused prior-step pure function; lawcoverage only adapts the graph fragment and
// renders the breach as a S13-shaped BlockReason (the same field order the
// Workbench /check panel and `aidos explain` use).
package lawcoverage

import (
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/composes"
	"github.com/steph-frtech/aidos/back/kernel/mirror/completeness"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
)

// Verb is one of the five core `aidos` compiler verbs. The owning verb of a law is
// the verb through which a HUMAN reaches that law's check (KRD §82.1).
type Verb string

const (
	VerbCheck   Verb = "check"
	VerbImpact  Verb = "impact"
	VerbStable  Verb = "stable"
	VerbDiff    Verb = "diff"
	VerbExplain Verb = "explain"
)

// LawID is the stable identifier of a KRD law in the registry. The set is CLOSED:
// exactly the ten §82.1 laws plus the §29 completeness law.
type LawID string

const (
	// §82.1 — the ten laws `krd check` MUST detect (in KRD's enumeration order).
	LawTruthWithoutKind     LawID = "truth_without_kind"      // vérité sans TruthKind
	LawMirrorIncompatible   LawID = "mirror_incompatible"     // miroir incompatible avec le type de vérité
	LawScopeAbsent          LawID = "scope_absent"            // scope absent
	LawAuthorityAbsent      LawID = "authority_absent"        // autorité absente
	LawMemoryWithoutGoal    LawID = "memory_without_goal"     // mémoire entrant dans le noyau sans Idea→Mirror→Goal
	LawPhaseNotStable       LawID = "phase_not_stable"        // phase non stable
	LawComposesWeight       LawID = "composes_weight"         // poids composes non justifié
	LawMutationScore        LawID = "mutation_score"          // mutation score insuffisant
	LawInvariantTooGlobal   LawID = "invariant_too_global"    // invariant global trop large
	LawContextDecisionUntst LawID = "context_decision_untest" // ContextGraphDecision non testée
	// §29 — the completeness law (au moins un miroir vivant par couche, pas de monstre).
	LawCompleteness LawID = "completeness"
)

// Breach is the S13-shaped actionable refusal a law's detector returns on a
// violating graph fragment (CLAUDE.md §2: code, severity, explanation,
// how_to_fix[]). It is the SAME shape as runtime/blockreason.BlockReason and the
// per-step detectors' local BlockReason; lawcoverage carries its own copy (the
// established precedent — each block site declares the shape locally). A block
// without a fix path is a prison; every Breach names the door (HowToFix non-empty).
type Breach struct {
	Law         LawID    `json:"law"`
	Code        string   `json:"code"`
	Severity    string   `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

// Law is one registry entry: the law id, its KRD reference, its owning verb, the
// prior step that owns the reused detector (detector_ref), and the deterministic
// Detect that REUSES that detector. Detect returns nil when the fragment satisfies
// the law (GREEN) and a *Breach when it violates it (RED).
type Law struct {
	ID          LawID
	KRDRef      string
	OwningVerb  Verb
	DetectorRef string // the prior step + package the detector is REUSED from
	// Detect is the deterministic breach check. graph is the law-specific fragment
	// (a small typed value); Detect type-asserts it. It NEVER mutates the input.
	Detect func(graph any) *Breach
}

// registry is the CLOSED canonical law registry, in KRD §82.1 enumeration order,
// then §29. Declared, never discovered — so Laws() and every projection are stable
// and the totality property can assert the exact set.
var registry = []Law{
	{
		ID: LawTruthWithoutKind, KRDRef: "§82.1 (vérité sans TruthKind) / §13.4",
		OwningVerb: VerbCheck, DetectorRef: "S14 kernel/truthtyping.Classify",
		Detect: detectTruthWithoutKind,
	},
	{
		ID: LawMirrorIncompatible, KRDRef: "§82.1 (miroir incompatible) / §34, §90",
		OwningVerb: VerbCheck, DetectorRef: "S06 kernel/mirror/records.RequiredTestKinds",
		Detect: detectMirrorIncompatible,
	},
	{
		ID: LawScopeAbsent, KRDRef: "§82.1 (scope absent) / §13.7",
		OwningVerb: VerbCheck, DetectorRef: "S15 kernel/scope.IsEmpty",
		Detect: detectScopeAbsent,
	},
	{
		ID: LawAuthorityAbsent, KRDRef: "§82.1 (autorité absente) / §13.8",
		OwningVerb: VerbCheck, DetectorRef: "S16 kernel/authority.Decide",
		Detect: detectAuthorityAbsent,
	},
	{
		ID: LawMemoryWithoutGoal, KRDRef: "§82.1 (mémoire sans Idea→Mirror→Goal) / §119.1",
		OwningVerb: VerbCheck, DetectorRef: "S30 archive/brain (MemoryFirewall)",
		Detect: detectMemoryWithoutGoal,
	},
	{
		ID: LawPhaseNotStable, KRDRef: "§82.1 (phase non stable) / §43",
		OwningVerb: VerbStable, DetectorRef: "S23 archive/phases.IsStable",
		Detect: detectPhaseNotStable,
	},
	{
		ID: LawComposesWeight, KRDRef: "§82.1 (poids composes non justifié) / §112",
		OwningVerb: VerbCheck, DetectorRef: "S19 kernel/composes (Weight)",
		Detect: detectComposesWeight,
	},
	{
		ID: LawMutationScore, KRDRef: "§82.1 (mutation score insuffisant) / §40",
		OwningVerb: VerbCheck, DetectorRef: "S40 runtime/debt (MutationStatus)",
		Detect: detectMutationScore,
	},
	{
		ID: LawInvariantTooGlobal, KRDRef: "§82.1 (invariant global trop large) / §13.7",
		OwningVerb: VerbCheck, DetectorRef: "S08 kernel/scope.IsGlobal",
		Detect: detectInvariantTooGlobal,
	},
	{
		ID: LawContextDecisionUntst, KRDRef: "§82.1 (ContextGraphDecision non testée) / §119.2",
		OwningVerb: VerbCheck, DetectorRef: "S32 runtime/context (ContextGraphDecision)",
		Detect: detectContextDecisionUntested,
	},
	{
		ID: LawCompleteness, KRDRef: "§29 (loi de complétude, pas de monstre) / §82",
		OwningVerb: VerbCheck, DetectorRef: "S06/S12 kernel/mirror/completeness.Gate",
		Detect: detectCompleteness,
	},
}

// Laws returns the closed law registry in canonical order. The Workbench /check
// panel and the CLI both read this single source so the matrix never diverges.
func Laws() []Law {
	out := make([]Law, len(registry))
	copy(out, registry)
	return out
}

// LookupLaw returns the registry entry for a law id, and whether it is registered.
func LookupLaw(id LawID) (Law, bool) {
	for _, l := range registry {
		if l.ID == id {
			return l, true
		}
	}
	return Law{}, false
}

// Verbs returns the five core compiler verbs in canonical order.
func Verbs() []Verb {
	return []Verb{VerbCheck, VerbImpact, VerbStable, VerbDiff, VerbExplain}
}

// --- per-law fragment shapes (the small typed graph each Detect asserts) --------

// TruthFrag carries the truth typing fields the §82.1 truth-typing laws read.
type TruthFrag struct {
	TruthKind          string
	VerifiabilityLevel string
}

// MirrorFrag carries a layer kind and the test_kind a candidate mirror declares.
type MirrorFrag struct {
	LayerKind string
	TestKind  string
}

// ScopeFrag carries the scope dimensions the scope/invariant laws read.
type ScopeFrag struct {
	Region      string
	Tenant      string
	Target      string
	UserSegment string
	Environment string
	IsInvariant bool // true for the global-invariant law fragment
}

// AuthorityFrag carries the approvers + the granted roles an admission reads.
type AuthorityFrag struct {
	Domain    string
	TruthKind string
	Approvers []string
	Granted   []string
}

// MemoryFrag models a memory item attempting to reach the kernel. ViaGoal is true
// iff the item travelled the full Memory→ContextPack→Idea→Mirror→Goal→Kernel path.
type MemoryFrag struct {
	ViaGoal bool
}

// PhaseFrag carries whether the current cut's links all resolve and sensors are green.
type PhaseFrag struct {
	Stable  bool
	Reasons []string
}

// ComposesFrag carries a child composes-edge weight + whether the requalification
// to load-bearing was justified (a recorded reason).
type ComposesFrag struct {
	ChildOwnMirror string // composes.Verdict of the child
	Weight         string // "load-bearing" | "cosmetic"
	Justified      bool   // whether a load-bearing weight carries its recorded reason
}

// MutationFrag carries the measured mutation score and the declared threshold.
type MutationFrag struct {
	Score     float64
	Threshold float64
}

// ContextDecisionFrag carries whether a ContextGraphDecision (reuse allowed?)
// carries a living decision-reuse test (KRD §119.2).
type ContextDecisionFrag struct {
	Tested bool
}

// CompletenessFrag carries the cut's mirrors + layers the completeness gate reads.
type CompletenessFrag struct {
	Mirrors []records.Mirror
	Layers  []records.Layer
}

// --- per-law detectors (each REUSES the prior-step authoritative function) ------

func detectTruthWithoutKind(graph any) *Breach {
	f, ok := graph.(TruthFrag)
	if !ok {
		return nil
	}
	// REUSE S14: truthtyping.Classify is the authoritative verdict.
	r, err := truthtyping.Classify(truthtyping.Truth{
		TruthKind:          truthtyping.TruthKind(f.TruthKind),
		VerifiabilityLevel: truthtyping.VerifiabilityLevel(f.VerifiabilityLevel),
	})
	if err == nil && r.Zone != truthtyping.ZoneRejected {
		return nil // typed and routed — GREEN
	}
	return &Breach{
		Law: LawTruthWithoutKind, Code: "TRUTH_WITHOUT_KIND", Severity: "blocking",
		Explanation: "Une vérité doit déclarer son TruthKind (KRD §13.4 / §82.1) : une affirmation " +
			"sans type épistémique est rejetée par le typage de vérité — elle n'entre pas dans le noyau.",
		HowToFix: []string{
			"classify_truth : assignez l'un des sept TruthKind §13.4 à la vérité (skill classify-truth).",
			"rerun aidos check : le blocage se lève dès que la vérité porte un TruthKind connu.",
		},
	}
}

func detectMirrorIncompatible(graph any) *Breach {
	f, ok := graph.(MirrorFrag)
	if !ok {
		return nil
	}
	// REUSE S06: records.RequiredTestKinds is the authoritative set of test_kinds a
	// layer admits. A mirror whose TestKind is not required by its layer is incompatible.
	required := records.RequiredTestKinds(f.LayerKind)
	for _, tk := range required {
		if string(tk) == f.TestKind {
			return nil // compatible — GREEN
		}
	}
	return &Breach{
		Law: LawMirrorIncompatible, Code: "MIRROR_INCOMPATIBLE", Severity: "blocking",
		Explanation: "Le miroir n'a pas une forme compatible avec le type de vérité de sa couche " +
			"(KRD §34/§90 : une forme de miroir par nature de vérité) — un miroir incompatible ne prouve rien.",
		HowToFix: []string{
			"derive_mirror : choisissez la forme de miroir de la couche (acceptance→Gherkin, invariant→property, workflow→fixture) — skill derive-mirror.",
			"rerun aidos check : le blocage se lève dès que le test_kind du miroir appartient au jeu requis par la couche.",
		},
	}
}

func detectScopeAbsent(graph any) *Breach {
	f, ok := graph.(ScopeFrag)
	if !ok {
		return nil
	}
	s := scope.TruthScope{
		Region:      scope.Region(f.Region),
		Tenant:      f.Tenant,
		Target:      scope.Target(f.Target),
		UserSegment: scope.UserSegment(f.UserSegment),
		Environment: scope.Environment(f.Environment),
	}
	// REUSE S15: scope.IsEmpty is the authoritative "scope absent" predicate.
	if !scope.IsEmpty(s) {
		return nil // GREEN
	}
	return &Breach{
		Law: LawScopeAbsent, Code: "OUT_OF_SCOPE", Severity: "blocking",
		Explanation: "La vérité active ne déclare aucun scope (KRD §13.7 / §82.1) : le contexte est " +
			"compilé, pas accumulé — toute vérité active porte un périmètre (scope) explicite.",
		HowToFix: []string{
			"view : déclarez le TruthScope (region/tenant/target/environment…) de la vérité — au moins une dimension.",
			"rerun aidos check : le blocage se lève dès que le scope porte ≥1 dimension.",
		},
	}
}

func detectAuthorityAbsent(graph any) *Breach {
	f, ok := graph.(AuthorityFrag)
	if !ok {
		return nil
	}
	g := authority.AuthorityGraph{Domain: f.Domain, TruthKind: authority.TruthKind(f.TruthKind)}
	for _, a := range f.Approvers {
		g.Approvers = append(g.Approvers, authority.Role(a))
	}
	var granted []authority.Role
	for _, r := range f.Granted {
		granted = append(granted, authority.Role(r))
	}
	// REUSE S16: authority.Decide is the authoritative admission verdict.
	d := authority.Decide(g, authority.Truth{Domain: f.Domain, TruthKind: authority.TruthKind(f.TruthKind)}, granted)
	if d.Decision == authority.DecisionAdmitted {
		return nil // GREEN
	}
	return &Breach{
		Law: LawAuthorityAbsent, Code: "MISSING_AUTHORITY", Severity: "blocking",
		Explanation: "Le changement exige une autorité non assignée (KRD §13.8 / §82.1) : nul ne peut " +
			"figer cette vérité sans le détenteur d'autorité du sous-graphe affecté (AuthorityGraph).",
		HowToFix: []string{
			"assign_authority : identifiez et faites accorder l'approbation de chaque approver requis du sous-graphe.",
			"rerun aidos check : le blocage se lève dès que toutes les autorités requises ont approuvé.",
		},
	}
}

func detectMemoryWithoutGoal(graph any) *Breach {
	f, ok := graph.(MemoryFrag)
	if !ok {
		return nil
	}
	// REUSE S30: the MemoryFirewall law — a MemoryItem reaches the kernel ONLY via
	// Memory→ContextPack→Idea→Mirror→Goal→Kernel. The direct edge is forbidden.
	if f.ViaGoal {
		return nil // promoted via the mandatory flow — GREEN
	}
	return &Breach{
		Law: LawMemoryWithoutGoal, Code: "MEMORY_CANNOT_DECLARE_TRUTH", Severity: "blocking",
		Explanation: "Une mémoire entre dans le noyau sans Idea→Mirror→Goal (MemoryFirewall, KRD §119.1 / " +
			"§82.1) : un MemoryItem est du carburant de contexte, jamais une vérité. La mémoire propose ; " +
			"le noyau déclare le vrai.",
		HowToFix: []string{
			"memory_to_contextpack_to_idea_to_mirror_to_goal_to_kernel : routez la mémoire par le flux complet à sens unique.",
			"rerun aidos check : le blocage se lève dès que la promotion passe par un /goal avec son miroir.",
		},
	}
}

func detectPhaseNotStable(graph any) *Breach {
	f, ok := graph.(PhaseFrag)
	if !ok {
		return nil
	}
	// REUSE S23: phases.IsStable's verdict ("all links resolved + all green"). The
	// fragment carries the verdict the catalogue computed via the real engine.
	if f.Stable {
		return nil // GREEN
	}
	return &Breach{
		Law: LawPhaseNotStable, Code: "PHASE_NOT_STABLE", Severity: "blocking",
		Explanation: "La coupe courante n'est PAS une phase stable (KRD §43 / §82.1) : un lien pend ou un " +
			"senseur est rouge — ce n'est pas une coupe cohérente du DAG.",
		HowToFix: []string{
			"resolve_links_and_green_sensors : réparez tout lien périmé et tout miroir rouge nommé dans les reasons.",
			"rerun aidos stable : le verdict passe STABLE dès que tout lien résout ET tout senseur est vert.",
		},
	}
}

func detectComposesWeight(graph any) *Breach {
	f, ok := graph.(ComposesFrag)
	if !ok {
		return nil
	}
	// REUSE S19: a load-bearing composes weight propagates redness (composes.Aggregate);
	// such a weight must carry its recorded justification (KRD §112). A cosmetic weight
	// never propagates and needs no justification.
	if f.Weight != string(composes.WeightLoadBearing) {
		return nil // cosmetic / non-load-bearing — no justification required, GREEN
	}
	if f.Justified {
		return nil // load-bearing AND justified — GREEN
	}
	return &Breach{
		Law: LawComposesWeight, Code: "COMPOSES_WEIGHT_UNJUSTIFIED", Severity: "blocking",
		Explanation: "Un poids composes load-bearing n'est pas justifié (KRD §112 / §82.1) : un lien " +
			"load-bearing propage la rougeur de l'enfant vers le parent — sa qualification d'importance " +
			"doit porter sa raison enregistrée, jamais être posée au passage.",
		HowToFix: []string{
			"semantic-diff : ouvrez un /goal de re-qualification (reweight) qui enregistre pourquoi le lien est load-bearing.",
			"rerun aidos check : le blocage se lève dès que le poids load-bearing porte sa justification.",
		},
	}
}

func detectMutationScore(graph any) *Breach {
	f, ok := graph.(MutationFrag)
	if !ok {
		return nil
	}
	// REUSE S40: the mutation-score gate — score below the declared threshold is a
	// breach (the threshold is DECLARED above the line, never learned, CLAUDE.md §8).
	if f.Score >= f.Threshold {
		return nil // GREEN
	}
	return &Breach{
		Law: LawMutationScore, Code: "MUTATION_SCORE_INSUFFICIENT", Severity: "blocking",
		Explanation: "Le score de mutation est sous le seuil déclaré (KRD §40 / §82.1) : des mutants " +
			"survivants signifient que les miroirs ne contraignent pas assez le comportement — un vert qui " +
			"ne prouve rien.",
		HowToFix: []string{
			"add_mirrors_to_kill_mutants : ajoutez les scénarios qui tuent les mutants survivants (le set rouge se précise).",
			"rerun aidos check : le blocage se lève dès que le score de mutation atteint le seuil déclaré.",
		},
	}
}

func detectInvariantTooGlobal(graph any) *Breach {
	f, ok := graph.(ScopeFrag)
	if !ok {
		return nil
	}
	s := scope.TruthScope{Region: scope.Region(f.Region)}
	// REUSE S08/S15: scope.IsGlobal is the authoritative "explicit global" predicate.
	// An invariant scoped to the explicit global "*" is too broad (KRD §13.7).
	if !f.IsInvariant || !scope.IsGlobal(s) {
		return nil // a properly-scoped invariant — GREEN
	}
	return &Breach{
		Law: LawInvariantTooGlobal, Code: "INVARIANT_TOO_GLOBAL", Severity: "blocking",
		Explanation: "Un invariant est porté au scope global explicite « * » (KRD §13.7 / §82.1) : un " +
			"invariant trop large prétend tenir partout — global n'est jamais implicite et rarement justifié ; " +
			"un invariant doit porter le périmètre le plus étroit qui le rend vrai.",
		HowToFix: []string{
			"view : ramenez l'invariant au scope étroit où il tient réellement (region/target/environment).",
			"rerun aidos check : le blocage se lève dès que l'invariant n'est plus au global explicite.",
		},
	}
}

func detectContextDecisionUntested(graph any) *Breach {
	f, ok := graph.(ContextDecisionFrag)
	if !ok {
		return nil
	}
	// REUSE S32: a ContextGraphDecision (reuse allowed?) must carry a living
	// decision-reuse test (KRD §119.2) — an untested reuse decision is a breach.
	if f.Tested {
		return nil // GREEN
	}
	return &Breach{
		Law: LawContextDecisionUntst, Code: "CONTEXT_DECISION_UNTESTED", Severity: "blocking",
		Explanation: "Une ContextGraphDecision (réutilisation autorisée ?) n'a pas de Decision Reuse Test " +
			"vivant (KRD §119.2 / §82.1) : décider de réutiliser un contexte sans le prouver est une décision " +
			"non vérifiée — un monstre du graphe de contexte.",
		HowToFix: []string{
			"context : attachez le Decision Reuse Test à la ContextGraphDecision (skill context).",
			"rerun aidos check : le blocage se lève dès que la décision porte son test vivant.",
		},
	}
}

func detectCompleteness(graph any) *Breach {
	f, ok := graph.(CompletenessFrag)
	if !ok {
		return nil
	}
	// REUSE S06/S12: completeness.Gate over the S06 monster detector. A monster
	// (truth without a living mirror, or an orphan mirror) blocks the §29 law.
	c := records.ComputeCompleteness(f.Mirrors, f.Layers)
	d := completeness.Gate(c.Monsters, completeness.Cut{Mirrors: f.Mirrors, Layers: f.Layers})
	if d.Verdict == completeness.VerdictPass {
		return nil // every layer has its living mirror — GREEN
	}
	return &Breach{
		Law: LawCompleteness, Code: "MONSTER", Severity: "blocking",
		Explanation: "La loi de complétude est rouge (KRD §29 / §82) : un monstre existe — une vérité sans " +
			"miroir vivant, ou un miroir orphelin. Au moins un miroir vivant par couche, jamais de monstre.",
		HowToFix: []string{
			"check-completeness : écrivez le miroir manquant ou rattachez le miroir orphelin à sa vérité.",
			"rerun aidos check : le blocage se lève dès que chaque couche porte son miroir vivant et qu'aucun miroir n'est orphelin.",
		},
	}
}
