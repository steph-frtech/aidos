import { expect, test } from "@playwright/test";

/**
 * EL08 Playwright e2e — the anchor-cascade Workbench panel (/compound-besoin-cascade).
 * mirror record: reflects=back/runtime/besoin/cascade.go (AnchorsAbove + Descend gated by CanDescend +
 *               ShrinkOptionSpaceCascade + ReopenAnchor; premature descent refused
 *               CANNOT_DESCEND_LEVEL_NOT_RIGHTSIZED; |OptionSpace| strictly smaller under a frozen
 *               anchor; reopening a frozen anchor requires a ChangeSet BESOIN_ANCHOR_OVERWRITE,
 *               anti-overwrite §9), test_kind=e2e, cert_language=gherkin, liveness=alive,
 *               authority=above
 *
 * The screen is action-capable (ui-completeness): every control EXECUTES the pure twin from the
 * screen — "List the anchors" / "Descend" / "Measure the shrink" / "Reopen the anchor".
 *
 * Scenario A: a right-sized frozen product → Descend OK, opens journey.
 * Scenario B: a frozen-but-vacant product → Descend REFUSED with CANNOT_DESCEND.
 * Scenario C: the shrink is STRICTLY smaller under the frozen anchor (After < Before).
 * Scenario D: reopening the frozen anchor without a ChangeSet is refused; with one it succeeds.
 */

test.describe("EL08 — the anchor cascade", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin-cascade");
		await expect(page.getByTestId("case-select")).toBeVisible({ timeout: 5000 });
	});

	test("a right-sized frozen product descends, opening journey", async ({ page }) => {
		await page.getByTestId("case-select").selectOption("frozenNarrowing");
		await page.getByTestId("descend-cta").click();
		await expect(page.getByTestId("descend-ok")).toHaveAttribute("data-ok", "true");
		await expect(page.getByTestId("descend-opened")).toContainText(/journey/i);
	});

	test("a frozen-but-vacant product refuses descent (CANNOT_DESCEND)", async ({ page }) => {
		await page.getByTestId("case-select").selectOption("frozenVacant");
		await page.getByTestId("descend-cta").click();
		await expect(page.getByTestId("descend-ok")).toHaveAttribute("data-ok", "false");
		await expect(
			page.getByTestId("block-CANNOT_DESCEND_LEVEL_NOT_RIGHTSIZED"),
		).toBeVisible();
	});

	test("the shrink is strictly smaller under the frozen anchor", async ({ page }) => {
		await page.getByTestId("case-select").selectOption("frozenNarrowing");
		await page.getByTestId("shrink-cta").click();
		await expect(page.getByTestId("shrink-before")).toContainText(/Before.*= 7/i);
		await expect(page.getByTestId("shrink-after")).toContainText(/After.*= 2/i);
		await expect(page.getByTestId("shrink-value")).toContainText(/Shrink = 5/i);

		// A drafting (unfrozen) product does not narrow: Shrink 0.
		await page.getByTestId("case-select").selectOption("draftingProduct");
		await page.getByTestId("shrink-cta").click();
		await expect(page.getByTestId("shrink-value")).toContainText(/Shrink = 0/i);
	});

	test("reopening a frozen anchor needs a ChangeSet (anti-overwrite §9)", async ({ page }) => {
		await page.getByTestId("case-select").selectOption("frozenNarrowing");
		// No ChangeSet → refused.
		await page.getByTestId("reopen-cta").click();
		await expect(page.getByTestId("reopen-ok")).toHaveAttribute("data-ok", "false");
		await expect(page.getByTestId("block-BESOIN_ANCHOR_OVERWRITE")).toBeVisible();

		// With a ChangeSet → recorded decision, allowed.
		await page.getByTestId("changeset-input").fill("cs-42");
		await page.getByTestId("reopen-cta").click();
		await expect(page.getByTestId("reopen-ok")).toHaveAttribute("data-ok", "true");
	});
});
