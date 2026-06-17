import { expect, test } from "@playwright/test";

/**
 * V3 « Concevoir » — la lentille LES VÉRITÉS DU NOYAU (kernels) portée EN PROPRE dans la session V3
 * (/v3/kernels).
 * mirror record: reflects=kernels@v3, test_kind=e2e, cert_language=playwright,
 *                liveness=alive, authority=above
 *
 * La lentille V3 est une LENTILLE NATIVE : loadKernelsAction → readVia(scope,"store_get",…) lit LIVE
 * le serveur MCP Go `store` via la passerelle (chaque vérité adressée par contenu, lue par son hash) ;
 * le jeu de vérités-démo (lib/v3/kernels-data) n'est que le repli déterministe (source:"live"|"demo")
 * — aucun fork, aucune ré-implémentation du noyau (ADR 0007 / 0092). Seul le SHELL diffère : le
 * chrome de la session V3 (V3Nav, V3SessionProvider) hérité du layout.
 *
 * Le geste, exécuté depuis l'écran V3 (CLAUDE.md §7 ui-completeness) :
 *   Given the V3 workbench is running
 *   When I navigate to /v3/kernels (the lens lives inside the V3 shell)
 *   Then the list of kernel truths read by hash is shown, with an honest source badge (live|demo);
 *   And selecting a truth shows its content-addressed JSONB body;
 *   And the wall holds — the « propose » control is present but disabled (no truth-write from screen).
 *
 * LE MUR (le wall, §2/§9) : la lentille LIT — store_get est une lecture sous la ligne ; geler une
 * vérité passe par propose → ChangeSet → /goal, jamais une écriture directe depuis l'écran.
 */

test.describe("V3 Concevoir — la lentille Les vérités du noyau (kernels)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/v3/kernels");
		// La lentille est bien montée DANS le shell V3 (la nav V3 enveloppe la route).
		await expect(page.getByTestId("v3-shell")).toBeVisible({ timeout: 15000 });
		await expect(page.getByTestId("v3-kernels")).toBeVisible();
		await expect(page.getByTestId("v3-kernels-lens")).toBeVisible();
	});

	test("the list of kernel truths is shown with an honest source badge (live|demo)", async ({
		page,
	}) => {
		const list = page.getByTestId("v3-kernels-list");
		await expect(list).toBeVisible();
		// au moins une vérité projetée (le jeu fermé déclaré).
		await expect(page.getByTestId("v3-kernels-item").first()).toBeVisible();
		// le badge `source` est honnête (live OU demo) — jamais un live cassé silencieux (ADR 0074).
		const badge = page.getByTestId("v3-kernels-source");
		await expect(badge).toBeVisible();
		const src = await badge.getAttribute("data-source");
		expect(["live", "demo"]).toContain(src);
	});

	test("selecting a truth shows its content-addressed JSONB body", async ({
		page,
	}) => {
		await page.getByTestId("v3-kernels-item").first().click();
		const body = page.getByTestId("v3-kernels-body");
		await expect(body).toBeVisible();
		// le corps est du JSONB (l'enveloppe canonique d'une kernel.truth).
		await expect(body).toContainText('"kind"');
		await expect(body).toContainText("truth");
	});

	test("the wall holds — the propose control is present but disabled (no write from screen)", async ({
		page,
	}) => {
		await expect(page.getByTestId("v3-kernels-wall-note")).toBeVisible();
		const propose = page.getByTestId("v3-kernels-propose");
		await expect(propose).toBeVisible();
		await expect(propose).toBeDisabled();
	});
});
