import { expect, test } from "@playwright/test";

/**
 * EL11 Playwright e2e — the Stop:besoin-gate panel (/compound-besoin-gate).
 * mirror record: reflects=back/hooks/stop/besoin-gate/gate.go (Decide: a level's descent is blocked
 *               iff ¬CanDescend.enough (EL07) OR a monster at the current level (EL09) — the OU, not the
 *               ET; a session without a BesoinGraph is a no-op, §5; the verdict is computed, never LLM),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness): every control EXECUTES the pure twin from the screen —
 * "Evaluate the gate" / "Break right-sizing" (disjunct 1) / "Break the level-mirror" (disjunct 2) /
 * "Detach the BesoinGraph" (the §5 no-op) / "Reset".
 *
 * Scenario A: a right-sized, monster-free session ALLOWS the descent.
 * Scenario B: breaking the right-sizing blocks on ¬enough ALONE (disjunct 1 of the OU, no monster).
 * Scenario C: breaking the level-mirror blocks on a monster ALONE (disjunct 2), then detaching no-ops.
 */

test.describe("EL11 — Stop:besoin-gate descent gate", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin-gate");
		await expect(page.getByTestId("gate-state")).toBeVisible({ timeout: 5000 });
	});

	test("a right-sized, monster-free session ALLOWS the descent", async ({
		page,
	}) => {
		await expect(page.getByTestId("session-attached")).toContainText(
			/oui|yes/i,
		);
		await page.getByTestId("evaluate").click();
		await expect(page.getByTestId("verdict")).toHaveAttribute(
			"data-verdict",
			"allow",
		);
	});

	test("breaking the right-sizing BLOCKS on ¬enough alone (the OU, no monster)", async ({
		page,
	}) => {
		await page.getByTestId("break-right-sizing").click();
		await page.getByTestId("evaluate").click();
		await expect(page.getByTestId("verdict")).toHaveAttribute(
			"data-verdict",
			"block",
		);
		await expect(page.getByTestId("not-enough-flag")).toContainText(/oui|yes/i);
		// the resolved product still has its level-mirror → no monster (proving the OU, not the ET).
		await expect(page.getByTestId("has-monster-flag")).toContainText(/non|no/i);
		await expect(page.getByTestId("block-reasons")).toBeVisible();
	});

	test("breaking the level-mirror BLOCKS on a monster; detaching no-ops", async ({
		page,
	}) => {
		await page.getByTestId("break-mirror").click();
		await page.getByTestId("evaluate").click();
		await expect(page.getByTestId("verdict")).toHaveAttribute(
			"data-verdict",
			"block",
		);
		await expect(page.getByTestId("has-monster-flag")).toContainText(
			/oui|yes/i,
		);

		// detach the BesoinGraph → the gate no-ops (the §5 scoping, no over-firing).
		await page.getByTestId("detach").click();
		await page.getByTestId("evaluate").click();
		await expect(page.getByTestId("verdict")).toHaveAttribute(
			"data-verdict",
			"no_op",
		);
	});
});
