import { expect, test } from "@playwright/test";

/**
 * WB2-04 Playwright e2e — l'écran /v2/kernels : l'ARBRE DE COMPOSITION des kernels (React Arborist).
 * mirror record: reflects=WB2-04-kernel-tree, test_kind=e2e, cert_language=playwright,
 * liveness=live, authority=above (projection de lecture, le mur intact).
 *
 * Les critères de done WB2-04, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - l'arbre rend 200+ nœuds (virtualisation : le compteur l'affiche, le DOM ne matérialise
 *     qu'une fenêtre) ;
 *   - DÉPLIER / REPLIER un nœud (drill-down fractal) ;
 *   - CLIC sur un kernel → l'anatomie (/v2/anatomie/[kernel]) ;
 *   - le mur intact : AUCUNE requête d'écriture ;
 *   - coexistence : /v2/kernels 200, l'ancien / 200 ; le slug concept /v2/arbres rend l'arbre.
 */

test.describe("WB2-04 /v2/kernels — l'arbre fractal de composition (React Arborist)", () => {
	test("200+ nœuds virtualisés ; déplier/replier ; clic → anatomie ; jamais une écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/kernels");
		await expect(page.getByTestId("v2-kernels-title")).toBeVisible();
		await expect(page.getByTestId("v2-kernels-wall-note")).toBeVisible();

		// Virtualisation : le compteur affiche 200+ nœuds, alors que le DOM n'en matérialise
		// qu'une fenêtre (preuve que la lib virtualise — sinon 240 lignes seraient toutes là).
		await expect(page.getByTestId("v2-kernels-count")).toContainText("240");
		const renderedRows = await page.locator('[data-testid^="v2-kernels-node-"]').count();
		expect(renderedRows).toBeLessThan(240);
		expect(renderedRows).toBeGreaterThan(0);

		// La racine est repliée par défaut. La DÉPLIER fait apparaître ses enfants.
		const rootToggle = page.getByTestId("v2-kernels-toggle-k0");
		await expect(page.getByTestId("v2-kernels-node-k0")).toHaveAttribute(
			"data-open",
			"false",
		);
		await rootToggle.click();
		await expect(page.getByTestId("v2-kernels-node-k0")).toHaveAttribute(
			"data-open",
			"true",
		);
		// L'enfant k1 (composé par k0) est désormais matérialisé.
		await expect(page.getByTestId("v2-kernels-node-k1")).toBeVisible();

		// REPLIER : l'enfant disparaît.
		await rootToggle.click();
		await expect(page.getByTestId("v2-kernels-node-k0")).toHaveAttribute(
			"data-open",
			"false",
		);
		await expect(page.getByTestId("v2-kernels-node-k1")).toHaveCount(0);

		// CLIC sur le kernel racine → la barre de sélection, puis → l'anatomie.
		await page.getByTestId("v2-kernels-select-k0").click();
		await expect(page.getByTestId("v2-kernels-selected")).toBeVisible();
		await page.getByTestId("v2-kernels-open-anatomy").click();
		await expect(page).toHaveURL(/\/v2\/anatomie\/k0$/);
		await expect(page.getByTestId("v2-anatomie-kernel-id")).toHaveText("k0");

		// LE MUR : aucune requête d'écriture n'a été émise.
		expect(writes).toEqual([]);
	});

	test("coexistence : /v2/kernels 200, /v2/arbres rend l'arbre, l'ancien / 200", async ({
		page,
	}) => {
		const kernels = await page.goto("/v2/kernels");
		expect(kernels?.status()).toBe(200);

		// Le slug concept « arbres » (atteint depuis la carte/nav de /v2) rend le même arbre,
		// en conservant le contrat de navigation WB2-02 (v2-concept-title = « Arbres »).
		const arbres = await page.goto("/v2/arbres");
		expect(arbres?.status()).toBe(200);
		await expect(page.getByTestId("v2-concept-title")).toHaveText("Arbres");
		await expect(page.getByTestId("v2-kernels-tree")).toBeVisible();

		const home = await page.goto("/");
		expect(home?.status()).toBe(200);
	});
});
