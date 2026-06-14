/**
 * Design Lab — LE PROTOCOLE du bridge iframe↔lentille (ADR 0071, Onlook INVERSÉ). Un
 * postMessage RPC TYPÉ (jeu CLOS, calqué penpal/preload Onlook) qui LIT les data-aidos-*
 * DÉJÀ émis — jamais d'injection de source. Le twin TS du protocole de back/runtime/honoemit/
 * aidos-bridge.embed.ts : mêmes messages (ready/selected/mutated + select/hover/preview-edit/
 * clear-preview), même normalisation du drift {view,screen,panel}→section / {col,field}→field /
 * invoke→action.
 *
 * DÉTERMINISME / TOLÉRANCE (§6/§8 + calque Onlook withTryCatch). Le parseur ne crash JAMAIS :
 * tout message reçu d'une iframe (y compris malformé/null/cross-origin) est soit un message
 * TYPÉ fermé, soit null — jamais une exception (le miroir bridge le scelle). Le mur (§2) : le
 * bridge ne calcule AUCUNE édition de source ; les commandes ne mutent que des classes-token
 * optimistes (purement visuel), la vérité reste le requirement content-adressé.
 */

import {
	type ChildTarget,
	type CoordKind,
	isKnownChildTarget,
	isKnownCoordKind,
	type ScreenCoord,
	type StyleToken,
} from "./screen-design";

/** La table de NORMALISATION du drift attribut→CoordKind (le MÊME ATTR_TO_KIND que l'embed). */
export const ATTR_TO_KIND: Readonly<Record<string, CoordKind>> = {
	"data-aidos-view": "section",
	"data-aidos-screen": "section",
	"data-aidos-panel": "section",
	"data-aidos-col": "field",
	"data-aidos-field": "field",
	"data-aidos-invoke": "action",
};

/** Le préfixe du protocole (= aidos-bridge:ready dans l'embed). */
export const READY_TYPE = "aidos-bridge:ready" as const;

// ─── IFRAME → PARENT (callbacks) ──────────────────────────────────────────────────────

/** Le handshake (= onDomProcessed Onlook) : la maître + chaque coordonnée. */
export interface ReadyMessage {
	readonly type: "ready";
	readonly masterHash: string;
	readonly target: ChildTarget;
	readonly coords: readonly ScreenCoord[];
}

/** L'utilisateur a cliqué un élément → sa coordonnée + son style calculé. */
export interface SelectedMessage {
	readonly type: "selected";
	readonly coord: ScreenCoord;
	readonly computed: Readonly<Record<string, string>>;
}

/** Le DOM a muté (= onWindowMutated) → re-sync de l'arbre de coordonnées. */
export interface MutatedMessage {
	readonly type: "mutated";
	readonly coords: readonly ScreenCoord[];
}

/** L'utilisateur a fini une édition visuelle → PROPOSITION (PAS encore capturée). */
export interface EditProposedMessage {
	readonly type: "edit-proposed";
	readonly coord: ScreenCoord;
	readonly styles: readonly StyleToken[];
}

/** Le jeu CLOS des messages iframe→parent. */
export type FromIframe =
	| ReadyMessage
	| SelectedMessage
	| MutatedMessage
	| EditProposedMessage;

// ─── PARENT → IFRAME (commandes) ────────────────────────────────────────────────────

/** Surligne un élément (overlay rect). */
export interface SelectCommand {
	readonly type: "select";
	readonly coord: ScreenCoord;
}

/** Survol (coord ou null pour annuler). */
export interface HoverCommand {
	readonly type: "hover";
	readonly coord: ScreenCoord | null;
}

/** Édition OPTIMISTE live (avant capture) — purement visuel. */
export interface PreviewEditCommand {
	readonly type: "preview-edit";
	readonly coord: ScreenCoord;
	readonly styles: readonly StyleToken[];
}

