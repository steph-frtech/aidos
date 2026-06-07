import { expect, test } from "@playwright/test";

/**
 * App Builder HUB Playwright e2e — the /app-builder journey index (ADR 0010 + 0011).
 * The hub surfaces EVERYTHING from one screen ("tout se fait par écran"): the five
 * phases (declare need → prove → emit → provision/deploy → SaaS product), LIVE items
 * deep-linking to their route, PLANNED items carrying their roadmap ref (DP/Sxx).
 * Read-only; the wall is untouched.
 *
 * Scenario A: the hub renders all five journey sections.
 * Scenario B: a LIVE capability links to its real route and navigates.
 * Scenario C: PLANNED sections (deploy/product) are present with their refs.
 * Scenario D: the hub is reachable from the left nav.
 */

test.describe("App Builder hub — /app-builder", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/app-builder");
	});

	test("renders all five journey sections", async ({ page }) => {
		for (const key of ["besoin", "prove", "emit", "deploy", "product"]) {
			await expect(page.getByTestId(`builder-section-${key}`)).toBeVisible({
				timeout: 5000,
			});
		}
	});

	test("a live capability deep-links to its route", async ({ page }) => {
		const besoin = page.getByTestId("builder-section-besoin");
		await besoin.getByRole("link", { name: /intake/i }).first().click();
		await expect(page).toHaveURL(/\/besoin-intake$/);
	});

	test("planned deploy section shows roadmap refs", async ({ page }) => {
		const deploy = page.getByTestId("builder-section-deploy");
		await expect(deploy).toBeVisible();
		await expect(deploy).toContainText(/DP/);
	});

	test("is reachable from the left nav", async ({ page }) => {
		await page.goto("/");
		await page
			.getByRole("link", { name: "App Builder", exact: true })
			.first()
			.click();
		await expect(page).toHaveURL(/\/app-builder$/);
		await expect(
			page.getByTestId("builder-section-besoin"),
		).toBeVisible();
	});
});
