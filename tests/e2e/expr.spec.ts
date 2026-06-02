import { expect, test } from "@playwright/test";

/**
 * S08 Playwright e2e — the Expr DSL Workbench panel (/expr).
 * mirror record: reflects=kernel.expr, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Scenario: The Workbench renders the typed Expr AST and its evaluated visible_when
 *   Given the Workbench is running
 *   When I navigate to /expr
 *   Then I see the five node kinds (lit/ref/call/obj/arr) and the closed catalogue
 *   And I see the visible_when AST $.cart.items.length > 0 as a typed node tree
 *   And its evaluated result is true for the non-empty cart and false for the empty cart
 *   And a non-catalogue function ("exec") is shown as rejected, never evaluated
 */

test.describe("S08 — the Expr DSL panel", () => {
	test("lists the five node kinds and the closed catalogue", async ({
		page,
	}) => {
		await page.goto("/expr");
		const kinds = page.getByTestId("expr-kinds");
		await expect(kinds).toBeVisible({ timeout: 5000 });
		for (const k of ["lit", "ref", "call", "obj", "arr"]) {
			await expect(kinds.getByText(k, { exact: true })).toBeVisible();
		}
		const cat = page.getByTestId("expr-catalogue");
		await expect(cat).toContainText("lowercase");
		await expect(cat).toContainText("concat");
	});

	test("renders the visible_when AST as a typed node tree", async ({
		page,
	}) => {
		await page.goto("/expr");
		const tree = page.getByTestId("expr-tree-visible_when-nonempty");
		await expect(tree).toBeVisible({ timeout: 5000 });
		// the typed tree shows the call ">" over the ref $.cart.items.length and a lit
		await expect(tree).toContainText("$.cart.items.length");
		await expect(tree.getByText("call", { exact: true }).first()).toBeVisible();
		await expect(tree.getByText("ref", { exact: true }).first()).toBeVisible();
	});

	test("evaluates visible_when TRUE for a non-empty cart", async ({ page }) => {
		await page.goto("/expr");
		const result = page.getByTestId("expr-result-visible_when-nonempty");
		await expect(result).toBeVisible({ timeout: 5000 });
		await expect(result).toHaveText("true");
	});

	test("evaluates visible_when FALSE for an empty cart", async ({ page }) => {
		await page.goto("/expr");
		const result = page.getByTestId("expr-result-visible_when-empty");
		await expect(result).toBeVisible({ timeout: 5000 });
		await expect(result).toHaveText("false");
	});

	test("shows a non-catalogue function as rejected, never evaluated", async ({
		page,
	}) => {
		await page.goto("/expr");
		const rejected = page.getByTestId("expr-rejected");
		await expect(rejected).toBeVisible({ timeout: 5000 });
		await expect(rejected).toContainText(/exec/);
		await expect(rejected).toContainText(/closed allow-list/i);
	});

	test("page heading is visible", async ({ page }) => {
		await page.goto("/expr");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	});
});
