import { expect, test } from "@playwright/test";

/**
 * EL06 Playwright e2e — the BesoinThresholds & OptionSpace Workbench panel
 * (/compound-besoin-thresholds).
 * mirror record: reflects=back/runtime/besoin/thresholds.go (BesoinThresholds: one declared
 *               content-addressed record read by EL07/EL11, no second copy; OptionSpace: the
 *               enumerable declared metric per adjacent rung pair, a pure integer count, a
 *               non-enumerable pair is a declared OpenQuestion with size -1, never fabricated to 0),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness): every control EXECUTES the pure twin from the
 * screen — "Load thresholds" loads the record + content-addressed hash, "Prove the single source"
 * proves no second required-fields copy, "Count the OptionSpace" counts |OptionSpace(L→L+1)|.
 *
 * Scenario A: load the thresholds record → max_scenarios 5 + a content-addressed hash render.
 * Scenario B: the single-source proof passes (record required fields == grammar).
 * Scenario C: an enumerable pair (product→journey) counts a positive integer.
 * Scenario D: a non-enumerable pair (operation→entity) is an OpenQuestion, size -1, never 0.
 */

test.describe("EL06 — BesoinThresholds & OptionSpace", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin-thresholds");
		await expect(page.getByTestId("optionspace-table")).toBeVisible({
			timeout: 5000,
		});
	});

	test("loading the thresholds record shows max_scenarios 5 + a content-addressed hash", async ({
		page,
	}) => {
		await page.getByTestId("load-cta").click();
		await expect(page.getByTestId("thresholds-loaded")).toBeVisible();
		await expect(page.getByTestId("max-scenarios")).toHaveText("5");
		// The content-addressed hash is a 64-hex-char SHA-256 (byte-identical to the Go authority).
		await expect(page.getByTestId("thresholds-hash")).toHaveText(
			/^[0-9a-f]{64}$/,
		);
		// Required fields per rung render (sourced from the grammar, the single source).
		await expect(page.getByTestId("req-product")).toContainText("scenarios");
	});

	test("the single-source proof passes (record required fields == grammar)", async ({
		page,
	}) => {
		await page.getByTestId("source-cta").click();
		const v = page.getByTestId("source-verdict");
		await expect(v).toBeVisible();
		await expect(v).not.toContainText(/Dérive|Drift/);
	});

	test("an enumerable pair (product→journey) counts a positive integer", async ({
		page,
	}) => {
		// product→journey is enumerable in the always-visible table.
		await expect(page.getByTestId("os-size-product→journey")).toContainText(
			/Énumérable|Enumerable/,
		);
		await page.getByTestId("pair-select").selectOption("product→journey");
		await page.getByTestId("count-cta").click();
		const size = page.getByTestId("count-size");
		await expect(size).toBeVisible();
		// |OptionSpace| = 7 for product→journey (a positive integer, never -1, never 0).
		await expect(size).toContainText("|OptionSpace| = 7");
	});

	test("a non-enumerable pair (operation→entity) is an OpenQuestion, size -1, never 0", async ({
		page,
	}) => {
		// In the table operation→entity is flagged OpenQuestion with the -1 sentinel.
		await expect(page.getByTestId("os-size-operation→entity")).toContainText(
			/OpenQuestion/,
		);
		await expect(page.getByTestId("os-size-operation→entity")).toContainText(
			"-1",
		);
		await page.getByTestId("pair-select").selectOption("operation→entity");
		await page.getByTestId("count-cta").click();
		const size = page.getByTestId("count-size");
		await expect(size).toContainText("|OptionSpace| = -1");
		await expect(page.getByTestId("count-verdict")).toContainText(
			/OpenQuestion/,
		);
	});
});