/** Annule la preview. */
export interface ClearPreviewCommand {
	readonly type: "clear-preview";
	readonly coord: ScreenCoord;
	readonly styles?: readonly StyleToken[];
}

/** Le jeu CLOS des commandes parent→iframe. */
export type ToIframe =
	| SelectCommand
	| HoverCommand
	| PreviewEditCommand
	| ClearPreviewCommand;

// ─── LE PARSEUR TOLÉRANT (calque withTryCatch — jamais un crash) ──────────────────────

/** Lit une coordonnée d'une valeur inconnue, fail-closed (null si malformée). PURE, TOTALE. */
function parseCoord(v: unknown): ScreenCoord | null {
	if (!v || typeof v !== "object") return null;
	const o = v as Record<string, unknown>;
	const kind = o.kind;
	if (typeof kind !== "string" || !isKnownCoordKind(kind)) return null;
	const entity = typeof o.entity === "string" ? o.entity : "";
	const field = typeof o.field === "string" ? o.field : undefined;
	const control = typeof o.control === "string" ? o.control : undefined;
	return { kind, entity, field, control };
}

/** Lit un empilement de styles d'une valeur inconnue (les non-objets sont ignorés). PURE. */
function parseStyles(v: unknown): StyleToken[] {
	if (!Array.isArray(v)) return [];
	const out: StyleToken[] = [];
	for (const it of v) {
		if (!it || typeof it !== "object") continue;
		const o = it as Record<string, unknown>;
		if (typeof o.property === "string" && typeof o.token === "string")
			out.push({ property: o.property, token: o.token });
	}
	return out;
}

/** Lit une liste de coordonnées (les malformées sont écartées). PURE, TOTALE. */
function parseCoords(v: unknown): ScreenCoord[] {
	if (!Array.isArray(v)) return [];
	const out: ScreenCoord[] = [];
	for (const it of v) {
		const c = parseCoord(it);
		if (c) out.push(c);
	}
	return out;
}

/**
 * parseFromIframe — le parseur TOLÉRANT (= la tolérance Onlook withTryCatch). ∀ donnée reçue
 * d'une iframe (y compris null, un primitif, un objet malformé, un type inconnu) : retourne soit
 * un message TYPÉ fermé, soit null — JAMAIS une exception. Le `aidos-bridge:ready` du runtime
 * embarqué est normalisé en `ready` ; tout type hors du jeu clos → null (fail-closed). PURE.
 */
export function parseFromIframe(data: unknown): FromIframe | null {
	try {
		if (!data || typeof data !== "object") return null;
		const o = data as Record<string, unknown>;
		const type = o.type;
		if (typeof type !== "string") return null;

		if (type === READY_TYPE || type === "ready") {
			const masterHash =
				typeof o.master_hash === "string"
					? o.master_hash
					: typeof o.masterHash === "string"
						? o.masterHash
						: "";
			const rawTarget = typeof o.target === "string" ? o.target : "";
			const target: ChildTarget = isKnownChildTarget(rawTarget)
				? rawTarget
				: "web";
			return {
				type: "ready",
				masterHash,
				target,
				coords: parseCoords(o.coords),
			};
		}
		if (type === "selected") {
			const coord = parseCoord(o.coord);
			if (!coord) return null;
			const computed: Record<string, string> = {};
			if (o.computed && typeof o.computed === "object") {
				for (const [k, val] of Object.entries(
					o.computed as Record<string, unknown>,
				)) {
					if (typeof val === "string") computed[k] = val;
				}
			}
			return { type: "selected", coord, computed };
		}
		if (type === "mutated") {
			return { type: "mutated", coords: parseCoords(o.coords) };
		}
		if (type === "edit-proposed") {
			const coord = parseCoord(o.coord);
			if (!coord) return null;
			return { type: "edit-proposed", coord, styles: parseStyles(o.styles) };
		}
		return null;
	} catch {
		return null;
	}
}
