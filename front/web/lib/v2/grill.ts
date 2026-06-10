// biome-ignore-all lint/suspicious/noThenProperty: « then » est le terme Gherkin canonique (Given/When/Then), la langue ubiquitaire KRD — jamais une thenable.
/**
 * WB2-10 — le TWIN PUR du geste /grill-with-docs (CLAUDE.md §6 phase 1), projeté DÉTERMINISTIQUEMENT.
 *
 * L'écran /v2/grill conduit le geste grill-with-docs comme une MACHINE : affûter une intention
 * AVANT qu'elle n'approche le kernel (le mur, §2). Le grill challenge l'intention, borne ses
 * SCÉNARIOS (≤ 5, mandat A — une intention ≤ 5 scénarios), AFFÛTE le langage (les termes ambigus
 * → termes canoniques du glossaire), puis SEED la doc Mintlify. La sortie est une INTENTION
 * AFFÛTÉE + des ADRs CANDIDATS : elle PROPOSE, elle n'écrit AUCUNE vérité (hasMirror=false,
 * wroteKernel=false) ; la promotion reste idée → miroir → /goal.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : affûter une intention est une FONCTION PURE & TOTALE —
 * pas d'horloge, pas d'aléa, pas d'E/S, pas de LLM. Le verdict (sharp / fuzzy / rejected) est
 * CALCULÉ par une grammaire déclarée (un grill sans Given/When/Then est fuzzy ; > 5 scénarios est
 * rejeté ; une intention vide est rejetée), jamais jugé par un LLM. L'affûtage du langage est un
 * REMPLACEMENT de termes par une table DÉCLARÉE (franglais/argot → terme canonique), jamais une
 * reformulation. L'identité du grill est content-adressée (FNV-1a sur l'intention affûtée +
 * scénarios canoniques) → même entrée → même sortie. Le miroir de reproductibilité
 * lib/v2/grill.test.ts (fast-check) épingle : totalité, ≤ 5 scénarios, verdict calculé, affûtage
 * idempotent, hasMirror/wroteKernel toujours faux, déterminisme de l'empreinte.
 *
 * RÉUTILISATION (pas de fork) : le glossaire V2 (lib/v2/glossary) fournit les termes canoniques de
 * la table d'affûtage ; ce module ne tient que la LOGIQUE du geste.
 */

import { SLUGS } from "./glossary";

/** Le nombre MAXIMAL de scénarios d'une intention (mandat A : une intention ≤ 5 scénarios). */
export const MAX_SCENARIOS = 5;

/** La longueur minimale d'une intention (une intention vide n'est pas falsifiable). */
export const MIN_INTENT_LEN = 3;

/**
 * Un SCÉNARIO Given/When/Then brut, saisi au grill. La présence des trois clauses gouverne la
 * netteté (un scénario sans When/Then n'est pas falsifiable → l'intention reste fuzzy).
 */
export interface Scenario {
	readonly given: string;
	readonly when: string;
	readonly then: string;
}

/** Le brouillon de grill saisi par le wizard, avant affûtage. */
export interface GrillDraft {
	/** L'intention brute (« je veux que… »), telle que formulée. */
	readonly intent: string;
	/** Les scénarios Given/When/Then proposés (≤ 5 attendu). */
	readonly scenarios: Scenario[];
}

/**
 * La TABLE D'AFFÛTAGE du langage : terme ambigu (franglais/argot, normalisé minuscules) → terme
 * canonique KRD. DÉCLARÉE, jamais apprise — l'affûtage est un remplacement, pas une reformulation.
 * (Le grill « challenge le langage contre le glossaire » : ici, déterministe.)
 */
export const SHARPEN_TABLE: ReadonlyArray<readonly [string, string]> = [
	["feature", "cellule"],
	["bounded context", "cellule"],
	["spec", "spécification"],
	["test", "miroir"],
	["bdd", "miroir"],
	["db", "Postgres"],
	["base de données", "Postgres"],
	["truth", "vérité"],
	["wall", "mur"],
	["goal", "/goal"],
	["ratchet", "cliquet"],
	["level", "niveau"],
	["facet", "facette"],
	["link", "lien"],
] as const;

/** Le verdict du grill — calculé par la grammaire, jamais déclaré (§8, anti-Goodhart). */
export type GrillVerdict = "sharp" | "fuzzy" | "rejected";

/** Le diagnostic d'un grill invalide / non affûté (par cause), pour l'affichage wizard. */
export type GrillIssue =
	| "intent_too_short"
	| "no_scenario"
	| "too_many_scenarios"
	| "scenario_incomplete";

/**
 * Un ADR CANDIDAT proposé par le grill : un terme affûté implique une décision à tracer (le mandat
 * doc §6 — « update CONTEXT/ADRs as decisions crystallise »). C'est une PROPOSITION, jamais un ADR
 * écrit. Le titre est dérivé du terme canonique ; l'id est un slug stable.
 */
