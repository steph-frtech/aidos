import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	isProbeable,
	type ProbeStatus,
	probeStatusLabelKey,
	probeStatusOf,
	probeStatusTestId,
} from "./probe-status";

/**
 * V3 — le MIROIR de la PROJECTION HONNÊTE du statut de stack (ADR 0080 step 2).
 * La règle : on n'affirme « en ligne » que ce qui est SONDABLE depuis l'hôte et
 * a répondu up ; un service interne reste « déclaré », jamais « live » (§8).
 */

describe("isProbeable — la règle ADR 0080 (https ⟺ endpoint hôte)", () => {
	it("https → sondable ; toute autre adresse interne → non sondable", () => {
		expect(isProbeable({ url: "https://demoshop-dev.sagedesk.fr" })).toBe(true);
		expect(isProbeable({ url: "http://api-hono-dev:3001" })).toBe(false);
		expect(isProbeable({ url: "nats://nats:4222" })).toBe(false);
		expect(isProbeable({ url: "redis://valkey-dev:6379" })).toBe(false);
		expect(isProbeable({ url: "doltgres://172.17.0.1:5433/dev" })).toBe(false);
		expect(isProbeable({ url: "" })).toBe(false);
	});

	it("honore le drapeau .probe de l'entrée s'il est présent (step 1 mergé)", () => {
		// L'entrée porte son drapeau → on l'honore, même si l'URL « semble » dire l'inverse.
		expect(isProbeable({ url: "http://interne:3001", probe: true })).toBe(true);
		expect(isProbeable({ url: "https://hote.example", probe: false })).toBe(
			false,
		);
	});
});

describe("probeStatusOf — (probe, sonde) → statut, anti-faux-positif", () => {
	it("probe=false → TOUJOURS declared, quel que soit le bruit de sonde", () => {
		fc.assert(
			fc.property(
				fc.option(fc.record({ up: fc.boolean() }), { nil: undefined }),
				(result) => {
					expect(probeStatusOf(false, result ?? undefined)).toBe("declared");
				},
			),
		);
	});

	it("probe=true : absente→probing, up→up, down→down", () => {
		expect(probeStatusOf(true, undefined)).toBe("probing");
		expect(probeStatusOf(true, { up: true })).toBe("up");
		expect(probeStatusOf(true, { up: false })).toBe("down");
	});

	it("∀ : jamais 'up' sans une sonde up=true (la seule affirmation prouvée)", () => {
		fc.assert(
			fc.property(
				fc.boolean(),
				fc.option(fc.record({ up: fc.boolean() }), { nil: undefined }),
				(probe, result) => {
					const status = probeStatusOf(probe, result ?? undefined);
					if (status === "up") {
						expect(probe).toBe(true);
						expect(result?.up).toBe(true);
					}
				},
			),
		);
	});
});

describe("les libellés + testids — un jeu déclaré et clos par statut", () => {
	const ALL: ProbeStatus[] = ["declared", "probing", "up", "down"];

	it("chaque statut a une clé i18n et un testid distincts", () => {
		const keys = ALL.map(probeStatusLabelKey);
		const ids = ALL.map(probeStatusTestId);
		expect(new Set(keys).size).toBe(ALL.length);
		expect(new Set(ids).size).toBe(ALL.length);
	});

	it("les clés i18n sont celles attendues par les messages FR/EN", () => {
		expect(probeStatusLabelKey("up")).toBe("stackProbeUp");
		expect(probeStatusLabelKey("down")).toBe("stackProbeDown");
		expect(probeStatusLabelKey("declared")).toBe("stackDeclared");
	});
});
