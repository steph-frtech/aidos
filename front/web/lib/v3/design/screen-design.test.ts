/**
 * Design Lab — le MIROIR du twin TS (ADR 0071) : verdict-pour-verdict avec
 * back/runtime/honoemit/screendesign.go. fast-check + valeurs DORÉES (capturées d'un
 * `go test` probe) :
 *   (a) composeScreenDesign produit l'EXACT records.Hash de Go (golden + idempotence + ordre
 *       d'entrée indifférent) ;
 *   (b) classifyGesture verdict-pour-verdict (structural-wins, total, ne panique jamais) ;
 *   (c) le catalogue est FERMÉ (hex/Tailwind arbitraire → refus fail-closed) ;
 *   (d) une coordonnée absente du master → refus nommant /goal (le wall-refusal honnête) ;
 *   (e) la normalisation du drift est totale et le sha256 pur == le sha256 de référence.
 *   (f) le parseur du bridge ne crash JAMAIS (tolérance Onlook withTryCatch).
 *   (g) l'embed front == le const Go byte-pour-byte (le twin aidos-bridge).
 *
 *   reflects: front.v3.design.screen-design (le twin EmitScreenDesign/ClassifyGesture)
 *   · test_kind: property + example · cert_language: fast-check/vitest · authority: below
 *   · liveness: live
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseFromIframe } from "./bridge-protocol";
import {
	classifyDrag,
	classifyGesture,
	classOf,
	composeScreenDesign,
	DRAG_MODES,
	type DragGesture,
	type GestureInput,
	isKnownStyleToken,
	type MasterDescriptor,
	routeDrag,
	type ScreenCoord,
	type ScreenOverride,
	STYLE_TOKEN_ALIAS,
	STYLE_TOKENS,
	sha256Hex,
} from "./screen-design";

// ─── LE MASTER DE RÉFÉRENCE (le MÊME que le probe Go : project "shop", entité produit) ──
// MASTER_HASH capturé via `go test -run TestProbeScreenDesignID` (EmitMasterView puis Hash).
const MASTER_HASH =
	"5b1f77302fd2c741b8e4be396ab913f96e5a86de7738577156244f4f05a37251";

const MASTER: MasterDescriptor = {
	hash: MASTER_HASH,
	coords: [
		{ kind: "section", entity: "produit" },
		{ kind: "field", entity: "produit", field: "nom" },
		{ kind: "field", entity: "produit", field: "prix" },
	],
};

describe("(a) composeScreenDesign — l'EXACT records.Hash de Go (content-address byte-égal)", () => {
	it("la valeur DORÉE : (section produit + bg=card,radius=lg,label · field prix text=primary) → l'ID Go", () => {
		const overrides: ScreenOverride[] = [
			{
				coord: { kind: "section", entity: "produit" },
				styles: [
					{ property: "bg", token: "card" },
					{ property: "radius", token: "lg" },
				],
				label: "Catalogue",
			},
			{
				coord: { kind: "field", entity: "produit", field: "prix" },
				styles: [{ property: "text", token: "primary" }],
			},
		];
		const r = composeScreenDesign(MASTER, "web", overrides);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.design.parentId).toBe(MASTER_HASH);
		// DESIGN_ID capturé du probe Go pour exactement ces (target, parent, overrides).
		expect(r.design.id).toBe(
			"3257dba79b89bb3b28e5c18671cc2a6ade9fc8a40cb52bb65a1e8e12b8bb3a02",
		);
	});

	it("la valeur DORÉE 2 : (mobile · section produit label-only « Boutique ») → l'ID Go", () => {
		const r = composeScreenDesign(MASTER, "mobile", [
			{ coord: { kind: "section", entity: "produit" }, label: "Boutique" },
		]);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.design.id).toBe(
			"0d3c9d578635808bbec520ce0050ba4e0f3bd454c80ab9fd5b2f0f6c9873ca46",
		);
	});

	it("la valeur DORÉE 3 : (desktop · aucun override) → l'ID Go", () => {
		const r = composeScreenDesign(MASTER, "desktop", []);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.design.id).toBe(
			"7d0e07361c20647eb506ff13ff301eb8adb52a20b0507dc0f741cd04ef455682",
		);
	});

	it("idempotence + ordre d'entrée indifférent : même requirement (mélangé) → même ID", () => {
		const a: ScreenOverride = {
			coord: { kind: "field", entity: "produit", field: "prix" },
			styles: [{ property: "text", token: "primary" }],
		};
		const b: ScreenOverride = {
			coord: { kind: "section", entity: "produit" },
			styles: [
				{ property: "radius", token: "lg" },
				{ property: "bg", token: "card" }, // styles dans le désordre
			],
			label: "Catalogue",
		};
		const r1 = composeScreenDesign(MASTER, "web", [a, b]);
		const r2 = composeScreenDesign(MASTER, "web", [b, a]); // overrides dans le désordre
		expect(r1.ok && r2.ok).toBe(true);
		if (r1.ok && r2.ok) expect(r1.design.id).toBe(r2.design.id);
	});
});

describe("(b) classifyGesture — verdict-pour-verdict (structural-wins, total, jamais panic)", () => {
	it("un geste de styling PUR (tokens + label) → styling", () => {
		expect(
			classifyGesture({
				coord: { kind: "section", entity: "produit" },
				styles: [{ property: "bg", token: "card" }],
				label: "Boutique",
			}),
		).toBe("styling");
	});

	it("∀ combinaison d'intentions structurelles : UNE seule vraie → structural (fail-closed)", () => {
		fc.assert(
			fc.property(
				fc.boolean(),
				fc.boolean(),
				fc.boolean(),
				fc.boolean(),
				fc.boolean(),
				(adds, removes, reorders, text, comp) => {
					const g: GestureInput = {
						coord: { kind: "section", entity: "produit" },
						styles: [{ property: "bg", token: "card" }],
						addsField: adds,
						removesField: removes,
						reordersFields: reorders,
						changesTextData: text,
						changesComponentKind: comp,
					};
					const nature = classifyGesture(g);
					const anyStructural = adds || removes || reorders || text || comp;
					expect(nature).toBe(anyStructural ? "structural" : "styling");
				},
			),
		);
	});

	it("total : ∀ entrée (même incohérente) → un verdict du jeu clos, jamais une exception", () => {
		fc.assert(
			fc.property(
				fc.record({
					kind: fc.constantFrom("section", "field", "action"),
					entity: fc.string(),
				}),
				(coord) => {
					const nature = classifyGesture({ coord: coord as ScreenCoord });
					expect(["styling", "structural"]).toContain(nature);
				},
			),
		);
	});
});

describe("(c) le catalogue FERMÉ — fail-closed (hex / Tailwind arbitraire → refus)", () => {
	it("un hex est REFUSÉ (jamais coercé)", () => {
		const r = composeScreenDesign(MASTER, "web", [
			{
				coord: { kind: "section", entity: "produit" },
				styles: [{ property: "bg", token: "#aabbcc" }],
			},
		]);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.block.explanation).toContain("catalogue");
			expect(r.block.howToFix.length).toBeGreaterThan(0);
		}
	});

	it("une utilitaire Tailwind arbitraire est REFUSÉE", () => {
		const r = composeScreenDesign(MASTER, "web", [
			{
				coord: { kind: "field", entity: "produit", field: "prix" },
				styles: [{ property: "text", token: "[13px]" }],
			},
		]);
		expect(r.ok).toBe(false);
	});

	it("∀ (property, token) HORS catalogue → isKnownStyleToken false (fail-closed)", () => {
		fc.assert(
			fc.property(fc.string(), fc.string(), (property, token) => {
				const set = Object.hasOwn(STYLE_TOKENS, property)
					? STYLE_TOKENS[property]
					: undefined;
				const known = Array.isArray(set) && set.includes(token);
				expect(isKnownStyleToken({ property, token })).toBe(known);
			}),
		);
	});

	it("∀ token DU catalogue → accepté (la frontière exacte)", () => {
		for (const [property, tokens] of Object.entries(STYLE_TOKENS)) {
			for (const token of tokens) {
				expect(isKnownStyleToken({ property, token })).toBe(true);
			}
		}
	});
});

describe("(d) une coordonnée absente du master → refus nommant /goal (le wall-refusal honnête)", () => {
	it("adapter une entité inexistante = geste structurel → refus", () => {
		const r = composeScreenDesign(MASTER, "web", [
			{
				coord: { kind: "section", entity: "client" }, // absente du master
				styles: [{ property: "bg", token: "card" }],
			},
		]);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.block.explanation).toContain("STRUCTUREL");
			expect(r.block.howToFix.join(" ")).toContain("/goal");
		}
	});

	it("un master vide refuse honnêtement", () => {
		const r = composeScreenDesign({ hash: "", coords: [] }, "web", []);
		expect(r.ok).toBe(false);
	});

	it("une cible enfant inconnue refuse honnêtement (jeu clos web/mobile/desktop)", () => {
		const r = composeScreenDesign(MASTER, "watch", []);
		expect(r.ok).toBe(false);
	});
});

describe("(e) le sha256 PUR == sha256 de référence (l'algorithme, jamais un LLM)", () => {
	it("les vecteurs FIPS-180 connus", () => {
		expect(sha256Hex("")).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
		expect(sha256Hex("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
		// Un message > 55 octets (force un second bloc de compression).
		expect(
			sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
		).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
	});

	it("∀ chaîne : le sha pur est déterministe (même entrée → même digest, 64 hex)", () => {
		fc.assert(
			fc.property(fc.string(), (s) => {
				const a = sha256Hex(s);
				const b = sha256Hex(s);
				expect(a).toBe(b);
				expect(a).toMatch(/^[0-9a-f]{64}$/);
			}),
		);
	});
});

describe("(f) le parseur du bridge ne crash JAMAIS (tolérance Onlook withTryCatch)", () => {
	it("∀ donnée arbitraire (null, primitif, objet, type inconnu) → message typé OU null", () => {
		fc.assert(
			fc.property(fc.anything(), (data) => {
				const msg = parseFromIframe(data);
				expect(
					msg === null ||
						["ready", "selected", "mutated", "edit-proposed"].includes(
							msg.type,
						),
				).toBe(true);
			}),
		);
	});

	it("le handshake `aidos-bridge:ready` est normalisé en `ready`", () => {
		const msg = parseFromIframe({
			type: "aidos-bridge:ready",
			master_hash: MASTER_HASH,
			target: "web",
			coords: [{ kind: "section", entity: "produit" }],
		});
		expect(msg?.type).toBe("ready");
		if (msg?.type === "ready") {
			expect(msg.masterHash).toBe(MASTER_HASH);
			expect(msg.target).toBe("web");
			expect(msg.coords).toHaveLength(1);
		}
	});

	it("un `edit-proposed` malformé (coord absente) → null (fail-closed)", () => {
		expect(parseFromIframe({ type: "edit-proposed", styles: [] })).toBeNull();
	});
});

describe("(g) l'embed front == le const Go byte-pour-byte (le twin aidos-bridge)", () => {
	it("aidos-bridge.embed.ts front est byte-identique à l'embed Go", () => {
		const front = readFileSync(
			join(process.cwd(), "lib/v3/design/aidos-bridge.embed.ts"),
			"utf8",
		);
		const back = readFileSync(
			join(
				process.cwd(),
				"..",
				"..",
				"back",
				"runtime",
				"honoemit",
				"aidos-bridge.embed.ts",
			),
			"utf8",
		);
		expect(front).toBe(back);
	});
});

// ─── TRANCHE 3 : LE CATALOGUE ÉTENDU (typo / élévation / densité / largeur / colonnes) ──────────

describe("(h) le catalogue ÉTENDU T3 — verdict-pour-verdict avec Go (mêmes tokens, mêmes classes)", () => {
	// Chaque NOUVELLE property × token + sa classe ADR-0010 ATTENDUE (la valeur DORÉE du `go test`
	// TestProp_ExtendedCatalogue_ClosedAndRenders — le rendu byte-égal Go classOf == className).
	const golden: ReadonlyArray<[string, string, string]> = [
		["size", "xs", "text-xs"],
		["size", "sm", "text-sm"],
		["size", "base", "text-base"],
		["size", "lg", "text-lg"],
		["size", "xl", "text-xl"],
		["weight", "normal", "font-normal"],
		["weight", "medium", "font-medium"],
		["weight", "semibold", "font-semibold"],
		["weight", "bold", "font-bold"],
		["shadow", "none", "shadow-none"],
		["shadow", "sm", "shadow-sm"],
		["shadow", "md", "shadow-md"],
		["shadow", "lg", "shadow-lg"],
		["density", "compact", "aidos-density-compact"],
		["density", "cosy", "aidos-density-cosy"],
		["density", "spacieux", "aidos-density-spacieux"],
		["width", "full", "w-full"],
		["width", "auto", "w-auto"],
		["width", "fit", "w-fit"],
		["width", "half", "w-1/2"], // l'alias : "half" → w-1/2 (le token évite le « / »)
		["cols", "1", "grid-cols-1"],
		["cols", "2", "grid-cols-2"],
		["cols", "3", "grid-cols-3"],
		["cols", "4", "grid-cols-4"],
	];

	it("∀ token T3 du catalogue → accepté ∧ classOf == la classe Go (déterministe)", () => {
		for (const [property, token, cls] of golden) {
			expect(isKnownStyleToken({ property, token })).toBe(true);
			expect(classOf({ property, token })).toBe(cls);
		}
	});

	it("l'alias width=half → w-1/2 est la seule traduction (sinon prefix+token verbatim)", () => {
		expect(STYLE_TOKEN_ALIAS["width=half"]).toBe("1/2");
		// un token sans alias rend prefix+token littéral
		expect(classOf({ property: "width", token: "full" })).toBe("w-full");
	});

	it("fail-closed sur les axes T3 : hex / arbitraire / token étranger → refusé", () => {
		for (const bad of [
			{ property: "size", token: "13px" },
			{ property: "weight", token: "900" },
			{ property: "shadow", token: "2xl" },
			{ property: "density", token: "ultra" },
			{ property: "width", token: "1/3" },
			{ property: "cols", token: "12" },
			{ property: "size", token: "#aabbcc" },
			{ property: "weight", token: "primary" },
		]) {
			expect(isKnownStyleToken(bad)).toBe(false);
		}
	});

	it("la VALEUR DORÉE A : (web · section produit {size=lg, weight=semibold, shadow=md, density=cosy}) → l'ID Go", () => {
		const r = composeScreenDesign(MASTER, "web", [
			{
				coord: { kind: "section", entity: "produit" },
				styles: [
					{ property: "size", token: "lg" },
					{ property: "weight", token: "semibold" },
					{ property: "shadow", token: "md" },
					{ property: "density", token: "cosy" },
				],
			},
		]);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		// DESIGN_A_ID capturé du probe Go pour exactement ces (target, parent, overrides) T3.
		expect(r.design.id).toBe(
			"bafe17e8fd67dc0dd0e97c265499888747d0c70c07a12329862f25acef0c3a8b",
		);
	});

	it("la VALEUR DORÉE B : (mobile · field prix {width=half, cols=2}) → l'ID Go", () => {
		const r = composeScreenDesign(MASTER, "mobile", [
			{
				coord: { kind: "field", entity: "produit", field: "prix" },
				styles: [
					{ property: "width", token: "half" },
					{ property: "cols", token: "2" },
				],
			},
		]);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(r.design.id).toBe(
			"5f50bb7da2074e85af70783361308eb75e3582554a3f66ee5560cf5ce40bd3a3",
		);
	});
});

describe("(i) LE DRAG-DROP T3 — la frontière nudge-visuel (styling) vs réordre (structural)", () => {
	const COORD: ScreenCoord = { kind: "section", entity: "produit" };

	it("un nudge VISUEL (densité/alignement) → styling (below-the-line, ScreenDesign)", () => {
		const g: DragGesture = {
			coord: COORD,
			mode: "visual-nudge",
			styles: [{ property: "density", token: "compact" }],
		};
		expect(classifyDrag(g)).toBe("styling");
		// le routage prend la voie « adapte … » (jamais l'idée)
		expect(routeDrag(g).startsWith("adapte")).toBe(true);
	});

	it("un RÉORDRE de champs → structural (idée→/goal, le mur §2)", () => {
		const g: DragGesture = {
			coord: { kind: "field", entity: "produit", field: "prix" },
			mode: "reorder",
		};
		expect(classifyDrag(g)).toBe("structural");
		// le routage prend la PORTE de l'idée (jamais « adapte … » — pas de smuggling)
		expect(routeDrag(g).startsWith("capture l'idée :")).toBe(true);
		expect(routeDrag(g)).toContain("réordonner les champs de");
	});

	it("∀ drag (mode × coord × tokens) : la nature est du jeu clos ∧ un réordre n'est JAMAIS styling", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...DRAG_MODES),
				fc.constantFrom("section", "field", "action"),
				fc.string(),
				(mode, ckind, entity) => {
					const g: DragGesture = {
						mode,
						coord: { kind: ckind, entity } as ScreenCoord,
						styles: [{ property: "density", token: "cosy" }],
					};
					const nature = classifyDrag(g);
					expect(["styling", "structural"]).toContain(nature);
					// un réordre est TOUJOURS structural (la frontière exacte = ClassifyGesture)
					if (mode === "reorder") expect(nature).toBe("structural");
					else expect(nature).toBe("styling");
				},
			),
		);
	});

	it("un nudge visuel VIDE (aucun token) ne propose RIEN (chaîne vide — la lentille n'émet rien)", () => {
		expect(routeDrag({ coord: COORD, mode: "visual-nudge", styles: [] })).toBe(
			"",
		);
	});
});
