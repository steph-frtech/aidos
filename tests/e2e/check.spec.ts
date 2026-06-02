import { expect, test } from "@playwright/test";

/**
 * S45 Playwright e2e — the aidos check / law-coverage Workbench panel (/check).
 * mirror record: reflects=S45-lawcoverage, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench surfaces every KRD law with one red and one green fixture (KRD §82.1 / §29)
 *   Given the Workbench is running
 *   When I navigate to /check
 *   Then every registered law renders a row with BOTH a runnable red AND a runnable green fixture
 *     (the 1-law-1-red-1-green done criterion is visible)
 *   And the five compiler verbs appear as owning verbs
 *   When I run aidos check on the demo project
 *   Then the verdict block renders GREEN (no law violated)
 *   When I run a law's red fixture
 *   Then a breach with its S13 code + how_to_fix is shown
 *   When I run that law's green fixture
 *   Then it passes (no breach)
 */

// The eleven KRD laws (the ten §82.1 laws + the §29 completeness law).
const lawIds = [
	"truth_without_kind",
	"mirror_incompatible",
	"scope_absent",
	"authority_absent",
	"memory_without_goal",
	"phase_not_stable",
	"composes_weight",
	"mutation_score",
	"invariant_too_global",
	"context_decision_untest",
	"completeness",
];

test.describe("S45 — the aidos check / law-coverage panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/check");
		await expect(
			page.getByRole("heading", { level: 1, name: /aidos check/i }),
		).toBeVisible({ timeout: 10000 });
	});

	test("every registered law renders a row with both a red and a green fixture", async ({
		page,
	}) => {
		const rows = page.getByTestId("law-row");
		await expect(rows).toHaveCount(lawIds.length);

		for (const id of lawIds) {
			const row = page.locator(`[data-testid="law-row"][data-law="${id}"]`);
			await expect(row).toHaveCount(1);
			// both a runnable red AND a runnable green fixture (1-law-1-red-1-green visible).
			await expect(row.getByTestId("run-red")).toBeVisible();
			await expect(row.getByTestId("run-green")).toBeVisible();
		}
	});

	test("the five compiler verbs appear as owning verbs", async ({ page }) => {
		const verbs = new Set<string>();
		const rows = page.getByTestId("law-row");
		const count = await rows.count();
		for (let i = 0; i < count; i++) {
			const v = await rows.nth(i).getAttribute("data-verb");
			if (v) verbs.add(v);
		}
		// every owning verb is one of the five; check + stable are both present
		// (check owns most laws, stable owns phase_not_stable).
		expect(verbs.has("check")).toBe(true);
		expect(verbs.has("stable")).toBe(true);
		for (const v of verbs) {
			expect(["check", "impact", "stable", "diff", "explain"]).toContain(v);
		}
	});

	test("running aidos check on the demo project renders a GREEN verdict", async ({
		page,
	}) => {
		await page
			.getByRole("button", { name: /projet de démonstration|demo project/i })
			.click();
		const verdict = page.getByTestId("check-verdict");
		await expect(verdict).toBeVisible();
		await expect(verdict).toHaveAttribute("data-verdict", "green");
	});

	test("running a law's red fixture shows a breach, the green fixture passes", async ({
		page,
	}) => {
		const row = page.locator(
			'[data-testid="law-row"][data-law="authority_absent"]',
		);
		// RED → a breach with the S13 code + how_to_fix is shown.
		await row.getByTestId("run-red").click();
		await expect(row.getByTestId("red-result")).toBeVisible();
		const verdict = page.getByTestId("check-verdict");
		await expect(verdict).toHaveAttribute("data-verdict", "invalid");
		await expect(verdict.getByTestId("breach")).toContainText(
			"MISSING_AUTHORITY",
		);

		// GREEN → it passes (no breach).
		await row.getByTestId("run-green").click();
		await expect(row.getByTestId("green-result")).toBeVisible();
		await expect(page.getByTestId("check-verdict")).toHaveAttribute(
			"data-verdict",
			"green",
		);
	});
});
