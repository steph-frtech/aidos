import { expect, test } from "@playwright/test";

/**
 * S29 Playwright e2e — the goal-engine Workbench panel (/goal).
 * mirror record: reflects=runtime.goal (OpenGoal: DRAFT ChangeSet + non-empty red set ;
 *               IsClosed: the four-condition non-gameable stop), test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: opening a goal from an idea shows a DRAFT ChangeSet + ≥1 red mirror; the stop is
 *   non-gameable
 *   Given the Workbench is running
 *   When I navigate to /goal and open a goal from the canonical idea
 *   Then a DRAFT ChangeSet badge and at least one red mirror in the red set are shown (the done
 *        criterion visible in the UI), status OPEN
 *   And the stop indicator reads NOT satisfied while any mirror is red
 *   And it flips to satisfied only when the red set is green and prior green is intact
 */

test.describe("S29 — the goal engine panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/goal");
		await expect(page.getByTestId("goal-panel")).toBeVisible({ timeout: 5000 });
	});

	test("opening a goal shows a DRAFT ChangeSet and ≥1 red mirror (the done criterion)", async ({
		page,
	}) => {
		await page.getByTestId("open-goal").click();

		// A DRAFT ChangeSet badge.
		const badge = page.getByTestId("changeset-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveAttribute("data-status", "DRAFT");
		await expect(badge).toContainText("DRAFT");

		// At least one red mirror in the red set.
		const redMirrors = page.getByTestId("red-set-mirror-red");
		await expect(redMirrors.first()).toBeVisible();
		expect(await redMirrors.count()).toBeGreaterThan(0);

		// Status OPEN.
		await expect(page.getByTestId("goal-status")).toHaveAttribute(
			"data-status",
			"OPEN",
		);
	});

	test("the stop reads NOT satisfied while a mirror is red", async ({
		page,
	}) => {
		await page.getByTestId("open-goal").click();
		const verdict = page.getByTestId("stop-verdict");
		await expect(verdict).toBeVisible();
		await expect(verdict).toHaveAttribute("data-satisfied", "false");
		// The red-set→green condition row is failing (✗).
		const conditions = page.getByTestId("stop-condition");
		await expect(conditions.first()).toHaveAttribute("data-ok", "false");
	});

	test("the stop flips to satisfied only when the red set is green and prior green is intact", async ({
		page,
	}) => {
		await page.getByTestId("open-goal").click();
		await expect(page.getByTestId("stop-verdict")).toHaveAttribute(
			"data-satisfied",
			"false",
		);

		// Turn the red set green (and prior green intact, mutation ok, no monster).
		await page.getByTestId("check-stop-green").click();
		await expect(page.getByTestId("stop-verdict")).toHaveAttribute(
			"data-satisfied",
			"true",
		);
		// The mirror is now rendered green.
		await expect(
			page.getByTestId("red-set-mirror-green").first(),
		).toBeVisible();
		// Every stop condition is now satisfied (✓).
		const conditions = page.getByTestId("stop-condition");
		const count = await conditions.count();
		for (let i = 0; i < count; i++) {
			await expect(conditions.nth(i)).toHaveAttribute("data-ok", "true");
		}

		// Flipping back to a red set re-opens the stop (the non-gameable stop tracks the verdict).
		await page.getByTestId("check-stop-red").click();
		await expect(page.getByTestId("stop-verdict")).toHaveAttribute(
			"data-satisfied",
			"false",
		);
	});

	test("the budgets burndown is rendered (the declared secondary guard)", async ({
		page,
	}) => {
		await page.getByTestId("open-goal").click();
		await expect(page.getByTestId("budgets-burndown")).toBeVisible();
	});
});
