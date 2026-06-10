import { expect, test } from "@playwright/test";

/**
 * WB2-00 Playwright e2e — la fondation du Workbench V2 (route /v2, shell, nav par concept).
 * mirror record: reflects=WB2-00-foundation, test_kind=e2e, cert_language=playwright,
 * liveness=live, authority=below (lecture seule, le mur intact).
 *
 * Les critères de done WB2-00, atteints depuis l'écran :
 *   - /v2 rend le SHELL (en-tête V2 + nav par concept) ;
 *   - la nav est issue du glossaire canonique (les neuf concepts présents, libellés FR) ;
 *   - chaque concept est CLIQUABLE et exécutable (carte → écran du concept) ;
 *   - COEXISTENCE : /v2 répond 200 ET l'ancien / répond 200 (aucune route V1 touchée) ;
 *   - aucun terme franglais en nav (le lint vocabulaire est prouvé par le miroir vitest).
 *
 * LE MUR : tout écran V2 PROPOSE / NAVIGUE ; il n'écrit aucune vérité.
 */

test.describe("WB2-00 — la fondation V2", () => {
	test("la coexistence : /v2 200 ET l'ancien / 200", async ({ page }) => {
		const v2 = await page.goto("/v2");
		expect(v2?.status()).toBe(200);
		const v1 = await page.goto("/");
		expect(v1?.status()).toBe(200);
	});

	test("/v2 rend le shell + l'en-tête + la nav par concept", async ({
		page,
	}) => {
		await page.goto("/v2");
		await expect(page.getByTestId("v2-shell")).toBeVisible();
		await expect(page.getByTestId("v2-header")).toBeVisible();
		await expect(page.getByTestId("v2-nav")).toBeVisible();
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Le Workbench, par concept|The Workbench, by concept/,
			}),
		).toBeVisible();
		// la note du mur (PROPOSE) est affichée.
		await expect(page.getByTestId("v2-wall-note")).toBeVisible();
	});

	test("la nav contient les neuf concepts canoniques KRD (libellés FR)", async ({
		page,
	}) => {
		await page.goto("/v2");
		for (const slug of [
			"idee",
			"mur",
			"kernel",
			"verticale",
			"facette",
			"paires-miroir",
			"liens",
			"arbres",
			"cellules",
		]) {
			await expect(page.getByTestId(`v2-nav-${slug}`)).toBeVisible();
			await expect(page.getByTestId(`v2-concept-${slug}`)).toBeVisible();
		}
		// le bon vocabulaire : « Mur » (FR), jamais « Wall » ; « Idée » jamais « Idea ».
		await expect(page.getByTestId("v2-nav-mur")).toHaveText("Mur");
		await expect(page.getByTestId("v2-nav-idee")).toHaveText("Idée");
	});

	test("chaque carte de concept navigue (exécutable) vers son écran", async ({
		page,
	}) => {
		await page.goto("/v2");
		await page.getByTestId("v2-concept-mur").click();
		await expect(page).toHaveURL(/\/v2\/mur$/);
		await expect(page.getByTestId("v2-concept-title")).toHaveText("Mur");
		await expect(page.getByTestId("v2-concept-def")).toBeVisible();
		// retour à la carte des concepts.
		await page.getByTestId("v2-concept-back").click();
		await expect(page).toHaveURL(/\/v2$/);
	});

	test("le retour vers le Workbench actuel mène à /", async ({ page }) => {
		await page.goto("/v2");
		await page.getByTestId("v2-back-to-v1").click();
		await expect(page).toHaveURL(/\/$/);
	});
});
