/**
 * Design Lab — le TWIN TS PUR de EmitScreenDesign / ClassifyGesture (ADR 0071, Onlook
 * INVERSÉ). Verdict-pour-verdict avec back/runtime/honoemit/screendesign.go : même
 * records.Hash (content-address), même nature de geste, même catalogue FERMÉ ADR 0010,
 * même normalisation du drift {view,screen,panel}→section / {col,field}→field / invoke→action.
 *
 * LE MUR (§2). Le ScreenDesign N'ÉTEND PAS la vue maître (ce serait structurel) : il étend
 * la voie ViewAdaptation — un override SOFT, content-adressé, append-only, below-the-line.
 * Un geste STRUCTUREL (ajout/retrait/réordre d'un champ/section/action, texte=donnée i18n,
 * composant=source-kind) route vers idée→miroir→/goal — classifyGesture le tranche déterministe.
 *
 * DÉTERMINISME-FIRST (§6/§8). Tout est PUR & TOTAL & SANS LLM : la classification lit la
 * STRUCTURE (les champs du geste), jamais un libellé fourni par un modèle ; le catalogue
 * Property×Token est CLOS (un hex / une utilitaire Tailwind arbitraire est REFUSÉ fail-closed,
 * jamais coercé) ; l'identité est content-adressée par un SHA-256 byte-égal à Go
 * (records.Hash(records.Canonicalize(screenDesignBody))). Le twin est synchrone et navigateur-
 * sûr : un sha256 PUR en TS (pas de node:crypto, pas de WebCrypto async), pour que la lentille
 * compose un ScreenDesign DRAFT et VÉRIFIE l'ID AVANT toute capture (le gate déterministe).
 *
 * RÉUTILISE, NE RÉINVENTE PAS : le schéma canonique (clés triées récursivement, échappement
 * HTML de Go) est le MÊME que lib/web-projection (canon/goJSONString) — ici en synchrone pur.
 */

/** La cible enfant — le jeu CLOS {web, mobile, desktop} (mirrors ChildTarget en Go). */
export type ChildTarget = "web" | "mobile" | "desktop";

/** Les cibles enfants connues, déclarées (jamais inventées). */
export const CHILD_TARGETS: readonly ChildTarget[] = [
	"web",
	"mobile",
	"desktop",
] as const;

export function isKnownChildTarget(t: string): t is ChildTarget {
	return CHILD_TARGETS.includes(t as ChildTarget);
}

/** La nature normalisée d'une coordonnée (mirrors CoordKind). Jeu CLOS. */
export type CoordKind = "section" | "field" | "action";

export const COORD_KINDS: readonly CoordKind[] = [
	"section",
	"field",
	"action",
] as const;

export function isKnownCoordKind(k: string): k is CoordKind {
	return COORD_KINDS.includes(k as CoordKind);
}

/**
 * La coordonnée-requirement qu'un élément projette (mirrors ScreenCoord). Adressée
 * RELATIVEMENT au master (jamais un fichier:ligne — il n'y a pas de source-main). Entity
 * toujours rempli ; field seulement pour `field` ; control seulement pour `action`.
 */
export interface ScreenCoord {
	readonly kind: CoordKind;
	readonly entity: string;
	readonly field?: string;
	readonly control?: string;
}

/** Un override de STYLING en TOKENS ADR 0010 (mirrors StyleToken). Catalogue FERMÉ. */
export interface StyleToken {
	readonly property: string;
	readonly token: string;
}

/** L'override-écran par coordonnée (mirrors ScreenOverride). */
export interface ScreenOverride {
	readonly coord: ScreenCoord;
	readonly styles?: readonly StyleToken[];
	readonly label?: string;
}

/**
 * Le requirement-écran complet pour UNE cible (mirrors ScreenDesign). Content-adressé
 * (id = sha256(canonical body), byte-égal Go). ParentID == master.Hash() TOUJOURS.
 */
export interface ScreenDesign {
	readonly id: string;
	readonly childTarget: ChildTarget;
	readonly parentId: string;
	readonly overrides: readonly ScreenOverride[];
	readonly validated: boolean;
	readonly by: string;
}

/**
 * La vue MAÎTRE telle que le twin en a besoin (un sous-ensemble lisible côté écran) :
 * son adresse content-adressée + les coordonnées qu'elle PIN (sections, champs, actions).
 * Le twin ne re-dérive pas le master (c'est le rôle de l'émetteur Go) ; il reçoit le hash
 * (du bridge `ready.master_hash`) et la liste des coordonnées qu'il pin (du bridge `coords`),
 * et VALIDE qu'un override ne cible qu'une coordonnée EXISTANTE (sinon c'est structurel).
 */
export interface MasterDescriptor {
	/** L'adresse content-adressée du master (== ParentID de tout ScreenDesign). */
	readonly hash: string;
	/** Les coordonnées que la maître PIN (lues des data-aidos-* via le bridge). */
	readonly coords: readonly ScreenCoord[];
}

/**
 * Le CATALOGUE FERMÉ property→prefix (ADR 0010) — le MÊME mapping que StyleToken.className en Go.
 * TRANCHE 3 l'ÉTEND (typo / élévation / densité / largeur / colonnes) — tout reste TOKENISÉ :
 *   - size    → text-…   (taille de police : xs/sm/base/lg/xl)
 *   - weight  → font-…   (graisse : normal/medium/semibold/bold)
 *   - shadow  → shadow-… (élévation : none/sm/md/lg)
 *   - density → aidos-density-… (densité : compact/cosy/spacieux — une classe du design system DÉCLARÉE)
 *   - width   → w-…      (largeur : full/auto/fit/half)
 *   - cols    → grid-cols-… (colonnes : 1/2/3/4)
 */
