/**
 * Le glossaire V2 — le vocabulaire CANONIQUE KRD (Workbench V2, étape WB2-00, ADR 0053).
 *
 * SOURCE UNIQUE des libellés de la V2 : un concept = un `slug` → son terme FR + son terme EN
 * + sa définition (FR + EN). Aucun écran V2 n'écrit une chaîne de navigation en dur ; tout
 * libellé vient d'ici. C'est l'application du mandat « le bon vocabulaire partout » : les
 * termes KRD (idée, mur, kernel, verticale, facette, paires-miroir, liens §17, cellules,
 * arbres) sont nommés VERBATIM, en français d'abord (ADR 0011).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : `term`, `def`, `isTotal`, `glossaryHash` sont des
 * fonctions PURES & TOTALES du glossaire — pas d'horloge, pas d'aléa, pas d'E/S, pas de LLM.
 * Même entrée → même sortie. Le miroir de reproductibilité lib/v2/glossary.test.ts (fast-check)
 * épingle la totalité (chaque concept a FR+EN+def) + le déterminisme.
 *
 * LE MUR (CLAUDE.md §2) : ce module DÉCRIT le vocabulaire ; il n'écrit aucune vérité. Le
 * glossaire est une projection de lecture, jamais un kernel.
 */

export type Locale = "fr" | "en";

/** Un terme localisé : son libellé court + sa définition. */
export interface LocalizedTerm {
	/** Le libellé court (utilisé en nav, en titre). */
	label: string;
	/** La définition (une phrase). */
	def: string;
}

/** Une entrée du glossaire : un concept canonique KRD, bilingue. */
export interface GlossaryEntry {
	/** Le slug stable, content-addressé (la clé de route + i18n). */
	slug: string;
	fr: LocalizedTerm;
	en: LocalizedTerm;
}

/**
 * LE GLOSSAIRE CANONIQUE — le schéma complet KRD, dans l'ordre du parcours :
 *   idée → MUR → verticale × facette × anatomie (paires-miroir) → liens §17 → arbres → cellules.
 *
 * Chaque concept est un slug stable. Les termes sont VERBATIM KRD, français d'abord.
 * AUCUN terme franglais (pas de mot anglais dans la colonne FR, ni l'inverse) — la totalité
 * et la pureté sont prouvées par lib/v2/glossary.test.ts.
 */
export const GLOSSARY: readonly GlossaryEntry[] = [
	{
		slug: "idee",
		fr: {
			label: "Idée",
			def: "Un candidat-vérité capturé au-dessus du mur : un besoin sans gel ni miroir (§115).",
		},
		en: {
			label: "Idea",
			def: "A candidate-truth captured above the wall: a need with no freeze and no mirror (§115).",
		},
	},
	{
		slug: "mur",
		fr: {
			label: "Mur",
			def: "La frontière : au-dessus on déclare, en dessous on prouve ; on ne la franchit que par idée → miroir → /goal.",
		},
		en: {
			label: "Wall",
			def: "The boundary: above it we declare, below it we prove; crossed only via idea → mirror → /goal.",
		},
	},
	{
		slug: "kernel",
		fr: {
			label: "Kernel",
			def: "Une vérité gelée, content-adressée et append-only ; la version est son empreinte.",
		},
		en: {
			label: "Kernel",
			def: "A frozen truth, content-addressed and append-only; its version is its hash.",
		},
	},
	{
		slug: "verticale",
		fr: {
			label: "Verticale",
			def: "L'axe architectural couplant : produit → parcours → vue → contrôle → action → opération → entité (§23).",
		},
		en: {
			label: "Verticale",
			def: "The coupling architectural axis: product → journey → view → control → action → operation → entity (§23).",
		},
	},
	{
		slug: "facette",
		fr: {
			label: "Facette",
			def: "L'axe orthogonal de la nature d'une vérité : les huit lentilles F·I·S·B·R·V·M·X (FKE-1.3).",
		},
		en: {
			label: "Facette",
			def: "The orthogonal axis of a truth's nature: the eight lenses F·I·S·B·R·V·M·X (FKE-1.3).",
		},
	},
	{
		slug: "paires-miroir",
		fr: {
			label: "Paires-miroir",
			def: "L'anatomie 1-pour-1 d'un kernel autour du mur : six paires déclaré ↔ prouvé.",
		},
		en: {
			label: "Mirror pairs",
			def: "A kernel's 1-to-1 anatomy around the wall: six declared ↔ proven pairs.",
		},
	},
	{
		slug: "liens",
		fr: {
			label: "Liens",
			def: "Les six liens du §17 (composes, depends_on, supersedes, provenance, triggers/binds, mirrors), tous pinnés @version.",
		},
		en: {
			label: "Links",
			def: "The six §17 links (composes, depends_on, supersedes, provenance, triggers/binds, mirrors), all pinned @version.",
		},
	},
	{
		slug: "arbres",
		fr: {
			label: "Arbres",
			def: "Les arbres fractals de composition : un kernel par niveau, dépliable, du produit à l'entité (§49).",
		},
		en: {
			label: "Trees",
			def: "The fractal composition trees: one kernel per level, expandable, from product to entity (§49).",
		},
	},
	{
		slug: "cellules",
		fr: {
			label: "Cellules",
			def: "Les contextes délimités (features = kernels grossiers) reliés par contrats Pact (§49).",
		},
		en: {
			label: "Cells",
			def: "The bounded contexts (features = coarse kernels) joined by Pact contracts (§49).",
		},
	},
];