export interface CandidateADR {
	/** Le slug stable de l'ADR candidat (kebab du terme canonique). */
	readonly slug: string;
	/** Le titre lisible (« Adopter le terme canonique “cellule” (au lieu de “feature”) »). */
	readonly title: string;
	/** Le terme ambigu d'origine. */
	readonly from: string;
	/** Le terme canonique retenu. */
	readonly to: string;
}

/**
 * Une SEED de documentation Mintlify (le mandat doc §6 — deux pages par étape). Le grill ne REND
 * PAS la doc ; il ANNEXE les deux chemins de pages attendus (concept + internals), déterministes.
 */
export interface DocSeed {
	/** La page « Pour les futurs utilisateurs » (concept). */
	readonly conceptPath: string;
	/** La page « Pour moi » (internals : Implémentation · Méta · Méta-méta). */
	readonly internalsPath: string;
}

/**
 * L'INTENTION AFFÛTÉE — la sortie du grill (§6 phase 1). PROPOSE : hasMirror et wroteKernel sont
 * TOUJOURS faux (le mur). Content-adressée → identité stable.
 */
export interface SharpenedIntention {
	/** L'empreinte content-adressée (l'identité stable du grill). */
	readonly id: string;
	/** L'intention affûtée (termes ambigus remplacés par les canoniques). */
	readonly sharpenedIntent: string;
	/** Les scénarios affûtés (mêmes scénarios, langage affûté). */
	readonly scenarios: Scenario[];
	/** Le verdict calculé (sharp si falsifiable & ≤ 5 scénarios complets). */
	readonly verdict: GrillVerdict;
	/** Les ADRs candidats (un par terme affûté distinct), ordonnés, dédupliqués. */
	readonly candidateAdrs: CandidateADR[];
	/** La seed de doc Mintlify (deux chemins de pages). */
	readonly docSeed: DocSeed;
	/** §115 : un grill ne porte JAMAIS de miroir (au-dessus du mur). Invariant : toujours false. */
	readonly hasMirror: false;
	/** Le mur (§2) : affûter n'écrit AUCUNE vérité. Invariant : toujours false. */
	readonly wroteKernel: false;
}

export type GrillResult =
	| { ok: true; intention: SharpenedIntention; issues: GrillIssue[] }
	| { ok: false; issues: GrillIssue[] };

/** Un scénario est COMPLET ssi ses trois clauses sont non-vides (falsifiable). */
export function scenarioComplete(s: Scenario): boolean {
	return (
		s.given.trim().length > 0 &&
		s.when.trim().length > 0 &&
		s.then.trim().length > 0
	);
}

/**
 * DIAGNOSTIQUE un brouillon de grill et renvoie la liste (ordonnée, stable) de ses problèmes.
 * PURE & TOTALE : même brouillon → mêmes problèmes. Aucun effet de bord.
 */
export function diagnose(d: GrillDraft): GrillIssue[] {
	const issues: GrillIssue[] = [];
	if (d.intent.trim().length < MIN_INTENT_LEN) issues.push("intent_too_short");
	if (d.scenarios.length === 0) issues.push("no_scenario");
	if (d.scenarios.length > MAX_SCENARIOS) issues.push("too_many_scenarios");
	if (d.scenarios.some((s) => !scenarioComplete(s)))
		issues.push("scenario_incomplete");
	return issues;
}

/**
 * CALCULE le verdict d'un grill depuis ses problèmes (§8 : le verdict est calculé, jamais déclaré).
 *   - une intention vide OU > 5 scénarios → rejected (hors grammaire) ;
 *   - sinon, un scénario manquant/incomplet → fuzzy (pas encore falsifiable) ;
 *   - sinon → sharp (falsifiable, ≤ 5 scénarios complets).
 */
export function verdictOf(issues: GrillIssue[]): GrillVerdict {
	if (
		issues.includes("intent_too_short") ||
		issues.includes("too_many_scenarios")
	)
		return "rejected";
	if (issues.includes("no_scenario") || issues.includes("scenario_incomplete"))
		return "fuzzy";
	return "sharp";
}

