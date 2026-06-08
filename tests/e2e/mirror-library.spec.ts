import { expect, test } from "@playwright/test";

/**
 * S70 Playwright e2e — the « librairie de miroirs par projet » Workbench panel.
 * mirror record: reflects=S70-mirror-library, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /mirror-library route is action-capable (ui-completeness law, CLAUDE.md §7): the control
 * is reachable AND executable from the screen, bound to a Server Action running the REAL pure engine
 * (lib/mirror-library, the TS twin of back/kernel/mirror/library). The done-criterion of S70:
 *   - fault-injection — the PROJECT-SCOPED monster detector fires (the monstered app goes red);
 *   - a sibling app stays green (scope is not cosmetic — it changes the verdict);
 *   - the user's mirrors are listed BY APP with their liveness.
 *
 * THE WALL (CLAUDE.md §2): the screen only READS a projection and computes a verdict — it writes no
 * truth. The detector is a pure function (never an LLM).
 */

test.describe("S70 — Mirror library by project", () => {
	test("the route renders the panel with the run control", async ({ page }) => {
		await page.goto("/mirror-library");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Librairie de miroirs par projet|Mirror library by project/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("library-submit")).toBeVisible();
		await expect(page.getByTestId("library-project")).toBeVisible();
	});

	test("fault-injection — the project-scoped monster detector fires for the monstered app", async ({
		page,
	}) => {
		await page.goto("/mirror-library");
		await page.getByTestId("library-project").selectOption("app-blog");
		await page.getByTestId("library-submit").click();

		const result = page.getByTestId("library-result");
		await expect(result).toHaveAttribute("data-monster", "true");
		await expect(result).toHaveAttribute("data-verdict", "RED_MONSTER");
		await expect(result).toHaveAttribute("data-project", "app-blog");

		// both injected monsters are reported within the project's scope.
		const monsters = page.getByTestId("monster-list");
		await expect(
			monsters.locator('[data-reason="no_truth_without_mirror"]'),
		).toHaveCount(1);
		await expect(
			monsters.locator('[data-reason="no_orphan_mirror"]'),
		).toHaveCount(1);
	});

	test("scope isolation — a sibling app stays green (scope changes the verdict)", async ({
		page,
	}) => {
		await page.goto("/mirror-library");
		await page.getByTestId("library-project").selectOption("app-shop");
		await page.getByTestId("library-submit").click();

		const result = page.getByTestId("library-result");
		await expect(result).toHaveAttribute("data-monster", "false");
		await expect(result).toHaveAttribute("data-verdict", "COMPLETE");
	});

	test("the user's mirrors are listed BY APP with their liveness", async ({
		page,
	}) => {
		await page.goto("/mirror-library");
		await page.getByTestId("library-project").selectOption("app-shop");
		await page.getByTestId("library-submit").click();

		await expect(page.getByTestId("apps")).toBeVisible();
		const shopCard = page.locator(
			'[data-testid="app-card"][data-project="app-shop"]',
		);
		await expect(shopCard).toBeVisible();
		// app-shop owns two living mirrors.
		await expect(shopCard.locator('[data-liveness="alive"]')).toHaveCount(2);
	});
});
