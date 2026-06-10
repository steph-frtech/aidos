/**
 * WB2-20 — le TWIN PUR de « la conscience » (ROADMAP-fke FK09 ; FKE-6.3 ; FKE-31 ; KRD §8). `/v2/conscience`
 * est l'AGRÉGATEUR DÉTERMINISTE des verdicts qui EXISTENT DÉJÀ : il compare, paire par paire, les quatre
 * axes d'une vérité — VOULU (l'idée / le miroir attendu), CONSTRUIT (le code / la projection), PROUVÉ (le
 * miroir vert), AUTORISÉ (la policy / le mur) — et il en tire UN rapport + ses decision cards. Il N'INVENTE
 * AUCUN juge (§8 — un évaluateur actif serait « le second agent qui valide », que le Tome refuse comme
 * preuve) : il LIT des verdicts sourcés et les ROUTE ; chaque ligne porte son juge-source.
 *
 * RÉUTILISATION (pas de fork, ADR 0007) : le cœur agrégateur est `reconcile` de `lib/conscience.ts` (FK09,
 * lui-même miroir du Go `back/runtime/conscience`) — une FONCTION PURE & TOTALE (mêmes verdicts → même
 * rapport, invariante sous l'ordre d'entrée). Ce module ne re-juge RIEN : il RÉ-EXPORTE `reconcile` VERBATIM
 * et il ajoute la seule chose neuve de WB2-20 — la VUE V2 par AXES :
 *   - `AXES` — les quatre axes (voulu/construit/prouvé/autorisé) auxquels on RANGE chaque paire (une table
 *     close `SOURCE_AXIS`, déterministe — un mapping, jamais un jugement) ;
 *   - `axisLights(report)` — le VOYANT 🟢/🔴/🟡 par paire d'axe (vert si toutes les paires de l'axe sont
 *     vertes, rouge si une paire HARD est rouge, ambre si seulement des advisories) ;
 *   - `decisionCardsV2(report)` — les decision cards à OPTIONS V2 (accept/amend/reject/defer) projetées
 *     DÉTERMINISTIQUEMENT depuis les `CardOption` FK09 (une table close `OPTION_V2`) ;
 *   - `CONSCIENCE_CASES` — le registre CLOS des cas d'exemple (aligné / drift-runner / casse-S / casse-X),
 *     réutilisant le squelette FK08 + les SourcedVerdict de FK09.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : tout est PUR (aucune horloge, aucun aléa, aucune I/O, aucun LLM) —
 * mêmes verdicts → même rapport, mêmes voyants, mêmes cards (mêmes ids content-adressés, même ordre). Le
 * miroir de reproductibilité lib/v2/conscience.test.ts épingle : déterminisme, agrégateur ≡ FK09, X jamais
 * bloquant, voyants cohérents avec le tally, options V2 closes, registre clos.
 *
 * LE MUR (CLAUDE.md §2) : la conscience LIT des verdicts sourcés ; elle n'écrit AUCUNE vérité. Le rapport et
 * les cards sont des PROJECTIONS. Agir sur une card (accept/amend/reject/defer) PROPOSE → /goal — c'est
 * l'ouverture d'une idée → miroir → /goal → approbation humaine, jamais une écriture directe depuis l'écran.
 */

import {
	type CardOption,
	type ConsciousnessReport,
	type DecisionCard,
	type DriftKind,
	type Input,
	KNOWN_SOURCES,
	type PairVerdict,
	reconcile,
	type Source,
	type SourcedVerdict,
	type Verdict,
} from "../conscience";
import {
	type Column,
	type Facet,
	NON_FUNCTIONAL_COLUMNS,
	RUNGS,
	type SkeletonReport,
	wireSkeleton,
} from "../facetwire";

// On RÉ-EXPORTE le cœur agrégateur (FK09) pour que l'écran V2 importe tout depuis un seul module v2 —
// aucune duplication, aucun nouveau juge.
export {
	type CardOption,
	type ConsciousnessReport,
	type DecisionCard,
	type DriftKind,
	type Input,
	KNOWN_SOURCES,
	type PairVerdict,
	reconcile,
	type Source,
	type SourcedVerdict,
	type Verdict,
};

