import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	isTotal,
	SCREEN_ROUTES,
	SCREEN_SLUGS,
	SCREENS,
	type ScreenEntry,
	screen,
	screensHash,
	screenTitle,
} from "./screens";
import { lintScreens } from "./vocabulary-lint";

/**
 * Miroir de cohérence + reproductibilité (∀) pour WB2-25 — la passe de cohérence finale :
 * nav V2 complète (le registre couvre exactement les routes réelles) + lint vocabulaire 0 écart.
 * mirror record: reflects=WB2-25-coherence, test_kind=property, cert_language=fast-check,
 * liveness=live, authority=below (au-dessous de la ligne : lecture seule, le mur intact).
 *
 * Ce miroir est RED avant le registre/lint, GREEN après. Il prouve, de façon déterministe :
 *   1. la TOTALITÉ du registre (chaque écran a un titre FR+EN non vide, slug unique) ;
 *   2. la NAV COMPLÈTE : le registre couvre EXACTEMENT les routes app/v2/*\/page.tsx concrètes
 *      (aucun écran orphelin déclaré, aucune route réelle non déclarée) — la cohérence cardinale ;
 *   3. le LINT VOCABULAIRE 0 écart : aucun titre FR ne contient de franglais accidentel ;
 *   4. le DÉTERMINISME : `screensHash` stable, `screen`/`screenTitle` totales (slug inconnu → undefined).
 */

/** Les routes /v2/<slug> concrètes réellement présentes sur le disque (un page.tsx, pas le catch-all). */
function realV2Routes(): string[] {
	const v2dir = join(__dirname, "..", "..", "app", "v2");
	const out: string[] = [];
	for (const name of readdirSync(v2dir)) {
		// Le catch-all [slug] et les fichiers/composants partagés ne sont pas des écrans déclarés.
		if (name.startsWith("[") || name.includes(".")) continue;
		const dir = join(v2dir, name);
		if (!statSync(dir).isDirectory()) continue;
		try {
			statSync(join(dir, "page.tsx"));
			out.push(name);
		} catch {
			// pas de page.tsx → pas une route d'écran
		}
	}
	return out.sort();
}

describe("WB2-25 — le registre des écrans V2 est total", () => {
	it("chaque écran a un titre FR+EN non vide et un slug unique", () => {
		expect(isTotal(SCREENS)).toBe(true);
		expect(SCREENS.length).toBeGreaterThan(0);
	});

	it("la totalité tombe sur un titre vide ou un slug dupliqué", () => {
		const empty: ScreenEntry[] = [
			{ slug: "x", concept: null, fr: { title: " " }, en: { title: "X" } },
		];
		expect(isTotal(empty)).toBe(false);
		const dup: ScreenEntry[] = [
			{ slug: "x", concept: null, fr: { title: "A" }, en: { title: "A" } },
			{ slug: "x", concept: null, fr: { title: "B" }, en: { title: "B" } },
		];
		expect(isTotal(dup)).toBe(false);
	});
});

describe("WB2-25 — la nav V2 est complète (le registre = les routes réelles)", () => {
	it("le registre couvre EXACTEMENT les routes app/v2/*/page.tsx concrètes", () => {
		const real = realV2Routes();
		const declared = [...SCREEN_SLUGS].sort();
		// Toute route réelle est déclarée (aucun écran non listé → nav incomplète).
		for (const r of real) {
			expect(
				declared,
				`la route /v2/${r} doit être déclarée au registre`,
			).toContain(r);
		}
		// Tout écran déclaré existe réellement (aucun écran fantôme dans la nav).
		for (const d of declared) {
			expect(
				real,
				`l'écran déclaré /v2/${d} doit exister sur le disque`,
			).toContain(d);
		}
		// La cohérence cardinale : même cardinal des deux côtés.
		expect(declared).toEqual(real);
	});

	it("chaque route déclarée est un chemin /v2/<slug> bien formé", () => {
		for (const route of SCREEN_ROUTES) {
			expect(route).toMatch(/^\/v2\/[a-z][a-z-]*$/);
		}
	});
});

describe("WB2-25 — le lint vocabulaire passe (0 écart)", () => {
	it("aucun titre d'écran FR ne contient de franglais accidentel", () => {
		const verdict = lintScreens(SCREENS, "fr");
		expect(
			verdict.clean,
			verdict.violations.map((v) => v.detail).join(" | "),
		).toBe(true);
		expect(verdict.violations).toHaveLength(0);
	});

	it("le lint ATTRAPE un franglais injecté (anti-faux-négatif)", () => {
		const polluted: ScreenEntry[] = [
			{
				slug: "x",
				concept: null,
				fr: { title: "Le dashboard des settings" },
				en: { title: "The dashboard of settings" },
			},
		];
		const verdict = lintScreens(polluted, "fr");
		expect(verdict.clean).toBe(false);
		expect(verdict.violations[0]?.reason).toBe("forbidden-franglais");
	});

	it("un nom propre KRD autorisé (Goal, Policy DSL, DAG) ne déclenche PAS le lint", () => {
		const ok: ScreenEntry[] = [
			{
				slug: "g",
				concept: null,
				fr: { title: "Goal — Policy DSL — le DAG" },
				en: { title: "Goal — Policy DSL — the DAG" },
			},
		];
		expect(lintScreens(ok, "fr").clean).toBe(true);
	});
});

describe("WB2-25 — déterminisme (reproductibilité)", () => {
	it("screensHash est stable (même registre → même empreinte)", () => {
		expect(screensHash(SCREENS)).toBe(screensHash(SCREENS));
		expect(screensHash(SCREENS)).toMatch(/^[0-9a-f]{8}$/);
	});

	it("screen / screenTitle sont totales : un slug inconnu rend undefined", () => {
		fc.assert(
			fc.property(fc.string(), (s) => {
				if (SCREEN_SLUGS.includes(s)) return true;
				return (
					screen(s) === undefined &&
					screenTitle(s, "fr") === undefined &&
					screenTitle(s, "en") === undefined
				);
			}),
		);
	});

	it("un slug connu rend toujours son titre dans les deux locales", () => {
		for (const slug of SCREEN_SLUGS) {
			expect(screenTitle(slug, "fr")?.length).toBeGreaterThan(0);
			expect(screenTitle(slug, "en")?.length).toBeGreaterThan(0);
		}
	});
});