export const PROPERTY_PREFIX: Readonly<Record<string, string>> = {
	bg: "bg-",
	text: "text-",
	border: "border-",
	radius: "rounded-",
	pad: "p-",
	gap: "gap-",
	align: "text-",
	size: "text-",
	weight: "font-",
	shadow: "shadow-",
	density: "aidos-density-",
	width: "w-",
	cols: "grid-cols-",
};

/**
 * Le CATALOGUE FERMÉ des tokens par property (ADR 0010 — zinc + blue-600, radius 0.5rem).
 * Byte-pour-byte le même que styleTokens en Go : un token hors de l'ensemble de sa property
 * est REFUSÉ fail-closed (jamais un hex, jamais une classe arbitraire).
 */
export const STYLE_TOKENS: Readonly<Record<string, readonly string[]>> = {
	bg: [
		"card",
		"foreground",
		"primary",
		"secondary",
		"muted",
		"accent",
		"background",
		"destructive",
		"border",
		"popover",
	],
	text: [
		"card",
		"foreground",
		"primary",
		"secondary",
		"muted",
		"muted-foreground",
		"accent",
		"background",
		"destructive",
		"primary-foreground",
		"left",
		"center",
		"right",
	],
	border: ["border", "primary", "muted", "destructive", "accent", "foreground"],
	radius: ["none", "sm", "md", "lg", "xl", "full"],
	pad: ["0", "1", "2", "3", "4", "5", "6", "8"],
	gap: ["0", "1", "2", "3", "4", "5", "6", "8"],
	align: ["left", "center", "right"],
	// TRANCHE 3 — les axes typographie / élévation / densité / largeur / colonnes (catalogue FERMÉ).
	size: ["xs", "sm", "base", "lg", "xl"],
	weight: ["normal", "medium", "semibold", "bold"],
	shadow: ["none", "sm", "md", "lg"],
	density: ["compact", "cosy", "spacieux"],
	width: ["full", "auto", "fit", "half"],
	cols: ["1", "2", "3", "4"],
};

/**
 * L'ALIAS de rendu (= styleTokenAlias en Go) : un (property, token) dont la classe Tailwind n'est PAS
 * le littéral prefix+token. Le catalogue reste le vocabulaire human-facing ; l'alias est la traduction
 * de rendu déterministe (width "half" → w-1/2 — le token évite le « / » que le parseur de la phrase
 * canonique interdit, ADR 0071 §3). Une table CLOSE — jamais une classe libre.
 */
export const STYLE_TOKEN_ALIAS: Readonly<Record<string, string>> = {
	"width=half": "1/2",
};

/**
 * Un (property, token) est-il dans le CATALOGUE FERMÉ ADR 0010 ? PURE, TOTALE, fail-closed :
 * une property inconnue OU un token inconnu pour une property connue → false (un hex, une
 * utilitaire libre, une faute de frappe rendent false). Ne panique jamais. = IsKnownStyleToken.
 */
export function isKnownStyleToken(t: StyleToken): boolean {
	// Object.hasOwn + Array.isArray : fail-closed même contre une clé du prototype
	// (« constructor », « includes »…) — un nom hors catalogue ne pioche jamais une méthode.
	if (!Object.hasOwn(STYLE_TOKENS, t.property)) return false;
	const set = STYLE_TOKENS[t.property];
	return Array.isArray(set) && set.includes(t.token);
}

/** La classe Tailwind d'un token (= StyleToken.className). PRE: isKnownStyleToken(t). PURE. */
export function classOf(t: StyleToken): string {
	if (!Object.hasOwn(PROPERTY_PREFIX, t.property)) return "";
	const prefix = PROPERTY_PREFIX[t.property];
	if (typeof prefix !== "string") return "";
	const aliasKey = `${t.property}=${t.token}`;
	if (Object.hasOwn(STYLE_TOKEN_ALIAS, aliasKey)) {
		return prefix + STYLE_TOKEN_ALIAS[aliasKey];
	}
	return prefix + t.token;
}

/** La clé stable, totale, d'une coordonnée (= ScreenCoord.coordKey en Go). PURE. */
export function coordKey(c: ScreenCoord): string {
	return `${c.kind} ${c.entity} ${c.field ?? ""} ${c.control ?? ""}`;
}

/** La clé stable d'un override (le tie-break déterministe, = overrideKeyScreen en Go). PURE. */
function overrideKey(o: ScreenOverride): string {
	let k = `${coordKey(o.coord)}${o.label ?? ""}`;
	for (const s of o.styles ?? []) k += `${s.property}=${s.token}`;
	return k;
}

/** Trie un empilement de styles canonique (property, token) — COPIE pure. = sortedStyles. */
function sortedStyles(styles: readonly StyleToken[]): StyleToken[] {
	return [...styles].sort((a, b) =>
		a.property !== b.property
			? a.property < b.property
				? -1
				: 1
			: a.token < b.token
				? -1
				: a.token > b.token
					? 1
					: 0,
	);
}

/**
 * Trie les overrides canonique (coordKey, puis clé complète) avec styles triés — COPIE
 * pure. Le point UNIQUE où l'ordre d'entrée est réconcilié (= sortedScreenOverrides). PURE.
 */
function sortedOverrides(
	overrides: readonly ScreenOverride[],
): ScreenOverride[] {
	const out = overrides.map((o) => ({
		...o,
		styles: o.styles !== undefined ? sortedStyles(o.styles) : undefined,
	}));
	return out.sort((a, b) => {
		const ka = coordKey(a.coord);
		const kb = coordKey(b.coord);
		if (ka !== kb) return ka < kb ? -1 : 1;
		const oa = overrideKey(a);
		const ob = overrideKey(b);
		return oa < ob ? -1 : oa > ob ? 1 : 0;
	});
}

