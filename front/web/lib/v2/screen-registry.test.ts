import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GLOSSARY } from "./glossary";
import {
	ALL_SCREENS,
	canonicalOpenPhrase,
	type RegistryScreen,
	registryHash,
	registryIsTotal,
} from "./screen-registry";
import { SCREENS } from "./screens";

/**
 * LE MIROIR du REGISTRE D'ÉCRANS COMPLET (lib/v2/screen-registry) — l'autorité source de
 * « toutes les capacités de la nav » (ADR 0057, loi de couverture §1/§5). Ce registre PILOTE
 * l'inventaire du chat ET le miroir de complétude (builder.test.ts). Ici, la REPRODUCTIBILITÉ
 * et la TOTALITÉ du registre lui-même (déterminisme-first §6/§8 : même registre → même sortie).
 *
 * LE MUR (§2) : ce module DÉCRIT les écrans, il n'écrit aucune vérité.
 */

describe("LE REGISTRE D'ÉCRANS COMPLET — totalité, déterminisme, exhaustivité", () => {
	it("est TOTAL : route non vide, route UNIQUE, label non vide (aucun monstre structurel)", () => {
		expect(registryIsTotal()).toBe(true);
		const routes = ALL_SCREENS.map((s) => s.route);
		expect(new Set(routes).size).toBe(routes.length);
		for (const s of ALL_SCREENS) {
			expect(s.route.startsWith("/")).toBe(true);
			expect(s.label.trim().length).toBeGreaterThan(0);
		}
	});

	it("registryIsTotal REJETTE un registre à route dupliquée, vide, ou à label vide (PURE & TOTALE)", () => {
		expect(registryIsTotal([])).toBe(false);
		expect(
			registryIsTotal([
				{ route: "/a", label: "a" },
				{ route: "/a", label: "b" },
			]),
		).toBe(false);
		expect(registryIsTotal([{ route: "", label: "x" }])).toBe(false);
		expect(registryIsTotal([{ route: "/a", label: "  " }])).toBe(false);
		expect(registryIsTotal([{ route: "/a", label: "a" }])).toBe(true);
	});

	it("est trié par route (déterministe, stable)", () => {
		const routes = ALL_SCREENS.map((s) => s.route);
		expect(routes).toEqual([...routes].sort());
	});

	it("registryHash est DÉTERMINISTE (même registre → même empreinte) et sensible au contenu", () => {
		expect(registryHash()).toBe(registryHash());
		const mutated: RegistryScreen[] = [
			...ALL_SCREENS,
			{ route: "/zzz-extra", label: "extra" },
		];
		expect(registryHash(mutated)).not.toBe(registryHash());
	});

	it("RÉUTILISE le registre V2 (SCREENS) + les concepts du glossaire (GLOSSARY) — aucun écran V2 perdu, aucune duplication", () => {
		const routes = new Set(ALL_SCREENS.map((s) => s.route));
		for (const e of SCREENS)
			expect(routes.has(`/v2/${e.slug}`), `V2 /${e.slug} absent`).toBe(true);
		// les concepts du glossaire NON déjà dédiés sont aussi servis par /v2/[slug].
		const dedicated = new Set(SCREENS.map((s) => s.slug));
		for (const g of GLOSSARY)
			if (!dedicated.has(g.slug))
				expect(routes.has(`/v2/${g.slug}`), `concept /${g.slug} absent`).toBe(
					true,
				);
	});

	it("couvre les trois plans de la nav : racine (V1), /v2/*, /v3/* (la couverture TOTALE)", () => {
		const hasRoot = ALL_SCREENS.some(
			(s) => !s.route.startsWith("/v2/") && !s.route.startsWith("/v3/"),
		);
		const hasV2 = ALL_SCREENS.some((s) => s.route.startsWith("/v2/"));
		const hasV3 = ALL_SCREENS.some((s) => s.route.startsWith("/v3/"));
		expect(hasRoot && hasV2 && hasV3).toBe(true);
		// les sous-routes /v3/* — l'angle mort du scan plat — sont bien déclarées.
		for (const r of ["/v3/code", "/v3/bench", "/v3/evolve", "/v3/design"])
			expect(
				ALL_SCREENS.some((s) => s.route === r),
				`${r} absent`,
			).toBe(true);
	});

	it("canonicalOpenPhrase est PURE & TOTALE & DÉTERMINISTE : « ouvre <segments de route> », préfixe inclus", () => {
		fc.assert(
			fc.property(fc.constantFrom(...ALL_SCREENS), (sc) => {
				const a = canonicalOpenPhrase(sc);
				expect(a).toBe(canonicalOpenPhrase(sc));
				expect(a.startsWith("ouvre ")).toBe(true);
			}),
		);
		expect(canonicalOpenPhrase({ route: "/v3/code", label: "x" })).toBe(
			"ouvre v3 code",
		);
		expect(canonicalOpenPhrase({ route: "/why-tree", label: "x" })).toBe(
			"ouvre why tree",
		);
	});
});
