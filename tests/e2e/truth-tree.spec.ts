import { expect, test } from "@playwright/test";

/**
 * S18 Playwright e2e — the compositional-truth Workbench panel (/truth-tree).
 * mirror record: reflects=S18-composes-aggregate, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench renders the composition tree with per-node aggregate verdicts (KRD §108–§112)
 *   Given the Workbench is running
 *   When I navigate to /truth-tree
 *   Then I see the parent node and its composes-children with weight badges
 *   And with all children green the parent's aggregate shows GREEN
 *   When a load-bearing child (control) is shown RED
 *   Then the parent's aggregate shows RED
 *   And drilling down from the parent names the red child (control)
 *   And a cosmetic child change below threshold leaves the parent GREEN
 */

test.describe("S18 — the compositional-truth tree panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/truth-tree");
		await expect(page.getByTestId("tree-node").first()).toBeVisible({
			timeout: 5000,
		});
	});

	test("the composition tree shows nodes with composes weight badges", async ({
		page,
	}) => {
		// the §114 chain has five nodes (product, journey, view, control, helptext)
		await expect(page.getByTestId("tree-node")).toHaveCount(5);
		// each composes edge carries a weight badge (load-bearing | cosmetic)
		await expect(
			page
				.getByTestId("edge-weight")
				.filter({ hasText: "load-bearing" })
				.first(),
		).toBeVisible();
		await expect(
			page.getByTestId("edge-weight").filter({ hasText: "cosmetic" }).first(),
		).toBeVisible();
	});

	test("with all children green the root aggregate shows GREEN", async ({
		page,
	}) => {
		await page.getByTestId("scenario-all-green").click();
		await expect(page.getByTestId("root-aggregate")).toHaveAttribute(
			"data-verdict",
			"GREEN",
		);
		await expect(page.getByTestId("root-verdict")).toContainText("GREEN");
	});

	test("a red load-bearing child reddens the root aggregate — the done criterion", async ({
		page,
	}) => {
		await page.getByTestId("scenario-red-control").click();
		await expect(page.getByTestId("root-aggregate")).toHaveAttribute(
			"data-verdict",
			"RED",
		);
		await expect(page.getByTestId("root-verdict")).toContainText("RED");
		// the control leaf's own mirror is RED and its aggregate is RED
		const control = page
			.getByTestId("tree-node")
			.filter({ hasText: "checkout-button" });
		await expect(control).toHaveAttribute("data-own", "RED");
		await expect(control).toHaveAttribute("data-aggregate", "RED");
	});

	test("drilling down from the parent names the red child (control)", async ({
		page,
	}) => {
		await page.getByTestId("scenario-red-control").click();
		// the drill-down path descends to the red control leaf (layer checkout-button)
		await expect(
			page.getByTestId("drill-step").filter({ hasText: "checkout-button" }),
		).toBeVisible();
	});

	test("a cosmetic change below threshold leaves the root aggregate GREEN", async ({
		page,
	}) => {
		await page.getByTestId("scenario-cosmetic").click();
		await expect(page.getByTestId("root-aggregate")).toHaveAttribute(
			"data-verdict",
			"GREEN",
		);
	});

	test("the screen carries a tutorial and a worked example", async ({
		page,
	}) => {
		await expect(page.getByTestId("tutorial")).toBeVisible();
		await expect(page.getByTestId("example")).toBeVisible();
	});
});
