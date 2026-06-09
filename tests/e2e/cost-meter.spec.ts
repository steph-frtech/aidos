import { expect, test } from "@playwright/test";

/**
 * S111 Playwright e2e — the « Compteur de coût par cellule + ValueCase » Workbench panel
 * (EPIC 13 governance).
 * mirror record: reflects=S111-cost-meter, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /cost-meter cockpit is action-capable (ui-completeness law, CLAUDE.md §7): controls
 * reachable AND executable from the screen, bound to Server Actions running the REAL pure twin
 * (lib/cost-meter composing the aggregation of real AgentRuns S52 + economics.Evaluate S51 +
 * the S83 disjoncteur signal). The §S111 done-criteria, reached from the screen:
 *
 *   « un goal over-budget est flaggé (advisory, jamais bloqué silencieusement) ; plus une
 *     contrainte est chère, plus elle doit justifier sa valeur ; le métrage est un COMPTAGE
 *     déterministe des AgentRun ; le signal d'over-budget alimente le disjoncteur (S83). »
 *
 * THE WALL (CLAUDE.md §2): the budget is DECLARED (read-only); the cockpit writes no truth.
 */

test.describe("S111 — per-cell cost meter & ValueCase cockpit", () => {
	test("the route renders the budget + the two controls", async ({ page }) => {
		await page.goto("/cost-meter");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
		await expect(page.getByTestId("section-budget")).toBeVisible();
		await expect(page.getByTestId("meter-submit")).toBeVisible();
		await expect(page.getByTestId("disjoncteur-submit")).toBeVisible();
	});

	test("done-criterion: metering counts the real AgentRuns and stays within budget", async ({
		page,
	}) => {
		await page.goto("/cost-meter");
		await page.getByTestId("meter-submit").click();
		await expect(page.getByTestId("meter-result")).toBeVisible();

		// The metered cost is the COUNTED sum of the real runs (12000+18000+8000 = 38000 / 6).
		await expect(page.getByTestId("run-count")).toHaveText("3");
		await expect(page.getByTestId("metered-tokens")).toHaveText("38000");
		await expect(page.getByTestId("metered-ci")).toHaveText("6");
		await expect(page.getByTestId("verdict-badge")).toContainText(
			/DANS LE BUDGET|WITHIN BUDGET/,
		);
	});

	test("done-criterion: an over-budget goal is FLAGGED (advisory, never a silent block)", async ({
		page,
	}) => {
		await page.goto("/cost-meter");
		// Add the heavy run → the summed tokens (78000) exceed the cap (50000).
		await page.getByTestId("heavy-toggle").check();
		await page.getByTestId("meter-submit").click();
		await expect(page.getByTestId("meter-result")).toBeVisible();

		await expect(page.getByTestId("metered-tokens")).toHaveText("78000");
		await expect(page.getByTestId("verdict-badge")).toContainText(
			/SIGNALÉ|FLAGGED/,
		);
		// The advisory BlockReason is surfaced (never silent), naming the exceeded axis.
		await expect(page.getByTestId("block-reason")).toContainText(
			"HARNESS_COST_EXCEEDS_BUDGET",
		);
		await expect(page.getByTestId("over-axes")).toContainText("llm_tokens");

		// The S83 disjoncteur wire: the over-budget cost TRIPS the breaker.
		await page.getByTestId("disjoncteur-submit").click();
		await expect(page.getByTestId("disjoncteur-result")).toBeVisible();
		await expect(page.getByTestId("trip-badge")).toContainText(
			/DÉCLENCHÉ|TRIPPED/,
		);
	});

	test("done-criterion: a justified ValueCase earns the costly cell its keep — no trip", async ({
		page,
	}) => {
		await page.goto("/cost-meter");
		// Over budget, but the costly cell justifies its value.
		await page.getByTestId("heavy-toggle").check();
		await page.getByTestId("valuecase-toggle").check();
		await page.getByTestId("meter-submit").click();
		await expect(page.getByTestId("verdict-badge")).toContainText(
			/JUSTIFIÉ|JUSTIFIED/,
		);

		// The disjoncteur does NOT trip on a justified over-budget cell.
		await page.getByTestId("disjoncteur-submit").click();
		await expect(page.getByTestId("trip-badge")).toContainText(
			/non déclenché|not tripped/,
		);
	});
});
