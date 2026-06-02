import { expect, test } from "@playwright/test";

/**
 * S10 Playwright e2e — the Operation DSL Workbench panel (/operation).
 * mirror record: reflects=kernel.operation, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Scenario: The Workbench renders the createOrder pipeline and the fixture trace
 *   Given the Workbench is running
 *   When I navigate to /operation
 *   Then I see the six ordered step chips validate → authorize → read → mutate → mutate → return
 *   And I see the fixture event trace OrderCreated then CartCleared
 *   And the createOrder/happy fixture badge reads PASS
 */

test.describe("S10 — the Operation DSL panel", () => {
	test("renders the createOrder six-step pipeline in order", async ({
		page,
	}) => {
		await page.goto("/operation");
		const anchor = page.getByTestId("operation-anchor");
		await expect(anchor).toBeVisible({ timeout: 5000 });
		await expect(anchor).toContainText("createOrder");
		await expect(anchor).toContainText("CreateOrderInput");

		// the six ordered chips, in pipeline order
		const wantKinds = [
			"validate",
			"authorize",
			"read",
			"mutate",
			"mutate",
			"return",
		];
		for (let i = 0; i < wantKinds.length; i++) {
			const chip = page.getByTestId(`operation-chip-${i}`);
			await expect(chip).toBeVisible();
			await expect(chip).toContainText(wantKinds[i]);
		}
		// the authorize chip names the canPlaceOrder policy (delegation is visible)
		await expect(page.getByTestId("operation-chip-1")).toContainText(
			"canPlaceOrder",
		);
	});

	test("shows the fixture event trace OrderCreated then CartCleared", async ({
		page,
	}) => {
		await page.goto("/operation");
		const events = page.getByTestId("operation-events");
		await expect(events).toBeVisible({ timeout: 5000 });
		await expect(page.getByTestId("operation-event-0")).toHaveText(
			"OrderCreated",
		);
		await expect(page.getByTestId("operation-event-1")).toHaveText(
			"CartCleared",
		);
	});

	test("the createOrder/happy fixture badge reads PASS", async ({ page }) => {
		await page.goto("/operation");
		const badge = page.getByTestId("operation-fixture-badge");
		await expect(badge).toBeVisible({ timeout: 5000 });
		await expect(badge).toHaveText("PASS");
	});

	test("the return ref shows status pending and total 15", async ({ page }) => {
		await page.goto("/operation");
		const ret = page.getByTestId("operation-return");
		await expect(ret).toBeVisible({ timeout: 5000 });
		await expect(ret).toContainText("pending");
		await expect(ret).toContainText("15");
	});

	test("lists the six verbs", async ({ page }) => {
		await page.goto("/operation");
		const verbs = page.getByTestId("operation-verbs");
		await expect(verbs).toBeVisible({ timeout: 5000 });
		for (const v of [
			"validate",
			"authorize",
			"read",
			"mutate",
			"branch",
			"return",
		]) {
			await expect(verbs.getByText(v, { exact: true }).first()).toBeVisible();
		}
	});

	test("page heading is visible", async ({ page }) => {
		await page.goto("/operation");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	});
});
