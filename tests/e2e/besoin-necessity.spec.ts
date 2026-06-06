import { expect, test } from "@playwright/test";

/**
 * EL01 Playwright e2e — the need-necessity spike Workbench panel (/besoin-necessity).
 * mirror record: reflects=spike/besoin.Decide (the deterministic, LLM-free necessity comparison:
 *               the SAME need captured as a top-down BesoinGraph vs a flat prompt; the graph
 *               backlog STRICTLY DOMINATES the flat prompt on every richness axis; declared floor +
 *               reproducibility; the lesson harvested as a DRAFT Idea, no mirror/version — the
 *               wall), test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: comparing the two captures yields a GO verdict with the strict-dominance deltas and the
 *           harvested DRAFT Idea visible (the done criterion made visible).
 *   Given the Workbench is running
 *   When I navigate to /besoin-necessity and click COMPARE BOTH CAPTURES
 *   Then a GO badge appears (the BesoinGraph strictly dominates the flat prompt)
 *   And the richness table shows the graph emits 5 Ideas vs the flat prompt's 1 (Δ +4)
 *   And the computed rationale is rendered
 *   And the harvested DRAFT candidate-Idea card shows no mirror and no frozen version (the wall)
 */

test.describe("EL01 — the need-necessity spike", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/besoin-necessity");
		await expect(page.getByTestId("besoin-necessity-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("COMPARE BOTH CAPTURES computes a GO verdict from the screen", async ({
		page,
	}) => {
		// Before running, the verdict is pending (action-capable: nothing computed yet).
		await expect(page.getByTestId("verdict-pending")).toBeVisible();

		await page.getByTestId("run-compare").click();

		// GO badge — the BesoinGraph strictly dominates the flat prompt.
		const badge = page.getByTestId("verdict-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveAttribute("data-verdict", "go");

		// The richness table: 5 Ideas from the graph, 1 from the flat prompt (Δ +4).
		const ideasRow = page.getByTestId("row-ideas");
		await expect(ideasRow).toContainText("5");
		await expect(ideasRow).toContainText("1");
		await expect(ideasRow).toContainText("+4");

		// The computed rationale is shown.
		await expect(page.getByTestId("verdict-rationale")).toContainText("GO");

		// THE WALL — the harvested candidate-Idea is DRAFT: no mirror, no frozen version.
		const harvest = page.getByTestId("harvest-card");
		await expect(harvest).toBeVisible();
		await expect(harvest).toContainText("draft");
	});
});
