import { expect, test } from "@playwright/test";

/**
 * S21 Playwright e2e — the SemanticDiff Workbench panel (/semantic-diff).
 * mirror record: reflects=S21-semanticdiff, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench classifies a proposed kernel change in human language (KRD §44.1)
 *   Given the Workbench is running
 *   When I navigate to /semantic-diff
 *   And I classify the incompatible enabled_when pair (checkout-button)
 *   Then I see the change_type OVERRIDE (the done criterion — a revoked promise)
 *   When I classify the widened-scope pair (refund-policy)
 *   Then I see the change_type RESCOPE, NOT override (the done criterion — a scope move)
 *   When I classify the cosmetic→load-bearing pair (help-link)
 *   Then I see the change_type REWEIGHT (the done criterion — a weight re-qualification)
 *   And each result is rendered in human language with the referenced blast_radius/authority/red_wave
 */

test.describe("S21 — the SemanticDiff panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/semantic-diff");
		await expect(page.getByTestId("semantic-diff-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the incompatible enabled_when pair classifies as override (the done criterion)", async ({
		page,
	}) => {
		await page.getByTestId("classify-checkout-button").click();
		const result = page.getByTestId("diff-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-change-type", "override");
		await expect(page.getByTestId("change-type-badge")).toContainText(
			"override",
		);
		// rendered in human language (not a YAML patch) with the references.
		await expect(page.getByTestId("reading")).toContainText("enabled_when");
		await expect(result).toContainText("UX + Product");
	});

	test("the widened-scope pair classifies as rescope, NOT override (the done criterion)", async ({
		page,
	}) => {
		await page.getByTestId("classify-refund-policy").click();
		const result = page.getByTestId("diff-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-change-type", "rescope");
		await expect(page.getByTestId("change-type-badge")).toContainText("rescope");
		await expect(page.getByTestId("change-type-badge")).not.toContainText(
			"override",
		);
		await expect(page.getByTestId("reading")).toContainText("scope");
	});

	test("the cosmetic→load-bearing pair classifies as reweight (the done criterion)", async ({
		page,
	}) => {
		await page.getByTestId("classify-help-link").click();
		const result = page.getByTestId("diff-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-change-type", "reweight");
		await expect(page.getByTestId("change-type-badge")).toContainText(
			"reweight",
		);
		await expect(page.getByTestId("reading")).toContainText("load-bearing");
	});

	test("the panel is action-capable — the classification runs from the screen, awaiting before", async ({
		page,
	}) => {
		// before any action, the panel awaits a pick (no result yet).
		await expect(page.getByTestId("awaiting")).toBeVisible();
		await expect(page.getByTestId("diff-result")).toHaveCount(0);
		// the select is an alternate executable control.
		await page.getByTestId("example-select").selectOption("help-link");
		await expect(page.getByTestId("diff-result")).toBeVisible();
	});
});
