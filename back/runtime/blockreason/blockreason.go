// Package blockreason is the canonical, single home of the AIDOS BlockReason — the
// actionable refusal shape reused at every KRD block site (CLAUDE.md §2, KRD §44.5).
//
// KRD §44.5: "Le mur doit bloquer sans devenir une prison. Chaque blocage doit
// expliquer quoi faire." A wall without a BlockReason becomes a prison — every
// refusal names the door out. This package gives the wall, completeness, and the
// scope/authority checks one common vocabulary: a code, a severity, a human
// explanation, and a non-empty how_to_fix resolution path.
//
// BELOW THE WATERLINE (CLAUDE.md §2/§8): a BlockReason is Runtime plumbing — it
// writes no truth, it is not a kernel truth. The Code enum is CLOSED and small: the
// three S13 codes (MISSING_MIRROR, MISSING_AUTHORITY, OUT_OF_SCOPE) plus the
// inherited AGENT_WRITE_ABOVE_WATERLINE (S04's wall). No code is invented beyond a
// human red.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): For and Render are pure total functions of
// their input — no clock, no rng, no I/O — so the same code always yields the same
// BlockReason and the same rendering. The reproducibility mirror
// (blockreason_property_test.go) pins that, and pins the prison-forbidding invariant
// (every code has a non-empty fix path).
package blockreason

import (
	"fmt"
	"strings"
)

// Code is the stable, machine-readable code of a refusal. The set is CLOSED —
// declared here, never discovered at runtime — so the Workbench /why-blocked
// projection and `aidos explain` enumerate exactly these.
type Code string

