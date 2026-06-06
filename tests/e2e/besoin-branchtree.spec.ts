import { expect, test } from "@playwright/test";

/**
 * EL12 Playwright e2e — the BranchTree decision-tree + altitude-classification Workbench panel
 * (/compound-besoin-branchtree).
 * mirror record: reflects=back/runtime/besoin/branchtree.go (BranchTree(level, body) → []OpenBranch;
 *               IsResolved = all branches closed ∧ anti-vacuity satisfied, COMPUTED never declared;
 *               ClassifyAltitude / IsOffAltitude = a schema-mismatch — an entity attributes body
 *               submitted at product FAILS the product schema, never an LLM opinion),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness): every control EXECUTES the pure twin from the
 * screen — "Build the tree" runs branchTree + isResolved, "Classify altitude" runs classifyAltitude
 * + isOffAltitude.
 *
 * Scenario A: a complete product body closes every branch → resolved=true.
 * Scenario B: an incomplete (missing scenarios) product leaves the required-field branch open.
 * Scenario C: a parsable-but-non-constraining product leaves the anti-vacuity branch open.
 * Scenario D: an entity `attributes` body submitted AT product is OFF-altitude → classified entity.
 */

test.describe("EL12 — BranchTree (the deterministic decision tree)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin-branchtree");
		await expect(page.getByTestId("case-select")).toBeVisible({ timeout: 5000 });
	});

	test("a complete product body closes every branch (resolved)", async ({ page }) => {
		await page.getByTestId("case-select").selectOption("productComplete");
		await page.getByTestId("tree-cta").click();
		await expect(page.getByTestId("tree")).toBeVisible();
		await expect(page.getByTestId("resolved")).toHaveAttribute("data-resolved", "true");
		await expect(page.getByTestId("anti-vacuity")).toHaveAttribute("data-satisfied", "true");
	});

	test("an incomplete product leaves the scenarios required-field branch open", async ({
		page,
	}) => {
		await page.getByTestId("case-select").selectOption("productMissing");
		await page.getByTestId("tree-cta").click();
		await expect(page.getByTestId("resolved")).toHaveAttribute("data-resolved", "false");
		await expect(
			page.getByTestId("branch-required_field-scenarios"),
		).toHaveAttribute("data-closed", "false");
	});

	test("a parsable-but-non-constraining product leaves the anti-vacuity branch open", async ({
		page,
	}) => {
		await page.getByTestId("case-select").selectOption("productVacant");
		await page.getByTestId("tree-cta").click();
		await expect(page.getByTestId("resolved")).toHaveAttribute("data-resolved", "false");
		await expect(page.getByTestId("anti-vacuity")).toHaveAttribute("data-satisfied", "false");
		await expect(
			page.getByTestId("branch-anti_vacuity-option_space"),
		).toHaveAttribute("data-closed", "false");
	});

	test("an entity body submitted at product is off-altitude → classified entity", async ({
		page,
	}) => {
		await page.getByTestId("case-select").selectOption("entityAtProduct");
		await page.getByTestId("altitude-cta").click();
		await expect(page.getByTestId("altitude")).toBeVisible();
		await expect(page.getByTestId("off-altitude")).toHaveAttribute("data-off", "true");
		await expect(page.getByTestId("altitude-best")).toContainText(/entity/);
	});
});