/** Une coordonnée est-elle PIN par le master ? (= coordExists). PURE, TOTALE. */
export function coordExists(m: MasterDescriptor, c: ScreenCoord): boolean {
	const k = coordKey(c);
	return m.coords.some((mc) => coordKey(mc) === k);
}

// ─── LE CONTENT-ADDRESS BYTE-ÉGAL À GO ──────────────────────────────────────────────

/**
 * goJSONString — l'échappement de chaîne de Go json.Marshal (SetEscapeHTML(true) par
 * défaut) : `<`, `>`, `&` → <, >, &. Le MÊME que lib/web-projection — c'est
 * ce qui rend les bytes byte-identiques à Go records.Canonicalize.
 */
function goJSONString(s: string): string {
	return JSON.stringify(s)
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e")
		.replace(/&/g, "\\u0026");
}

/** JSON canonique : clés d'objet triées récursivement, undefined omis (= records.Canonicalize). */
function canon(v: unknown): string {
	if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
	if (v && typeof v === "object") {
		const obj = v as Record<string, unknown>;
		const keys = Object.keys(obj)
			.filter((k) => obj[k] !== undefined)
			.sort();
		return `{${keys
			.map((k) => `${goJSONString(k)}:${canon(obj[k])}`)
			.join(",")}}`;
	}
	if (typeof v === "string") return goJSONString(v);
	return JSON.stringify(v);
}

/**
 * coordObject — le corps JSON d'une coordonnée tel que Go le marshale (omitempty sur field
 * et control). PURE : reproduit EXACTEMENT la struct ScreenCoord sérialisée par Go.
 */
function coordObject(c: ScreenCoord): Record<string, unknown> {
	const o: Record<string, unknown> = { kind: c.kind, entity: c.entity };
	if (c.field !== undefined && c.field !== "") o.field = c.field;
	if (c.control !== undefined && c.control !== "") o.control = c.control;
	return o;
}

/**
 * overrideObject — le corps JSON d'un override tel que Go le marshale : `styles` omis quand
 * vide (omitempty), `label` omis quand vide. PURE.
 */
function overrideObject(o: ScreenOverride): Record<string, unknown> {
	const out: Record<string, unknown> = { coord: coordObject(o.coord) };
	if (o.styles !== undefined && o.styles.length > 0)
		out.styles = o.styles.map((s) => ({
			property: s.property,
			token: s.token,
		}));
	if (o.label !== undefined && o.label !== "") out.label = o.label;
	return out;
}

/**
 * screenDesignBody — le corps content-adressé (le MÊME map que screenDesignBody en Go) :
 * child_target, parent_id, overrides (triés), validated, by. PURE.
 */
function screenDesignBody(d: {
	childTarget: ChildTarget;
	parentId: string;
	overrides: readonly ScreenOverride[];
	validated: boolean;
	by: string;
}): Record<string, unknown> {
	return {
		child_target: d.childTarget,
		parent_id: d.parentId,
		overrides: sortedOverrides(d.overrides).map(overrideObject),
		validated: d.validated,
		by: d.by,
	};
}

// ─── sha256 PUR (navigateur-sûr, synchrone — byte-égal à Go records.Hash) ────────────

const K256 = [
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
	0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
	0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
	0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
	0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
	0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
	0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
	0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
	0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
	return (x >>> n) | (x << (32 - n));
}

/**
 * sha256Hex — SHA-256 PUR (UTF-8 → digest hex), byte-égal à Go records.Hash. Synchrone,
 * sans node:crypto ni WebCrypto async (utilisable dans le navigateur ET vitest). Un hash
 * est un ALGORITHME (déterminisme-first §6) — jamais une génération, jamais un LLM.
 */
export function sha256Hex(input: string): string {
	// UTF-8 encode (TextEncoder dispo partout : navigateur + Node 18+).
	const bytes = new TextEncoder().encode(input);
	const l = bytes.length;
	const bitLen = l * 8;
	// Padding : 0x80 puis des zéros jusqu'à ≡ 56 mod 64, puis la longueur sur 64 bits.
	const withOne = l + 1;
	const k = (56 - (withOne % 64) + 64) % 64;
	const total = withOne + k + 8;
	const buf = new Uint8Array(total);
	buf.set(bytes);
	buf[l] = 0x80;
	// La longueur en bits (big-endian, 64 bits) — bitLen tient sur 53 bits utiles ici.
	const hi = Math.floor(bitLen / 0x100000000);
	const lo = bitLen >>> 0;
	const dv = new DataView(buf.buffer);
	dv.setUint32(total - 8, hi);
	dv.setUint32(total - 4, lo);

	let h0 = 0x6a09e667;
	let h1 = 0xbb67ae85;
	let h2 = 0x3c6ef372;
	let h3 = 0xa54ff53a;
	let h4 = 0x510e527f;
	let h5 = 0x9b05688c;
	let h6 = 0x1f83d9ab;
	let h7 = 0x5be0cd19;

	const w = new Array<number>(64);
	for (let off = 0; off < total; off += 64) {
		for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
		for (let i = 16; i < 64; i++) {
			const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
			const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
			w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
		}
		let a = h0;
		let b = h1;
		let c = h2;
		let d = h3;
		let e = h4;
		let f = h5;
		let g = h6;
		let hh = h7;
		for (let i = 0; i < 64; i++) {
			const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
			const ch = (e & f) ^ (~e & g);
			const t1 = (hh + S1 + ch + K256[i] + w[i]) >>> 0;
			const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const t2 = (S0 + maj) >>> 0;
			hh = g;
			g = f;
			f = e;
			e = (d + t1) >>> 0;
			d = c;
			c = b;
			b = a;
			a = (t1 + t2) >>> 0;
		}
		h0 = (h0 + a) >>> 0;
		h1 = (h1 + b) >>> 0;
		h2 = (h2 + c) >>> 0;
		h3 = (h3 + d) >>> 0;
		h4 = (h4 + e) >>> 0;
		h5 = (h5 + f) >>> 0;
		h6 = (h6 + g) >>> 0;
		h7 = (h7 + hh) >>> 0;
	}
	const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
	return (
		hex(h0) +
		hex(h1) +
		hex(h2) +
		hex(h3) +
		hex(h4) +
		hex(h5) +
		hex(h6) +
		hex(h7)
	);
}

