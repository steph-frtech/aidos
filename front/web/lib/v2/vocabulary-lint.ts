/**
 * Le lint vocabulaire V2 (Workbench V2, étape WB2-00) — la garde déterministe « aucun terme
 * franglais dans la nav V2 ». La nav V2 ne tire ses libellés QUE du glossaire canonique
 * (lib/v2/glossary.ts) ; ce lint le PROUVE : tout libellé de nav doit correspondre, mot pour
 * mot, au terme FR d'un slug du glossaire, et aucun mot anglais interdit ne doit s'y glisser.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : `lintNav` est PURE & TOTALE — pas de LLM, pas d'E/S.
 * Même nav + même glossaire → même verdict. C'est un algorithme (un set-membership + un
 * scan de tokens), jamais un « agent qui juge le franglais ». Miroir : lib/v2/glossary.test.ts.
 *
 * LE MUR : ce lint LIT et VÉRIFIE ; il n'écrit aucune vérité.
 */

import { GLOSSARY, type GlossaryEntry } from "./glossary";
import { type Locale, SCREENS, type ScreenEntry } from "./screens";

/**
 * Les mots anglais INTERDITS dans un libellé français de la V2 (la liste explicite, déclarée,
 * jamais apprise — §8). Un franglais courant à bannir des écrans : on garde le terme KRD FR.
 * Volontairement minimal et explicite : étendu au besoin, jamais deviné par un LLM.
 */
export const FORBIDDEN_FRANGLAIS: readonly string[] = [
	"wall",
	"tree",
	"trees",
	"link",
	"links",
	"cell",
	"cells",
	"idea",
	"settings",
	"dashboard",
	"home",
	"workflow",
	"workflows",
	"goal",
	"deploy",
	"preview",
	"overview",
];

/**
 * Les NOMS PROPRES / acronymes KRD AUTORISÉS dans un titre d'écran FR (déclarés, §8). Ce sont des
 * termes du vocabulaire canonique qui RESTENT en anglais ou en sigle VERBATIM (KRD.md, ADR 0009/
 * 0010) : « Goal » (le geste §56), « Policy DSL » et « DSL » (les ASTs), « DAG », « Pact », « AI »
 * (AI-Lab), « Go », « TS », « DDL » (les cibles d'émission). Un token de cette liste neutralise le
 * ban franglais (un faux positif évité), jamais un mot anglais accidentel. Déclaré, jamais deviné.
 */
export const ALLOWED_PROPER_NOUNS: readonly string[] = [
	"goal",
	"policy",
	"dsl",
	"dag",
	"pact",
	"ai",
	"lab",
	"go",
	"ts",
	"ddl",
	"allow",
	"deny",
];

/** Un écart de vocabulaire : le libellé fautif + la raison. */
export interface VocabularyViolation {
	label: string;
	reason:
		| "not-in-glossary" // le libellé ne correspond à aucun terme FR canonique
		| "forbidden-franglais"; // le libellé contient un mot anglais banni
	detail: string;
}

/** Le verdict du lint : conforme (0 écart) ou la liste des écarts. */
export interface VocabularyVerdict {
	clean: boolean;
	violations: VocabularyViolation[];
}

function tokenize(label: string): string[] {
	return label
		.toLowerCase()
		.split(/[^a-zàâäéèêëîïôöùûüç]+/i)
		.filter((t) => t.length > 0);
}

/**
 * Lint d'une liste de libellés de nav contre le glossaire FR canonique.
 * Un libellé est CONFORME ssi :
 *   1. il est, mot pour mot, le terme FR d'un slug du glossaire, ET
 *   2. il ne contient aucun token de FORBIDDEN_FRANGLAIS.
 */
export function lintNav(
	navLabels: readonly string[],
	entries: readonly GlossaryEntry[] = GLOSSARY,
): VocabularyVerdict {
	const canonicalFr = new Set(entries.map((e) => e.fr.label));
	const forbidden = new Set(FORBIDDEN_FRANGLAIS.map((w) => w.toLowerCase()));
	const violations: VocabularyViolation[] = [];

	for (const label of navLabels) {
		if (!canonicalFr.has(label)) {
			violations.push({
				label,
				reason: "not-in-glossary",
				detail: `« ${label} » ne provient pas du glossaire canonique KRD.`,
			});
			continue;
		}
		const offending = tokenize(label).filter((t) => forbidden.has(t));
		if (offending.length > 0) {
			violations.push({
				label,
				reason: "forbidden-franglais",
				detail: `« ${label} » contient un terme franglais interdit : ${offending.join(", ")}.`,
			});
		}
	}

	return { clean: violations.length === 0, violations };
}

/**
 * Lint des TITRES d'écran V2 (la passe de cohérence WB2-25 : « le bon mot partout »). À la
 * différence de `lintNav` (qui exige le terme glossaire exact), un titre d'écran est une phrase ;
 * on n'exige PAS qu'il soit dans le glossaire, mais on PROUVE qu'aucun token n'est du franglais
 * accidentel — sauf les noms propres / acronymes KRD explicitement autorisés (ALLOWED_PROPER_NOUNS).
 *
 * PURE & TOTALE : même registre → même verdict. Algorithme (scan de tokens + set-membership),
 * jamais un LLM. C'est l'application déterministe-first du mandat « bon vocabulaire partout ».
 */
export function lintScreens(
	entries: readonly ScreenEntry[] = SCREENS,
	locale: Locale = "fr",
): VocabularyVerdict {
	const forbidden = new Set(FORBIDDEN_FRANGLAIS.map((w) => w.toLowerCase()));
	const allowed = new Set(ALLOWED_PROPER_NOUNS.map((w) => w.toLowerCase()));
	const violations: VocabularyViolation[] = [];

	for (const e of entries) {
		const title = e[locale].title;
		const offending = tokenize(title).filter(
			(t) => forbidden.has(t) && !allowed.has(t),
		);
		if (offending.length > 0) {
			violations.push({
				label: title,
				reason: "forbidden-franglais",
				detail: `Le titre de « /v2/${e.slug} » contient un terme franglais interdit : ${offending.join(", ")}.`,
			});
		}
	}

	return { clean: violations.length === 0, violations };
}
