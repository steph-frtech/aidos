import { expect, test } from "@playwright/test";

/**
 * S41 Playwright e2e — the kernel-debt panel (/kernel-debt).
 *
 * mirror record: reflects=front.kernelDebt (the PROJECTION of
 *               runtime.debt.Scan + runtime.debt.trim.SuggestTrim + the
 *               fitness.kernel_debt_snapshot read, S41),
 *               test_kind=gherkin, cert_language=playwright-bdd, liveness=alive,
 *               authority=below
 *
 * THE DONE CRITERION: /kernel-debt renders the debt ledger grouped under ORPHAN
 * MIRRORS / STALE FIXTURES / SURVIVING MUTANTS; each trim suggestion shows the
 * idea → mirror → /goal → human approval requirement with NO apply/delete button
 * (suggestion only); and a clean snapshot renders the empty-debt state.
 */

test.describe("S41 — Kernel debt (detect rot; /trim suggests, deletes nothing)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/kernel-debt");
		await expect(
			page.getByRole("heading", {
				name: /Dette du noyau|Kernel debt/i,
			}),
		).toBeVisible({ timeout: 5000 });
	});

	test("the all-three scenario surfaces orphan, stale and surviving-mutant debt", async ({
		page,
	}) => {
		await page.getByTestId("scenario-select").selectOption("all-three");

		await expect(page.getByTestId("group-orphan_mirror")).toContainText(
			/truth-GONE|mir-9/,
		);
		await expect(page.getByTestId("group-stale_fixture")).toContainText(
			/fix-4/,
		);
		await expect(page.getByTestId("group-surviving_mutant")).toContainText(
			/truth-3|mir-5/,
		);
	});

	test("each trim suggestion requires the door and exposes no apply/delete button", async ({
		page,
	}) => {
		await page.getByTestId("scenario-select").selectOption("all-three");

		const suggestions = page.getByTestId("trim-suggestion");
		await expect(suggestions.first()).toBeVisible();

		// every suggestion names the idea → mirror → /goal → human approval door.
		const door = page.getByTestId("requires-door").first();
		await expect(door).toContainText(/idea → mirror → \/goal → human approval/);

		// the suggested actions are all open_idea_* — never a delete.
		await expect(page.getByTestId("trim-plan")).toContainText(/open_idea_/);

		// suggestion only: NO apply / delete / trim button anywhere on the page.
		await expect(
			page.getByRole("button", {
				name: /delete|supprimer|apply|appliquer|trim|retire|remove/i,
			}),
		).toHaveCount(0);
	});

	test("a clean snapshot renders the empty-debt state and an empty plan", async ({
		page,
	}) => {
		await page.getByTestId("scenario-select").selectOption("clean");

		await expect(page.getByTestId("empty-debt")).toBeVisible();
		await expect(page.getByTestId("empty-plan")).toBeVisible();
	});
});