// ── Les quatre AXES de la conscience (voulu / construit / prouvé / autorisé) ──

/**
 * Un axe de vérité : l'angle SOUS lequel on range une paire de verdict.
 *   - `voulu` — l'intention : l'idée, le miroir ATTENDU, la complétude (ce qui DEVRAIT exister) ;
 *   - `construit` — la projection : le code, le contrat, le SemanticDiff (ce qui EST écrit) ;
 *   - `prouvé` — la preuve : le runner, l'evidence, la RealityMirror (ce qui est VÉRIFIÉ vert) ;
 *   - `autorisé` — l'autorisation : la policy, le mur, la sécurité (ce qui est PERMIS).
 */
export type Axis = "voulu" | "construit" | "prouvé" | "autorisé";

/** Les quatre axes, dans l'ordre d'affichage (voulu → construit → prouvé → autorisé). */
export const AXES: readonly Axis[] = [
	"voulu",
	"construit",
	"prouvé",
	"autorisé",
] as const;

/**
 * `SOURCE_AXIS` range chaque juge-source FK09 sous son axe (une table CLOSE, déterministe — un mapping,
 * jamais un jugement). La facette S (sécurité) bascule une paire vers l'axe `autorisé`, peu importe sa
 * source : la sécurité est une question d'autorisation. Tout le reste suit sa source.
 */
const SOURCE_AXIS: Record<Source, Axis> = {
	runner: "prouvé",
	reality_mirror: "prouvé",
	sensor: "prouvé",
	completeness: "voulu",
	semantic_diff: "construit",
	ledger: "construit",
	facet: "construit",
};

/** L'axe d'une paire : la facette S force `autorisé` ; sinon on suit la source (table close). PURE & TOTALE. */
export function axisOf(p: PairVerdict): Axis {
	if (p.facet === "S") return "autorisé";
	return SOURCE_AXIS[p.source] ?? "construit";
}

// ── Le VOYANT 🟢/🔴/🟡 par axe ────────────────────────────────────────────────

/** L'état d'un voyant d'axe : vert (toutes vertes), rouge (une HARD rouge), ambre (seulement advisories). */
export type Light = "green" | "red" | "amber";

/** Un voyant d'axe : l'axe, son état, et le compte de paires vert/rouge/ambre qui le composent. */
export interface AxisLight {
	readonly axis: Axis;
	readonly light: Light;
	readonly green: number;
	readonly red: number;
	readonly amber: number;
	/** le nombre total de paires rangées sous cet axe. */
	readonly total: number;
}

/**
 * `axisLights` projette un ConsciousnessReport en QUATRE voyants — un par axe. Pour chaque axe : on compte
 * les paires vertes / rouges / advisories qui lui sont rangées, puis :
 *   - 🔴 rouge ssi AU MOINS une paire HARD rouge ;
 *   - 🟡 ambre ssi pas de rouge MAIS au moins une advisory (X informe, ne bloque pas — §13.6) ;
 *   - 🟢 vert sinon.
 * PURE + TOTALE + DÉTERMINISTE : même rapport → mêmes voyants (toujours les quatre axes, dans l'ordre `AXES`).
 */
export function axisLights(report: ConsciousnessReport): AxisLight[] {
	const acc = new Map<Axis, { green: number; red: number; amber: number }>();
	for (const a of AXES) acc.set(a, { green: 0, red: 0, amber: 0 });
	for (const p of report.pairs) {
		const bucket = acc.get(axisOf(p));
		if (bucket === undefined) continue;
		if (p.verdict === "green") bucket.green++;
		else if (p.verdict === "red") bucket.red++;
		else bucket.amber++;
	}
	return AXES.map((axis) => {
		const b = acc.get(axis) ?? { green: 0, red: 0, amber: 0 };
		const light: Light = b.red > 0 ? "red" : b.amber > 0 ? "amber" : "green";
		return {
			axis,
			light,
			green: b.green,
			red: b.red,
			amber: b.amber,
			total: b.green + b.red + b.amber,
		};
	});
}

// ── Le VOYANT par PAIRE (le détail sous chaque axe) ──────────────────────────

