import { expect, test } from "@playwright/test";

/**
 * S46 Playwright e2e — the demo-checkout Workbench panel (/demo-checkout), the BUTTON
 * driver. mirror record: reflects=front.demo-checkout.place-order, test_kind=gherkin,
 *               cert_language=playwright-bdd, liveness=alive, authority=above
 *
 * Feature: the demo cart's checkout button places an order (the emitted projection, end to end)
 *
 *   Scenario: the cart renders and the checkout button respects its control-spec fixture
 *     Given the demo-checkout slice is on a green stable phase
 *     When I open "/demo-checkout"
 *     Then the cart shows 2 line items                 # the emitted Next view (S38)
 *     And the "checkout" button is visible and enabled # matches EvalState(control, given) (S11)
 *
 *   Scenario: clicking checkout creates the order
 *     Given I am on "/demo-checkout" with a cart of 2 line items
 *     When I click the "checkout" button
 *     Then createOrder is dispatched                   # Plan(action, click) (S11), the bound op
 *     And the placed order is shown with its 2 line items # the persisted Order, projected back
 */

test.describe("S46 — the demo-checkout panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/demo-checkout");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /démo checkout|demo checkout/i,
			}),
		).toBeVisible({ timeout: 10000 });
	});

	test("the loop pipeline renders every stage", async ({ page }) => {
		await expect(page.getByTestId("loop-pipeline")).toBeVisible();
		for (const ev of [
			"IdeaIntaken",
			"GoalOpened",
			"ChangeSetApplied",
			"MirrorLive",
			"ArtifactsEmitted",
			"OrderPlaced",
			"PhaseSealed",
		]) {
			await expect(page.getByTestId(`stage-${ev}`)).toBeVisible();
		}
	});

	test("the cart shows 2 line items and the checkout button is visible and enabled", async ({
		page,
	}) => {
		await expect(page.getByTestId("seed-idea")).toContainText(
			"places an order from their cart",
		);
		const lines = page.getByTestId("cart-line");
		await expect(lines).toHaveCount(2);

		const button = page.getByTestId("checkout-button");
		await expect(button).toBeVisible();
		await expect(button).toBeEnabled();
	});

	test("clicking checkout creates the order with its 2 line items", async ({
		page,
	}) => {
		// No order result before the click (the button drives the op).
		await expect(page.getByTestId("order-result")).toHaveCount(0);

		await page.getByTestId("checkout-button").click();

		// The placed order is shown, green/stable, with EXACTLY the 2 cart line items.
		const result = page.getByTestId("order-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-result", "green");
		await expect(page.getByTestId("stable-badge")).toBeVisible();

		const orderLines = page.getByTestId("order-line");
		await expect(orderLines).toHaveCount(2);
		await expect(orderLines.first()).toContainText("widget");
	});
});
