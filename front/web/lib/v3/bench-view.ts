/**
 * V3 — le TWIN de la VUE « BENCH DE COMPLÉTUDE » (DG06, ROADMAP-diffusiongemma,
 * ADR 0079 / 0088). Une PROJECTION PURE d'un run du RequirementBench → les lignes
 * affichables : par spec, le `match%`, les TYPES de requirement manquants, et le
 * différentiel par modèle (single vs A∪B). Le Go `back/runtime/requirementbench`
 * reste LA RÉFÉRENCE ; ce twin est BYTE-COHÉRENT avec lui — il rejoue EXACTEMENT
 * la même arithmétique (Extract / union / diff / MatchPct) déclarée dans
 * requirementbench.go / completeness_dg03.go / taxonomy.go.
 *
 * DÉTERMINISME-FIRST (§6/§8) : tout est une fonction PURE de (spec, candidats) — pas
 * d'horloge, pas de Math.random, pas de réseau. Même entrée ⇒ même sortie. Le JUGE
 * est l'arithmétique déterministe : MatchPct = |attendus couverts| / |attendus|
 * (vacuoirement 1,0 quand la spec déclare aucun type attendu). Un type MANQUANT est
 * une PROPOSITION (idea → mirror → /goal, via firewall.ViaIdea), jamais une écriture
 * de vérité.
 *
 * LE MUR (§2) : cette projection LIT et PROJETTE — aucune écriture kernel/mirrors/fitness.
 * Les MissingTypes sont des PROPOSITIONS de trous ; le bench PROPOSE, il ne gouverne
 * pas (ADR 0072). Miroir : bench-view.test.ts (fast-check).
 */

// ─── La taxonomie fermée (22 kinds) — byte-cohérente avec taxonomy.go ────────────────

/**
 * RequirementKind — un type atomique de requirement que la spec peut déclarer. Jeu
 * FERMÉ et DÉCLARÉ (jamais appris) : identique aux constantes Go du taxonomy.go
 * (back/runtime/requirementbench). L'arithmétique de couverture est purement ensembliste
 * sur ce jeu.
 */
export type RequirementKind =
	| "view.goal"
	| "view.zone"
	| "view.displayed"
	| "view.empty_state"
	| "control.exists"
	| "control.visible_when"
	| "control.enabled_when"
	| "control.triggers"
	| "action.invoke"
	| "action.on_success"
	| "action.on_error"
	| "operation.exists"
	| "operation.event"
	| "operation.guard"
	| "entity.exists"
	| "entity.field"
	| "entity.relation"
	| "invariant.forall"
	| "policy.authz"
	| "budget.perf_sec"
	| "case.error"
	| "case.edge";

/**
 * ALL_KINDS — le jeu FERMÉ de 22 types dans l'ordre canonique déclaré (Go AllKinds).
 * L'ordre est DÉCLARÉ, jamais appris — l'ui l'utilise pour afficher les types dans
 * l'ordre de la taxonomie, indépendamment des sets (déterminisme de l'affichage).
 */
export const ALL_KINDS: readonly RequirementKind[] = [
	"view.goal",
	"view.zone",
	"view.displayed",
	"view.empty_state",
	"control.exists",
	"control.visible_when",
	"control.enabled_when",
	"control.triggers",
	"action.invoke",
	"action.on_success",
	"action.on_error",
	"operation.exists",
	"operation.event",
	"operation.guard",
	"entity.exists",
	"entity.field",
	"entity.relation",
	"invariant.forall",
	"policy.authz",
	"budget.perf_sec",
	"case.error",
	"case.edge",
] as const;

// ─── Types d'entrée : BenchSpec + BenchCandidate ──────────────────────────────────────

/**
 * BenchSpec — la spec que le bench projette. ExpectedKinds est le SET FERMÉ de types
 * attendus (le dénominateur de MatchPct) — déclaré par le propriétaire humain (le mur,
 * §8), jamais appris ni élargi par un modèle. Byte-cohérent avec `Spec` Go.
 */
export interface BenchSpec {
	readonly id: string;
	readonly specText: string;
	readonly expectedKinds: readonly RequirementKind[];
}

