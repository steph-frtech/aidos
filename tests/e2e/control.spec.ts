import { expect, test } from "@playwright/test";

/**
 * S11 Playwright e2e — the control-spec + action-spec Workbench panel (/control).
 * mirror record: reflects=kernel.control + kernel.action, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Scenario: The Workbench renders the checkout-button control, its bound action, and
 *   the state fixture
 *   Given the Workbench is running
 *   When I navigate to /control
 *   Then I see the checkout-button control with its triggers → checkout-submit
 *   And I see the checkout-submit action bind → invoke operation createOrder
 *   And the state-fixture table shows visible=false (empty cart), enabled=false
 *       (invalid form), enabled=true (valid form)
 *   And the fixture badge reads PASS
 */

test.describe("S11 — the control & action panel", () => {
	test("renders the checkout-button control with its triggers link", async ({
		page,
	}) => {
		await page.goto("/control");
		const card = page.getByTestId("control-card");
		await expect(card).toBeVisible({ timeout: 5000 });
		await expect(card).toContainText("checkout-button");
		await expect(card).toContainText("$.cart.items.length > 0");
		await expect(card).toContainText("$.form.valid && !$.submitting");
		// triggers → the bound action
		await expect(page.getByTestId("control-triggers")).toContainText(
			"checkout-submit",
		);
	});

	test("the action binds the operation createOrder", async ({ page }) => {
		await page.goto("/control");
		const action = page.getByTestId("action-card");
		await expect(action).toBeVisible({ timeout: 5000 });
		await expect(action).toContainText("checkout-submit");
		// the bind: invoke operation createOrder
		const invoke = page.getByTestId("action-invoke");
		await expect(invoke).toContainText("checkout-submit");
		await expect(invoke).toContainText("createOrder");
	});

	test("the state-fixture table shows the three computed rows", async ({
		page,
	}) => {
		await page.goto("/control");
		const table = page.getByTestId("control-fixture-table");
		await expect(table).toBeVisible({ timeout: 5000 });

		// row 1 — empty cart hides the button (visible=false)
		await expect(
			page.getByTestId("control-visible-empty-cart-hides"),
		).toHaveText("false");

		// row 2 — filled cart, invalid form → visible but disabled (enabled=false)
		await expect(
			page.getByTestId("control-visible-filled-cart-invalid-form-disabled"),
		).toHaveText("true");
		await expect(
			page.getByTestId("control-enabled-filled-cart-invalid-form-disabled"),
		).toHaveText("false");

		// row 3 — filled cart, valid form → enabled (enabled=true)
		await expect(
			page.getByTestId("control-enabled-filled-cart-valid-form-enabled"),
		).toHaveText("true");
	});

	test("the fixture badge reads PASS", async ({ page }) => {
		await page.goto("/control");
		const badge = page.getByTestId("control-fixture-badge");
		await expect(badge).toBeVisible({ timeout: 5000 });
		await expect(badge).toHaveText("PASS");
	});

	test("lists the on_success and on_error effects", async ({ page }) => {
		await page.goto("/control");
		const action = page.getByTestId("action-card");
		await expect(action).toContainText("navigate");
		await expect(action).toContainText("toast");
		await expect(action).toContainText("toast.error");
	});

	test("page heading is visible", async ({ page }) => {
		await page.goto("/control");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	});
});
