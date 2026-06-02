import { expect, test } from "@playwright/test";

/**
 * S40 Playwright e2e — the mutation-score panel (/mutation-score).
 *
 * mirror record: reflects=front.mutationScore (the score/verdict PROJECTION of
 *               runtime.sensors.mutation.Gate + runtime.mutation_runs, S40),
 *               test_kind=gherkin, cert_language=playwright-bdd, liveness=alive,
 *               authority=below
 *
 * THE DONE CRITERION: /mutation-score renders the latest mutation score and the
 * declared threshold bar labelled read-only; a BLOCK verdict for a 40% run against
 * the 80% bar; a PASS verdict for an 80% run against the 80% bar; and the
 * surviving-mutant list (file · line · operator) for the blocked run.
 */

test.describe("S40 — Mutation score (the densimeter; the threshold gates the phase)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/mutation-score");
		await expect(
			page.getByRole("heading", {
				name: /Score de mutation|Mutation score/i,
			}),
		).toBeVisible({ timeout: 5000 });
	});

	test("the score gauge shows the declared threshold bar labelled read-only", async ({
		page,
	}) => {
		await expect(page.getByTestId("threshold-marker")).toBeVisible();
		await expect(page.getByTestId("threshold")).toContainText("80%");
		await expect(page.getByTestId("mutation-panel")).toContainText(
			/lecture seule|read-only/i,
		);
	});

	test("a 40% run against the 80% bar BLOCKS the phase", async ({ page }) => {
		await page.getByTestId("scenario-select").selectOption("below");

		await expect(page.getByTestId("verdict")).toHaveAttribute(
			"data-verdict",
			"block",
		);
		await expect(page.getByTestId("score")).toContainText("40%");

		// the surviving mutants (the holes to plug) are listed with file·line·operator.
		await expect(page.getByTestId("survivors")).toBeVisible();
		await expect(page.getByTestId("survivor").first()).toContainText(
			/back\/kernel\/eval\.go/,
		);
		await expect(page.getByTestId("survivor").first()).toContainText(
			/CONDITIONALS_BOUNDARY/,
		);
	});

	test("an 80% run against the 80% bar PASSES", async ({ page }) => {
		await page.getByTestId("scenario-select").selectOption("at-bar");

		await expect(page.getByTestId("verdict")).toHaveAttribute(
			"data-verdict",
			"pass",
		);
		await expect(page.getByTestId("score")).toContainText("80%");
		await expect(page.getByTestId("survivors-empty")).toBeVisible();
	});

	test("a missing declared threshold blocks with MISSING_THRESHOLD (no self-chosen bar)", async ({
		page,
	}) => {
		await page.getByTestId("scenario-select").selectOption("missing-threshold");

		await expect(page.getByTestId("verdict")).toHaveAttribute(
			"data-verdict",
			"block",
		);
		await expect(page.getByTestId("block-reason")).toContainText(
			"MISSING_THRESHOLD",
		);
	});

	test("the append-only run history lists prior runs", async ({ page }) => {
		await expect(page.getByTestId("history-row").first()).toBeVisible();
		const rows = await page.getByTestId("history-row").count();
		expect(rows).toBeGreaterThanOrEqual(2);
	});
});
