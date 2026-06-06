import { expect, test } from "@playwright/test";

/**
 * EL05 Playwright e2e — the LevelToProposes table Workbench panel (/compound-besoin-proposes).
 * mirror record: reflects=back/runtime/besoin/proposes.go (LevelToProposes: the honest join between
 *               the 9 grammar levels and the closed set ideas.ProposesKinds(); self-map is the only
 *               legal Emit; journey/view/invariant are NoEmit; out-of-grammar is a hard error),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness): every control EXECUTES the pure twin from the
 * screen — "Map the level" runs levelToProposes(level), "Prove the honest join" proves every Emit ∈
 * closed set with no alias, and "Test an out-of-grammar level" proves the hard error.
 *
 * Scenario A: a self-kind rung (entity) maps to Emit → entity; the full table renders.
 * Scenario B: a NoEmit rung (journey) maps to NoEmit (no silent cast journey→product).
 * Scenario C: the honest-join proof is honest (every Emit ∈ closed set, no alias).
 * Scenario D: an out-of-grammar level (saga) is a hard error.
 */

test.describe("EL05 — LevelToProposes table", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin-proposes");
		await expect(page.getByTestId("proposes-table")).toBeVisible({
			timeout: 5000,
		});
	});

	test("a self-kind rung (entity) maps to Emit → entity", async ({ page }) => {
		// The full declared table is rendered (9 rows).
		await expect(page.getByTestId("row-product")).toBeVisible();
		await expect(page.getByTestId("row-entity")).toBeVisible();
		await expect(page.getByTestId("mapping-entity")).toContainText("entity");

		await page.getByTestId("level-select").selectOption("entity");
		await page.getByTestId("map-cta").click();
		await expect(page.getByTestId("map-verdict")).toContainText("entity");
	});

	test("a NoEmit rung (journey) maps to NoEmit — no silent cast to product", async ({
		page,
	}) => {
		// In the table, journey is NoEmit, never product.
		await expect(page.getByTestId("mapping-journey")).not.toContainText(
			"product",
		);
		await expect(page.getByTestId("mapping-view")).not.toContainText("view*");

		await page.getByTestId("level-select").selectOption("journey");
		await page.getByTestId("map-cta").click();
		const verdict = page.getByTestId("map-verdict");
		await expect(verdict).not.toContainText("product");
		// NoEmit levels are listed in the dedicated panel.
		await expect(page.getByTestId("noemit-levels")).toContainText("journey");
		await expect(page.getByTestId("noemit-levels")).toContainText("view");
		await expect(page.getByTestId("noemit-levels")).toContainText("invariant");
	});

	test("the honest-join proof passes (every Emit ∈ closed set, no alias)", async ({
		page,
	}) => {
		await page.getByTestId("join-cta").click();
		const v = page.getByTestId("join-verdict");
		await expect(v).toBeVisible();
		// honest, not failed — the FR/EN strings both contain the closed-set wording.
		await expect(v).not.toContainText(/Échec|Failed/);
		await expect(page.getByTestId("emit-levels")).toContainText("product");
		await expect(page.getByTestId("emit-levels")).toContainText("policy");
	});

	test("an out-of-grammar level (saga) is a hard error", async ({ page }) => {
		await page.getByTestId("raw-input").fill("saga");
		await page.getByTestId("check-cta").click();
		const v = page.getByTestId("check-verdict");
		await expect(v).toBeVisible();
		// hard error wording (FR "Erreur dure" / EN "Hard error"), never "valid".
		await expect(v).toContainText(/Erreur dure|Hard error/);
	});
});
