import { expect, test } from "@playwright/test";

/**
 * S51 Playwright e2e — the harness-economics Workbench panel (/harness-economics).
 * mirror record: reflects=S51-harness-economics, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench surfaces the declared HarnessCostBudget and the economics verdicts (KRD §66.3)
 *   Given the Workbench is running
 *   When I navigate to /harness-economics
 *   Then the budget card surfaces the five declared caps (e.g. max_ci_minutes: 10)
 *   And the economics table shows the no-value-case over-budget row as over_budget_flagged
 *       with HARNESS_COST_EXCEEDS_BUDGET and a how_to_fix naming open_value_case
 *   And the justified row is over_budget_justified (kept)
 *   And the within-budget row is within_budget
 *   And the ValueCase card names truth: checkout.payment.idempotent, risk_if_broken: high, decision: justified
 *   And there is NO budget-edit affordance and NO delete affordance
 *   And the propose control opens a ChangeSet proposal stub (the wall — never a direct truth-write)
 *   And the read-only re-evaluate control re-runs the pure evaluator below the line
 */

test.describe("S51 — the harness-economics panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/harness-economics");
		await expect(page.getByTestId("budget-card")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the budget card surfaces the five declared caps", async ({ page }) => {
		await expect(page.getByTestId("cap-ci-value")).toContainText("10");
		await expect(page.getByTestId("cap-tokens-value")).toContainText("50000");
		await expect(page.getByTestId("cap-mutation-value")).toContainText("5m");
		await expect(page.getByTestId("cap-review-value")).toContainText("30");
		await expect(page.getByTestId("cap-risk-value")).toContainText("high");
	});

	test("the over-budget no-value-case row is over_budget_flagged with HARNESS_COST_EXCEEDS_BUDGET + open_value_case", async ({
		page,
	}) => {
		const row = page.getByTestId("econ-row-flagged");
		await expect(row).toHaveAttribute("data-verdict", "over_budget_flagged");
		await expect(row.getByTestId("badge-over_budget_flagged")).toBeVisible();
		await expect(row.getByTestId("econ-row-flagged-code")).toContainText(
			"HARNESS_COST_EXCEEDS_BUDGET",
		);
		await expect(row).toContainText("open_value_case");
	});

	test("the justified row is over_budget_justified (kept) and the within row is within_budget", async ({
		page,
	}) => {
		const justified = page.getByTestId("econ-row-justified");
		await expect(justified).toHaveAttribute(
			"data-verdict",
			"over_budget_justified",
		);
		await expect(
			justified.getByTestId("badge-over_budget_justified"),
		).toBeVisible();

		const within = page.getByTestId("econ-row-within");
		await expect(within).toHaveAttribute("data-verdict", "within_budget");
		await expect(within.getByTestId("badge-within_budget")).toBeVisible();
	});

	test("the too_expensive row is still flagged (only justified clears the flag)", async ({
		page,
	}) => {
		const row = page.getByTestId("econ-row-too_expensive");
		await expect(row).toHaveAttribute("data-verdict", "over_budget_flagged");
	});

	test("the ValueCase card names the costly truth, its risk and the justified decision", async ({
		page,
	}) => {
		await expect(page.getByTestId("vc-truth")).toContainText(
			"checkout.payment.idempotent",
		);
		await expect(page.getByTestId("vc-risk")).toContainText("high");
		await expect(page.getByTestId("vc-decision")).toContainText("justified");
	});

	test("there is NO budget-edit affordance and NO delete affordance (the wall)", async ({
		page,
	}) => {
		await expect(
			page.getByRole("button", { name: /modifier|edit|éditer/i }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: /supprimer|delete/i }),
		).toHaveCount(0);
	});

	test("the propose control opens a ChangeSet proposal stub (the wall)", async ({
		page,
	}) => {
		await page.getByTestId("propose-button").click();
		await expect(page.getByTestId("propose-stub")).toBeVisible();
	});

	test("the read-only re-evaluate control re-runs the pure evaluator", async ({
		page,
	}) => {
		await page.getByTestId("re-evaluate-button").click();
		await expect(page.getByTestId("re-evaluate-done")).toBeVisible();
	});
});
