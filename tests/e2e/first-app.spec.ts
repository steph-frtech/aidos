import { expect, test } from "@playwright/test";

/**
 * Playwright e2e — the hands-on guided first-app builder (/first-app).
 * mirror record: reflects=front.first-app.guided-builder, test_kind=e2e,
 *                cert_language=playwright-bdd, liveness=alive, authority=above
 *
 * Feature: a newcomer builds their first capability by following arrows, idea → button
 *
 *   Scenario: each stage is an action the user performs, guided by an arrow
 *     Given I open "/first-app"
 *     When I click the highlighted button at each of the 8 stages
 *     Then the pipeline fills idea → … → button and the progress advances
 *     And the last click is the real checkout button I just built → the order is placed
 */

test.describe("first-app — the hands-on guided builder", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/first-app");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /première application|first application/i,
			}),
		).toBeVisible({ timeout: 15000 });
	});

	test("the user clicks through all 8 stages, guided by the arrow, to a placed order", async ({
		page,
	}) => {
		const builder = page.getByTestId("first-app-builder");
		await expect(builder).toBeVisible();
		await expect(page.getByTestId("builder-progress")).toHaveText("0 / 8");

		for (let n = 1; n <= 8; n++) {
			// the arrow coach-mark points at the active stage until the build is complete
			await expect(page.getByTestId("builder-arrow")).toBeVisible();
			const action = page.getByTestId(`builder-action-${n}`);
			await expect(action).toBeVisible();
			await action.click();
			await expect(page.getByTestId("builder-progress")).toHaveText(`${n} / 8`);
			await expect(page.getByTestId(`pipeline-node-${n}`)).toHaveAttribute(
				"data-done",
				"true",
			);
		}

		// the built button placed the order; the celebration shows
		await expect(page.getByTestId("order-placed")).toBeVisible();
		await expect(page.getByTestId("builder-complete")).toBeVisible();
		// no arrow once there is nothing left to click
		await expect(page.getByTestId("builder-arrow")).toHaveCount(0);

		// restart clears it
		await page.getByTestId("builder-restart").click();
		await expect(page.getByTestId("builder-progress")).toHaveText("0 / 8");
	});

	test("the real panels are deep-linked, and the slice can be seen green", async ({
		page,
	}) => {
		await expect(page.getByTestId("panel-link-1")).toHaveAttribute(
			"href",
			"/ideas",
		);
		await expect(page.getByTestId("panel-link-5")).toHaveAttribute(
			"href",
			"/changeset",
		);
		await expect(page.getByTestId("panel-link-8")).toHaveAttribute(
			"href",
			"/phase-stable",
		);
		await expect(page.getByTestId("see-cta")).toHaveAttribute(
			"href",
			"/demo-checkout",
		);
	});

	test("is reachable from the home hero", async ({ page }) => {
		await page.goto("/");
		const cta = page.getByTestId("first-app-link");
		await expect(cta).toBeVisible();
		await expect(cta).toHaveAttribute("href", "/first-app");
	});
});
