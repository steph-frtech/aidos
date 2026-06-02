import { expect, test } from "@playwright/test";

/**
 * S06 Playwright e2e — the completeness-law Workbench panel (/mirror-health).
 * mirror record: reflects=mirror.completeness, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive
 *
 * The completeness law makes the bicephalous body checkable: a truth without a
 * living mirror (no_truth_without_mirror) or a mirror reflecting nothing
 * (no_orphan_mirror) is a MONSTER — and a monster is red. The /mirror-health
 * panel is action-capable (ui-completeness): computing the law is reachable AND
 * executable from the screen, not just displayed.
 *
 * Scenario A — the monster cut yields RED — MONSTER with both monster kinds
 *   When I compute the law over the monster cut
 *   Then a truth-without-mirror (pricing-policy) AND an orphan mirror appear
 *   And the completeness verdict reads RED — MONSTER
 *
 * Scenario B — the complete cut yields COMPLETE with an empty monster set
 *   When I compute the law over the complete cut
 *   Then the monster set is empty
 *   And the completeness verdict reads COMPLETE
 */

test.describe("S06 — the completeness-law panel (/mirror-health)", () => {
	test("the panel renders with the tutorial and a worked example", async ({
		page,
	}) => {
		await page.goto("/mirror-health");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
		await expect(page.getByTestId("mirror-health-tutorial")).toBeVisible();
		await expect(page.getByTestId("mirror-health-example")).toBeVisible();
		await expect(page.getByTestId("health-runner")).toBeVisible();
	});

	test("the monster cut yields RED — MONSTER with both monster kinds", async ({
		page,
	}) => {
		await page.goto("/mirror-health");
		await page.getByTestId("run-monster").click();

		const verdict = page.getByTestId("completeness-verdict");
		await expect(verdict).toBeVisible({ timeout: 5000 });
		await expect(verdict).toHaveAttribute("data-verdict", "RED_MONSTER");

		// The monster set shows both reasons.
		await expect(page.getByTestId("monster-set")).toBeVisible();
		await expect(
			page.getByTestId("monster-no_truth_without_mirror").first(),
		).toBeVisible();
		await expect(
			page.getByTestId("monster-no_orphan_mirror").first(),
		).toBeVisible();

		// The orphan mirror row is flagged as an orphan in the inventory.
		await expect(
			page.getByTestId("mirror-row-old-pricing.property"),
		).toHaveAttribute("data-orphan", "true");
	});

	test("the complete cut yields COMPLETE with an empty monster set", async ({
		page,
	}) => {
		await page.goto("/mirror-health");
		await page.getByTestId("run-complete").click();

		const verdict = page.getByTestId("completeness-verdict");
		await expect(verdict).toBeVisible({ timeout: 5000 });
		await expect(verdict).toHaveAttribute("data-verdict", "COMPLETE");
		await expect(verdict).toContainText("COMPLETE");

		// No monster set is rendered.
		await expect(page.getByTestId("monster-set")).toHaveCount(0);

		// Every inventory mirror is living.
		for (const id of [
			"checkout-button.fixture",
			"place-order.fixture",
			"order.schema",
			"cart-view.e2e",
			"pricing-policy.property",
		]) {
			await expect(page.getByTestId(`mirror-row-${id}`)).toHaveAttribute(
				"data-living",
				"true",
			);
		}
	});
});
