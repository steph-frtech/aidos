import { expect, test } from "@playwright/test";

/**
 * S12 Playwright e2e — the completeness-gate Workbench panel (/completeness).
 * mirror record: reflects=S12-completeness-stop-gate, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench renders the Stop completeness gate over the current cut
 *   Given the Workbench is running
 *   When I navigate to /completeness
 *   Then I see a layer missing its mirror reported as no_truth_without_mirror
 *   And I see an orphan mirror reported as no_orphan_mirror with liveness dead
 *   And the current-cut verdict reads "BLOCKED — MONSTER"
 *   And the BlockReason code reads MONSTER
 *   And a second, complete cut shows an empty monster set and the verdict "COMPLETE"
 */

test.describe("S12 — the completeness / monster panel", () => {
	test("reports a missing-mirror layer as no_truth_without_mirror", async ({
		page,
	}) => {
		await page.goto("/completeness");
		const monster = page.getByTestId("monster-no_truth_without_mirror");
		await expect(monster).toBeVisible({ timeout: 5000 });
		await expect(monster).toContainText("no_truth_without_mirror");
		await expect(monster).toContainText("checkout-button@v1");
		await expect(monster).toContainText("fixture");
	});

	test("reports an orphan mirror as no_orphan_mirror with liveness dead", async ({
		page,
	}) => {
		await page.goto("/completeness");
		const orphan = page.getByTestId("monster-no_orphan_mirror");
		await expect(orphan).toBeVisible();
		await expect(orphan).toContainText("no_orphan_mirror");
		await expect(orphan.getByTestId("monster-liveness")).toContainText("dead");
	});

	test("the current-cut verdict reads BLOCKED — MONSTER with code MONSTER", async ({
		page,
	}) => {
		await page.goto("/completeness");
		const verdict = page.getByTestId("current-verdict");
		await expect(verdict).toHaveAttribute("data-verdict", "block");
		await expect(verdict).toContainText("BLOCKED — MONSTER");
		await expect(page.getByTestId("block-reason-code")).toContainText(
			"MONSTER",
		);
		await expect(page.getByTestId("block-reason-howtofix")).toContainText(
			"no_truth_without_mirror",
		);
	});

	test("a complete cut shows an empty monster set and the verdict COMPLETE", async ({
		page,
	}) => {
		await page.goto("/completeness");
		const complete = page.getByTestId("complete-cut");
		await expect(complete).toBeVisible();
		const verdict = complete.getByTestId("complete-verdict");
		await expect(verdict).toHaveAttribute("data-verdict", "pass");
		await expect(verdict).toContainText("COMPLETE");
		await expect(complete).toContainText("0");
	});
});
