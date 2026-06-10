import { expect, test } from "@playwright/test";

/**
 * WB2-09 Playwright e2e — l'écran /v2/cellules : LES CELLULES (bounded contexts, §49) + Pact. Une
 * grosse app est une FÉDÉRATION de petites cellules ; par cellule : sa grille niveau × facette
 * (rollup Σ), ses liens internes `composes ↓`, ses contrats `depends_on`/Pact → autres cellules.
 * mirror record: reflects=WB2-09-cellules, test_kind=e2e, cert_language=playwright, liveness=live,
 * authority=above (projection de lecture, le mur intact).
 *
 * Les critères de done WB2-09, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - NAVIGUER cellule → cases → specs (le critère de done) : clic cellule → drill-down (grille +
 *     liens internes + contrats) → clic case → SES specs (liens vers l'anatomie de chaque kernel) ;
 *   - Σ COHÉRENTE : la somme de la grille de la cellule = son count (aucune spec perdue) ;
 *   - les contrats inter-cellules (§49, Pact) sont présents ;
 *   - le BAS read-only : aucune requête d'écriture (POST/PUT/PATCH/DELETE) — le mur intact ;
 *   - DÉTERMINISTE : mêmes comptes au rechargement (la fédération canonique est pure).
 */

test.describe("WB2-09 /v2/cellules — les cellules (bounded contexts) + Pact", () => {
	test("naviguer cellule → cases → specs + Σ cohérente + contrats ; jamais une écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/cellules");
		await expect(page.getByTestId("v2-cellules-title")).toBeVisible();
		await expect(page.getByTestId("v2-cellules-wall-note")).toBeVisible();

		// La fédération canonique : 3 cellules, 2 contrats inter-cellules, 10 kernels.
		const summary = page.getByTestId("v2-cellules-summary");
		await expect(summary).toHaveAttribute("data-cell-count", "3");
		await expect(summary).toHaveAttribute("data-contract-count", "2");
		await expect(summary).toHaveAttribute("data-total", "10");

		// Les trois cellules sont des boutons de drill-down.
		await expect(page.getByTestId("v2-cellules-cell-checkout")).toBeVisible();
		await expect(page.getByTestId("v2-cellules-cell-order")).toBeVisible();
		await expect(page.getByTestId("v2-cellules-cell-inventory")).toBeVisible();

		// NAVIGUER : clic cellule → drill-down (grille + liens internes + contrats).
		await page.getByTestId("v2-cellules-cell-checkout").click();
		const drill = page.getByTestId("v2-cellules-drilldown");
		await expect(drill).toBeVisible();
		await expect(drill).toHaveAttribute("data-cell-id", "checkout");

		// Σ COHÉRENTE : la grille de checkout totalise son count (4 kernels).
		await expect(page.getByTestId("v2-cellules-grid-total")).toHaveText("4");

		// Les liens internes composes ↓ de checkout sont présents (3).
		await expect(page.getByTestId("v2-cellules-internal")).toBeVisible();

		// Les CONTRATS inter-cellules (§49, Pact) de checkout : sortant → order.
		await expect(
			page.getByTestId("v2-cellules-contract-checkout-order"),
		).toBeVisible();

		// NAVIGUER : clic case (niveau, facette) → SES specs. La case product × F tient le kernel racine.
		await page.getByTestId("v2-cellules-case-product-F").click();
		const caseDetail = page.getByTestId("v2-cellules-case-detail");
		await expect(caseDetail).toBeVisible();
		// La case product × F de checkout tient son kernel racine → un lien vers son anatomie.
		await expect(
			page.getByTestId("v2-cellules-spec-checkout-product"),
		).toBeVisible();
		await expect(
			page.getByTestId("v2-cellules-spec-checkout-product"),
		).toHaveAttribute("href", "/v2/anatomie/checkout-product");

		// Naviguer vers une AUTRE cellule (order) — le drill-down se met à jour.
		await page.getByTestId("v2-cellules-cell-order").click();
		await expect(page.getByTestId("v2-cellules-drilldown")).toHaveAttribute(
			"data-cell-id",
			"order",
		);
		// order a 2 contrats (entrant de checkout, sortant vers inventory).
		await expect(
			page.getByTestId("v2-cellules-contract-checkout-order"),
		).toBeVisible();
		await expect(
			page.getByTestId("v2-cellules-contract-order-inventory"),
		).toBeVisible();

		// LE MUR : aucune requête d'écriture (bas read-only).
		expect(writes).toEqual([]);
	});

	test("DÉTERMINISTE : mêmes comptes au rechargement (la fédération canonique est pure)", async ({
		page,
	}) => {
		await page.goto("/v2/cellules");
		const summary = page.getByTestId("v2-cellules-summary");
		await expect(summary).toBeVisible();
		const cells = await summary.getAttribute("data-cell-count");
		const contracts = await summary.getAttribute("data-contract-count");
		const total = await summary.getAttribute("data-total");

		await page.reload();
		await expect(summary).toBeVisible();
		expect(await summary.getAttribute("data-cell-count")).toBe(cells);
		expect(await summary.getAttribute("data-contract-count")).toBe(contracts);
		expect(await summary.getAttribute("data-total")).toBe(total);
	});
});