/** Le kebab-case stable d'un terme (pour le slug d'ADR / de doc). */
function kebab(term: string): string {
	return term
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * AFFÛTE un texte : remplace chaque terme ambigu de la table par son canonique (insensible à la
 * casse, frontières de mots), et renvoie aussi les termes effectivement remplacés (ordre de la
 * table, dédupliqués). PURE & IDEMPOTENTE : affûter deux fois = affûter une fois (les canoniques
 * ne sont pas eux-mêmes des termes ambigus de la table).
 */
export function sharpenText(text: string): {
	sharpened: string;
	applied: ReadonlyArray<readonly [string, string]>;
} {
	let out = text;
	const applied: Array<readonly [string, string]> = [];
	for (const [from, to] of SHARPEN_TABLE) {
		const re = new RegExp(`\\b${escapeRegExp(from)}\\b`, "gi");
		if (re.test(out)) {
			out = out.replace(re, to);
			applied.push([from, to]);
		}
	}
	return { sharpened: out, applied };
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Le chemin de doc concept attendu pour cette étape (mandat §6, déterministe). */
export function conceptDocPath(stepSlug: string): string {
	return `steps/concept/${stepSlug}.mdx`;
}

/** Le chemin de doc internals attendu pour cette étape (mandat §6, déterministe). */
export function internalsDocPath(stepSlug: string): string {
	return `steps/internals/${stepSlug}.mdx`;
}

/**
 * L'empreinte content-adressée d'un grill (FNV-1a 32 bits, hex) — déterministe. Même intention
 * affûtée + mêmes scénarios canoniques → même empreinte ; toute mutation la change.
 */
export function grillHash(
	sharpenedIntent: string,
	scenarios: Scenario[],
): string {
	const canon = [
		sharpenedIntent.trim(),
		...scenarios.map(
			(s) => `${s.given.trim()}>${s.when.trim()}>${s.then.trim()}`,
		),
	].join("|");
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}

/**
 * CONDUIT le geste grill — le cœur du twin. PURE & TOTALE & DÉTERMINISTE :
 *   1. diagnostique le brouillon (les problèmes ordonnés) ;
 *   2. si rejected (intention vide / > 5 scénarios) → { ok:false, issues } (pas de sortie) ;
 *   3. AFFÛTE l'intention + chaque scénario (table déclarée, jamais un LLM) ;
 *   4. dérive les ADRs candidats (un par terme affûté distinct, ordonnés) ;
 *   5. ANNEXE la seed de doc (deux chemins) ;
 *   6. CALCULE le verdict (sharp / fuzzy) ;
 *   7. content-adresse l'identité ; pose les invariants du mur (hasMirror/wroteKernel = false).
 * Aucune écriture, aucun LLM, aucune horloge. Même brouillon → même sortie.
 *
 * @param stepSlug le slug de l'étape (pour les chemins de doc), p.ex. "wb2-10-grill".
 */
export function runGrill(d: GrillDraft, stepSlug: string): GrillResult {
	const issues = diagnose(d);
	const verdict = verdictOf(issues);
	if (verdict === "rejected") return { ok: false, issues };

	const { sharpened: sharpenedIntent, applied: intentApplied } = sharpenText(
		d.intent.trim(),
	);

	// Affûte chaque scénario, en accumulant les termes remplacés (pour les ADRs candidats).
	const appliedAll = new Map<string, string>();
	for (const [from, to] of intentApplied) appliedAll.set(from, to);
	const scenarios: Scenario[] = d.scenarios.map((s) => {
		const g = sharpenText(s.given);
		const w = sharpenText(s.when);
		const th = sharpenText(s.then);
		for (const r of [...g.applied, ...w.applied, ...th.applied])
			appliedAll.set(r[0], r[1]);
		return {
			given: g.sharpened.trim(),
			when: w.sharpened.trim(),
			then: th.sharpened.trim(),
		};
	});

	// Les ADRs candidats : un par terme affûté distinct, dans l'ordre de la table (déterministe).
	const candidateAdrs: CandidateADR[] = SHARPEN_TABLE.filter(([from]) =>
		appliedAll.has(from),
	).map(([from, to]) => ({
		slug: `adopter-${kebab(to)}`,
		title: `Adopter le terme canonique « ${to} » (au lieu de « ${from} »)`,
		from,
		to,
	}));

	const intention: SharpenedIntention = {
		id: grillHash(sharpenedIntent, scenarios),
		sharpenedIntent,
		scenarios,
		verdict,
		candidateAdrs,
		docSeed: {
			conceptPath: conceptDocPath(stepSlug),
			internalsPath: internalsDocPath(stepSlug),
		},
		hasMirror: false,
		wroteKernel: false,
	};

	return { ok: true, intention, issues };
}

/**
 * Un brouillon de grill CANONIQUE de démonstration (l'intention de WB2-10 elle-même), pour seeder
 * l'écran : une intention avec deux termes ambigus (« feature », « bdd ») et deux scénarios
 * complets — affûtée → 2 ADRs candidats, verdict sharp.
 */
export function syntheticGrillDraft(): GrillDraft {
	return {
		intent:
			"Je veux conduire le geste grill comme une feature affûtée, prouvée en bdd avant le code.",
		scenarios: [
			{
				given: "une intention floue saisie au grill",
				when: "j'affûte le langage et borne les scénarios",
				then: "j'obtiens une intention affûtée + des ADRs candidats, sans écrire de vérité",
			},
			{
				given: "un grill avec plus de cinq scénarios",
				when: "je tente de l'affûter",
				then: "le grill est rejeté (une intention ≤ cinq scénarios)",
			},
		],
	};
}

/** Le slug d'étape canonique de WB2-10 (pour la seed de doc de l'écran). */
export const STEP_SLUG = "wb2-10-grill";

/** Re-export pour le test : les slugs du glossaire (les termes canoniques connus). */
export { SLUGS };