// ─── L'ÉMISSION (le verdict-pour-verdict de EmitScreenDesign) ────────────────────────

/** Un refus honnête (mirrors blockreason.BlockReason — la forme lue par la lentille). */
export interface DesignBlock {
	readonly code: string;
	readonly explanation: string;
	readonly howToFix: readonly string[];
}

export type EmitResult =
	| { readonly ok: true; readonly design: ScreenDesign }
	| { readonly ok: false; readonly block: DesignBlock };

/** Le refus pour un token hors-catalogue (= blockScreenDesignBadToken, FR). */
function blockBadToken(s: StyleToken): DesignBlock {
	return {
		code: "out_of_scope",
		explanation: `Override de style refusé : le token (${s.property}=${s.token}) est HORS du catalogue FERMÉ ADR 0010 (zinc + blue-600 : bg/text/border/radius/pad/gap/align × card/foreground/primary/border/muted/sm/md/lg…). Le Design Lab n'accepte JAMAIS un hex ni une utilitaire Tailwind arbitraire (fail-closed).`,
		howToFix: [
			"Choisissez une property du catalogue (bg|text|border|radius|pad|gap|align) et un token déclaré.",
			"Un hex (#aabbcc) ou une classe libre (text-[13px]) est refusé — le thème ADR 0010 est la seule source.",
			"Pour un nouveau token, étendez le catalogue above-the-line (idée → miroir → /goal).",
		],
	};
}

/** Le refus pour une coordonnée absente du master = geste structurel (= blockScreenDesignStructuralCoord, FR). */
function blockStructuralCoord(c: ScreenCoord): DesignBlock {
	const suffix = c.field ? ` · ${c.field}` : c.control ? ` · ${c.control}` : "";
	return {
		code: "out_of_scope",
		explanation: `Override d'écran refusé : la coordonnée (${c.kind} · ${c.entity}${suffix}) n'existe PAS dans la vue MAÎTRE. Adapter une coordonnée absente serait un geste STRUCTUREL (ajouter/retirer/réordonner un champ/section/action) — au-dessus de la ligne (le mur §2).`,
		howToFix: [
			"Ciblez une section/champ/action que la maître pin déjà.",
			"Pour AJOUTER/RETIRER/RÉORDONNER, ouvrez une idée → miroir → /goal (jamais un write direct).",
			"Depuis l'écran : send(« capture l'idée : <besoin structurel> ») — la porte structurelle.",
		],
	};
}

/** Le refus pour une cible enfant inconnue (= blockScreenDesignUnknownTarget, FR). */
function blockUnknownTarget(target: string): DesignBlock {
	return {
		code: "out_of_scope",
		explanation: `ScreenDesign refusé : la cible enfant ${target} est inconnue. L'ensemble est CLOS (web / mobile / desktop) — le Design Lab n'invente aucune plateforme (honnêteté, le mur §8).`,
		howToFix: ["Ciblez web, mobile ou desktop."],
	};
}

/** Le refus pour un master vide / sans coordonnée (= blockScreenDesignNoMaster, FR). */
function blockNoMaster(): DesignBlock {
	return {
		code: "out_of_scope",
		explanation: `Émission du ScreenDesign refusée : la vue MAÎTRE est vide ou sans coordonnée — il n'y a aucun parent à adresser (ParentID == master.Hash()). Un ScreenDesign étend la voie ViewAdaptation : il a TOUJOURS besoin d'une maître projetable.`,
		howToFix: [
			"Émettez la maître d'abord (au moins une section/champ/action).",
		],
	};
}

/**
 * composeScreenDesign — le TWIN de EmitScreenDesign. PURE & TOTALE : valide chaque token
 * contre le catalogue FERMÉ (hex/arbitraire → refus), valide chaque coordonnée contre le
 * master (absente → structurel → refus nommant /goal), trie canonique, content-adresse
 * (sha256 byte-égal Go). ParentID == master.hash TOUJOURS. Même (master, target, overrides)
 * → même id, byte-pour-byte que Go EmitScreenDesign.
 */
export function composeScreenDesign(
	master: MasterDescriptor,
	target: string,
	overrides: readonly ScreenOverride[],
): EmitResult {
	if (!isKnownChildTarget(target)) {
		return { ok: false, block: blockUnknownTarget(target) };
	}
	if (master.hash === "" || master.coords.length === 0) {
		return { ok: false, block: blockNoMaster() };
	}
	for (const o of overrides) {
		if (!coordExists(master, o.coord)) {
			return { ok: false, block: blockStructuralCoord(o.coord) };
		}
		for (const s of o.styles ?? []) {
			if (!isKnownStyleToken(s)) {
				return { ok: false, block: blockBadToken(s) };
			}
		}
	}
	const sorted = sortedOverrides(overrides);
	const body = screenDesignBody({
		childTarget: target,
		parentId: master.hash,
		overrides: sorted,
		validated: false,
		by: "human",
	});
	const id = sha256Hex(canon(body));
	return {
		ok: true,
		design: {
			id,
			childTarget: target,
			parentId: master.hash,
			overrides: sorted,
			validated: false,
			by: "human",
		},
	};
}

