import { expect, test } from "@playwright/test";

/**
 * FK10 Playwright e2e — the « l'autonomie A0-A8 » Workbench panel.
 * mirror record: reflects=FK10-autonomy, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /autonomy route is action-capable (ui-completeness law, CLAUDE.md §7): TWO controls
 * are reachable AND executable from the screen, bound to the REAL pure twin (lib/autonomy, the TS
 * twin of back/kernel/autonomy). The FK10 done-criteria, reached from the screen:
 *   - the controls render (the A0..A8 ladder, ENFORCER, CALCULER LA MONTÉE);
 *   - an A1 agent attempting a merge is REFUSED with AGENT_AUTONOMY_EXCEEDED (the fixture
 *     done-criterion: « un A1 tentant un merge refusé »);
 *   - an A6 agent merges fine (the level is sufficient);
 *   - A8 on a critical action is refused (FKE-11/34: « A8 jamais sur action critique »);
 *   - promotion is a pure function of history: 3 clean E4+ runs promote A1→A2, an incident
 *     withholds it.
 *
 * THE WALL (CLAUDE.md §2): the screen only ENFORCES + COMPUTES — it writes no truth (the verdict
 * and the proposed level are projections; freezing a promotion goes idea → mirror → /goal).
 */

test.describe("FK10 — autonomy_level A0-A8 (fail-closed enforce + promotion-from-history)", () => {
	test("the route renders the ladder and both controls", async ({ page }) => {
		await page.goto("/autonomy");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /l'autonomie a0-a8|autonomy a0-a8/i,
			}),
		).toBeVisible();
		await expect(page.getByTestId("ladder")).toBeVisible();
		await expect(page.getByTestId("ladder-rung")).toHaveCount(9);
		await expect(page.getByTestId("enforce-submit")).toBeVisible();
		await expect(page.getByTestId("promote-submit")).toBeVisible();
	});

	test("an A1 agent attempting a merge is REFUSED with AGENT_AUTONOMY_EXCEEDED", async ({
		page,
	}) => {
		await page.goto("/autonomy");
		await page.getByTestId("action-select").selectOption("a1-merge");
		await page.getByTestId("enforce-submit").click();

		await expect(page.getByTestId("decision")).toHaveAttribute(
			"data-allowed",
			"false",
		);
		await expect(page.getByTestId("decision-badge")).toHaveText(
			/refus|refused/i,
		);
		await expect(page.getByTestId("block-reason")).toContainText(
			"AGENT_AUTONOMY_EXCEEDED",
		);
		// the BlockReason is not a prison — it names the door out.
		await expect(page.getByTestId("how-to-fix").first()).toBeVisible();
	});

	test("an A6 agent merges fine (the level is sufficient)", async ({
		page,
	}) => {
		await page.goto("/autonomy");
		await page.getByTestId("action-select").selectOption("a6-merge");
		await page.getByTestId("enforce-submit").click();
		await expect(page.getByTestId("decision")).toHaveAttribute(
			"data-allowed",
			"true",
		);
		await expect(page.getByTestId("decision-badge")).toHaveText(
			/admis|admitted/i,
		);
	});

	test("A8 on a critical action is refused (A8 jamais sur action critique)", async ({
		page,
	}) => {
		await page.goto("/autonomy");
		await page.getByTestId("action-select").selectOption("a8-critical");
		await page.getByTestId("enforce-submit").click();
		await expect(page.getByTestId("decision")).toHaveAttribute(
			"data-allowed",
			"false",
		);
		await expect(page.getByTestId("block-reason")).toContainText(
			"AGENT_AUTONOMY_EXCEEDED",
		);
	});

	test("promotion is a pure function of history: clean runs promote, an incident withholds", async ({
		page,
	}) => {
		await page.goto("/autonomy");

		// 3 clean E4+ runs → A1 promotes to A2 (earned).
		await page.getByTestId("history-select").selectOption("clean");
		await page.getByTestId("promote-submit").click();
		await expect(page.getByTestId("promotion")).toHaveAttribute(
			"data-earned",
			"true",
		);
		await expect(page.getByTestId("promoted-level")).toHaveText("A2");

		// an incident in the window withholds it (stays A1).
		await page.getByTestId("history-select").selectOption("incident");
		await page.getByTestId("promote-submit").click();
		await expect(page.getByTestId("promotion")).toHaveAttribute(
			"data-earned",
			"false",
		);
		await expect(page.getByTestId("promoted-level")).toHaveText("A1");
	});
});
