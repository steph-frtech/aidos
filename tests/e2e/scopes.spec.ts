import { expect, test } from "@playwright/test";

/**
 * S15 Playwright e2e — the TruthScope Workbench panel (/scopes).
 * mirror record: reflects=S15-truth-scope, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench renders each candidate truth's scope + the guard verdict (KRD §13.7)
 *   Given the Workbench is running
 *   When I navigate to /scopes
 *   Then a scoped active truth shows the green ACCEPTED badge with its dimension chips
 *   And an explicit-global truth (region "*") shows the distinct blue GLOBAL (explicit) badge
 *   And a scope-less active truth shows the red REJECTED badge with active-truth-without-scope
 *   And a non-active (deprecated) scope-less truth is exempt (ACCEPTED)
 *   And the screen carries a tutorial and a worked example
 */

test.describe("S15 — the TruthScope panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/scopes");
		await expect(page.getByTestId("scope-row").first()).toBeVisible({
			timeout: 5000,
		});
	});

	test("a scoped active truth is ACCEPTED with its dimension chips", async ({
		page,
	}) => {
		const row = page
			.getByTestId("scope-row")
			.filter({ hasText: "TVA française" });
		await expect(row).toHaveAttribute("data-verdict", "accepted");
		await expect(row.getByTestId("verdict-badge")).toContainText("ACCEPTED");
		await expect(
			row.getByTestId("scope-chip").filter({ hasText: "region" }),
		).toContainText("FR");
		await expect(
			row.getByTestId("scope-chip").filter({ hasText: "target" }),
		).toContainText("web");
	});

	test("an explicit-global truth shows the distinct GLOBAL (explicit) badge", async ({
		page,
	}) => {
		const row = page
			.getByTestId("scope-row")
			.filter({ hasText: "content-addressed" });
		await expect(row).toHaveAttribute("data-verdict", "global");
		await expect(row.getByTestId("verdict-badge")).toContainText(
			"GLOBAL (explicit)",
		);
		await expect(
			row.getByTestId("scope-chip").filter({ hasText: "region" }),
		).toContainText("*");
	});

	test("a scope-less active truth is REJECTED — active truth without a scope", async ({
		page,
	}) => {
		const row = page
			.getByTestId("scope-row")
			.filter({ hasText: "vérité sans scope" });
		await expect(row).toHaveAttribute("data-verdict", "rejected");
		await expect(row).toHaveAttribute(
			"data-code",
			"active-truth-without-scope",
		);
		await expect(row.getByTestId("verdict-badge")).toContainText("REJECTED");
		await expect(row.getByTestId("verdict-reason")).toContainText(
			"active-truth-without-scope",
		);
	});

	test("a non-active scope-less truth is exempt (ACCEPTED)", async ({
		page,
	}) => {
		const row = page.getByTestId("scope-row").filter({ hasText: "v1" });
		await expect(row).toHaveAttribute("data-verdict", "accepted");
		await expect(row.getByTestId("status-chip")).toContainText("deprecated");
	});

	test("the screen carries a tutorial and a worked example", async ({
		page,
	}) => {
		await expect(page.getByTestId("tutorial")).toBeVisible();
		await expect(page.getByTestId("example")).toBeVisible();
	});
});