// ─── LA CLASSIFICATION DU GESTE (le verdict-pour-verdict de ClassifyGesture) ──────────

/** La nature d'un geste (mirrors GestureNature). Jeu CLOS. */
export type GestureNature = "styling" | "structural";

/**
 * L'entrée PURE que classifyGesture juge (mirrors GestureInput) : la coordonnée, l'empilement
 * de styles, le label, et les intentions STRUCTURELLES explicitement déclarées. Le classifieur
 * lit la STRUCTURE (les champs), jamais un libellé fourni par un LLM (§8 — le code juge).
 */
export interface GestureInput {
	readonly coord: ScreenCoord;
	readonly styles?: readonly StyleToken[];
	readonly label?: string;
	readonly addsField?: boolean;
	readonly removesField?: boolean;
	readonly reordersFields?: boolean;
	readonly changesTextData?: boolean;
	readonly changesComponentKind?: boolean;
}

/**
 * classifyGesture — le TWIN de ClassifyGesture. PURE, TOTALE, ne panique jamais. Un geste est
 * STRUCTURAL ssi il déclare UNE intention structurelle (ajout/retrait/réordre d'un champ,
 * changement de donnée i18n, changement de source-kind) — fail-closed vers STRUCTURAL (un
 * structurel ne peut JAMAIS être passé en contrebande sous la ligne comme du styling, la garde
 * §8/BA12). Sinon STYLING. Même geste ⇒ même nature.
 */
export function classifyGesture(g: GestureInput): GestureNature {
	if (
		g.addsField === true ||
		g.removesField === true ||
		g.reordersFields === true ||
		g.changesTextData === true ||
		g.changesComponentKind === true
	) {
		return "structural";
	}
	return "styling";
}

/**
 * La phrase canonique du geste de styling — « adapte <coord> : <property>=<token> » (×N).
 * Réutilisée VERBATIM par la lentille (send) puis re-jugée par understand/applyIntent (la
 * loi). Le LLM peut PROPOSER cette phrase ; le code la re-juge toujours. PURE & TOTALE.
 */
export function canonicalAdaptPhrase(
	coord: ScreenCoord,
	styles: readonly StyleToken[],
): string {
	const ref = coordRef(coord);
	const tokens = styles.map((s) => `${s.property}=${s.token}`).join(" ");
	return `adapte ${ref} : ${tokens}`.trim();
}

/** La référence lisible d'une coordonnée (pour la phrase canonique + l'affichage). PURE. */
export function coordRef(c: ScreenCoord): string {
	if (c.kind === "field") return `${c.entity}.${c.field ?? ""}`;
	if (c.kind === "action") return c.control ?? c.entity;
	return c.entity;
}

// ─── LE MUR STRUCTUREL (TRANCHE 2) : le routage idée→/goal, jamais un ScreenDesign ────

/**
 * Le jeu CLOS des gestes STRUCTURELS (ADR 0071 §3) — ajouter/retirer/réordonner un champ,
 * une section, une action. CHACUN est above-the-line : il ne peut JAMAIS devenir un
 * ScreenDesign (le mur §2) — il devient un BESOIN, capturé en idée (hasMirror=false), promu
 * par idée→miroir→/goal→approbation. Le verbe lexical de chacun est DÉCLARÉ, jamais inventé.
 */
export type StructuralKind =
	| "add-field"
	| "remove-field"
	| "reorder-field"
	| "add-section"
	| "remove-section"
	| "add-action"
	| "remove-action";

export const STRUCTURAL_KINDS: readonly StructuralKind[] = [
	"add-field",
	"remove-field",
	"reorder-field",
	"add-section",
	"remove-section",
	"add-action",
	"remove-action",
] as const;

/** L'entrée PURE d'un geste structurel : ce QU'ON veut, SUR quelle coordonnée. */
export interface StructuralGesture {
	readonly kind: StructuralKind;
	/** La coordonnée concernée (la section/champ/action visé, ou son parent pour un ajout). */
	readonly coord: ScreenCoord;
}

/**
 * Le verbe FRANÇAIS du besoin structurel, par kind (DÉCLARÉ, repris verbatim dans la phrase
 * d'idée). PURE & TOTALE — le besoin est libellé en français clair (le mur expliqué).
 */
function structuralVerb(kind: StructuralKind): string {
	switch (kind) {
		case "add-field":
			return "ajouter un champ à";
		case "remove-field":
			return "retirer le champ";
		case "reorder-field":
			return "réordonner les champs de";
		case "add-section":
			return "ajouter une section à";
		case "remove-section":
			return "retirer la section";
		case "add-action":
			return "ajouter une action à";
		case "remove-action":
			return "retirer l'action";
	}
}

/**
 * structuralNeed — le BESOIN structurel libellé en français clair (le « <besoin verbatim> »
 * de la phrase d'idée). PURE & TOTALE : même geste → même besoin. C'est le texte que la
 * lentille montre à l'utilisateur (« ceci change la structure → ça passe par une idée à valider »).
 */
export function structuralNeed(g: StructuralGesture): string {
	return `${structuralVerb(g.kind)} ${coordRef(g.coord)}`;
}

