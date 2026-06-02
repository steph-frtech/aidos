import { expect, test } from "@playwright/test";

/**
 * S05 Playwright e2e — the cliquet (ratchet) Workbench panel (/mirrors).
 * mirror record: reflects=mirror.ci-ratchet, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * The ratchet replays every materialized mirror and rejects a merge the moment a
 * baseline-green mirror turns red (RED_REGRESSION). The /mirrors panel is
 * action-capable (ui-completeness): the replay-all → merge verdict capability is
 * reachable AND executable from the screen, not just displayed.
 *
 * Scenario A — a candidate that reddens a prior mirror is rejected
 *   Given the Workbench /mirrors panel with every mirror green at the baseline
 *   When I run the cliquet over the reddened candidate
 *   Then the regressed mirror (S04-the-wall) renders red
 *   And the merge verdict reads REJECTED — RED_REGRESSION
 *
 * Scenario B — an all-green candidate is allowed
 *   When I run the cliquet over the all-green candidate
 *   Then the merge verdict reads ALLOWED
 */

test.describe("S05 — the cliquet (ratchet) panel", () => {
	test("the mirror inventory renders with the baseline-green column", async ({
		page,
	}) => {
		await page.goto("/mirrors");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
		const runner = page.getByTestId("ratchet-runner");
		await expect(runner).toBeVisible({ timeout: 5000 });
		// Every shipped mirror is present in the inventory.
		for (const id of [
			"S01-content-store",
			"S02-krdcore-records",
			"S03-cli-aidos",
			"S04-the-wall",
			"S05-ci-ratchet",
		]) {
			await expect(page.getByTestId(`mirror-row-${id}`)).toBeVisible();
		}
	});

	test("the screen teaches — tutorial with four concept cards is visible", async ({
		page,
	}) => {
		await page.goto("/mirrors");
		await expect(page.getByTestId("mirrors-tutorial")).toBeVisible();
	});

	test("running the reddened candidate yields REJECTED — RED_REGRESSION and the regressed mirror renders red", async ({
		page,
	}) => {
		await page.goto("/mirrors");
		await page.getByTestId("run-reddened").click();

		const verdict = page.getByTestId("merge-verdict");
		await expect(verdict).toBeVisible({ timeout: 5000 });
		await expect(verdict).toHaveAttribute("data-verdict", "REJECTED");
		await expect(verdict).toContainText("REJECTED");
		await expect(verdict).toContainText("RED_REGRESSION");

		// The regressed mirror (S04-the-wall) is flagged and shows red on candidate.
		const reddened = page.getByTestId("mirror-row-S04-the-wall");
		await expect(reddened).toHaveAttribute("data-regressed", "true");
		await expect(reddened.locator('[data-status="red"]')).toBeVisible();

		// The BlockReason feed carries the RED_REGRESSION code + the regressed set.
		await expect(page.getByTestId("block-event-code")).toHaveText(
			"RED_REGRESSION",
		);
		await expect(page.getByTestId("regressed-set")).toContainText(
			"S04-the-wall",
		);
	});

	test("running the all-green candidate yields ALLOWED", async ({ page }) => {
		await page.goto("/mirrors");
		await page.getByTestId("run-all-green").click();

		const verdict = page.getByTestId("merge-verdict");
		await expect(verdict).toBeVisible({ timeout: 5000 });
		await expect(verdict).toHaveAttribute("data-verdict", "ALLOWED");
		await expect(verdict).toContainText("ALLOWED");

		// No mirror is flagged regressed, no BlockReason feed.
		await expect(page.getByTestId("block-event")).toHaveCount(0);
		await expect(page.getByTestId("mirror-row-S04-the-wall")).toHaveAttribute(
			"data-regressed",
			"false",
		);
	});
});
