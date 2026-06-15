/**
 * V3 — le TWIN PUR du PROJET PERSISTANT (ADR 0061).
 *
 * « Créer une app crée un PROJET qu'on rouvre avec tout l'historique, partout,
 * même état. » Le projet ne stocke JAMAIS l'état : il stocke le TRANSCRIPT (la
 * seule vérité — event-sourcing, ADR 0057/0060) + les réponses conversationnelles
 * de l'IA (une décoration : la vérité reste les messages). ROUVRIR = parser puis
 * REJOUER (replayTo) — « le même état partout » est une CONSÉQUENCE du rejeu
 * déterministe déjà prouvé, pas une synchronisation.
 *
 * DÉTERMINISME-FIRST : sérialisation canonique (JSON, clés ordonnées par
 * construction), parse TOTAL & FAIL-CLOSED (du bruit → null, un transcript
 * non-textuel → null — jamais une invention), slug stable, tri déterministe
 * (savedAt ↓ puis id ↑). PAS d'horloge ici : `savedAt` est FOURNI par la couche
 * impure (l'action serveur), jamais lu dans le twin. Miroir : lib/v3/project.test.ts.
 *
 * LE MUR : un projet est un transcript de PROPOSITIONS ; le rejouer ne produit
 * aucune écriture-vérité (la loi ∀ du réducteur couvre chaque pas).
 */

/** Un PROJET : l'identité + le transcript (la vérité) + les réponses IA (décor). */
export interface ProjectRecord {
	/** L'id stable (slug + suffixe éventuel) — la clé de fichier/stockage. */
	readonly id: string;
	/** Le nom affiché, libre. */
	readonly name: string;
	/** LE TRANSCRIPT — la seule vérité ; l'état se rejoue depuis lui. */
	readonly transcript: readonly string[];
	/** Les réponses conversationnelles par index de tour (décoration, rejouable sans). */
	readonly replies: Readonly<Record<string, string>>;
	/** L'instant de sauvegarde (epoch s) — FOURNI par la couche impure, jamais lu ici. */
	readonly savedAt: number;
}

/** SÉRIALISE un projet (JSON canonique, indenté pour la lisibilité du fichier). */
export function serializeProject(p: ProjectRecord): string {
	return JSON.stringify(
		{
			id: p.id,
			name: p.name,
			transcript: p.transcript,
			replies: p.replies,
			savedAt: p.savedAt,
		},
		null,
		"\t",
	);
}

/**
 * PARSE un projet — TOTAL & FAIL-CLOSED : toute forme inattendue → null (jamais
 * une invention, jamais une exception). Chaque champ est vérifié structurellement.
 */
export function parseProject(raw: string): ProjectRecord | null {
	let v: unknown;
	try {
		v = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof v !== "object" || v === null) return null;
	const o = v as Record<string, unknown>;
	if (typeof o.id !== "string" || o.id === "") return null;
	if (typeof o.name !== "string" || o.name === "") return null;
	if (!Array.isArray(o.transcript)) return null;
	if (!o.transcript.every((m) => typeof m === "string")) return null;
	if (typeof o.replies !== "object" || o.replies === null) return null;
	const replies = o.replies as Record<string, unknown>;
	if (!Object.values(replies).every((r) => typeof r === "string")) return null;
	if (typeof o.savedAt !== "number" || !Number.isFinite(o.savedAt)) return null;
	return {
		id: o.id,
		name: o.name,
		transcript: o.transcript as string[],
		replies: replies as Record<string, string>,
		savedAt: o.savedAt,
	};
}

/** Le SLUG stable d'un nom de projet (accents pliés, tirets bornés). */
export function projectSlug(name: string): string {
	return name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

/**
 * Le VERDICT d'un nom de projet proposé — la validation PURE de la création (déterministe,
 * miroir : project.test.ts). Avant, un nom dupliqué glissait silencieusement vers « toto-2 »
 * (aucune alerte) ; désormais la création REFUSE un doublon et l'écran alerte. Les trois
 * refus clos :
 *   - empty    : nom vide / blancs uniquement ;
 *   - unusable : le nom n'a aucun caractère slug-able (ex. « !!! », emoji) → slug vide ;
 *   - duplicate: le slug existe déjà (insensible à la casse/aux accents — projectSlug plie
 *                « Tôto » et « toto » sur le même slug). takenSlugs = les slugs DÉJÀ pris
 *                (fichiers + registre Postgres, l'appelant les rassemble des deux sources).
 */
export type NewNameVerdict =
	| { readonly ok: true; readonly slug: string }
	| { readonly ok: false; readonly reason: "empty" | "unusable" | "duplicate" };

export function classifyNewName(
	name: string,
	takenSlugs: ReadonlySet<string>,
): NewNameVerdict {
	if (name.trim() === "") return { ok: false, reason: "empty" };
	const slug = projectSlug(name);
	if (slug === "") return { ok: false, reason: "unusable" };
	if (takenSlugs.has(slug)) return { ok: false, reason: "duplicate" };
	return { ok: true, slug };
}

/** TRIE les projets : le plus récemment sauvé d'abord, départage stable par id. */
export function sortProjects(ps: readonly ProjectRecord[]): ProjectRecord[] {
	return [...ps].sort((a, b) =>
		a.savedAt !== b.savedAt
			? b.savedAt - a.savedAt
			: a.id < b.id
				? -1
				: a.id > b.id
					? 1
					: 0,
	);
}
