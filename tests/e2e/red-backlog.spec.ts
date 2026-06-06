import { expect, test } from "@playwright/test";

/**
 * EL17 Playwright e2e — the deterministic RedBacklog Workbench panel (/red-backlog).
 * mirror record: reflects=back/runtime/besoin/red_backlog.go + the besoin_red_backlog MCP tool
 *               (RedBacklog(graph) → BacklogItem[]: topo-sort the emitted Ideas along constrains/seeds
 *               edges → the architectural promotion order; NoEmit rungs in anchors_above never in the
 *               list; mirror form annexed never written; a cycle = BESOIN_CYCLE),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness, CLAUDE.md §7): the human shapes the already-decided
 * graph (per-rung status toggles), then "Sort the RedBacklog" EXECUTES redBacklog(nodes, edges) from
 * the screen (the besoin_red_backlog op). ABOVE the wall: the mirror form is annexed never written;
 * every Idea is a DRAFT with no version/mirror; the panel reflects the byte-equivalent Go sort.
 *
 * Scenario A: two resolved mapping rungs (product + entity) → two ordered items, product before entity,
 *             each carrying its annexed mirror form.
 * Scenario B: a resolved journey rung is NoEmit — appears in anchors_above of a deeper item, never in
 *             the list (no silent cast).
 * Scenario C: injecting a cycle is REFUSED with BESOIN_CYCLE.
 * Scenario D: reset clears the backlog.
 */

test.describe("EL17 — /red-backlog topological sort", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/red-backlog");
		await expect(page.getByTestId("sort-cta")).toBeVisible({ timeout: 5000 });
	});

	test("two resolved mapping rungs → two ordered items, product before entity, with annexed mirror form", async ({
		page,
	}) => {
		// product + entity are resolved by default → two mapping rungs.
		await page.getByTestId("status-product").selectOption("resolved");
		await page.getByTestId("status-entity").selectOption("resolved");
		await page.getByTestId("sort-cta").click();
		await expect(page.getByTestId("backlog-count")).toContainText("2");
		await expect(page.getByTestId("item-product")).toBeVisible();
		await expect(page.getByTestId("item-entity")).toBeVisible();
		// the mirror form is annexed (product → gherkin_n0, entity → property_n1).
		await expect(page.getByTestId("form-product")).toContainText("gherkin_n0");
		await expect(page.getByTestId("form-entity")).toContainText("property_n1");
		// topological order: product item comes before entity item in the list.
		const items = page.locator('[data-testid^="item-"]');
		await expect(items.nth(0)).toHaveAttribute("data-testid", "item-product");
		await expect(items.nth(1)).toHaveAttribute("data-testid", "item-entity");
	});

	test("a resolved journey rung is NoEmit — never in the list, present in anchors_above", async ({
		page,
	}) => {
		// product → journey (NoEmit) → view (NoEmit) → control → action: control's anchors carry journey.
		for (const lvl of ["product", "journey", "view", "control", "action"]) {
			await page.getByTestId(`status-${lvl}`).selectOption("resolved");
		}
		await page.getByTestId("status-entity").selectOption("empty");
		await page.getByTestId("sort-cta").click();
		// journey/view are NoEmit — no list item for them.
		await expect(page.getByTestId("item-journey")).toHaveCount(0);
		await expect(page.getByTestId("item-view")).toHaveCount(0);
		// control IS a list item, and its anchors_above include journey + view.
		await expect(page.getByTestId("item-control")).toBeVisible();
		await expect(page.getByTestId("anchors-control")).toContainText("journey");
		await expect(page.getByTestId("anchors-control")).toContainText("view");
	});

	test("injecting a cycle is refused with BESOIN_CYCLE", async ({ page }) => {
		await page.getByTestId("cycle-cta").click();
		await page.getByTestId("sort-cta").click();
		await expect(page.getByTestId("cycle-refused")).toBeVisible();
		await expect(page.getByTestId("cycle-refused")).toContainText(
			"BESOIN_CYCLE",
		);
		// no backlog list when refused.
		await expect(page.getByTestId("backlog-list")).toHaveCount(0);
	});

	test("reset clears the backlog", async ({ page }) => {
		await page.getByTestId("sort-cta").click();
		await expect(page.getByTestId("backlog-list")).toBeVisible();
		await page.getByTestId("reset-cta").click();
		await expect(page.getByTestId("backlog-list")).toHaveCount(0);
	});
});
