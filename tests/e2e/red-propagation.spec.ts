import { expect, test } from "@playwright/test";

/**
 * S19 Playwright e2e — the weighted red-propagation Workbench panel (/red-propagation).
 * mirror record: reflects=S19-weighted-propagation, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench renders the weighted composition + fire + admission tables (KRD §112, §114)
 *   Given the Workbench is running
 *   When I navigate to /red-propagation
 *   Then I see view: cart with activation_threshold 1 and its three weighted controls
 *   And the help-link edge is cosmetic and the checkout-button edge is load-bearing
 *   And the fire table shows the cosmetic (help-link) change row GREEN (the done criterion)
 *   And the load-bearing (checkout-button) change row RED
 *   And the critical-without-evidence admission row is rejected with CRITICAL_WEIGHT_WITHOUT_EVIDENCE
 *   And the critical-with-evidence admission row is accepted
 */

test.describe("S19 — the weighted red-propagation panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/red-propagation");
		await expect(page.getByTestId("cart-parent")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the tree names view cart with threshold 1 and the weighted controls", async ({
		page,
	}) => {
		const parent = page.getByTestId("cart-parent");
		await expect(parent).toHaveAttribute("data-threshold", "1");
		await expect(parent).toContainText("cart");

		const helpLink = page.locator(
			'[data-testid="composes-edge"][data-child="help-link"]',
		);
		await expect(helpLink).toBeVisible();
		await expect(helpLink).toHaveAttribute("data-weight", "cosmetic");
		await expect(
			page.locator(
				'[data-testid="composes-edge"][data-child="checkout-button"]',
			),
		).toHaveAttribute("data-weight", "load-bearing");
	});

	test("the cosmetic (help-link) change row is GREEN — the done criterion", async ({
		page,
	}) => {
		await expect(
			page.getByTestId("fire-row").filter({ hasText: "help-link" }),
		).toHaveAttribute("data-verdict", "GREEN");
	});

	test("the load-bearing (checkout-button) change row is RED", async ({
		page,
	}) => {
		await expect(
			page.getByTestId("fire-row").filter({ hasText: "checkout-button" }),
		).toHaveAttribute("data-verdict", "RED");
	});

	test("a critical weight without evidence is rejected with the actionable code", async ({
		page,
	}) => {
		const row = page.locator(
			'[data-testid="admission-row"][data-row="critical-no-evidence"]',
		);
		await expect(row).toHaveAttribute("data-result", "rejected");
		await expect(row).toHaveAttribute(
			"data-code",
			"CRITICAL_WEIGHT_WITHOUT_EVIDENCE",
		);
		await expect(
			row
				.getByTestId("how-to-fix")
				.filter({ hasText: "attach_incident_evidence" }),
		).toBeVisible();
	});

	test("a critical weight with evidence is accepted", async ({ page }) => {
		const row = page.locator(
			'[data-testid="admission-row"][data-row="critical-with-evidence"]',
		);
		await expect(row).toHaveAttribute("data-result", "accepted");
		await expect(row).toContainText("INC-2026-014");
	});

	test("the screen carries a tutorial and a worked example", async ({
		page,
	}) => {
		await expect(page.getByTestId("tutorial")).toBeVisible();
		await expect(page.getByTestId("example")).toBeVisible();
	});
});