/**
 * routeStructuralGesture — LE ROUTAGE DU MUR STRUCTUREL (ADR 0071 §3). PURE & TOTALE &
 * DÉTERMINISTE : un geste STRUCTUREL devient la phrase canonique « capture l'idée : <besoin> »
 * — la PORTE idée→miroir→/goal, JAMAIS un ScreenDesign, JAMAIS une écriture directe. La
 * lentille send() cette phrase ; le réducteur la re-juge (intent `capturer_idee` → composeIdea,
 * hasMirror=false). Le LLM peut PROPOSER cette phrase ; le code la re-juge toujours (le mur §2).
 *
 * GARDE (§8/BA12) : un geste structurel ne peut PAS prendre la voie styling (canonicalAdaptPhrase)
 * — classifyGesture(toGestureInput(g)) renvoie TOUJOURS "structural" (le miroir l'épingle).
 */
export function routeStructuralGesture(g: StructuralGesture): string {
	return `capture l'idée : ${structuralNeed(g)}`;
}

// ─── LE DRAG-DROP (TRANCHE 3) : la frontière nudge-visuel vs réordre-structurel ──────────────────

/**
 * Un geste de GLISSER-DÉPOSER sur le canvas / les layers (ADR 0071 §3). La FRONTIÈRE EXACTE est
 * ClassifyGesture (déjà total) :
 *   - un NUDGE PUREMENT VISUEL (re-densité / re-alignement / déplacement cosmétique) ne change PAS
 *     la requirement → classifyGesture == "styling" → ScreenDesign (below-the-line) ;
 *   - un RÉORDRE de champs/sections qui change l'ORDRE des champs (la requirement) → classifyGesture
 *     == "structural" → idée→/goal (le mur).
 * Le jeu des modes est CLOS — il n'y a pas de troisième nature (déterminisme-first §6/§8).
 */
export type DragMode = "visual-nudge" | "reorder";

export const DRAG_MODES: readonly DragMode[] = [
	"visual-nudge",
	"reorder",
] as const;

/**
 * L'entrée PURE d'un drag : sa coordonnée, son mode, et — pour un nudge visuel — l'empilement de
 * tokens qu'il propose (densité/alignement). Le RÉORDRE ne porte AUCUN token (il change l'ordre, pas
 * l'apparence) — il prend toujours la voie structurelle. PURE.
 */
export interface DragGesture {
	readonly coord: ScreenCoord;
	readonly mode: DragMode;
	/** Pour un nudge visuel : les tokens (densité/alignement) — ignoré pour un réordre. */
	readonly styles?: readonly StyleToken[];
}

/**
 * dragToGestureInput — projette un DragGesture vers l'entrée de classifyGesture. PURE & TOTALE :
 * un "visual-nudge" ne déclare AUCUNE intention structurelle (→ styling) ; un "reorder" déclare
 * reordersFields (→ structural). La FRONTIÈRE est ClassifyGesture, jamais une heuristique de texte.
 */
export function dragToGestureInput(g: DragGesture): GestureInput {
	if (g.mode === "reorder") {
		return { coord: g.coord, reordersFields: true };
	}
	return { coord: g.coord, styles: g.styles ?? [] };
}

/**
 * classifyDrag — LA FRONTIÈRE du drag-drop (ADR 0071 §3). PURE, TOTALE, DÉTERMINISTE : délègue à
 * classifyGesture (la loi du mur déjà totale). Un nudge visuel → "styling" ; un réordre → "structural".
 * Même geste ⇒ même nature ; un réordre ne peut JAMAIS être passé en contrebande comme du styling.
 */
export function classifyDrag(g: DragGesture): GestureNature {
	return classifyGesture(dragToGestureInput(g));
}

/**
 * routeDrag — LE ROUTAGE d'un drag selon sa nature. PURE & TOTALE :
 *   - styling   → la phrase canonique « adapte <coord> : <property>=<token> » (la voie ScreenDesign) ;
 *   - structural→ « capture l'idée : réordonner les champs de <coord> » (la porte idée→/goal — le mur).
 * Le LLM peut PROPOSER ; le code re-juge toujours (le mur §2). Un drag sans token utile (un nudge
 * vide) ne propose RIEN (chaîne vide → la lentille n'émet aucune phrase).
 */
export function routeDrag(g: DragGesture): string {
	if (classifyDrag(g) === "structural") {
		return routeStructuralGesture({ kind: "reorder-field", coord: g.coord });
	}
	const styles = g.styles ?? [];
	if (styles.length === 0) return "";
	return canonicalAdaptPhrase(g.coord, styles);
}

/**
 * Projette un StructuralGesture vers l'entrée de classifyGesture — la garde explicite que la
 * voie structurelle est TOUJOURS classée "structural" (jamais "styling"). PURE & TOTALE.
 */
export function toGestureInput(g: StructuralGesture): GestureInput {
	return {
		coord: g.coord,
		addsField: g.kind === "add-field" || g.kind === "add-section",
		removesField:
			g.kind === "remove-field" ||
			g.kind === "remove-section" ||
			g.kind === "remove-action",
		reordersFields: g.kind === "reorder-field",
		changesComponentKind: g.kind === "add-action",
	};
}

