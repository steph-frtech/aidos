import { expect, test } from "@playwright/test";

/**
 * WB2-19 Playwright e2e — l'écran /v2/why : le WhyTree, l'arbre caused_by (FK13, FKE-35.1). D'un
 * SYMPTÔME, la remontée caused_by MONTE en arbre fishbone (React Arborist) jusqu'à la cause RACINE.
 * Réutilise `trace` (FK12 lib/caused-by.ts) via le twin pur lib/v2/why.ts.
 * mirror record: reflects=WB2-19-why, test_kind=e2e, cert_language=playwright, liveness=live,
 * authority=below (construire/afficher un WhyTree est une lecture — le mur intact, aucune écriture).
 *
 * Les critères de done WB2-19, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - un SYMPTÔME → un ARBRE : on choisit un symptôme → le WhyTree se construit (nœuds > 0, racine = symptôme) ;
 *   - l'arbre se déplie/replie (React Arborist) ; une cause hors-graphe reproduite est greffée, une rejetée élaguée ;
 *   - la TERMINAISON en miroir : le miroir terminal est affiché ; un cas SANS miroir terminal → refus WHYTREE_NO_MIRROR ;
 *   - un cas CYCLIQUE → refus CAUSED_BY_CYCLE (jamais un arbre partiel) ;
 *   - LE MUR : aucune requête d'écriture (POST/PUT/PATCH/DELETE) — construire un WhyTree n'écrit aucune vérité.
 */

test.describe("WB2-19 /v2/why — le WhyTree (d'un symptôme à la cause racine, caused_by)", () => {
	test("un symptôme → un arbre ; le miroir terminal ; hors-graphe reproduite gardée, rejetée élaguée ; jamais une écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/why");
		await expect(page.getByTestId("v2-why-view")).toBeVisible();
		await expect(page.getByTestId("v2-why-wall-note")).toBeVisible();

		// Avant de choisir : l'arbre est vide.
		await expect(page.getByTestId("v2-why-empty")).toBeVisible();

		// CHOISIR le symptôme « off-graph » (la chaîne + une cause hors-graphe reproduite + une rejetée).
		await page.getByTestId("v2-why-sample-off-graph").click();

		// Un ARBRE est construit : la racine = le symptôme.
		await expect(page.getByTestId("v2-why-tree")).toBeVisible();
		await expect(page.getByTestId("v2-why-node-w0")).toContainText(
			"checkout-accept",
		);

		// Le RÉSUMÉ : des nœuds, au moins une cause hors-graphe (reproduite).
		const tally = page.getByTestId("v2-why-tally");
		await expect(tally).toBeVisible();
		const nodes = Number(await tally.getAttribute("data-nodes"));
		expect(nodes).toBeGreaterThan(0);
		await expect(tally).toHaveAttribute("data-offgraph", "1");

		// La cause HORS-graphe REPRODUITE est greffée (verdict reproduced).
		await expect(
			page
				.locator('[data-testid^="v2-why-node-"][data-verdict="reproduced"]')
				.first(),
		).toBeVisible();

		// La cause REJETÉE est ÉLAGUÉE (jamais dans l'arbre) mais listée dans pruned.
		await expect(page.getByTestId("v2-why-pruned")).toBeVisible();
		await expect(page.getByTestId("v2-why-pruned")).toContainText("moon-phase");
		await expect(
			page.locator('[data-testid^="v2-why-node-"]', {
				hasText: "moon-phase",
			}),
		).toHaveCount(0);

		// La TERMINAISON en miroir : le miroir terminal est affiché.
		const terminal = page.getByTestId("v2-why-terminal");
		await expect(terminal).toBeVisible();
		await expect(terminal).toHaveAttribute(
			"data-mirror",
			"mirror-anti-recurrence-total-col",
		);

		// DÉPLIER/REPLIER la racine (le drill-down de l'arbre).
		await expect(page.getByTestId("v2-why-node-w0.0")).toBeVisible();
		await page.getByTestId("v2-why-toggle-w0").click();
		await expect(page.getByTestId("v2-why-node-w0.0")).toHaveCount(0);
		await page.getByTestId("v2-why-toggle-w0").click();
		await expect(page.getByTestId("v2-why-node-w0.0")).toBeVisible();

		// RÉINITIALISER → l'arbre disparaît.
		await page.getByTestId("v2-why-reset").click();
		await expect(page.getByTestId("v2-why-empty")).toBeVisible();

		// LE MUR : aucune écriture.
		expect(writes).toEqual([]);
	});

	test("un cas SANS miroir terminal est refusé (WHYTREE_NO_MIRROR) ; un cas CYCLIQUE est refusé (CAUSED_BY_CYCLE)", async ({
		page,
	}) => {
		await page.goto("/v2/why");

		// Le cas « no-mirror » : la chaîne SANS miroir terminal → REFUS WHYTREE_NO_MIRROR (pas d'arbre).
		await page.getByTestId("v2-why-sample-no-mirror").click();
		const refusedNm = page.getByTestId("v2-why-refused");
		await expect(refusedNm).toBeVisible();
		await expect(refusedNm).toHaveAttribute(
			"data-refusal",
			"WHYTREE_NO_MIRROR",
		);
		await expect(page.getByTestId("v2-why-tree")).toHaveCount(0);

		// Le cas « cyclic » : un cycle caused_by → REFUS CAUSED_BY_CYCLE (jamais un arbre partiel).
		await page.getByTestId("v2-why-sample-cyclic").click();
		const refusedCy = page.getByTestId("v2-why-refused");
		await expect(refusedCy).toBeVisible();
		await expect(refusedCy).toHaveAttribute("data-refusal", "CAUSED_BY_CYCLE");
		await expect(page.getByTestId("v2-why-tree")).toHaveCount(0);
	});
});