const (
	// CodeMissingMirror — a truth has no living mirror (the completeness law, KRD
	// §29/§44.5). The canonical KRD §44.5 example code.
	CodeMissingMirror Code = "MISSING_MIRROR"
	// CodeMissingAuthority — a change requires an authority that has not been
	// assigned (the AuthorityGraph, KRD §44.5 how_to_fix `assign_authority`).
	CodeMissingAuthority Code = "MISSING_AUTHORITY"
	// CodeOutOfScope — a write targets a layer outside the declared TruthScope
	// (KRD §118.2 forbidden: out_of_scope).
	CodeOutOfScope Code = "OUT_OF_SCOPE"
	// CodeAgentWriteAboveWaterline — an agent attempted to write a truth zone above
	// the waterline. INHERITED from S04's wall (back/hooks/pretooluse); folded in
	// here via a ChangeSet + SemanticDiff so the wall can import this one home
	// instead of re-declaring the shape.
	CodeAgentWriteAboveWaterline Code = "AGENT_WRITE_ABOVE_WATERLINE"
	// CodeNoMirrorNoKernel — an idea was promoted toward the kernel WITHOUT a
	// mirror. The only door from idea to truth is `idea → mirror → /goal → freeze`
	// (KRD §116/§118/§119.1): an idea with no mirror can NEVER enter the kernel.
	// ADDED at S27 (the ideas lifecycle) — an additive extension of the closed enum
	// recorded by a ChangeSet + SemanticDiff (change_type: refine, never a removal).
	CodeNoMirrorNoKernel Code = "NO_MIRROR_NO_KERNEL"
	// CodeSpikeWriteEscapesZone — while an idea is `spiking` (ratchet OFF, T0,
	// throwaway), a write whose path ESCAPES the `/spike` prefix. The spike must not
	// leak into /kernel or /src (KRD §84/§60.x). ADDED at S28 (exploration gestures),
	// ADR 0023 — additive enum extension (change_type: refine, never a removal).
	CodeSpikeWriteEscapesZone Code = "SPIKE_WRITE_ESCAPES_ZONE"
	// CodeHarvestCannotFreeze — `/harvest` attempted to write the kernel or a mirror
	// directly. Harvest PROPOSES a DRAFT Truth; it never freezes. The freeze is the
	// separate later `/goal` (KRD §116/§118). ADDED at S28 (exploration gestures),
	// ADR 0023 — additive enum extension (change_type: refine, never a removal).
	CodeHarvestCannotFreeze Code = "HARVEST_CANNOT_FREEZE"
	// CodeIdeaWithoutMirror — `/goal` was opened on an idea with no mirror_delta. An
	// idea without a mirror is a *vœu* / monster: the only door to truth is
	// idea → mirror → /goal (KRD §57, LIVRE XX). The goal is refused; no ChangeSet is
	// opened. ADDED at S29 (goal engine) — additive enum extension (change_type:
	// refine, never a removal); recorded by a ChangeSet + SemanticDiff.
	CodeIdeaWithoutMirror Code = "IDEA_WITHOUT_MIRROR"
	// CodeNoRedSet — `/goal` was opened on an idea whose mirror is ALREADY green: the
	// derived red set is empty. A test already green is not a goal — there is nothing
	// to close (KRD §56). The goal is refused. ADDED at S29 (goal engine) — additive
	// enum extension (change_type: refine, never a removal).
	CodeNoRedSet Code = "NO_RED_SET"
	// CodeGoalStillRed — the non-gameable stop (KRD §57 Algorithme ①/§8) refused to
	// CLOSE a goal: at least one of the four computed conditions fails (a still-red
	// mirror, a broken prior green, mutation < threshold, or a monster). "Done" is
	// COMPUTED, never declared — the engine never reads the agent's confidence. ADDED
	// at S29 (goal engine) — additive enum extension (change_type: refine, never a
	// removal).
	CodeGoalStillRed Code = "GOAL_STILL_RED"
	// CodeMemoryCannotDeclareTruth — the MemoryFirewall (KRD §119.1) refused the direct
	// edge Memory → Kernel: a `MemoryItem` is context fuel, never truth. No memory enters
	// /kernel except through the mandatory one-way flow
	// Memory → ContextPack → Idea → Mirror → Goal → Kernel — regardless of its confidence
	// or taint (even a clean, fully-confident memory is still not truth). "Memory proposes;
	// the kernel declares." ADDED at S30 (memory firewall) — additive enum extension
	// (change_type: refine, never a removal); recorded by a ChangeSet + SemanticDiff + ADR.
	CodeMemoryCannotDeclareTruth Code = "MEMORY_CANNOT_DECLARE_TRUTH"
	// CodeHistoricalImpactRequiresMigration — a change whose DataTruthScope.applies_to
	// touches existing_records/historical_records (a historical-impact change, KRD §44.3
	// "les données ont leur propre inertie") was made WITHOUT a declared migration.
	// Changing the truth of the code does not automatically change the truth of data
	// already produced: a historical-impact change REQUIRES a declared migration
	// (migration.required:true, a strategy in the closed §44.3 set, preserve_old_truth:true)
	// or it is refused — never a silent schema edit over historical data. ADDED at S37
	// (the db projection / DataTruthScope) — additive enum extension (change_type: refine,
	// never a removal); recorded by a ChangeSet + SemanticDiff + ADR.
	CodeHistoricalImpactRequiresMigration Code = "HISTORICAL_IMPACT_REQUIRES_MIGRATION"
	// CodeUnknownMigrationStrategy — a DataTruthScope declared a migration.strategy
	// outside the CLOSED §44.3 set {expand_contract, backfill, dual_read, dual_write}.
	// A strategy is never guessed or coerced: an unknown strategy is refused (honesty,
	// CLAUDE.md §8 — never invent a business rule). ADDED at S37 (the db projection /
	// DataTruthScope) — additive enum extension (change_type: refine, never a removal);
	// recorded by a ChangeSet + SemanticDiff + ADR.
	CodeUnknownMigrationStrategy Code = "UNKNOWN_MIGRATION_STRATEGY"
	// CodeSandboxWriteEscapesZone — while an /evolve run is active (the EvolutionSandbox
	// is open, KRD §66.1), a write whose path ESCAPES the can_write set
	// {/branches/evolution, /reports, /ideas/proposed} — typically a write to /kernel,
	// /mirrors/above, /authority, or /fitness (the cannot_write set), or any path outside
	// the can_write prefixes. "L'évolution explore, elle ne gouverne pas" : the medium
	// loop may produce candidates, branches, scores, hypotheses, suggestions — never
	// truths, approvals, exceptions, or rights. The §66.1 cannot_write set IS the §2 wall.
	// ADDED at S42 (the EvolutionSandbox) — additive enum extension (change_type: refine,
	// never a removal); recorded by a ChangeSet + SemanticDiff + ADR.
	CodeSandboxWriteEscapesZone Code = "SANDBOX_WRITE_ESCAPES_ZONE"
	// CodeSandboxCannotGovern — the /evolve loop attempted to write a truth / approval /
	// exception / right directly (a kernel freeze, a mirror, an authority approval, a
	// fitness/exception). The evolution PROPOSES; the human FREEZES via /goal (KRD
	// §118/§132). Even a green-mirror, out-of-sample-green, authority-approved variant
	// yields only a promotion PROPOSAL — never the freeze itself. ADDED at S42 (the
	// EvolutionSandbox) — additive enum extension (change_type: refine, never a removal);
	// recorded by a ChangeSet + SemanticDiff + ADR.
	CodeSandboxCannotGovern Code = "SANDBOX_CANNOT_GOVERN"
	// CodeRealityCannotDeclareTruth — the RealityMirror (KRD §53/§67/§117/§1099) refused
	// the direct edge Incident → Kernel: a prod incident / telemetry signal is REALITY, never
	// a truth. Reality is a sensor that READS the world and PROPOSES — it never writes the
	// kernel. Judging that the world disagrees with the kernel is a TRUTH DECISION, above the
	// line, owned by human + reality, not the agent (KRD §1099). The only outward edge from a
	// RealityMirror is → the S27 idea-intake door (an incident becomes an idea DRAFT); turning
	// that idea into a frozen truth is still the human's mirror + /goal + approval. ADDED at
	// S43 (the RealityMirror) — additive enum extension (change_type: refine, never a removal);
	// recorded by a ChangeSet + SemanticDiff + ADR.
	CodeRealityCannotDeclareTruth Code = "REALITY_CANNOT_DECLARE_TRUTH"
)

