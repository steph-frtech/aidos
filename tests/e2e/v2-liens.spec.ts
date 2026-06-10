import { expect, test } from "@playwright/test";

/**
 * WB2-08 Playwright e2e — l'écran /v2/liens : LES SIX LIENS (§17/§41) entre kernels, rendus en
 * React Flow. Les nœuds = des kernels (id@version), les arêtes = des liens TYPÉS des six familles.
 * Chaque lien pointe une VERSION pinnée (id@version), jamais une identité nue (§41).
 * mirror record: reflects=WB2-08-links, test_kind=e2e, cert_language=playwright, liveness=live,
 * authority=above (projection de lecture, le mur intact).
 *
 * Les critères de done WB2-08, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - FILTRE PAR TYPE D'ARÊTE (le critère de done) : cliquer une famille ne montre QUE ses arêtes ;
 *   - les six familles sont présentes comme filtres ;
 *   - ACTION-CAPABLE : cliquer un lien l'ouvre (détail : famille, from, cible PINNÉE @version) ;
 *   - PAN/ZOOM (Controls + zoom) ;
 *   - le BAS read-only : aucune requête d'écriture (POST/PUT/PATCH/DELETE) ;
 *   - DÉTERMINISTE : mêmes liens au rechargement (le graphe canonique est pur).
 */

const KINDS = [
	"composes",
	"depends_on",
	"supersedes",
	"provenance",
	"triggers_binds",
	"mirrors",
];

test.describe("WB2-08 /v2/liens — les six liens (React Flow)", () => {
	test("le filtre par type d'arête + action-capable + pan/zoom ; jamais une écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/liens");
		await expect(page.getByTestId("v2-liens-title")).toBeVisible();
		await expect(page.getByTestId("v2-liens-wall-note")).toBeVisible();
		await expect(page.getByTestId("v2-liens-canvas")).toBeVisible();

		// Les six familles sont présentes comme filtres, plus « toutes ».
		await expect(page.getByTestId("v2-liens-filter-all")).toBeVisible();
		for (const k of KINDS) {
			await expect(page.getByTestId(`v2-liens-filter-${k}`)).toBeVisible();
		}

		// « toutes » par défaut : tous les liens du graphe canonique (8) sont affichés.
		await expect(page.getByTestId("v2-liens-summary")).toHaveAttribute(
			"data-link-count",
			"8",
		);
		await expect(page.getByTestId("v2-liens-filter-all")).toHaveAttribute(
			"aria-pressed",
			"true",
		);

		// FILTRE PAR TYPE D'ARÊTE (le critère de done) : cliquer « composes » ne montre QUE ses arêtes.
		// composes : 3 liens dans le graphe canonique (vue→submit, submit→createOrder, createOrder→order).
		await page.getByTestId("v2-liens-filter-composes").click();
		await expect(page.getByTestId("v2-liens-filter-composes")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(page.getByTestId("v2-liens-summary")).toHaveAttribute(
			"data-link-count",
			"3",
		);
		// Le canvas ne dessine plus que les arêtes composes.
		await expect(page.locator(".react-flow__edge")).toHaveCount(3);

		// Filtrer « mirrors » (1 lien) — un autre type d'arête.
		await page.getByTestId("v2-liens-filter-mirrors").click();
		await expect(page.getByTestId("v2-liens-summary")).toHaveAttribute(
			"data-link-count",
			"1",
		);
		await expect(page.locator(".react-flow__edge")).toHaveCount(1);

		// Revenir à « toutes » : tous les liens reviennent (filtre réversible).
		await page.getByTestId("v2-liens-filter-all").click();
		await expect(page.getByTestId("v2-liens-summary")).toHaveAttribute(
			"data-link-count",
			"8",
		);

		// PAN/ZOOM : les Controls React Flow sont présents — navigable.
		await expect(page.locator(".react-flow__controls")).toBeVisible();
		await page.locator(".react-flow__controls-zoomin").click();

		// ACTION-CAPABLE : cliquer un lien l'ouvre (détail avec la cible PINNÉE @version).
		await page.locator(".react-flow__edge").first().click();
		await expect(page.getByTestId("v2-liens-edge-detail")).toBeVisible();
		await expect(page.getByTestId("v2-liens-detail-kind")).toBeVisible();
		// La cible est PINNÉE (id@version, jamais une identité nue — §41).
		await expect(page.getByTestId("v2-liens-detail-to")).toContainText("@");
		await expect(page.getByTestId("v2-liens-detail-pinned")).toBeVisible();
		await expect(page.getByTestId("v2-liens-detail-readonly")).toBeVisible();

		// LE MUR : aucune requête d'écriture n'a été émise (bas read-only).
		expect(writes).toEqual([]);
	});

	test("DÉTERMINISTE : mêmes kernels + liens au rechargement (le graphe canonique est pur)", async ({
		page,
	}) => {
		await page.goto("/v2/liens");
		await expect(page.getByTestId("v2-liens-canvas")).toBeVisible();
		const first = await page
			.getByTestId("v2-liens-summary")
			.getAttribute("data-link-count");
		const firstNodes = await page
			.getByTestId("v2-liens-summary")
			.getAttribute("data-node-count");

		await page.reload();
		await expect(page.getByTestId("v2-liens-canvas")).toBeVisible();
		const second = await page
			.getByTestId("v2-liens-summary")
			.getAttribute("data-link-count");
		const secondNodes = await page
			.getByTestId("v2-liens-summary")
			.getAttribute("data-node-count");

		expect(second).toBe(first);
		expect(secondNodes).toBe(firstNodes);
	});
});