/**
 * BenchCandidate — UN candidat comparé sur une spec : son rôle (p. ex. "single" pour le
 * recompile déterministe, "A"/"B" pour des modèles divergents — ADR 0079) et son texte
 * brut. Byte-cohérent avec `LLMOutput` Go.
 */
export interface BenchCandidate {
	readonly role: string;
	readonly text: string;
}

// ─── L'extracteur déterministe — byte-cohérent avec taxonomy.go Extract ──────────────

/**
 * KIND_MARKERS — les marqueurs CLOS par type de requirement (Go kindMarkers). Un output
 * est scanné insensiblement à la casse ; la présence d'UN seul marqueur suffit à
 * signaler le type. Déclaré, jamais appris (§8 — la parole finale est déterministe).
 */
const KIND_MARKERS: Readonly<Record<RequirementKind, readonly string[]>> = {
	"view.goal": ["view goal:", "screen goal:", "but de l'écran"],
	"view.zone": [
		"zone:",
		"layout zone",
		"header zone",
		"footer zone",
		"detail zone",
	],
	"view.displayed": [
		"displays field",
		"displayed:",
		"shows field",
		"affiche le champ",
	],
	"view.empty_state": [
		"empty state",
		"empty-state",
		"zero state",
		"état vide",
		"no items",
	],
	"control.exists": ["control:", "button:", "bouton:"],
	"control.visible_when": ["visible_when", "visible when", "visibilité"],
	"control.enabled_when": [
		"enabled_when",
		"enabled when",
		"disabled when",
		"grisé quand",
	],
	"control.triggers": ["triggers action", "triggers:", "déclenche l'action"],
	"action.invoke": [
		"invoke operation",
		"invokes operation",
		"invoke:",
		"appelle l'opération",
	],
	"action.on_success": ["on_success", "on success", "en cas de succès"],
	"action.on_error": ["on_error", "on error", "en cas d'erreur"],
	"operation.exists": ["operation:", "command:", "opération:"],
	"operation.event": ["emits event", "event:", "émet l'événement"],
	"operation.guard": ["guard:", "precondition", "validates that", "valide que"],
	"entity.exists": ["entity:", "aggregate:", "entité:"],
	"entity.field": ["field:", "champ:", "attribute:"],
	"entity.relation": [
		"relation:",
		"references entity",
		"belongs to",
		"has many",
	],
	"invariant.forall": [
		"invariant:",
		"for all",
		"∀",
		"must always",
		"doit toujours",
		"never negative",
		"jamais négatif",
	],
	"policy.authz": [
		"policy:",
		"authorization",
		"only the owner",
		"permission",
		"seul le propriétaire",
	],
	"budget.perf_sec": [
		"budget:",
		"must respond within",
		"p95",
		"rate limit",
		"latency budget",
	],
	"case.error": [
		"error case:",
		"on failure",
		"rejected when",
		"rejeté quand",
		"out of stock",
		"rupture de stock",
	],
	"case.edge": [
		"edge case:",
		"boundary:",
		"when empty",
		"maximum",
		"overflow",
		"cas limite",
	],
};

/**
 * extract — mappe un texte de sortie au SET de types de requirement qu'il mentionne.
 * PURE et DÉTERMINISTE : insensible à la casse, scanne les marqueurs du jeu fermé,
 * retourne un tableau dans l'ordre canonique (dédupliqué). Byte-cohérent avec Go Extract
 * (taxonomy.go). Aucun LLM, aucune horloge, aucun aléa, jamais de panique.
 */
export function extract(output: string): RequirementKind[] {
	const lower = output.toLowerCase();
	const seen = new Set<RequirementKind>();
	for (const kind of ALL_KINDS) {
		for (const marker of KIND_MARKERS[kind]) {
			if (lower.includes(marker.toLowerCase())) {
				seen.add(kind);
				break;
			}
		}
	}
	// Retourner dans l'ordre canonique (déterminisme de l'ordre — ALL_KINDS est l'ordre Go).
	return ALL_KINDS.filter((k) => seen.has(k));
}

// ─── Arithmétique ensembliste — byte-cohérente avec taxonomy.go union/diff ───────────

/**
 * kindUnion — l'union de plusieurs ensembles de types, dans l'ordre canonique. PURE.
 * Byte-cohérent avec Go union (taxonomy.go).
 */