// Severity is the gravity marker of a refusal. The KRD §44.5 example uses
// `blocking`; the set is closed.
type Severity string

const (
	// SeverityBlocking — the refusal halts the action until the fix path is walked
	// (KRD §44.5 example).
	SeverityBlocking Severity = "blocking"
)

// BlockReason is the actionable refusal shape (KRD §44.5): a code, a severity, a
// human explanation, and a how_to_fix resolution path of length >= 1. A BlockReason
// with an empty how_to_fix IS the prison and is forbidden (the property mirror).
type BlockReason struct {
	Code        Code     `json:"code"`
	Severity    Severity `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

// reasons is the closed registry mapping each Code to its canonical BlockReason.
// The how_to_fix tokens are grounded in KRD §44.5 (write_mirror, assign_authority,
// rerun_krd_check — here `rerun aidos check`, the AIDOS CLI verb). Each path is
// non-empty: no code becomes a prison.
//
// OUT_OF_SCOPE names the in-scope target or its owner generically — TruthScope
// (the real scope record) lands at S14, so until a concrete record is supplied the
// fix path names the role, never a fabricated owner (OpenQuestion OQ-S13-scope).
var reasons = map[Code]BlockReason{
	CodeMissingMirror: {
		Code:     CodeMissingMirror,
		Severity: SeverityBlocking,
		Explanation: "La vérité visée n'a pas de miroir vivant : un comportement sans preuve BDD est un " +
			"monstre (loi de complétude, KRD §29). Aucune ligne de code sans scénario rouge d'abord.",
		HowToFix: []string{
			"write_mirror : créez le miroir (Gherkin / property / fixture) de la vérité — le rouge est le /goal.",
			"assign_authority : faites approuver le miroir par l'autorité du sous-graphe (idea → mirror → /goal → approbation).",
			"rerun aidos check : rejouez le set rouge ; le blocage se lève quand le miroir devient vivant.",
		},
	},
	CodeMissingAuthority: {
		Code:     CodeMissingAuthority,
		Severity: SeverityBlocking,
		Explanation: "Le changement exige une autorité qui n'a pas été assignée : nul ne peut figer cette " +
			"vérité sans le détenteur d'autorité du sous-graphe affecté (AuthorityGraph).",
		HowToFix: []string{
			"assign_authority : identifiez et assignez l'autorité requise pour le sous-graphe affecté.",
			"Faites approuver le ChangeSet par cette autorité — une autorité manquante n'est jamais contournée.",
			"rerun aidos check : rejouez le set rouge une fois l'autorité assignée.",
		},
	},
	CodeOutOfScope: {
		Code:     CodeOutOfScope,
		Severity: SeverityBlocking,
		Explanation: "L'écriture vise une couche hors du TruthScope déclaré : le contexte est compilé, pas " +
			"accumulé — un changement reste dans son périmètre (scope) ou passe par son propriétaire (owner).",
		HowToFix: []string{
			"Routez le changement vers la cible in-scope (l'owner / le propriétaire du périmètre déclaré).",
			"Si la cible doit changer de périmètre, ouvrez un /goal de re-scoping (rescope) auprès du scope owner.",
			"rerun aidos check : rejouez le set rouge une fois le changement ramené dans le périmètre.",
		},
	},
	CodeAgentWriteAboveWaterline: {
		Code:     CodeAgentWriteAboveWaterline,
		Severity: SeverityBlocking,
		Explanation: "Refus du mur : l'agent ne peut pas écrire au-dessus de la ligne de flottaison " +
			"(kernel / mirrors / fitness). Seul un ChangeSet approuvé, appliqué par le rôle `aidos`, écrit la vérité.",
		HowToFix: []string{
			"write_mirror : ne jamais écrire la vérité au passage — créez une idea puis son miroir (le rouge est le /goal).",
			"assign_authority : ouvrez un /goal et obtenez l'approbation humaine (idea → mirror → /goal → approbation).",
			"rerun aidos check : le ChangeSet approuvé est appliqué par le rôle `aidos`, la seule porte vers le noyau.",
		},
	},
	CodeNoMirrorNoKernel: {
		Code:     CodeNoMirrorNoKernel,
		Severity: SeverityBlocking,
		Explanation: "Refus du mur : on promeut une idée vers le noyau SANS miroir. Une idée est une " +
			"vérité-candidate sans gel ni miroir (KRD §118) ; la seule porte vers /kernel est " +
			"idea → miroir → /goal → gel (KRD §116/§119.1). Sans miroir, aucune idée n'entre jamais dans le noyau.",
		HowToFix: []string{
			"write_mirror_run_goal_freeze : écrivez le miroir BDD rouge de l'idée — ce rouge EST le /goal, et le /goal EST le gel dans /kernel.",
			"assign_authority : faites approuver le /goal par l'autorité du sous-graphe (idea → mirror → /goal → approbation).",
			"rerun aidos check : la promotion passe le mur dès que l'idée porte son miroir ; le gel est écrit par le rôle `aidos` via /goal, jamais par l'agent.",
		},
	},
	CodeSpikeWriteEscapesZone: {
		Code:     CodeSpikeWriteEscapesZone,
		Severity: SeverityBlocking,
		Explanation: "Refus du confinement : pendant qu'une idée est en `spiking` (cliquet OFF, T0, " +
			"jetable), une écriture sort de la zone `/spike`. Le spike est jetable et ne doit JAMAIS fuir " +
			"vers /kernel ni /src (KRD §84/§60.x) ; il ne gradue pas directement vers le noyau.",
		HowToFix: []string{
			"confine_write_to_/spike : ramenez l'écriture sous le préfixe `/spike` — tout ce qu'un spike produit y reste, et reste jetable.",
			"run_/harvest_to_propose_a_kernel_delta : quand l'intention découverte est nette, récoltez-la (/harvest) pour PROPOSER un delta-noyau DRAFT — c'est la seule sortie de la zone.",
			"rerun aidos check : le blocage se lève dès que l'écriture est confinée à `/spike`.",
		},
	},
	CodeHarvestCannotFreeze: {
		Code:     CodeHarvestCannotFreeze,
		Severity: SeverityBlocking,
		Explanation: "Refus du mur : /harvest tente d'écrire le noyau ou un miroir directement. Harvest " +
			"PROPOSE une DRAFT Truth (un delta-noyau candidat sans gel ni miroir) ; il ne gèle JAMAIS. " +
			"Le gel est un /goal ultérieur séparé (KRD §116/§118) : l'IA esquisse, l'humain gèle.",
		HowToFix: []string{
			"harvest_proposes_only : /harvest s'arrête à la proposition DRAFT — aucune écriture du noyau ni d'un miroir.",
			"write_mirror_run_goal_freeze : pour figer la DRAFT Truth, ouvrez un /goal séparé qui écrit son miroir (le gel) — la seule porte vers /kernel.",
			"rerun aidos check : le blocage se lève dès que harvest ne vise plus le noyau/un miroir.",
		},
	},
	CodeIdeaWithoutMirror: {
		Code:     CodeIdeaWithoutMirror,
		Severity: SeverityBlocking,
		Explanation: "Refus du /goal : on ouvre un goal sur une idée SANS miroir. Une idée sans miroir est " +
			"un vœu — un monstre (KRD §57, LIVRE XX) ; la seule porte vers la vérité est idea → miroir → /goal. " +
			"Aucun ChangeSet n'est ouvert tant que l'idée ne porte pas son miroir.",
		HowToFix: []string{
			"draft_mirror_for_idea : esquissez le miroir BDD (Gherkin / property / fixture) de l'idée — ce rouge EST le /goal.",
			"assign_authority : faites approuver le miroir par l'autorité du sous-graphe (idea → mirror → /goal → approbation).",
			"rerun aidos check : ouvrez le /goal dès que l'idée porte son mirror_delta.",
		},
	},
	CodeNoRedSet: {
		Code:     CodeNoRedSet,
		Severity: SeverityBlocking,
		Explanation: "Refus du /goal : le set rouge dérivé est VIDE — le miroir de l'idée est déjà vert. " +
			"Un test déjà vert n'est pas un goal : il n'y a rien à fermer (KRD §56, « le set rouge EST la " +
			"todo-list »). Un goal existe seulement s'il porte ≥1 miroir rouge.",
		HowToFix: []string{
			"check_the_idea_changes_something : un goal n'est légitime que si son spec_delta fait rougir ≥1 miroir ; sinon il n'y a rien à faire.",
			"open_a_real_change : reformulez l'idée pour qu'elle change réellement une couche (et fasse rougir son miroir) — la vague de rouge (S22) dérive alors un set non vide.",
			"rerun aidos check : le /goal s'ouvre dès que le set rouge dérivé est non vide.",
		},
	},
	CodeGoalStillRed: {
		Code:     CodeGoalStillRed,
		Severity: SeverityBlocking,
		Explanation: "Refus de la fermeture (stop non-gameable, KRD §57 Algorithme ①/§8) : le goal ne peut " +
			"PAS être fermé — au moins une des quatre conditions calculées échoue (un miroir encore rouge, un " +
			"vert antérieur cassé, un score de mutation sous le seuil, ou un monstre). « Done » est CALCULÉ, " +
			"jamais déclaré : le moteur ne lit jamais la confiance de l'agent.",
		HowToFix: []string{
			"close_red_mirrors : passez au vert tout miroir encore rouge du set rouge (la todo-list du goal).",
			"restore_prior_green : réparez tout vert antérieur cassé — aucune fermeture ne casse un seul vert existant (KRD §8).",
			"raise_mutation_or_remove_monster : remontez le score de mutation au-dessus du seuil et éliminez tout monstre (orphelin / vérité sans miroir).",
			"rerun aidos check : la fermeture est admise dès que les quatre conditions tiennent — jamais sur la déclaration de l'agent.",
		},
	},
	CodeMemoryCannotDeclareTruth: {
		Code:     CodeMemoryCannotDeclareTruth,
		Severity: SeverityBlocking,
		Explanation: "Refus du MemoryFirewall (KRD §119.1) : un `MemoryItem` est du carburant de " +
			"contexte, JAMAIS une vérité. Aucune mémoire n'entre dans /kernel par l'arête directe " +
			"Memory → Kernel ; la seule porte est le flux obligatoire à sens unique " +
			"Memory → ContextPack → Idea → Mirror → Goal → Kernel — quels que soient sa confiance ou " +
			"son taint (même une mémoire propre et pleinement confiante n'est pas une vérité). " +
			"« La mémoire propose ; le noyau déclare le vrai. »",
		HowToFix: []string{
			"memory_to_contextpack_to_idea_to_mirror_to_goal_to_kernel : routez la mémoire par le flux complet — proposez-la dans un ContextPack, puis remettez-la à l'idea-intake (S27) comme idée draft.",
			"write_mirror_run_goal_freeze : l'idée draft DOIT encore acquérir son miroir (le /goal) pour atteindre le noyau ; sans miroir, aucune idée n'entre jamais dans /kernel.",
			"assign_authority : faites approuver le /goal par l'autorité du sous-graphe (idea → mirror → /goal → approbation).",
			"rerun aidos check : le gel dans /kernel est écrit par le rôle `aidos` via /goal, jamais par la mémoire ni par l'agent.",
		},
	},
	CodeHistoricalImpactRequiresMigration: {
		Code:     CodeHistoricalImpactRequiresMigration,
		Severity: SeverityBlocking,
		Explanation: "Refus (DataTruthScope, KRD §44.3) : un changement touche des données déjà " +
			"produites (existing_records / historical_records) SANS migration déclarée. Changer la vérité " +
			"du code ne change pas automatiquement la vérité des données historiques — « les données ont leur " +
			"propre inertie ». Une telle modification EXIGE une migration déclarée (migration.required:true, " +
			"une stratégie du jeu fermé §44.3, audit.preserve_old_truth:true) ; jamais une modification " +
			"silencieuse du schéma sur des données historiques.",
		HowToFix: []string{
			"declare_data_truth_scope : déclarez un DataTruthScope avec migration.required:true et une stratégie ∈ {expand_contract, backfill, dual_read, dual_write}.",
			"preserve_old_truth : posez audit.preserve_old_truth:true — l'ancienne vérité sur les enregistrements historiques n'est jamais détruite (la migration est forward-only, expand→backfill→contract).",
			"rerun aidos check : le blocage se lève dès que le changement à impact historique porte sa migration déclarée — l'écriture de la déclaration passe par le rôle `aidos`, jamais par l'agent.",
		},
	},
	CodeUnknownMigrationStrategy: {
		Code:     CodeUnknownMigrationStrategy,
		Severity: SeverityBlocking,
		Explanation: "Refus (DataTruthScope, KRD §44.3) : la stratégie de migration déclarée n'appartient " +
			"pas au jeu FERMÉ {expand_contract, backfill, dual_read, dual_write}. Une stratégie n'est jamais " +
			"devinée ni coercée (honnêteté, CLAUDE.md §8) ; une stratégie inconnue est refusée.",
		HowToFix: []string{
			"use_a_known_strategy : choisissez une stratégie du jeu fermé §44.3 — expand_contract | backfill | dual_read | dual_write.",
			"do_not_invent : aucune stratégie hors de ce jeu n'est acceptée ; corrigez le DataTruthScope plutôt que d'inventer une règle.",
			"rerun aidos check : le blocage se lève dès que la stratégie déclarée est membre du jeu fermé.",
		},
	},
	CodeSandboxWriteEscapesZone: {
		Code:     CodeSandboxWriteEscapesZone,
		Severity: SeverityBlocking,
		Explanation: "Refus du sandbox (EvolutionSandbox, KRD §66.1) : pendant qu'une exécution /evolve " +
			"est active, une écriture sort de la zone autorisée {/branches/evolution, /reports, " +
			"/ideas/proposed}. La boucle moyenne EXPLORE, elle ne GOUVERNE pas : elle peut produire " +
			"candidats, branches, scores, hypothèses, suggestions — jamais des vérités, approbations, " +
			"exceptions ou droits. Tout chemin vers /kernel, /mirrors/above, /authority, /fitness (ou " +
			"hors de la zone autorisée) est refusé. Le jeu cannot_write §66.1 EST le mur §2.",
		HowToFix: []string{
			"confine_write_to_/branches/evolution_or_/reports_or_/ideas/proposed : ramenez l'écriture sous une des trois zones autorisées — tout ce que la boucle produit y reste un candidat.",
			"open_a_/goal_to_promote_a_candidate : pour qu'un candidat devienne vérité, ouvrez un /goal séparé (mirror_green ∧ out_of_sample_green ∧ authority_approval) — la seule porte vers /kernel ; l'IA propose, l'humain gèle.",
			"rerun aidos check : le blocage se lève dès que l'écriture est confinée à la zone autorisée.",
		},
	},
	CodeSandboxCannotGovern: {
		Code:     CodeSandboxCannotGovern,
		Severity: SeverityBlocking,
		Explanation: "Refus du sandbox (EvolutionSandbox, KRD §66.1/§118/§132) : la boucle /evolve tente " +
			"d'écrire directement une vérité / approbation / exception / droit (un gel du noyau, un " +
			"miroir, une approbation d'autorité, une fitness). L'évolution PROPOSE ; l'humain GÈLE " +
			"via /goal. Même une variante mirror_green ∧ out_of_sample_green ∧ authority_approval ne " +
			"produit qu'une PROPOSITION de promotion — jamais le gel lui-même. « L'évolution explore, " +
			"elle ne gouverne pas. »",
		HowToFix: []string{
			"evolve_proposes_only : /evolve s'arrête à la proposition (candidat, branche, score, hypothèse, suggestion) — aucune écriture d'une vérité/approbation/droit.",
			"open_a_/goal_to_promote_a_candidate : pour figer un candidat, ouvrez un /goal séparé qui écrit son miroir et obtient l'approbation de l'autorité — la seule porte vers /kernel.",
			"rerun aidos check : le blocage se lève dès que la boucle ne vise plus une vérité/approbation/droit.",
		},
	},
	CodeRealityCannotDeclareTruth: {
		Code:     CodeRealityCannotDeclareTruth,
		Severity: SeverityBlocking,
		Explanation: "Refus du RealityMirror (boucle externe, KRD §53/§67/§117/§1099) : un incident de " +
			"prod / un signal de télémétrie est de la RÉALITÉ, jamais une vérité. La réalité est un " +
			"sensor qui LIT le monde et PROPOSE — elle n'écrit jamais le noyau. Juger qu'un désaccord " +
			"avec le réel est vrai est une DÉCISION DE VÉRITÉ, au-dessus de la ligne, détenue par " +
			"l'humain + la réalité, pas par l'agent. La seule arête sortante d'un RealityMirror est " +
			"vers la porte idea-intake (S27) : un incident devient une idée DRAFT, jamais une vérité.",
		HowToFix: []string{
			"incident_then_learn_then_mirror_then_goal_then_approval : observez l'incident → /learn le transforme en idée DRAFT (provenance incident:#NNNN) → écrivez son miroir (le /goal) → approbation de l'autorité → gel dans /kernel.",
			"reality_proposes_only : la boucle externe lit la réalité et PROPOSE une idée ; elle n'écrit jamais /kernel, /mirrors ou /fitness — il n'existe aucune porte Incident → Kernel.",
			"rerun aidos check : le blocage est permanent sur l'arête directe ; la seule sortie est l'idée DRAFT remise à l'idea-intake (S27), qui doit encore acquérir son miroir.",
		},
	},
}

// codeOrder is the canonical enumeration order of the Code enum. Declared, never
// derived from map iteration, so Codes() and every projection are stable.
var codeOrder = []Code{
	CodeMissingMirror,
	CodeMissingAuthority,
	CodeOutOfScope,
	CodeAgentWriteAboveWaterline,
	CodeNoMirrorNoKernel,
	CodeSpikeWriteEscapesZone,
	CodeHarvestCannotFreeze,
	CodeIdeaWithoutMirror,
	CodeNoRedSet,
	CodeGoalStillRed,
	CodeMemoryCannotDeclareTruth,
	CodeHistoricalImpactRequiresMigration,
	CodeUnknownMigrationStrategy,
	CodeSandboxWriteEscapesZone,
	CodeSandboxCannotGovern,
	CodeRealityCannotDeclareTruth,
}

// Codes returns every Code in the closed enum, in canonical order.
func Codes() []Code {
	out := make([]Code, len(codeOrder))
	copy(out, codeOrder)
	return out
}

// Lookup returns the canonical BlockReason for a code, and whether the code is a
// known member of the closed enum. It invents nothing: an unknown code returns the
// zero BlockReason and false.
func Lookup(code Code) (BlockReason, bool) {
	br, ok := reasons[code]
	if !ok {
		return BlockReason{}, false
	}
	return br, true
}

// For returns the canonical BlockReason for a known code. It panics on an unknown
// code — callers that accept untrusted input use Lookup. For is the deterministic
// constructor the property mirror checks over every enum value.
func For(code Code) BlockReason {
	br, ok := Lookup(code)
	if !ok {
		panic(fmt.Sprintf("blockreason: unknown code %q (the enum is closed)", code))
	}
	return br
}

// Render writes a BlockReason as human-readable text — code, severity, explanation,
// then the numbered how_to_fix resolution path. It is the single rendering shared by
// `aidos explain` and the Workbench /why-blocked panel, so the CLI and the screen
// never diverge. Pure: it round-trips every field and invents nothing (the property
// mirror pins that).
func Render(br BlockReason) string {
	var b strings.Builder
	fmt.Fprintf(&b, "code        : %s\n", br.Code)
	fmt.Fprintf(&b, "severity    : %s\n", br.Severity)
	fmt.Fprintf(&b, "explanation : %s\n", br.Explanation)
	fmt.Fprintln(&b, "how_to_fix  :")
	for i, step := range br.HowToFix {
		fmt.Fprintf(&b, "  %d. %s\n", i+1, step)
	}
	return b.String()
}
