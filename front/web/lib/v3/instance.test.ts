import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	defaultInstanceConfig,
	envStackOf,
	hostProbeable,
	INSTANCE_TOOLS,
	ladderOf,
	parseInstanceConfig,
	STACK_SERVICES,
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

describe("l'ÉCHELLE PARAMÉTRABLE + la STACK PAR ENVIRONNEMENT (DP14)", () => {
	it("ladderOf : la config porte l'échelle ; défaut dev→staging→prod ; fail-closed", () => {
		expect(ladderOf(defaultInstanceConfig())).toEqual([
			"dev",
			"staging",
			"prod",
		]);
		expect(
			ladderOf({ ...defaultInstanceConfig(), ladder: "dev, preprod ,prod" }),
		).toEqual(["dev", "preprod", "prod"]);
		// du bruit → le défaut (jamais une échelle vide ou inventée)
		expect(ladderOf({ ...defaultInstanceConfig(), ladder: " , ," })).toEqual([
			"dev",
			"staging",
			"prod",
		]);
	});

	it("STACK_SERVICES est déclaré et couvre le substrat DP14 (docs Fumadocs, télémétrie OTel…)", () => {
		const keys = STACK_SERVICES.map((s) => s.key);
		for (const k of ["app", "db", "telemetry", "docs", "auth"])
			expect(keys).toContain(k);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("ADR 0080 — honnêteté : probe ⟺ endpoint hôte (https) ; jamais affirmer live un service interne", () => {
		// La règle est PURE : sondable ⟺ l'URL est un endpoint joignable par l'hôte (https Traefik).
		for (const s of STACK_SERVICES) {
			expect(hostProbeable(s)).toBe(s.urlPattern.startsWith("https://"));
		}
		// app/docs/auth sont sondables ; les services internes au réseau docker NE le sont PAS.
		const probeable = STACK_SERVICES.filter(hostProbeable).map((s) => s.key);
		expect(probeable).toContain("app");
		expect(probeable).not.toContain("bus"); // nats:// interne
		expect(probeable).not.toContain("cache"); // redis:// interne
		expect(probeable).not.toContain("telemetry"); // collector interne
		// envStackOf porte le drapeau ; un service interne reste DÉCLARÉ, jamais « live » affirmé.
		const dev = envStackOf("dev", defaultInstanceConfig());
		expect(dev.find((e) => e.key === "app")?.probe).toBe(true);
		expect(dev.find((e) => e.key === "bus")?.probe).toBe(false);
	});

	it("envStackOf : chaque env a SA stack — %env% substitué, db Doltgres en non-prod / Postgres en prod", () => {
		const cfg = defaultInstanceConfig();
		const dev = envStackOf("dev", cfg);
		const prod = envStackOf("prod", cfg);
		expect(dev).toHaveLength(STACK_SERVICES.length);
		expect(envStackOf("dev", cfg)).toEqual(dev); // déterministe
		const devApp = dev.find((s) => s.key === "app");
		expect(devApp?.url).toContain("dev");
		expect(devApp?.url).not.toContain("%env%");
		// ADR 0006 : la donnée versionnée en non-prod (doltgres), Postgres en prod.
		expect(dev.find((s) => s.key === "db")?.url).toContain("doltgres");
		expect(prod.find((s) => s.key === "db")?.url).toContain("postgres");
	});
});
