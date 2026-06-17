import { createHash } from "node:crypto";

/**
 * kernels-data.ts — le jeu CANONIQUE de vérités du noyau (kernel.truth) que la lentille
 * /v3/kernels lit EN DIRECT, adressées par contenu (S02 — records content-addressed,
 * append-only).
 *
 * POURQUOI CE FICHIER. La lentille V3 « kernels » lit le moteur Go LIVE par la passerelle
 * (`store_get` sur le serveur `store`, dispatché — ADR 0092). Mais `store_get` lit des OCTETS
 * par hash : il faut donc connaître le hash de chaque vérité à lire. Ce module déclare le jeu
 * FERMÉ de vérités-démo (leur corps JSONB canonique, la forme records.EXAMPLE_BODY étendue par
 * des exemples concrets) et calcule leur hash AVEC LA MÊME fonction que le content-store Go
 * (contentstore.Hash = SHA-256 du corps canonique). On lit ensuite chaque vérité par son hash :
 *   - hash trouvé dans le store du projet → octets LIVE décodés (source:"live") ;
 *   - hash absent / store non dispatché / payload malformé → le corps-démo (source:"demo").
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : le hash et la sérialisation canonique sont des fonctions
 * PURES (même corps → même hash → mêmes octets) ; aucun LLM n'entre. Ce module ne RÉIMPLÉMENTE
 * aucune logique du noyau — il ne fait que DÉCLARER des corps de vérité et les ADRESSER comme le
 * Go le ferait, puis les LIRE par la passerelle. Le Go reste la source unique.
 *
 * LE MUR (CLAUDE.md §2) : `kernel.truth` est de la VÉRITÉ, au-dessus de la ligne de flottaison.
 * Cette lentille LIT (un `store_get` est une lecture sous la ligne) ; geler une nouvelle vérité
 * passe par idée → miroir → /goal → approbation, jamais depuis l'écran.
 */

/** Les facettes du noyau (KRD §13) — la nature de la vérité portée par chaque kernel.truth. */
export type KernelFacet =
	| "expr"
	| "policy"
	| "operation"
	| "control"
	| "action"
	| "entity"
	| "invariant"
	| "budget";

/** Une vérité du noyau projetée : son enveloppe d'adressage + son corps JSONB canonique. */
export interface KernelTruthView {
	/** l'identifiant logique de la vérité (id du record, stable à travers les versions). */
	id: string;
	/** la facette (la nature de la vérité — expr/policy/operation/…). */
	facet: KernelFacet;
	/** l'énoncé humain (statement) — la phrase de vérité. */
	statement: string;
	/** le hash de contenu (SHA-256 du corps canonique) sous lequel les octets sont rangés. */
	hash: string;
	/** le corps JSONB canonique, rendu en une seule ligne pour l'aperçu. */
	body: string;
}

/** Un enregistrement de vérité-démo : son id/facette/énoncé + son corps JSONB (objet). */
interface KernelTruthSeed {
	id: string;
	facet: KernelFacet;
	statement: string;
	body: Record<string, unknown>;
}

/**
 * hashBody renvoie le SHA-256 hex du corps SÉRIALISÉ CANONIQUEMENT — l'image exacte de
 * contentstore.Hash côté Go (SHA-256 des octets stockés). PURE : même corps → même hash.
 */
export function hashBody(body: Record<string, unknown>): string {
	return createHash("sha256")
		.update(Buffer.from(canonicalBody(body), "utf8"))
		.digest("hex");
}

/**
 * canonicalBody sérialise un corps en JSON canonique (clés triées) — la forme déterministe
 * dont on calcule le hash et qu'on compare aux octets lus. PURE et totale.
 */
export function canonicalBody(body: Record<string, unknown>): string {
	return JSON.stringify(body, Object.keys(body).sort());
}

/** shortHash tronque un digest hex pour l'affichage (parité lib/store-data.shortHash). */
export function shortHash(h: string): string {
	return h.slice(0, 12);
}

/**
 * KERNEL_TRUTH_SEEDS — le jeu FERMÉ de vérités-démo, une par facette représentative. Les corps
 * suivent la forme records.truth (kind/statement/truth_kind/scope/verifiability/authority) enrichie
 * d'un champ de facette concret. Ils sont DÉCLARÉS (au-dessus de la ligne, jamais appris) et servent
 * À LA FOIS de cibles de lecture (par leur hash) et de repli-démo honnête.
 */
const KERNEL_TRUTH_SEEDS: readonly KernelTruthSeed[] = [
	{
		id: "truth-checkout-authz",
		facet: "policy",
		statement:
			"Seul le propriétaire du panier peut valider la commande (checkout).",
		body: {
			kind: "truth",
			truth_kind: "policy",
			statement:
				"Seul le propriétaire du panier peut valider la commande (checkout).",
			scope: "checkout",
			verifiability: "verifiable",
			authority: "human",
		},
	},
	{
		id: "truth-cart-total-nonneg",
		facet: "invariant",
		statement: "Le total du panier est toujours ≥ 0 (∀ panier).",
		body: {
			kind: "truth",
			truth_kind: "invariant",
			statement: "Le total du panier est toujours ≥ 0 (∀ panier).",
			scope: "cart",
			verifiability: "verifiable",
			authority: "human",
		},
	},
	{
		id: "truth-place-order",
		facet: "operation",
		statement:
			"Passer commande : valider → autoriser → muter → émettre OrderPlaced.",
		body: {
			kind: "truth",
			truth_kind: "operation",
			statement:
				"Passer commande : valider → autoriser → muter → émettre OrderPlaced.",
			scope: "order",
			verifiability: "verifiable",
			authority: "human",
		},
	},
	{
		id: "truth-order-entity",
		facet: "entity",
		statement: "Une commande (Order) porte un id, un total et un statut typés.",
		body: {
			kind: "truth",
			truth_kind: "entity",
			statement:
				"Une commande (Order) porte un id, un total et un statut typés.",
			scope: "order",
			verifiability: "verifiable",
			authority: "human",
		},
	},
	{
		id: "truth-checkout-visible-when",
		facet: "control",
		statement:
			"Le bouton « Valider » n'est visible que si le panier n'est pas vide.",
		body: {
			kind: "truth",
			truth_kind: "control",
			statement:
				"Le bouton « Valider » n'est visible que si le panier n'est pas vide.",
			scope: "checkout",
			verifiability: "verifiable",
			authority: "human",
		},
	},
];

/**
 * KERNEL_TRUTHS — la projection des seeds : chaque vérité avec son hash de contenu calculé et son
 * corps canonique en une ligne. C'est le repli-démo de la lentille (source:"demo"), et la LISTE des
 * hashes que la lentille lit par `store_get` (un hash trouvé dans le store du projet → live).
 */
export const KERNEL_TRUTHS: readonly KernelTruthView[] = KERNEL_TRUTH_SEEDS.map(
	(seed) => ({
		id: seed.id,
		facet: seed.facet,
		statement: seed.statement,
		hash: hashBody(seed.body),
		body: canonicalBody(seed.body),
	}),
);

/**
 * KERNEL_TRUTH_BY_HASH indexe les vérités-démo par leur hash de contenu — la table que la lentille
 * consulte pour passer d'octets lus (validés == un corps connu) à la vue typée correspondante.
 */
export const KERNEL_TRUTH_BY_HASH: Record<string, KernelTruthView> =
	Object.fromEntries(KERNEL_TRUTHS.map((tr) => [tr.hash, tr]));