// ─── TRANCHE 4 : LE RE-JUGEMENT DÉTERMINISTE DU CHAT IA GATÉ (l'autorité, §6/§8) ────────────
//
// LE CHAT DESIGN (ADR 0071 §4) : l'utilisateur écrit en langage NATUREL LIBRE ; le LLM PROPOSE
// une phrase canonique de la grammaire design FERMÉE (« adapte <coord> : <property>=<token> »)
// ou la phrase structurelle (« capture l'idée : <besoin> »). C'est une PROPOSITION, jamais une
// action. rejudgeDesignProposal() est l'AUTORITÉ DÉTERMINISTE : la proposition LLM est RE-PARSÉE
// et RE-JUGÉE par CE code (le catalogue FERMÉ + composeScreenDesign + classifyGesture) AVANT
// toute capture. IA ÉTEINTE, le rejeu reste VERT (le chemin déterministe suffit — la lentille
// passe la phrase BRUTE de l'utilisateur ici, et le verdict est le même).
//
// LE LLM NE CAPTURE JAMAIS DIRECTEMENT : il propose, le déterministe dispose. Une proposition
// VALIDE (tokens du catalogue, coordonnée du master) → un ScreenDesign DRAFT + la phrase
// canonique à send() (le chemin T1) ; une proposition INVALIDE (hex, token étranger, propriété
// inconnue) → REFUSÉE fail-closed (jamais capturée) ; une proposition STRUCTURELLE → routée vers
// la porte idée→/goal (le mur §2). Jamais une génération LLM autoritaire (sinon AGENT_DETERMINISM_GAP).

/**
 * resolveCoordRef — RÉSOUT une référence textuelle de coordonnée (« produit », « produit.prix »,
 * « checkout ») vers la coordonnée EXACTE que le master PIN. PURE & TOTALE & DÉTERMINISTE &
 * fail-closed : une référence sans coordonnée correspondante → null (jamais une coordonnée
 * inventée). C'est le verdict-pour-verdict de l'inverse de coordRef : un match exact sur
 * coordRef(mc) plié (accents retirés, minuscule), departage stable par l'ordre du master.
 */
export function resolveCoordRef(
	m: MasterDescriptor,
	ref: string,
): ScreenCoord | null {
	const want = foldRef(ref);
	if (want === "") return null;
	for (const mc of m.coords) {
		if (foldRef(coordRef(mc)) === want) return mc;
	}
	return null;
}