/** Une paire de verdict enrichie de son axe + son voyant — la ligne d'affichage de l'écran V2. */
export interface PairLight {
	readonly axis: Axis;
	readonly light: Light;
	readonly pair: PairVerdict;
}

/** Le voyant d'UNE paire (vert/rouge/ambre selon son verdict). PURE & TOTALE. */
export function pairLight(p: PairVerdict): Light {
	if (p.verdict === "green") return "green";
	if (p.verdict === "red") return "red";
	return "amber";
}

/** Range toutes les paires d'un rapport sous leur axe, chacune avec son voyant. PURE + TOTALE + DÉTERMINISTE. */
export function pairLights(report: ConsciousnessReport): PairLight[] {
	return report.pairs.map((p) => ({
		axis: axisOf(p),
		light: pairLight(p),
		pair: p,
	}));
}

// ── Les DECISION CARDS à OPTIONS V2 (accept / amend / reject / defer) ─────────

/** Une option de routage V2 d'une decision card (le verbe que l'humain choisit). */
export type V2Option = "accept" | "amend" | "reject" | "defer";

/** Les quatre options V2, dans l'ordre d'affichage. */
export const V2_OPTIONS: readonly V2Option[] = [
	"accept",
	"amend",
	"reject",
	"defer",
] as const;

/**
 * `OPTION_V2` projette une `CardOption` FK09 (§FKE-30) vers son verbe V2 (accept/amend/reject/defer) — une
 * table CLOSE, déterministe :
 *   - `fix_below_wall` → `amend` (corriger sous le mur) ;
 *   - `change_above_wall` → `accept` (accepter le nouveau voulu : PROPOSE → /goal) ;
 *   - `ask_user_decision` → `defer` (différer à la décision humaine) ;
 *   - `block` → `reject` (bloquer / rejeter le drift) ;
 *   - `keep_experimental` → `defer` (garder expérimental — l'advisory, ne bloque pas) ;
 *   - `deprecate` → `reject` (déprécier).
 */
const OPTION_V2: Record<CardOption, V2Option> = {
	fix_below_wall: "amend",
	change_above_wall: "accept",
	ask_user_decision: "defer",
	block: "reject",
	keep_experimental: "defer",
	deprecate: "reject",
};

/** Le verbe V2 d'une CardOption FK09 (table close). PURE & TOTALE. */
export function v2Option(o: CardOption): V2Option {
	return OPTION_V2[o] ?? "defer";
}

/** Une decision card en VUE V2 : la card FK09 + ses options/recommandation projetées en verbes V2. */
export interface DecisionCardV2 {
	readonly card: DecisionCard;
	readonly axis: Axis;
	/** les options V2 (dédupliquées, ordre `V2_OPTIONS`) — toujours ⊆ {accept,amend,reject,defer}. */
	readonly options: V2Option[];
	/** la recommandation FK09 projetée en verbe V2. */
	readonly recommendation: V2Option;
}

/** L'ordre canonique d'une liste de V2Option (dédupliquée, dans l'ordre `V2_OPTIONS`). */
function orderV2(opts: V2Option[]): V2Option[] {
	const present = new Set(opts);
	return V2_OPTIONS.filter((o) => present.has(o));
}

/** L'axe d'une card (la facette S force `autorisé` ; sinon la source). PURE & TOTALE. */
function cardAxis(c: DecisionCard): Axis {
	if (c.facet === "S") return "autorisé";
	return SOURCE_AXIS[c.source] ?? "construit";
}

/**
 * `decisionCardsV2` projette les decision cards FK09 d'un rapport en VUE V2 (options accept/amend/reject/
 * defer). DÉTERMINISTE : même rapport → mêmes cards V2 (mêmes ids, même ordre, mêmes options). Les cards
 * gardent leur ordre FK09 (tri par id content-adressé), donc la projection est stable.
 */
export function decisionCardsV2(report: ConsciousnessReport): DecisionCardV2[] {
	return report.cards.map((card) => ({
		card,
		axis: cardAxis(card),
		options: orderV2(card.options.map(v2Option)),
		recommendation: v2Option(card.recommendation),
	}));
}

