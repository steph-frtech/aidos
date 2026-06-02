import { expect, test } from "@playwright/test";

/**
 * Playwright e2e — the guided first-app onboarding tutorial (/first-app).
 * mirror record: reflects=front.first-app.guided-tutorial, test_kind=e2e,
 *                cert_language=playwright-bdd, liveness=alive, authority=above
 *
 * Feature: a newcomer is guided, step by step, from intention to a clickable button
 *
 *   Scenario: the guide renders the eight verticale steps, each deep-linking to its panel
 *     Given I open "/first-app"
 *     Then I see the guided walkthrough with 8 steps
 *     And step 1 deep-links to the ideas store, step 5 to the changesets, step 8 to the stable phase
 *
 *   Scenario: progress is interactive and persists
 *     When I check off a step
 *     Then the progress counter advances
 *     And reloading keeps it checked (localStorage)
 *     And checking all 8 shows the completion banner
 */

test.describe("first-app — the guided onboarding tutorial", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/first-app");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /première application|first application/i,
			}),
		).toBeVisible({ timeout: 15000 });
	});

	test("renders the 8 verticale steps deep-linked to their panels", async ({
		page,
	}) => {
		await expect(page.getByTestId("first-app-guide")).toBeVisible();
		for (let n = 1; n <= 8; n++) {
			await expect(page.getByTestId(`guide-step-${n}`)).toBeVisible();
		}
		// each step deep-links to a real Workbench panel
		await expect(page.getByTestId("step-open-1")).toHaveAttribute(
			"href",
			"/ideas",
		);
		await expect(page.getByTestId("step-open-5")).toHaveAttribute(
			"href",
			"/changeset",
		);
		await expect(page.getByTestId("step-open-8")).toHaveAttribute(
			"href",
			"/phase-stable",
		);
		// the worked example links to the live, green verticale
		await expect(page.getByTestId("see-cta")).toHaveAttribute(
			"href",
			"/demo-checkout",
		);
	});

	test("progress is interactive, persists, and completes", async ({ page }) => {
		await expect(page.getByTestId("guide-progress")).toHaveText("0 / 8");

		await page.getByTestId("step-toggle-1").click();
		await expect(page.getByTestId("guide-progress")).toHaveText("1 / 8");
		await expect(page.getByTestId("guide-step-1")).toHaveAttribute(
			"data-done",
			"true",
		);

		// persists across reload (localStorage)
		await page.reload();
		await expect(page.getByTestId("guide-progress")).toHaveText("1 / 8");

		// complete the loop → the celebration banner appears
		for (let n = 2; n <= 8; n++) {
			await page.getByTestId(`step-toggle-${n}`).click();
		}
		await expect(page.getByTestId("guide-progress")).toHaveText("8 / 8");
		await expect(page.getByTestId("guide-complete")).toBeVisible();

		// reset clears it
		await page.getByTestId("guide-reset").click();
		await expect(page.getByTestId("guide-progress")).toHaveText("0 / 8");
	});

	test("is reachable from the home hero", async ({ page }) => {
		await page.goto("/");
		const cta = page.getByTestId("first-app-link");
		await expect(cta).toBeVisible();
		await expect(cta).toHaveAttribute("href", "/first-app");
	});
});
