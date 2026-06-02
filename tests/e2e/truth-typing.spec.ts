import { expect, test } from "@playwright/test";

/**
 * S14 Playwright e2e — the truth-typing Workbench panel (/truth-typing).
 * mirror record: reflects=S14-truth-typing, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench routes each candidate truth by its (TruthKind, VerifiabilityLevel)
 *   Given the Workbench is running
 *   When I navigate to /truth-typing
 *   Then a behavioral + deterministic truth shows the green KERNEL badge (admitted)
 *   And an experiential + unverifiable truth shows the amber /SPIKE badge (routed away)
 *   And an untyped truth shows the red REJECTED badge with reason missing-truth-kind
 *   And an unknown truth_kind shows REJECTED with reason unknown-truth-kind
 *   And the screen carries a tutorial and a worked example
 */

test.describe("S14 — the truth-typing panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/truth-typing");
		await expect(page.getByTestId("truth-row").first()).toBeVisible({
			timeout: 5000,
		});
	});

	test("a behavioral + deterministic truth is admitted to the kernel", async ({
		page,
	}) => {
		const row = page
			.getByTestId("truth-row")
			.filter({ hasText: "mot de passe invalide" });
		await expect(row).toHaveAttribute("data-routing", "kernel");
		await expect(row.getByTestId("routing-badge")).toContainText("KERNEL");
		await expect(row.getByTestId("kind-chip")).toContainText("behavioral");
		await expect(row.getByTestId("level-chip")).toContainText("deterministic");
	});

	test("an experiential + unverifiable truth is routed to /spike", async ({
		page,
	}) => {
		const row = page
			.getByTestId("truth-row")
			.filter({ hasText: "semble plus clair" });
		await expect(row).toHaveAttribute("data-routing", "spike");
		await expect(row.getByTestId("routing-badge")).toContainText("/SPIKE");
		await expect(row.getByTestId("kind-chip")).toContainText("experiential");
		await expect(row.getByTestId("level-chip")).toContainText("unverifiable");
	});

	test("an untyped truth is rejected with missing-truth-kind", async ({
		page,
	}) => {
		const row = page
			.getByTestId("truth-row")
			.filter({ hasText: "claim non typé" });
		await expect(row).toHaveAttribute("data-routing", "rejected");
		await expect(row).toHaveAttribute("data-code", "missing-truth-kind");
		await expect(row.getByTestId("routing-badge")).toContainText("REJECTED");
		await expect(row.getByTestId("routing-reason")).toContainText(
			"missing-truth-kind",
		);
	});

	test("an unknown truth_kind is rejected with unknown-truth-kind", async ({
		page,
	}) => {
		const row = page.getByTestId("truth-row").filter({ hasText: "vibes" });
		await expect(row).toHaveAttribute("data-routing", "rejected");
		await expect(row).toHaveAttribute("data-code", "unknown-truth-kind");
		await expect(row.getByTestId("routing-reason")).toContainText(
			"unknown-truth-kind",
		);
	});

	test("the screen carries a tutorial and a worked example", async ({
		page,
	}) => {
		await expect(page.getByTestId("tutorial")).toBeVisible();
		await expect(page.getByTestId("example")).toBeVisible();
	});
});