export function kindUnion(
	sets: readonly RequirementKind[][],
): RequirementKind[] {
	const seen = new Set<RequirementKind>();
	for (const s of sets) for (const k of s) seen.add(k);
	return ALL_KINDS.filter((k) => seen.has(k));
}

/**
 * kindDiff — (a \ b) dans l'ordre canonique. PURE. Byte-cohérent avec Go diff (taxonomy.go).
 */
export function kindDiff(
	a: readonly RequirementKind[],
	b: readonly RequirementKind[],
): RequirementKind[] {
	const bs = new Set<RequirementKind>(b);
	return a.filter((k) => !bs.has(k));
}

// ─── La dérivation principale — byte-cohérente avec requirementbench.go Derive ──────

/**
 * BenchReport — le résultat par spec, PUREMENT DÉRIVÉ de (spec, candidats) via extract +
 * union + diff. Byte-cohérent avec `CompletenessReport` Go (requirementbench.go). Écrit
 * RIEN (le mur). Les MissingTypes sont les trous PROPOSÉS — idea → mirror → /goal.
 */
export interface BenchReport {
	readonly specId: string;
	/** L'union des types que TOUS les candidats surfacent (ordre canonique). */
	readonly presentTypes: readonly RequirementKind[];
	readonly presentCount: number;
	/** Les types attendus par la spec qu'AUCUN candidat ne surfac e — les trous proposés. */
	readonly missingTypes: readonly RequirementKind[];
	readonly expectedCount: number;
	/**
	 * MatchPct ∈ [0,1] = |attendus couverts| / |attendus|. Vacuoirement 1,0 quand la
	 * spec n'attend rien (une spec sans structure est totalement couverte).
	 */
	readonly matchPct: number;
}

/**
 * deriveBenchReport — la DÉRIVATION PURE. Byte-cohérente avec Go Derive (requirementbench.go).
 * Déterministe : mêmes (spec, candidats) ⇒ même report, byte-identique, rejoué 100×.
 */
export function deriveBenchReport(
	spec: BenchSpec,
	candidates: readonly BenchCandidate[],
): BenchReport {
	const sets = candidates.map((c) => extract(c.text));
	const presentTypes = kindUnion(sets);

	// expectedSorted : de-dup + dans l'ordre canonique (byte-cohérent avec Go sortedExpected).
	const expectedSorted = ALL_KINDS.filter((k) =>
		spec.expectedKinds.includes(k),
	);
	const missingTypes = kindDiff(expectedSorted, presentTypes);

	const expectedCount = expectedSorted.length;
	const matchPct =
		expectedCount === 0
			? 1.0
			: (expectedCount - missingTypes.length) / expectedCount;

	return {
		specId: spec.id,
		presentTypes,
		presentCount: presentTypes.length,
		missingTypes,
		expectedCount,
		matchPct,
	};
}

// ─── Le différentiel par modèle ───────────────────────────────────────────────────────

/**
 * ModelDiff — le différentiel d'UN modèle vs l'union de tous les candidats. Projette les
 * types que CE modèle SEUL surfacerait vs ce que l'union A∪B révèle de plus. PURE.
 */
export interface ModelDiff {
	/** Le rôle du modèle (p. ex. "single", "A", "B"). */
	readonly role: string;
	/** Les types que CE modèle surfac e (ordre canonique). */
	readonly ownTypes: readonly RequirementKind[];
	/** Les types que l'union révèle mais que CE modèle manque. */
	readonly missedByThisModel: readonly RequirementKind[];
	/** MatchPct de CE modèle seul vs les attendus de la spec. */
	readonly ownMatchPct: number;
}

/**
 * deriveModelDiffs — calcule le différentiel de CHAQUE candidat vs l'union totale. PURE
 * et TOTALE. Le différentiel montre le GAIN de comparer plusieurs modèles (ADR 0079 :
 * "comparer >=2 LLMs révèle des types qu'un seul recompile manque").
 */
