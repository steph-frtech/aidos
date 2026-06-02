import { expect, test } from "@playwright/test";

/**
 * S49 Playwright e2e — the SagaInvariant Workbench panel (/sagas).
 * mirror record: reflects=S49-saga-invariant, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench renders the checkout-payment-shipping cross-cell saga + the outcome
 *   table (a failed leg triggers compensation) + the CoherenceTest verdict (KRD §49.2)
 *   Given the Workbench is running
 *   When I navigate to /sagas
 *   Then the saga card names scope federation_policy, the cross-cell property, and lists the
 *        three participants order / payment / shipping
 *   And the outcome table shows the happy-path row satisfied
 *   And the failed-leg row satisfied with refundPayment / cancelOrder / compensation_executed
 *        visible (a failed leg triggers compensation)
 *   And the dangling-money row violated with SAGA_INVARIANT_VIOLATED shown red
 *   And the CoherenceTest card shows incompatible with INCOMPATIBLE_CONTRACT_VERSION
 *   And the propose control opens a ChangeSet proposal stub (the wall — never a direct truth-write)
 */

test.describe("S49 — the SagaInvariant panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/sagas");
		await expect(page.getByTestId("saga-card")).toBeVisible({ timeout: 5000 });
	});

	test("the saga card names scope, the cross-cell property and the three participants", async ({
		page,
	}) => {
		await expect(page.getByTestId("saga-scope")).toContainText(
			"federation_policy",
		);
		await expect(page.getByTestId("saga-property")).toContainText(
			"payment_captured implies (order_confirmed or compensation_executed)",
		);
		for (const cell of ["order", "payment", "shipping"]) {
			await expect(page.getByTestId(`participant-${cell}`)).toBeVisible();
		}
	});

	test("the happy-path row is satisfied", async ({ page }) => {
		await expect(page.getByTestId("outcome-row-happy")).toHaveAttribute(
			"data-outcome",
			"satisfied",
		);
	});

	test("a failed leg triggers compensation — the row is satisfied with the compensation events visible", async ({
		page,
	}) => {
		const row = page.getByTestId("outcome-row-compensated");
		await expect(row).toHaveAttribute("data-outcome", "satisfied");
		const events = page.getByTestId("compensation-events-compensated");
		await expect(events).toContainText("refundPayment");
		await expect(events).toContainText("cancelOrder");
		await expect(events).toContainText("compensation_executed");
	});

	test("the dangling-money row is violated with SAGA_INVARIANT_VIOLATED", async ({
		page,
	}) => {
		await expect(page.getByTestId("outcome-row-dangling")).toHaveAttribute(
			"data-outcome",
			"violated",
		);
		await expect(page.getByTestId("block-code-dangling")).toContainText(
			"SAGA_INVARIANT_VIOLATED",
		);
	});

	test("the CoherenceTest card shows incompatible with INCOMPATIBLE_CONTRACT_VERSION", async ({
		page,
	}) => {
		await expect(page.getByTestId("coherence-verdict")).toHaveAttribute(
			"data-coherence",
			"incompatible",
		);
		await expect(page.getByTestId("coherence-code")).toContainText(
			"INCOMPATIBLE_CONTRACT_VERSION",
		);
	});

	test("the propose control opens a ChangeSet proposal stub (the wall)", async ({
		page,
	}) => {
		await page.getByTestId("propose-changeset").click();
		await expect(page.getByTestId("propose-stub")).toBeVisible();
	});
});