// ── Le REGISTRE CLOS des cas d'exemple de la conscience ───────────────────────

/** Un cas d'exemple de la conscience : un kernel + son squelette FK08 + ses SourcedVerdict (FK09). */
export interface ConscienceCase {
	readonly id: string;
	readonly labelKey: string;
	readonly input: Input;
}

function alignedSkeleton(): SkeletonReport {
	const cols: Column[] = NON_FUNCTIONAL_COLUMNS.map((facet: Facet) => ({
		kernel_id: "checkout",
		facet,
		rungs: RUNGS.map((rung) => ({ rung, declared: true, proven: true })),
	}));
	return wireSkeleton({ kernel_id: "checkout", columns: cols });
}

function brokenSkeleton(broken: Facet): SkeletonReport {
	const cols: Column[] = NON_FUNCTIONAL_COLUMNS.map((facet: Facet) => ({
		kernel_id: "checkout",
		facet,
		rungs: RUNGS.map((rung) => ({
			rung,
			declared: true,
			proven: !(facet === broken && rung === "6-evidence"),
		})),
	}));
	return wireSkeleton({ kernel_id: "checkout", columns: cols });
}

const runnerGreen: SourcedVerdict = {
	source: "runner",
	facet: "F",
	pair: "s2↔s9",
	verdict: "green",
};
const completenessGreen: SourcedVerdict = {
	source: "completeness",
	facet: "F",
	pair: "completeness",
	verdict: "green",
};

/**
 * Le registre CLOS des cas d'exemple. RÉUTILISE le squelette FK08 + les SourcedVerdict de FK09 :
 *   - `aligned` — tout aligné : quatre voyants verts, aucune decision card ;
 *   - `runner-drift` — le runner (s2↔s9) diverge : voyant `prouvé` rouge + sa decision card actionnable ;
 *   - `break-security` — une paire de S (sécurité) cassée : voyant `autorisé` rouge + carte de blocage ;
 *   - `break-experience` — une paire de X (expérience) cassée : reste aligné, carte ADVISORY (X ne bloque pas).
 * Aucune règle inventée : ce ne sont que des entrées d'exemple pour l'agrégateur déterministe.
 */
export const CONSCIENCE_CASES: readonly ConscienceCase[] = [
	{
		id: "aligned",
		labelKey: "caseAligned",
		input: {
			kernel_id: "checkout",
			skeleton: alignedSkeleton(),
			verdicts: [runnerGreen, completenessGreen],
		},
	},
	{
		id: "runner-drift",
		labelKey: "caseRunnerDrift",
		input: {
			kernel_id: "checkout",
			skeleton: alignedSkeleton(),
			verdicts: [
				{
					source: "runner",
					facet: "F",
					pair: "s2↔s9",
					verdict: "red",
					drift: "semantic_drift",
					detail: "le code accepte 31 jours ; le contrat dit 30",
					blast: "medium",
				},
				completenessGreen,
			],
		},
	},
	{
		id: "break-security",
		labelKey: "caseBreakSecurity",
		input: {
			kernel_id: "checkout",
			skeleton: brokenSkeleton("S"),
			verdicts: [runnerGreen],
		},
	},
	{
		id: "break-experience",
		labelKey: "caseBreakExperience",
		input: {
			kernel_id: "checkout",
			skeleton: brokenSkeleton("X"),
			verdicts: [runnerGreen],
		},
	},
];

/** Les ids de tous les cas d'exemple connus. */
export function conscienceCaseIds(): string[] {
	return CONSCIENCE_CASES.map((c) => c.id);
}

/** Résout un id de cas d'exemple (totalité). */
export function conscienceCaseById(id: string): ConscienceCase | undefined {
	return CONSCIENCE_CASES.find((c) => c.id === id);
}

/** Le rapport d'un cas d'exemple, via l'agrégateur FK09 réutilisé. PURE & TOTALE. */
export function caseReport(c: ConscienceCase): ConsciousnessReport {
	return reconcile(c.input);
}

/** Le slug d'étape canonique de WB2-20 (pour la seed de doc de l'écran). */
export const STEP_SLUG = "wb2-20-conscience";