export function deriveModelDiffs(
	spec: BenchSpec,
	candidates: readonly BenchCandidate[],
): ModelDiff[] {
	const union = kindUnion(candidates.map((c) => extract(c.text)));
	const expectedSorted = ALL_KINDS.filter((k) =>
		spec.expectedKinds.includes(k),
	);
	return candidates.map((c) => {
		const own = extract(c.text);
		const missedByThisModel = kindDiff(union, own);
		const ownMatchPct =
			expectedSorted.length === 0
				? 1.0
				: own.filter((k) => expectedSorted.includes(k)).length /
					expectedSorted.length;
		return {
			role: c.role,
			ownTypes: own,
			missedByThisModel,
			ownMatchPct,
		};
	});
}

// ─── La ligne affichable : une spec + son report + ses diffs ──────────────────────────

/**
 * BenchRow — la projection d'UNE spec : le report de complétude + le différentiel par
 * modèle — UNE ligne affichable par l'écran. Byte-cohérent avec la combinaison des
 * sorties Go CompletenessReport + ModelDiff. PURE.
 */
export interface BenchRow {
	readonly specId: string;
	readonly report: BenchReport;
	readonly diffs: readonly ModelDiff[];
}

/**
 * projectBenchRow — projette UNE spec + ses candidats → une ligne affichable. PURE.
 */
export function projectBenchRow(
	spec: BenchSpec,
	candidates: readonly BenchCandidate[],
): BenchRow {
	return {
		specId: spec.id,
		report: deriveBenchReport(spec, candidates),
		diffs: deriveModelDiffs(spec, candidates),
	};
}

// ─── Le jeu canonique hermétique (l'e2e, IA coupée, §6 déterminisme) ─────────────────

/**
 * CANONICAL_SPEC — la spec hermétique que l'écran et l'e2e rejouent (aucun réseau).
 * Déclarée, jamais apprise (§8). Sept types attendus couvrant les facettes les plus
 * souvent manquées par un recompile unique (les cross-cutting truth facets + une vue).
 */
export const CANONICAL_SPEC: BenchSpec = {
	id: "createOrder",
	specText: "# besoin createOrder — spec hermétique DG06",
	expectedKinds: [
		"view.goal",
		"control.exists",
		"action.invoke",
		"operation.exists",
		"invariant.forall",
		"policy.authz",
		"case.error",
	],
};

/**
 * CANONICAL_CANDIDATES — les candidats hermétiques (aucun réseau, IA éteinte). Le modèle
 * "single" surfac e les types courants (view + control + action + operation) mais MANQUE
 * les cross-cutting (invariant + policy + error). Le modèle "A" surfac e invariant + error.
 * Le modèle "B" surfac e policy. L'union single∪A∪B couvre tous les 7 attendus →
 * MatchPct = 1,0 (le GAIN du bench différentiel — ADR 0079).
 */
export const CANONICAL_CANDIDATES: readonly BenchCandidate[] = [
	{
		role: "single",
		text: [
			"view goal: afficher la commande",
			"control: bouton Passer la commande",
			"invoke operation: createOrder",
			"operation: createOrder command",
		].join("\n"),
	},
	{
		role: "A",
		text: [
			"invariant: for all orders, quantity must be positive",
			"error case: on failure when stock is empty",
		].join("\n"),
	},
	{
		role: "B",
		text: "policy: only the owner can cancel",
	},
] as const;

/**
 * runCanonical — le run hermétique sur la spec et les candidats canoniques. C'est ce que
 * l'écran affiche par défaut et ce que l'e2e prouve (IA coupée, jeu déterministe).
 */
export function runCanonical(): BenchRow {
	return projectBenchRow(CANONICAL_SPEC, CANONICAL_CANDIDATES);
}

// ─── Clés i18n : labels de kind + labels de rôle (jeu déclaré et clos) ───────────────

/**
 * kindLabelKey — la clé i18n du libellé affichable d'un type de requirement. Les clés
 * « benchKind_* » sont dans messages/{fr,en}.json — jamais inventées.
 */
export function kindLabelKey(kind: RequirementKind): string {
	return `benchKind_${kind.replace(/\./g, "_")}`;
}

/**
 * roleLabelKey — la clé i18n d'un rôle de candidat (jeu déclaré). Le rôle "single" est
 * le recompile déterministe seul ; "A" et "B" sont les modèles divergents.
 */
export function roleLabelKey(role: string): string {
	if (role === "single") return "benchRoleSingle";
	if (role === "A") return "benchRoleA";
	if (role === "B") return "benchRoleB";
	return "benchRoleOther";
}
