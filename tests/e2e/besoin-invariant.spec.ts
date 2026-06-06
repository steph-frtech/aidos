import { expect, test } from "@playwright/test";

/**
 * EL14 Playwright e2e — the transversal band Workbench panel (/besoin-invariant).
 * mirror record: reflects=back/runtime/besoin/invariant.go (the lateral band: parseInvariantBand
 *               refuses an ∃; crossedLevels is the upward lateral constraint; recordInvariant applies
 *               the circularity ban §8 and emits at most one Idea{Proposes:policy}; bandCompleteness
 *               flags the missing crossing invariant), test_kind=e2e, cert_language=gherkin,
 *               liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness): every control EXECUTES the pure twin from the screen
 * — "Record the invariant" runs recordInvariant(...), "Crossed levels" runs crossedLevels(band),
 * "Band completeness" runs bandCompleteness(nodes). ABOVE the wall: the band writes no truth.
 *
 * Scenario A: a ∀ attached at operation is recorded and constrains every rung above (lateral).
 * Scenario B: an ∃ (an example) is refused by INVARIANT_IS_EXAMPLE_NOT_FORALL.
 * Scenario C: a policy band emits exactly one Idea{Proposes:policy}.
 * Scenario D: a self-authored invariant is refused by the circularity ban (§8).
 * Scenario E: band completeness flags the missing crossing invariant, then clears.
 */

test.describe("EL14 — /besoin-invariant transversal band", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/besoin-invariant");
		await expect(page.getByTestId("band-case-select")).toBeVisible({
			timeout: 5000,
		});
	});

	test("a ∀ attached at operation is recorded and constrains every rung above", async ({
		page,
	}) => {
		await page.getByTestId("band-case-select").selectOption("forall");
		await page.getByTestId("record-cta").click();
		await expect(page.getByTestId("routing")).toContainText(/record/i);
		// The lateral constraint reaches up to product (an invariant on operation is "true on all paths").
		const crossed = page.getByTestId("crossed-levels");
		await expect(crossed).toContainText("operation");
		await expect(crossed).toContainText("product");
		// A path-independent invariant emits NO idea (NoEmit).
		await expect(page.getByTestId("policy-idea-none")).toBeVisible();
	});

	test("an ∃ (an example) is refused by INVARIANT_IS_EXAMPLE_NOT_FORALL", async ({
		page,
	}) => {
		await page.getByTestId("band-case-select").selectOption("example");
		await page.getByTestId("record-cta").click();
		await expect(page.getByTestId("routing")).toContainText(/off_altitude/i);
		await expect(page.getByTestId("block-code")).toContainText(
			"INVARIANT_IS_EXAMPLE_NOT_FORALL",
		);
	});

	test("a policy band emits exactly one Idea{Proposes:policy}", async ({
		page,
	}) => {
		await page.getByTestId("band-case-select").selectOption("policy");
		await page.getByTestId("record-cta").click();
		await expect(page.getByTestId("routing")).toContainText(/record/i);
		const idea = page.getByTestId("policy-idea");
		await expect(idea).toContainText("policy");
		await expect(idea).toContainText("human");
	});

	test("a self-authored invariant is refused by the circularity ban (§8)", async ({
		page,
	}) => {
		await page.getByTestId("band-case-select").selectOption("self");
		await page.getByTestId("record-cta").click();
		await expect(page.getByTestId("routing")).toContainText(/off_altitude/i);
		await expect(page.getByTestId("block-code")).toContainText(
			"INVARIANT_CIRCULAR_SELF_AUTHORED",
		);
	});

	test("band completeness flags the missing crossing invariant, then clears", async ({
		page,
	}) => {
		// With the example case (not recorded), the resolved operation node requiring an invariant is
		// crossed by NONE → a monster.
		await page.getByTestId("band-case-select").selectOption("example");
		await page.getByTestId("completeness-cta").click();
		await expect(page.getByTestId("completeness-monster")).toContainText(
			"NEED_LEVEL_MISSING_INVARIANT",
		);

		// With the forall case (recorded, crosses operation), the monster clears.
		await page.getByTestId("band-case-select").selectOption("forall");
		await page.getByTestId("completeness-cta").click();
		await expect(page.getByTestId("completeness-complete")).toBeVisible();
	});
});
