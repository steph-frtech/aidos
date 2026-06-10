import { expect, test } from "@playwright/test";

/**
 * WB2-05 Playwright e2e — l'écran /v2/grille : la GRILLE niveau × facette (FKE-1.4 les deux axes).
 * mirror record: reflects=WB2-05-grid, test_kind=e2e, cert_language=playwright,
 * liveness=live, authority=above (projection de lecture, le mur intact).
 *
 * Les critères de done WB2-05, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - la grille rend 7 lignes (niveaux) × 8 colonnes (facettes F·I·S·B·R·V·M·X) ;
 *   - les sommes Σ sont COHÉRENTES : Σ des lignes = Σ des colonnes = total = nombre de kernels ;
 *   - CLIC sur une cellule → ses kernels/specs ; chaque spec → son anatomie (/v2/anatomie/[id]) ;
 *   - le mur intact : AUCUNE requête d'écriture ;
 *   - coexistence : /v2/grille 200, l'ancien / 200 ; le slug concept /v2/verticale rend la grille.
 */

const FACETS = ["F", "I", "S", "B", "R", "V", "M", "X"];
const LEVELS = [
	"product",
	"journey",
	"view",
	"control",
	"action",
	"operation",
	"entity",
];

test.describe("WB2-05 /v2/grille — la grille niveau × facette (les deux axes)", () => {
	test("7×8, sommes Σ cohérentes, clic cellule → specs, jamais une écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/grille");
		await expect(page.getByTestId("v2-grille-title")).toBeVisible();
		await expect(page.getByTestId("v2-grille-wall-note")).toBeVisible();

		// Les deux axes : 8 colonnes (facettes) + 7 lignes (niveaux).
		for (const f of FACETS) {
			await expect(page.getByTestId(`v2-grille-colhead-${f}`)).toBeVisible();
		}
		for (const l of LEVELS) {
			await expect(page.getByTestId(`v2-grille-rowhead-${l}`)).toBeVisible();
		}

		// Sommes Σ cohérentes : Σ rowTotals = Σ colTotals = grandTotal = total affiché.
		const grand = Number(
			(await page.getByTestId("v2-grille-grandtotal").textContent())?.trim(),
		);
		let sumRows = 0;
		for (const l of LEVELS) {
			sumRows += Number(
				(await page.getByTestId(`v2-grille-rowtotal-${l}`).textContent())?.trim(),
			);
		}
		let sumCols = 0;
		for (const f of FACETS) {
			sumCols += Number(
				(await page.getByTestId(`v2-grille-coltotal-${f}`).textContent())?.trim(),
			);
		}
		expect(sumRows).toBe(grand);
		expect(sumCols).toBe(grand);
		expect(grand).toBe(240);

		// CLIC une cellule → la liste de ses specs ; chaque spec → l'anatomie.
		// On cherche une cellule non vide (count > 0) déterministe : product × F (k0 y tombe).
		const cell = page.getByTestId("v2-grille-cell-product-F");
		await cell.click();
		await expect(page.getByTestId("v2-grille-cell-detail")).toBeVisible();
		const count = Number(
			(await page.getByTestId("v2-grille-cell-count").textContent())?.trim(),
		);
		expect(count).toBeGreaterThan(0);
		// La liste matérialise exactement `count` specs.
		await expect(
			page.locator('[data-testid^="v2-grille-spec-"]'),
		).toHaveCount(count);

		// Cliquer une spec → son anatomie (jamais un lien mort).
		const firstSpec = page.locator('[data-testid^="v2-grille-spec-"]').first();
		const specId = (await firstSpec.getAttribute("data-testid"))?.replace(
			"v2-grille-spec-",
			"",
		);
		await firstSpec.click();
		await expect(page).toHaveURL(new RegExp(`/v2/anatomie/${specId}$`));
		await expect(page.getByTestId("v2-anatomie-kernel-id")).toHaveText(
			specId ?? "",
		);

		// LE MUR : aucune requête d'écriture n'a été émise.
		expect(writes).toEqual([]);
	});

	test("coexistence : /v2/grille 200, /v2/verticale rend la grille, l'ancien / 200", async ({
		page,
	}) => {
		const grille = await page.goto("/v2/grille");
		expect(grille?.status()).toBe(200);

		// Le slug concept « verticale » (atteint depuis la carte/nav de /v2) rend la même grille,
		// en conservant le contrat de navigation WB2-02 (v2-concept-title = « Verticale »).
		const verticale = await page.goto("/v2/verticale");
		expect(verticale?.status()).toBe(200);
		await expect(page.getByTestId("v2-concept-title")).toHaveText("Verticale");
		await expect(page.getByTestId("v2-grille-grid")).toBeVisible();

		const home = await page.goto("/");
		expect(home?.status()).toBe(200);
	});
});
