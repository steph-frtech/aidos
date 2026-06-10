/**
 * Le REGISTRE des écrans V2 — la source unique « quels écrans existent + leur bon libellé »
 * (Workbench V2, passe de cohérence WB2-25 ; ADR 0010 thème, ADR 0011 bilingue, ADR 0053 libs).
 *
 * WB2-25 est la PASSE DE COHÉRENCE finale : nav V2 complète + lint vocabulaire (le bon mot
 * partout, du glossaire, aucun franglais). Pour PROUVER « nav complète » et « bon vocabulaire »
 * de façon déterministe, il faut un INVENTAIRE DÉCLARÉ des écrans V2 : un slug stable = un écran
 * = sa route /v2/<slug> + son titre FR + son titre EN. Ce registre EST cet inventaire, content-
 * adressable, en français d'abord. Le miroir de cohérence (lib/v2/screens.test.ts) prouve qu'il
 * couvre exactement les routes réelles app/v2/*\/page.tsx (aucun écran orphelin, aucun fantôme).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : `screen`, `screenTitle`, `screensHash`, `isTotal` sont
 * PURES & TOTALES du registre — pas d'horloge, pas d'aléa, pas d'E/S, pas de LLM. Même registre
 * → même sortie. Le lint vocabulaire (lib/v2/vocabulary-lint.ts) est un ALGORITHME (set-membership
 * + scan de tokens), jamais « un agent qui juge le franglais ». Le bon mot est DÉCLARÉ, jamais
 * deviné (§8 : les seuils/listes sont déclarés, jamais appris).
 *
 * LE MUR (CLAUDE.md §2) : ce module DÉCRIT les écrans ; il n'écrit aucune vérité. Le registre est
 * une projection de lecture, jamais un kernel.
 */

export type Locale = "fr" | "en";

/** Un titre localisé d'écran. */
export interface LocalizedScreen {
	/** Le titre court de l'écran (FR d'abord). */
	title: string;
}

/** Une entrée du registre : un écran V2 concret, bilingue, avec sa route. */
export interface ScreenEntry {
	/** Le slug stable = le segment de route /v2/<slug>. */
	slug: string;
	/** Le concept canonique (glossaire) que l'écran sert, ou `null` si l'écran est un hub/geste. */
	concept: string | null;
	fr: LocalizedScreen;
	en: LocalizedScreen;
}

/**
 * LE REGISTRE DES ÉCRANS V2 — un par route /v2/<slug>/page.tsx (WB2-02..22 + la fondation WB2-00).
 *
 * Le bon mot partout : chaque titre FR est en français, termes KRD VERBATIM. Les noms propres
 * et acronymes KRD admis (« Goal », « Policy DSL », « DAG », « Pact », « AI-Lab ») sont
 * AUTORISÉS explicitement (ALLOWED_PROPER_NOUNS dans le lint), jamais du franglais accidentel.
 */