/** Plie une référence de coordonnée (accents retirés, minuscule, espaces compactés). PURE. */
function foldRef(s: string): string {
	return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * parseAdaptProposal — PARSE une phrase canonique « adapte <coord> : <property>=<token> [<p>=<t> …] »
 * (le MÊME parseur que parseAdapt du réducteur lib/v2/builder, ici exporté pour le re-jugement
 * autoritaire). PURE & TOTALE & fail-closed : sans « : » ou sans token reconnaissable → null
 * (jamais une adaptation en douce). La référence de coordonnée est reprise VERBATIM (re-validée
 * ensuite contre le master). Les tokens sont pliés (accents retirés, minuscule).
 */
export function parseAdaptProposal(
	text: string,
): { ref: string; tokens: StyleToken[] } | null {
	const colon = text.indexOf(":");
	if (colon < 0) return null;
	const left = text
		.slice(0, colon)
		.replace(/^.*?(?:adapte[rz]?|style[rz]?|design)\s*/i, "")
		.trim();
	const right = text.slice(colon + 1).trim();
	const tokens: StyleToken[] = [];
	for (const part of right.split(/[\s,;]+/)) {
		const m = part
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.match(/^([a-z]+)=([a-z0-9#[\]/-]+)$/);
		if (m === null) continue;
		tokens.push({ property: m[1], token: m[2] });
	}
	if (tokens.length === 0) return null;
	return { ref: left, tokens };
}

/** Une phrase est-elle une intention de CAPTURE D'IDÉE structurelle (« capture l'idée : … ») ? PURE. */
export function isCapturePhrase(text: string): boolean {
	const folded = foldRef(text);
	return /^\s*(?:capture[rz]?|note[rz]?|enregistre[rz]?)\b/.test(folded);
}

/**
 * Le VERDICT du re-jugement déterministe d'une proposition (le jeu CLOS, discriminé) :
 *   - "styling"    : valide → un ScreenDesign DRAFT (le gate T1 passé) + la phrase canonique à send() ;
 *   - "structural" : un besoin structurel → la phrase « capture l'idée : … » à send() (le mur §2) ;
 *   - "refused"    : hex / token étranger / coordonnée absente / phrase non reconnue → fail-closed,
 *                    JAMAIS capturée (un message clair, le BlockReason honnête).
 */
export type DesignVerdict =
	| {
			readonly nature: "styling";
			readonly coord: ScreenCoord;
			readonly styles: readonly StyleToken[];
			readonly design: ScreenDesign;
			readonly phrase: string;
	  }
	| {
			readonly nature: "structural";
			readonly need: string;
			readonly phrase: string;
	  }
	| { readonly nature: "refused"; readonly block: DesignBlock };

/** Le refus pour une proposition non reconnue (ni adaptation ni capture). FR, fail-closed. */
function blockUnparseable(): DesignBlock {
	return {
		code: "out_of_scope",
		explanation:
			"Proposition refusée : la phrase n'est ni une adaptation de style (« adapte <coordonnée> : <propriété>=<jeton> ») ni une capture d'idée structurelle (« capture l'idée : … »). Le Design Lab ne capture QUE ce qu'il sait re-juger (fail-closed, le mur §8).",
		howToFix: [
			"Décrivez un changement de style sur un élément existant (couleur, taille, espacement, radius…).",
			"Pour ajouter/retirer/réordonner un champ, formulez le besoin : il passera par une idée à valider.",
		],
	};
}

/**
 * rejudgeDesignProposal — L'AUTORITÉ DÉTERMINISTE du chat IA gaté (ADR 0071 §4, le cœur de T4).
 * PURE & TOTALE & DÉTERMINISTE & fail-closed. Prend une phrase (la PROPOSITION du LLM, OU le texte
 * brut de l'utilisateur quand l'IA est éteinte) + le master, et la RE-JUGE entièrement par CE code :
 *
 *   1. STRUCTUREL — « capture l'idée : <besoin> » → classifyGesture le confirme structural →
 *      verdict "structural" : la phrase « capture l'idée : … » à send() (la porte idée→/goal, le mur §2).
 *      Le LLM ne décide PAS que c'est structurel ; le code le tranche (changesComponentKind).
 *   2. STYLING — « adapte <coord> : <property>=<token> » → résout la coordonnée contre le master,
 *      valide chaque token contre le catalogue FERMÉ via composeScreenDesign (l'autorité unique de
 *      l'ID content-adressé) :
 *        · coordonnée absente du master → REFUSÉE (geste structurel déguisé — composeScreenDesign
 *          renvoie blockStructuralCoord nommant /goal) ;
 *        · token hors-catalogue (hex, utilitaire arbitraire) → REFUSÉE (blockBadToken) ;
 *        · sinon → verdict "styling" : le ScreenDesign DRAFT + la phrase canonique à send().
 *   3. AUTRE (ni adaptation ni capture) → REFUSÉE (blockUnparseable).
 *
 * LE MUR (§2) : un verdict "styling" ne produit qu'un requirement SOFT below-the-line (capturé via
 * send→applyIntent) ; un verdict "structural" ne produit qu'une idée (hasMirror=false) ; un verdict
 * "refused" ne produit RIEN. JAMAIS une écriture-vérité, JAMAIS une capture directe par le LLM.
 */
export function rejudgeDesignProposal(
	m: MasterDescriptor,
	target: string,
	proposal: string,
): DesignVerdict {
	const text = proposal.trim();
	// (1) Une capture d'idée structurelle — le LLM a proposé la porte du mur, ou l'a paraphrasée.
	if (isCapturePhrase(text)) {
		const need = text
			.replace(
				/^\s*(?:capture[rz]?|note[rz]?|enregistre[rz]?)\s*(?:l['’]\s*idee|l['’]\s*idée)?\s*:?\s*/i,
				"",
			)
			.trim();
		return {
			nature: "structural",
			need: need === "" ? text : need,
			// La phrase canonique normalisée à send() — RE-JUGÉE par le réducteur (capturer_idee).
			phrase: `capture l'idée : ${need === "" ? text : need}`,
		};
	}
	// (2) Une adaptation de style — re-parsée puis re-jugée contre le master + le catalogue FERMÉ.
	const a = parseAdaptProposal(text);
	if (a === null) {
		return { nature: "refused", block: blockUnparseable() };
	}
	const coord = resolveCoordRef(m, a.ref);
	if (coord === null) {
		// La coordonnée n'existe PAS dans le master → c'est un geste STRUCTUREL déguisé (le mur §2).
		return {
			nature: "refused",
			block: blockStructuralCoord({ kind: "section", entity: a.ref }),
		};
	}
	// composeScreenDesign est l'AUTORITÉ : il re-valide chaque token contre le catalogue FERMÉ et
	// content-adresse le ScreenDesign (le MÊME records.Hash que Go). Un token hors-catalogue → refus.
	const r = composeScreenDesign(m, target, [{ coord, styles: a.tokens }]);
	if (!r.ok) {
		return { nature: "refused", block: r.block };
	}
	// La GARDE §8/BA12 explicite : un styling ne peut JAMAIS être un structurel déguisé.
	const nature = classifyGesture({ coord, styles: a.tokens });
	if (nature === "structural") {
		// Défense en profondeur : si jamais classifyGesture trouvait une intention structurelle,
		// on REFUSE le chemin styling (jamais une capture below-the-line d'un structurel).
		return {
			nature: "structural",
			need: structuralNeed({ kind: "reorder-field", coord }),
			phrase: routeStructuralGesture({ kind: "reorder-field", coord }),
		};
	}
	return {
		nature: "styling",
		coord,
		styles: a.tokens,
		design: r.design,
		phrase: canonicalAdaptPhrase(coord, a.tokens),
	};
}

/**
 * sessionScreenOverrides — les ScreenOverride CAPTURÉS dans la session : re-parse les phrases
 * canoniques « adapte <coord> : <property>=<token> » du transcript (parseAdaptProposal) → la
 * coordonnée (resolveCoordRef, ou le SENTINEL racine app/root → le conteneur <main data-aidos-root>)
 * + les tokens du catalogue FERMÉ. Le DERNIER override par coordonnée gagne (append-only, la tête).
 * PURE & TOTALE & fail-closed (une coord inconnue / un token hors-catalogue est IGNORÉ, jamais inventé).
 * Passé au déploiement via --screen-design pour que les adaptations validées soient REPRODUITES sur
 * l'app déployée — la PERMANENCE (le rouge survit au reload), ADR 0071.
 */
export function sessionScreenOverrides(
	master: MasterDescriptor,
	messages: readonly string[],
): ScreenOverride[] {
	const byCoord = new Map<string, ScreenOverride>();
	for (const text of messages) {
		const a = parseAdaptProposal(text);
		if (a === null) continue;
		const folded = a.ref
			.normalize("NFD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.trim();
		// Le sentinel RACINE (« app »/« root ») → le conteneur racine (normalizeRootCoord côté Go) ;
		// sinon une coordonnée EXISTANTE de la maître (jamais une coord inventée → ignorée).
		const coord: ScreenCoord | null =
			folded === "app" || folded === "root"
				? { kind: "section", entity: "app" }
				: resolveCoordRef(master, a.ref);
		if (coord === null) continue;
		const styles = a.tokens.filter(isKnownStyleToken);
		if (styles.length === 0) continue;
		const key = `${coord.kind}:${coord.entity}:${coord.field ?? ""}:${coord.control ?? ""}`;
		byCoord.set(key, { coord, styles });
	}
	return [...byCoord.values()];
}
