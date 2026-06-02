import { expect, test } from "@playwright/test";

/**
 * S50 Playwright e2e — the TemporalInvariant Workbench panel (/temporal-invariants).
 * mirror record: reflects=S50-temporal-invariant, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench renders the checkout-confirm-within-5m temporal invariant + the
 *   tolerance band + the evaluation table (KRD §49.3)
 *   Given the Workbench is running
 *   When I navigate to /temporal-invariants
 *   Then the invariant card names clock: system, tolerance: 10s, mirror: statechart and the property
 *   And the green-band marker shows 5m ± 10s
 *   And the 4m58s and 5m04s rows are HELD (the 5m04s row marked inside-tolerance — not a flake)
 *   And the 5m20s row is VIOLATED with TEMPORAL_INVARIANT_VIOLATED shown red
 *   And the out-of-order row is VIOLATED
 *   And the propose control opens a ChangeSet proposal stub (the wall — never a direct truth-write)
 *   And the read-only re-evaluate control re-runs the pure evaluator below the line
 */

test.describe("S50 — the TemporalInvariant panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/temporal-invariants");
		await expect(page.getByTestId("temporal-card")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the invariant card names clock, tolerance, mirror form and the property", async ({
		page,
	}) => {
		await expect(page.getByTestId("temporal-clock")).toContainText("system");
		await expect(page.getByTestId("temporal-tolerance")).toContainText("10s");
		await expect(page.getByTestId("temporal-mirror")).toContainText(
			"statechart",
		);
		await expect(page.getByTestId("temporal-property")).toContainText(
			"payment_captured implies order_confirmed within 5 minutes",
		);
	});

	test("the green-band marker shows 5m ± 10s", async ({ page }) => {
		await expect(page.getByTestId("band-value")).toContainText("5m ± 10s");
	});

	test("the 4m58s and 5m04s rows are HELD (5m04s inside tolerance — not a flake)", async ({
		page,
	}) => {
		await expect(page.getByTestId("eval-row-inside-bound")).toHaveAttribute(
			"data-verdict",
			"held",
		);
		await expect(page.getByTestId("eval-row-inside-tolerance")).toHaveAttribute(
			"data-verdict",
			"held",
		);
		await expect(
			page.getByTestId("inside-tolerance-inside-tolerance"),
		).toBeVisible();
	});

	test("the 5m20s row is VIOLATED with TEMPORAL_INVARIANT_VIOLATED (THE done case)", async ({
		page,
	}) => {
		await expect(page.getByTestId("eval-row-over-tolerance")).toHaveAttribute(
			"data-verdict",
			"violated",
		);
		await expect(page.getByTestId("block-code-over-tolerance")).toContainText(
			"TEMPORAL_INVARIANT_VIOLATED",
		);
	});

	test("the out-of-order row is VIOLATED (ordre des événements)", async ({
		page,
	}) => {
		await expect(page.getByTestId("eval-row-out-of-order")).toHaveAttribute(
			"data-verdict",
			"violated",
		);
		await expect(page.getByTestId("block-code-out-of-order")).toContainText(
			"TEMPORAL_INVARIANT_VIOLATED",
		);
	});

	test("the propose control opens a ChangeSet proposal stub (the wall)", async ({
		page,
	}) => {
		await page.getByTestId("propose-changeset").click();
		await expect(page.getByTestId("propose-stub")).toBeVisible();
	});

	test("the read-only re-evaluate control re-runs the pure evaluator", async ({
		page,
	}) => {
		await page.getByTestId("reevaluate").click();
		await expect(page.getByTestId("reevaluate-done")).toBeVisible();
	});
});
