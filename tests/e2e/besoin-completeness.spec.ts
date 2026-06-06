import { expect, test } from "@playwright/test";

/**
 * EL09 Playwright e2e — the need-completeness Workbench panel (/compound-besoin-completeness).
 * mirror record: reflects=back/runtime/besoin/completeness.go (BesoinCompleteness(graph, mirrors) →
 *               { complete, monsters[] }; a resolved node without its level-mirror = monster
 *               NEED_LEVEL_WITHOUT_MIRROR; a level-mirror reflecting no resolved node = ORPHAN_NEED_MIRROR;
 *               breaking the node↔level-mirror link in EITHER direction turns the detector red),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness): every control EXECUTES the pure twin from the screen —
 * "Check completeness" / "Break link (remove mirror)" / "Break link (orphan mirror)" / "Reset".
 *
 * Scenario A: the intact link → complete, no monster.
 * Scenario B: breaking the link by removing the mirror → NEED_LEVEL_WITHOUT_MIRROR (red).
 * Scenario C: breaking the link by adding an orphan mirror → ORPHAN_NEED_MIRROR (red).
 * Scenario D: reset restores the intact link (the verdict clears).
 */

test.describe("EL09 — need completeness", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin-completeness");
		await expect(page.getByTestId("check-cta")).toBeVisible({ timeout: 5000 });
	});

	test("the intact link is complete, no monster", async ({ page }) => {
		await page.getByTestId("check-cta").click();
		await expect(page.getByTestId("verdict-complete")).toHaveAttribute(
			"data-complete",
			"true",
		);
		await expect(page.getByTestId("monsters")).toHaveCount(0);
	});

	test("removing the mirror turns red with NEED_LEVEL_WITHOUT_MIRROR", async ({
		page,
	}) => {
		await page.getByTestId("break-mirror-cta").click();
		await expect(page.getByTestId("verdict-complete")).toHaveAttribute(
			"data-complete",
			"false",
		);
		await expect(
			page.getByTestId("monster-NEED_LEVEL_WITHOUT_MIRROR"),
		).toBeVisible();
	});

	test("an orphan mirror turns red with ORPHAN_NEED_MIRROR", async ({ page }) => {
		await page.getByTestId("orphan-cta").click();
		await expect(page.getByTestId("verdict-complete")).toHaveAttribute(
			"data-complete",
			"false",
		);
		await expect(page.getByTestId("monster-ORPHAN_NEED_MIRROR")).toBeVisible();
	});

	test("reset restores the intact link", async ({ page }) => {
		await page.getByTestId("break-mirror-cta").click();
		await expect(page.getByTestId("verdict-complete")).toHaveAttribute(
			"data-complete",
			"false",
		);
		await page.getByTestId("reset-cta").click();
		await expect(page.getByTestId("verdict-pending")).toBeVisible();
		// And a fresh check on the restored link is complete again.
		await page.getByTestId("check-cta").click();
		await expect(page.getByTestId("verdict-complete")).toHaveAttribute(
			"data-complete",
			"true",
		);
	});
});
