import { expect, test } from "@playwright/test";

/**
 * Playwright e2e — the left sidebar navigation with collapsible sub-menus.
 * mirror record: reflects=front.workbench.left-sidebar-nav, test_kind=e2e,
 *                cert_language=playwright-bdd, liveness=alive, authority=below
 *
 * The Workbench nav is a LEFT sidebar grouped by KRD subsystem (not a top bar): the group
 * holding the current route is open, the active link is highlighted, and groups toggle.
 */

test.describe("workbench left-sidebar navigation", () => {
	test("renders the left sidebar with grouped sub-menus", async ({ page }) => {
		await page.goto("/");
		const sidebar = page.getByTestId("workbench-sidebar");
		await expect(sidebar).toBeVisible();
		// the brand and a few group headers are present
		await expect(sidebar.getByRole("link", { name: "AIDOS" })).toBeVisible();
		await expect(page.getByTestId("navgroup-kernel")).toBeVisible();
		await expect(page.getByTestId("navgroup-mirror")).toBeVisible();
	});

	test("a collapsed group expands on click and reveals its routes", async ({
		page,
	}) => {
		await page.goto("/");
		const kernel = page.getByTestId("navgroup-kernel");
		// kernel is not the active group on "/", so it starts collapsed
		await expect(kernel).toHaveAttribute("aria-expanded", "false");
		await kernel.click();
		await expect(kernel).toHaveAttribute("aria-expanded", "true");
		await expect(
			page.getByTestId("workbench-sidebar").getByRole("link", {
				name: /typer le vrai|truth typing/i,
			}),
		).toBeVisible();
	});

	test("the active route's group is open and its link is highlighted", async ({
		page,
	}) => {
		await page.goto("/sensors");
		// the 'mirror' group contains /sensors → it should be open by default
		await expect(page.getByTestId("navgroup-mirror")).toHaveAttribute(
			"aria-expanded",
			"true",
		);
		const active = page
			.getByTestId("workbench-sidebar")
			.getByRole("link", { name: /^Sensors$/ });
		await expect(active).toHaveAttribute("aria-current", "page");
	});
});