export const SCREENS: readonly ScreenEntry[] = [
	{
		slug: "idee",
		concept: "idee",
		fr: { title: "L'idée — capturer un candidat-vérité" },
		en: { title: "The idea — capture a candidate-truth" },
	},
	{
		slug: "kernels",
		concept: "kernel",
		fr: { title: "Les kernels — les vérités gelées" },
		en: { title: "The kernels — the frozen truths" },
	},
	{
		slug: "grille",
		concept: "facette",
		fr: { title: "La grille — niveau × facette" },
		en: { title: "The grid — level × facet" },
	},
	{
		slug: "verticale",
		concept: "verticale",
		fr: { title: "La verticale — produit jusqu'à l'entité" },
		en: { title: "The verticale — product down to the entity" },
	},
	{
		slug: "liens",
		concept: "liens",
		fr: { title: "Les liens — les six liens du §17" },
		en: { title: "The links — the six §17 links" },
	},
	{
		slug: "arbres",
		concept: "arbres",
		fr: { title: "Les arbres — la composition fractale" },
		en: { title: "The trees — the fractal composition" },
	},
	{
		slug: "cellules",
		concept: "cellules",
		fr: { title: "Les cellules — les contextes délimités" },
		en: { title: "The cells — the bounded contexts" },
	},
	{
		slug: "grill",
		concept: "idee",
		fr: { title: "Le grill — challenger l'intention" },
		en: { title: "The grill — challenge the intention" },
	},
	{
		slug: "goal",
		concept: "mur",
		fr: { title: "Goal — promouvoir une idée en vérité" },
		en: { title: "Goal — promote an idea into a truth" },
	},
	{
		slug: "operations",
		concept: "verticale",
		fr: { title: "Les opérations — état → commande → événements" },
		en: { title: "The operations — state → command → events" },
	},
	{
		slug: "workflows",
		concept: "verticale",
		fr: { title: "Les enchaînements — les fixtures d'opération" },
		en: { title: "The workflows — the operation fixtures" },
	},
	{
		slug: "policy",
		concept: "verticale",
		fr: { title: "Policy DSL — l'arbre ALLOW/DENY" },
		en: { title: "Policy DSL — the ALLOW/DENY tree" },
	},
	{
		slug: "dag",
		concept: "kernel",
		fr: { title: "Le DAG — les phases stables et les changesets" },
		en: { title: "The DAG — the stable phases and the changesets" },
	},
	{
		slug: "ai-lab",
		concept: "verticale",
		fr: { title: "AI-Lab — placer le besoin sur la verticale" },
		en: { title: "AI-Lab — place the need on the verticale" },
	},
	{
		slug: "graphe",
		concept: "liens",
		fr: { title: "Le graphe — verticale × facette × profondeur" },
		en: { title: "The graph — verticale × facet × depth" },
	},
	{
		slug: "why",
		concept: "liens",
		fr: { title: "Le pourquoi — d'un symptôme à la cause racine" },
		en: { title: "The why — from a symptom to the root cause" },
	},
	{
		slug: "conscience",
		concept: "kernel",
		fr: { title: "La conscience — voulu · construit · prouvé · autorisé" },
		en: { title: "The conscience — wanted · built · proven · authorised" },
	},
	{
		slug: "emetteurs",
		concept: "verticale",
		fr: { title: "Les émetteurs — DDL · Go · TS, octet-stable" },
		en: { title: "The emitters — DDL · Go · TS, byte-stable" },
	},
	{
		slug: "deploy",
		concept: "verticale",
		fr: { title: "Provisionner & déployer — l'app émise en ligne" },
		en: { title: "Provision & deploy — the emitted app live" },
	},
	{
		slug: "lab",
		concept: "verticale",
		fr: { title: "Le lab — la verticale d'un besoin, bout en bout" },
		en: { title: "The lab — a need's verticale, end to end" },
	},
];

const BY_SLUG: ReadonlyMap<string, ScreenEntry> = new Map(
	SCREENS.map((s) => [s.slug, s] as const),
);

/** Tous les slugs d'écran, dans l'ordre du parcours. */
export const SCREEN_SLUGS: readonly string[] = SCREENS.map((s) => s.slug);

/** Toutes les routes /v2/<slug> des écrans déclarés. */
export const SCREEN_ROUTES: readonly string[] = SCREENS.map(
	(s) => `/v2/${s.slug}`,
);

/** Récupère un écran par son slug (total : `undefined` si inconnu). */
export function screen(slug: string): ScreenEntry | undefined {
	return BY_SLUG.get(slug);
}

/** Le titre d'un écran dans la locale demandée. `undefined` si slug inconnu. */
export function screenTitle(slug: string, locale: Locale): string | undefined {
	const s = BY_SLUG.get(slug);
	if (s === undefined) return undefined;
	return s[locale].title;
}

/**
 * La totalité du registre (le critère de done WB2-25) : chaque écran a un titre NON VIDE en FR ET
 * en EN, et son slug est unique. PURE & TOTALE.
 */
export function isTotal(entries: readonly ScreenEntry[] = SCREENS): boolean {
	const seen = new Set<string>();
	for (const e of entries) {
		if (e.slug.trim() === "") return false;
		if (seen.has(e.slug)) return false;
		seen.add(e.slug);
		if (typeof e.fr.title !== "string" || e.fr.title.trim() === "")
			return false;
		if (typeof e.en.title !== "string" || e.en.title.trim() === "")
			return false;
	}
	return entries.length > 0;
}

/**
 * L'empreinte content-adressée du registre (déterministe, stable) — FNV-1a 32 bits sur la
 * sérialisation ordonnée. Même registre → même empreinte.
 */
export function screensHash(entries: readonly ScreenEntry[] = SCREENS): string {
	const canon = entries
		.map((e) => `${e.slug}|${e.concept ?? ""}|${e.fr.title}|${e.en.title}`)
		.join("\n");
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}