// Map (not a plain object) so a lookup is TOTAL : un slug hors-glossaire — y compris une clé
// héritée d'Object.prototype (« constructor », « toString », « __proto__ »…) — rend undefined,
// jamais un membre du prototype. (Sinon la propriété de totalité échoue sur ces clés empoisonnées.)
const FR_BY_SLUG: ReadonlyMap<string, GlossaryEntry> = new Map(
	GLOSSARY.map((e) => [e.slug, e] as const),
);

/** Tous les slugs canoniques, dans l'ordre du parcours. */
export const SLUGS: readonly string[] = GLOSSARY.map((e) => e.slug);

/** Récupère une entrée par son slug (total : `undefined` si inconnu). */
export function entry(slug: string): GlossaryEntry | undefined {
	return FR_BY_SLUG.get(slug);
}

/** Le libellé court d'un concept dans la locale demandée. `undefined` si slug inconnu. */
export function term(slug: string, locale: Locale): string | undefined {
	const e = FR_BY_SLUG.get(slug);
	if (e === undefined) return undefined;
	return e[locale].label;
}

/** La définition d'un concept dans la locale demandée. `undefined` si slug inconnu. */
export function def(slug: string, locale: Locale): string | undefined {
	const e = FR_BY_SLUG.get(slug);
	if (e === undefined) return undefined;
	return e[locale].def;
}

/**
 * La totalité du glossaire (le critère de done WB2-00) : chaque concept a un libellé ET une
 * définition NON VIDES en FR ET en EN, et son slug est unique. PURE & TOTALE.
 */
export function isTotal(entries: readonly GlossaryEntry[] = GLOSSARY): boolean {
	const seen = new Set<string>();
	for (const e of entries) {
		if (e.slug.trim() === "") return false;
		if (seen.has(e.slug)) return false;
		seen.add(e.slug);
		const cells = [e.fr.label, e.fr.def, e.en.label, e.en.def];
		for (const c of cells) {
			if (typeof c !== "string" || c.trim() === "") return false;
		}
	}
	return entries.length > 0;
}

/**
 * L'empreinte content-adressée du glossaire (déterministe, stable) — FNV-1a 32 bits sur la
 * sérialisation ordonnée. Même glossaire → même empreinte.
 */
export function glossaryHash(
	entries: readonly GlossaryEntry[] = GLOSSARY,
): string {
	const canon = entries
		.map((e) => `${e.slug}|${e.fr.label}|${e.fr.def}|${e.en.label}|${e.en.def}`)
		.join("\n");
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, "0");
}
