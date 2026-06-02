import { expect, test } from "@playwright/test";

/**
 * S09 Playwright e2e — the Policy DSL Workbench panel (/policy).
 * mirror record: reflects=kernel.policy, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Scenario: The Workbench renders the canPlaceOrder rule tree and its ALLOW/DENY decision
 *   Given the Workbench is running
 *   When I navigate to /policy
 *   Then I see the canPlaceOrder rule tree with its three named leaves and the ALLOW effect
 *   And I see the above-the-line authority badge and the content-address id
 *   And an authed user with a matching non-empty cart evaluates to ALLOW
 *   And a missing-auth / empty-cart context evaluates to DENY
 */

test.describe("S09 — the Policy DSL panel", () => {
	test("renders the canPlaceOrder rule tree with its three leaves and ALLOW effect", async ({
		page,
	}) => {
		await page.goto("/policy");
		const anchor = page.getByTestId("policy-anchor");
		await expect(anchor).toBeVisible({ timeout: 5000 });
		await expect(anchor).toContainText("canPlaceOrder");
		await expect(anchor).toContainText("OPERATION createOrder");

		const tree = page.getByTestId("policy-rule-tree");
		await expect(tree).toBeVisible();
		// the three §93 leaves
		await expect(tree).toContainText("$.auth.user");
		await expect(tree).toContainText("$.cart.userId");
		await expect(tree).toContainText("$.cart.items.length");
		// the combinator + leaf kinds
		await expect(tree.getByText("all", { exact: true }).first()).toBeVisible();
		await expect(
			tree.getByText("exists", { exact: true }).first(),
		).toBeVisible();
	});

	test("shows the above-the-line authority badge and the content-address id", async ({
		page,
	}) => {
		await page.goto("/policy");
		await expect(page.getByTestId("policy-authority")).toBeVisible({
			timeout: 5000,
		});
		const id = page.getByTestId("policy-id");
		await expect(id).toBeVisible();
		// a 64-hex SHA-256 content address
		await expect(id).toHaveText(/^[0-9a-f]{64}$/);
	});

	test("lists the four scopes and the eight rule kinds", async ({ page }) => {
		await page.goto("/policy");
		const scopes = page.getByTestId("policy-scopes");
		await expect(scopes).toBeVisible({ timeout: 5000 });
		for (const s of ["RESOURCE", "OPERATION", "ENTITY", "FIELD"]) {
			await expect(scopes.getByText(s, { exact: true })).toBeVisible();
		}
		const kinds = page.getByTestId("policy-kinds");
		for (const k of ["all", "any", "not", "exists", "matches"]) {
			await expect(kinds.getByText(k, { exact: true }).first()).toBeVisible();
		}
	});

	test("evaluates ALLOW for an authed user with a matching non-empty cart", async ({
		page,
	}) => {
		await page.goto("/policy");
		const dec = page.getByTestId("policy-decision-allow-authed-matching-cart");
		await expect(dec).toBeVisible({ timeout: 5000 });
		await expect(dec).toHaveText("ALLOW");
	});

	test("evaluates DENY for a missing-auth context", async ({ page }) => {
		await page.goto("/policy");
		const dec = page.getByTestId("policy-decision-deny-no-auth");
		await expect(dec).toBeVisible({ timeout: 5000 });
		await expect(dec).toHaveText("DENY");
	});

	test("evaluates DENY for an empty cart", async ({ page }) => {
		await page.goto("/policy");
		const dec = page.getByTestId("policy-decision-deny-empty-cart");
		await expect(dec).toBeVisible({ timeout: 5000 });
		await expect(dec).toHaveText("DENY");
	});

	test("page heading is visible", async ({ page }) => {
		await page.goto("/policy");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	});
});
