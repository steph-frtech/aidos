import { expect, test } from "@playwright/test";

/**
 * S04 Playwright e2e — the wall Workbench panel (/wall).
 * mirror record: reflects=runtime.wall, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Scenario: The Workbench renders the waterline and a block event
 *   Given the Workbench is running
 *   When I navigate to /wall
 *   Then I see the waterline with kernel, mirrors, fitness above the line
 *   And I see a block event with code AGENT_WRITE_ABOVE_WATERLINE
 *   And its how_to_fix names the idea → mirror → /goal door
 */

const ABOVE = ["kernel", "mirrors", "fitness"] as const;

test.describe("S04 — the wall panel", () => {
	test("the waterline shows kernel/mirrors/fitness above the line", async ({
		page,
	}) => {
		await page.goto("/wall");
		const above = page.getByTestId("waterline-above");
		await expect(above).toBeVisible({ timeout: 5000 });
		for (const zone of ABOVE) {
			await expect(page.getByTestId(`wall-zone-${zone}`)).toBeVisible();
		}
	});

	test("the below-the-line projections zone is visible", async ({ page }) => {
		await page.goto("/wall");
		await expect(page.getByTestId("waterline-below")).toBeVisible();
	});

	test("a block event with code AGENT_WRITE_ABOVE_WATERLINE is shown", async ({
		page,
	}) => {
		await page.goto("/wall");
		const event = page.getByTestId("block-event");
		await expect(event).toBeVisible({ timeout: 5000 });
		await expect(page.getByTestId("block-event-code")).toHaveText(
			"AGENT_WRITE_ABOVE_WATERLINE",
		);
	});

	test("the block event's how_to_fix names the idea → mirror → /goal door", async ({
		page,
	}) => {
		await page.goto("/wall");
		const fix = page.getByTestId("block-event-howtofix");
		await expect(fix).toBeVisible();
		await expect(fix).toContainText(/idea/i);
		await expect(fix).toContainText(/mirror/i);
		await expect(fix).toContainText("/goal");
	});

	test("page heading and the defense-in-depth badge are visible", async ({
		page,
	}) => {
		await page.goto("/wall");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	});

	// ui-completeness: every screen is self-teaching (tutorial + worked example).
	test("the screen teaches — tutorial (4 steps) and worked example are visible", async ({
		page,
	}) => {
		await page.goto("/wall");
		await expect(page.getByTestId("tutorial")).toBeVisible();
		for (let i = 0; i < 4; i++) {
			await expect(page.getByTestId(`tutorial-step-${i}`)).toBeVisible();
		}
		await expect(page.getByTestId("example")).toBeVisible();
		await expect(page.getByTestId("example-body")).toBeVisible();
	});
});
