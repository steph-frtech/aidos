import { expect, test } from "@playwright/test";

/**
 * S32 Playwright e2e — the ContextGraphDecision reuse-ledger Workbench panel (/decision-reuse).
 * mirror record: reflects=archive.brain.contextgraph.Decide (the deterministic, LLM-free reuse
 *               gate ; the four declared dimensions time/scope/authority/conditions ;
 *               false-dominant), test_kind=e2e, cert_language=gherkin, liveness=alive,
 *               authority=above
 *
 * Scenario: an expired or out-of-scope candidate yields BLOCK with the failing dimension lit
 *   Given the Workbench is running
 *   When I navigate to /decision-reuse and click DÉCIDER on each candidate row
 *   Then an EXPIRED candidate renders a BLOCK badge with the time chip marked failing
 *   And an OUT-OF-SCOPE candidate renders a BLOCK badge with the scope chip marked failing
 *       (the done criterion made visible)
 *   And an in-time / in-scope / in-authority candidate renders an ALLOW badge
 *   And an authority-no-longer-holds candidate shows the needs-human-review flag
 */

test.describe("S32 — the ContextGraphDecision reuse ledger", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/decision-reuse");
		await expect(page.getByTestId("decision-reuse-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	async function decideRow(page, row: string) {
		await page
			.getByTestId("run-decide")
			.and(page.locator(`[data-row="${row}"]`))
			.click();
	}

	function rowLocator(page, row: string) {
		return page
			.getByTestId("ledger-row")
			.and(page.locator(`[data-row="${row}"]`));
	}

	test("an EXPIRED candidate renders BLOCK with the time chip failing (the done criterion)", async ({
		page,
	}) => {
		await decideRow(page, "expired");
		const article = rowLocator(page, "expired");

		const badge = article.getByTestId("verdict-badge");
		await expect(badge).toHaveAttribute("data-verdict", "block");

		const timeChip = article
			.getByTestId("dimension-chip")
			.and(page.locator('[data-dimension="time"]'));
		await expect(timeChip).toHaveAttribute("data-state", "fail");
	});

	test("an OUT-OF-SCOPE candidate renders BLOCK with the scope chip failing (the done criterion)", async ({
		page,
	}) => {
		await decideRow(page, "out-of-scope");
		const article = rowLocator(page, "out-of-scope");

		const badge = article.getByTestId("verdict-badge");
		await expect(badge).toHaveAttribute("data-verdict", "block");

		const scopeChip = article
			.getByTestId("dimension-chip")
			.and(page.locator('[data-dimension="scope"]'));
		await expect(scopeChip).toHaveAttribute("data-state", "fail");
		// time passed (reached, not the blocker) — false-dominant stops at scope.
		const timeChip = article
			.getByTestId("dimension-chip")
			.and(page.locator('[data-dimension="time"]'));
		await expect(timeChip).toHaveAttribute("data-state", "pass");
	});

	test("an in-time / in-scope / in-authority candidate renders ALLOW", async ({
		page,
	}) => {
		await decideRow(page, "allowed");
		const article = rowLocator(page, "allowed");

		const badge = article.getByTestId("verdict-badge");
		await expect(badge).toHaveAttribute("data-verdict", "allow");

		// All four dimensions are checked and passed when reuse is granted (false-dominant ⇒ true).
		for (const dim of ["time", "scope", "authority", "conditions"]) {
			const chip = article
				.getByTestId("dimension-chip")
				.and(page.locator(`[data-dimension="${dim}"]`));
			await expect(chip).toHaveAttribute("data-state", "pass");
		}
	});

	test("an authority-no-longer-holds candidate shows the needs-human-review flag", async ({
		page,
	}) => {
		await decideRow(page, "needs-review");
		const article = rowLocator(page, "needs-review");

		const badge = article.getByTestId("verdict-badge");
		await expect(badge).toHaveAttribute("data-verdict", "block");
		await expect(article.getByTestId("needs-review-flag")).toBeVisible();

		const authChip = article
			.getByTestId("dimension-chip")
			.and(page.locator('[data-dimension="authority"]'));
		await expect(authChip).toHaveAttribute("data-state", "fail");
	});
});
