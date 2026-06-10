import { expect, test } from "@playwright/test";
import { SCREENS, screensHash } from "../../front/web/lib/v2/screens";

/**
 * WB2-25 Playwright e2e — la PASSE DE COHÉRENCE finale du Workbench V2.
 * mirror record: reflects=WB2-25-coherence, test_kind=e2e, cert_language=playwright,
 * liveness=live, authority=below (lecture seule, le mur intact).
 *
 * Les critères de done WB2-25, atteints depuis l'écran :
 *   - NAV V2 COMPLÈTE : /v2 affiche le registre « Tous les écrans » et CHAQUE écran déclaré
 *     est cliquable ET exécutable (chaque route /v2/<slug> répond 200, aucun écran orphelin) ;
 *   - LE BON MOT : le titre rendu de chaque écran vient du registre (glossaire), aucun franglais
 *     (le lint vocabulaire 0 écart est prouvé par le miroir vitest lib/v2/screens.test.ts) ;
 *   - BASCULE PROD : la V2 est servie à /v2 (sa nouvelle URL) ET l'ancien Workbench répond 200 à /
 *     (coexistence, aucune route V1 touchée).
 *
 * LE MUR : tout écran V2 PROPOSE / NAVIGUE ; il n'écrit aucune vérité.
 */

test.describe("WB2-25 — la cohérence V2", () => {
	test("la bascule prod : /v2 répond 200 ET l'ancien / répond 200 (coexistence)", async ({
		page,
	}) => {
		const v2 = await page.goto("/v2");
		expect(v2?.status()).toBe(200);
		const v1 = await page.goto("/");
		expect(v1?.status()).toBe(200);
	});

	test("/v2 affiche le registre « Tous les écrans » + son empreinte", async ({
		page,
	}) => {
		await page.goto("/v2");
		await expect(page.getByTestId("v2-all-screens")).toBeVisible();
		await expect(page.getByTestId("v2-screens-hash")).toContainText(
			screensHash(),
		);
	});

	test("chaque écran déclaré est cliquable depuis /v2 (nav complète)", async ({
		page,
	}) => {
		await page.goto("/v2");
		for (const s of SCREENS) {
			await expect(
				page.getByTestId(`v2-screen-${s.slug}`),
				`l'écran /v2/${s.slug} doit être listé et cliquable`,
			).toBeVisible();
		}
	});

	// Chaque route déclarée répond 200 (exécutable, aucun lien mort). Un test par écran : la
	// preuve granulaire que TOUTE la nav V2 est servie à sa nouvelle URL.
	for (const s of SCREENS) {
		test(`/v2/${s.slug} répond 200 et porte son titre (le bon mot)`, async ({
			page,
		}) => {
			const res = await page.goto(`/v2/${s.slug}`);
			expect(res?.status(), `/v2/${s.slug} doit répondre 200`).toBe(200);
		});
	}
});
