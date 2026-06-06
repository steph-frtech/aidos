import { expect, test } from "@playwright/test";

/**
 * EL02 Playwright e2e — the BesoinLevel grammar Workbench panel (/compound-besoin-grammar).
 * mirror record: reflects=back/runtime/besoin grammar (the closed, total order of the 7 §23 SOURCE
 *               rungs + the 2 transversal bands; a hard refusal of out-of-grammar;
 *               saga/temporal/globalinvariant declared out-of-scope-v1, refused not aliased),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness): the two controls EXECUTE the pure twin from the
 * screen — "List the grammar" renders the closed order, bands and out-of-scope layers; "Parse the
 * level" resolves a valid level and HARD-refuses an out-of-grammar string.
 *
 * Scenario A: listing the grammar renders the total order + bands + declared out-of-scope.
 *   Given the Workbench is running
 *   When I navigate to /compound-besoin-grammar and click LIST THE GRAMMAR
 *   Then the 7 SOURCE rungs appear in their total order (product first, entity the leaf)
 *   And the 2 transversal bands (invariant, policy) appear
 *   And saga/temporal/globalinvariant appear as declared out-of-scope-v1 (not aliased)
 *
 * Scenario B: parsing executes the grammar — valid resolves, out-of-grammar is a hard refusal.
 *   When I parse "control" then a valid-level result appears
 *   When I parse "saga" then an out-of-scope refusal appears
 *   When I parse "foo" then a hard out-of-grammar refusal appears
 */

test.describe("EL02 — the BesoinLevel grammar", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin-grammar");
		await expect(page.getByTestId("besoin-grammar-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("LIST THE GRAMMAR renders the closed total order + bands + out-of-scope", async ({
		page,
	}) => {
		// Before running, nothing is listed (action-capable).
		await expect(page.getByTestId("list-pending")).toBeVisible();

		await page.getByTestId("list-grammar").click();

		await expect(page.getByTestId("grammar-result")).toBeVisible();

		// The 7 SOURCE rungs in total order.
		await expect(page.getByTestId("rung-product")).toContainText("product");
		await expect(page.getByTestId("rung-control")).toContainText(
			"triggers → action",
		);
		await expect(page.getByTestId("rung-entity")).toBeVisible();
		// entity is the leaf — no next (FR default locale renders "feuille"; EN renders "leaf").
		await expect(page.getByTestId("rung-entity")).toContainText(/feuille|leaf/);
		await expect(page.getByTestId("rung-entity")).toContainText("attributes");

		// The 2 transversal bands.
		await expect(page.getByTestId("band-invariant")).toBeVisible();
		await expect(page.getByTestId("band-policy")).toBeVisible();

		// The 3 declared out-of-scope-v1 layers (refused, not aliased).
		await expect(page.getByTestId("oos-saga")).toBeVisible();
		await expect(page.getByTestId("oos-temporal")).toBeVisible();
		await expect(page.getByTestId("oos-globalinvariant")).toBeVisible();
	});

	test("PARSE THE LEVEL resolves a valid level and hard-refuses out-of-grammar", async ({
		page,
	}) => {
		// A valid level resolves.
		await page.getByTestId("parse-input").fill("control");
		await page.getByTestId("parse-level").click();
		await expect(page.getByTestId("parse-ok")).toContainText("control");

		// An out-of-scope kernel layer is refused as out-of-scope (never aliased).
		await page.getByTestId("parse-input").fill("saga");
		await page.getByTestId("parse-level").click();
		await expect(page.getByTestId("parse-refused")).toBeVisible();
		await expect(page.getByTestId("parse-refused")).toContainText("saga");

		// An unknown string is a HARD refusal.
		await page.getByTestId("parse-input").fill("foo");
		await page.getByTestId("parse-level").click();
		await expect(page.getByTestId("parse-refused")).toBeVisible();
		await expect(page.getByTestId("parse-refused")).toContainText("foo");
	});
});
