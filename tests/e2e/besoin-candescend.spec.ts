import { expect, test } from "@playwright/test";

/**
 * EL07 Playwright e2e — the CanDescend forcing-gate Workbench panel
 * (/compound-besoin-candescend).
 * mirror record: reflects=back/runtime/besoin/candescend.go (CanDescend(graph, level) → Verdict:
 *               enough COMPUTED never declared; (a) body non-vacant, (b) four metadata, (c) refs
 *               resolve, (e) ANTI-VACUITY ShrinkOptionSpace>0; a forward dep is a carried
 *               OpenQuestion + enough=true), test_kind=e2e, cert_language=gherkin, liveness=alive,
 *               authority=above
 *
 * The screen is action-capable (ui-completeness): every control EXECUTES the pure twin from the
 * screen — "Compute the verdict" runs canDescend, "Count the shrink" runs shrinkOptionSpace.
 *
 * Scenario A: a right-sized, narrowing product → enough=true, no BlockReasons.
 * Scenario B: a parsable-but-non-constraining product → not_enough with the anti-vacuity block.
 * Scenario C: an operation forward dep toward entity → enough=true + a carried OpenQuestion.
 * Scenario D: counting the shrink — a narrowing body > 0, a vacant body 0 (anti-vacuity).
 */

test.describe("EL07 — CanDescend (the forcing gate)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin-candescend");
		await expect(page.getByTestId("case-select")).toBeVisible({
			timeout: 5000,
		});
	});

	test("a right-sized, narrowing product is enough (no block reasons)", async ({
		page,
	}) => {
		await page.getByTestId("case-select").selectOption("rightSized");
		await page.getByTestId("verdict-cta").click();
		await expect(page.getByTestId("verdict")).toBeVisible();
		await expect(page.getByTestId("verdict-enough")).toHaveAttribute(
			"data-enough",
			"true",
		);
		await expect(page.getByTestId("verdict-blockreasons")).toHaveText(/aucun|none/i);
	});

	test("a parsable-but-non-constraining product is not_enough (anti-vacuity)", async ({
		page,
	}) => {
		await page.getByTestId("case-select").selectOption("vacant");
		await page.getByTestId("verdict-cta").click();
		await expect(page.getByTestId("verdict-enough")).toHaveAttribute(
			"data-enough",
			"false",
		);
		// The anti-vacuity BlockReason surfaces (enough is COMPUTED from ShrinkOptionSpace==0).
		await expect(
			page.getByTestId("block-BESOIN_OPTION_SPACE_NOT_NARROWED"),
		).toBeVisible();
	});

	test("an operation forward dep toward entity carries an OpenQuestion, enough=true", async ({
		page,
	}) => {
		await page.getByTestId("case-select").selectOption("forwardDep");
		await page.getByTestId("verdict-cta").click();
		await expect(page.getByTestId("verdict-enough")).toHaveAttribute(
			"data-enough",
			"true",
		);
		// A carried OpenQuestion is shown (a forward dep, never a blocking residual — bootstrap §6).
		await expect(page.getByTestId("verdict-openquestions")).toContainText(
			/forward-dep/i,
		);
		await expect(page.getByTestId("verdict-blockreasons")).toHaveText(/aucun|none/i);
	});

	test("counting the shrink: a narrowing body is > 0, a vacant body is 0", async ({
		page,
	}) => {
		await page.getByTestId("case-select").selectOption("rightSized");
		await page.getByTestId("shrink-cta").click();
		await expect(page.getByTestId("shrink-value")).toContainText(/shrink = 5/);

		await page.getByTestId("case-select").selectOption("vacant");
		await page.getByTestId("shrink-cta").click();
		await expect(page.getByTestId("shrink-value")).toContainText(/shrink = 0/);
		await expect(page.getByTestId("shrink-meaning")).toHaveText(/vacant|narrows nothing/i);
	});
});
