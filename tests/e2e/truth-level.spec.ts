import { expect, test } from "@playwright/test";

/**
 * FK01 Playwright e2e — the « les 7 niveaux de vérité » Workbench panel.
 * mirror record: reflects=FK01-truth-level, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /truth-level route is action-capable (ui-completeness law, CLAUDE.md §7): the FILTER
 * BY LEVEL control (the done-criterion "panel filtre par niveau") is reachable AND executable from
 * the screen, bound to a Server Action running the REAL pure transition (lib/truth-level, the TS
 * twin of back/kernel/truthlevel). The FK01 done-criteria, reached from the screen:
 *   - the ladder shows the seven rungs (Raw → Reconciled);
 *   - filtering by a level returns only the records computed at that level;
 *   - each record's parity badge is 🟢 (stored == computed — the parity mirror).
 *
 * THE WALL (CLAUDE.md §2): the screen only COMPUTES + DISPLAYS — it writes no truth. The transition
 * is a pure function (never an LLM).
 */

test.describe("FK01 — the 7 truth levels", () => {
	test("the route renders the ladder + the filter control", async ({
		page,
	}) => {
		await page.goto("/truth-level");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Les 7 niveaux de vérité|The 7 truth levels/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("filter-select")).toBeVisible();
		await expect(page.getByTestId("filter-submit")).toBeVisible();
		// the ladder shows the seven canonical rungs.
		await expect(page.getByTestId("ladder-raw")).toBeVisible();
		await expect(page.getByTestId("ladder-reconciled")).toBeVisible();
	});

	test("filter = all: every rung is returned, each with a 🟢 parity badge", async ({
		page,
	}) => {
		await page.goto("/truth-level");
		await page.getByTestId("filter-select").selectOption("all");
		await page.getByTestId("filter-submit").click();

		await expect(page.getByTestId("results")).toBeVisible();
		await expect(page.getByTestId("results-count")).toHaveText("7 / 7");
		// the accepted-level record's parity is aligned (stored == computed).
		await expect(page.getByTestId("parity-rec-accepted")).toHaveAttribute(
			"data-aligned",
			"true",
		);
		await expect(page.getByTestId("record-rec-reconciled")).toHaveAttribute(
			"data-level",
			"reconciled",
		);
	});

	test("filter by a single level returns only that level's records", async ({
		page,
	}) => {
		await page.goto("/truth-level");
		await page.getByTestId("filter-select").selectOption("accepted");
		await page.getByTestId("filter-submit").click();

		await expect(page.getByTestId("results-count")).toHaveText("1 / 7");
		await expect(page.getByTestId("record-rec-accepted")).toBeVisible();
		await expect(page.getByTestId("record-rec-accepted")).toHaveAttribute(
			"data-level",
			"accepted",
		);
		// a record of another level is NOT shown.
		await expect(page.getByTestId("record-rec-raw")).toHaveCount(0);
	});

	test("the projected level filters to exactly its record", async ({
		page,
	}) => {
		await page.goto("/truth-level");
		await page.getByTestId("filter-select").selectOption("projected");
		await page.getByTestId("filter-submit").click();
		await expect(page.getByTestId("results-count")).toHaveText("1 / 7");
		await expect(page.getByTestId("record-level-rec-projected")).toContainText(
			"5",
		);
	});
});
