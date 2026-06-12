import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	defaultInstanceConfig,
	INSTANCE_TOOLS,
	parseInstanceConfig,
	serializeInstanceConfig,
} from "./instance";

/**
 * V3 — le MIROIR de la CONFIG D'INSTANCE (ADR 0062) : « paramétrer toutes les
 * infos de l'instance (BDD, monitoring…) car on pourrait paramétrer dans le
 * cloud ». Le jeu d'outils est DÉCLARÉ et clos ; la config est un aller-retour
 * sans perte, fail-closed — jamais une invention.
 */

describe("INSTANCE_TOOLS — le jeu déclaré des outils d'instance", () => {
	it("clos, non vide, clés uniques, chacun avec libellé", () => {
		expect(INSTANCE_TOOLS.length).toBeGreaterThanOrEqual(6);
		const keys = INSTANCE_TOOLS.map((t) => t.key);
		expect(new Set(keys).size).toBe(keys.length);
		for (const t of INSTANCE_TOOLS)
			expect(t.labelKey.length).toBeGreaterThan(0);
	});
});

describe("la config — aller-retour sans perte, fail-closed", () => {
	const cfgArb = fc.dictionary(
		fc.constantFrom(...INSTANCE_TOOLS.map((t) => t.key)),
		fc.webUrl(),
		{ maxKeys: INSTANCE_TOOLS.length },
	);

	it("∀ config : parse(serialize(c)) ≡ c (complétée des défauts)", () => {
		fc.assert(
			fc.property(cfgArb, (c) => {
				const full = { ...defaultInstanceConfig(), ...c };
				expect(parseInstanceConfig(serializeInstanceConfig(full))).toEqual(
					full,
				);
			}),
		);
	});

	it("du bruit → les DÉFAUTS (fail-closed, jamais une invention)", () => {
		expect(parseInstanceConfig("@@@")).toEqual(defaultInstanceConfig());
		expect(parseInstanceConfig('{"db":42}')).toEqual(defaultInstanceConfig());
	});
});
