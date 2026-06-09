import { expect, test } from "@playwright/test";

/**
 * FK03 Playwright e2e — the « la grille niveau × facette » Workbench panel.
 * mirror record: reflects=FK03-grid, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /grid route is action-capable (ui-completeness law, CLAUDE.md §7): the RESOLVE &
 * MARK control is reachable AND executable from the screen, bound to a Server Action running the
 * REAL pure twin (lib/grid, the TS twin of back/kernel/grid). The FK03 done-criteria, reached
 * from the screen:
 *   - LAW 1: a (rung, facet) coordinate resolves to a deterministic cell + content address;
 *   - LAW 2 (lateral coupling): a low change (entity) marks the source rungs ABOVE it stale,
 *     with the facet HELD CONSTANT; a change at the summit (product) marks nothing;
 *   - LAW 3 (orthogonality): the seven OTHER facets are listed untouched — the facets do not
 *     interact.
 *
 * THE WALL (CLAUDE.md §2): the screen only COMPUTES + DISPLAYS — it writes no truth. The
 * resolver is a pure function (never an LLM).
 */

test.describe("FK03 — the level × facet grid", () => {
	test("the route renders the two axes + the resolve control", async ({
		page,
	}) => {
		await page.goto("/grid");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /La grille niveau × facette|The level × facet grid/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("rung-select")).toBeVisible();
		await expect(page.getByTestId("facet-select")).toBeVisible();
		await expect(page.getByTestId("resolve-submit")).toBeVisible();
		// the verticale shows the seven rungs (product..entity).
		await expect(page.getByTestId("rung-product")).toBeVisible();
		await expect(page.getByTestId("rung-entity")).toBeVisible();
		// the octuor shows the eight facets (F and X visible).
		await expect(page.getByTestId("facet-F")).toBeVisible();
		await expect(page.getByTestId("facet-X")).toBeVisible();
	});

	test("LAW 1 + 2: a low change (entity×S) resolves a cell and marks the rungs above, facet held", async ({
		page,
	}) => {
		await page.goto("/grid");
		await page.getByTestId("rung-select").selectOption("entity");
		await page.getByTestId("facet-select").selectOption("S");
		await page.getByTestId("resolve-submit").click();

		await expect(page.getByTestId("result")).toBeVisible();
		// LAW 1 — the deterministic resolved cell.
		await expect(page.getByTestId("resolved-cell")).toHaveText("entity×S");
		await expect(page.getByTestId("resolved-hash")).not.toBeEmpty();

		// LAW 2 — the six source rungs above entity are marked stale, top-down.
		const stale = page.getByTestId("stale-cells");
		await expect(stale).toBeVisible();
		await expect(page.getByTestId("stale-product")).toHaveText("product×S");
		await expect(page.getByTestId("stale-operation")).toHaveText("operation×S");
		// the facet is held CONSTANT on every stale cell (data-facet = S).
		await expect(page.getByTestId("stale-product")).toHaveAttribute(
			"data-facet",
			"S",
		);
		await expect(page.getByTestId("stale-operation")).toHaveAttribute(
			"data-facet",
			"S",
		);
		// no stale cell is BELOW entity (entity is the foundation; nothing below it).
	});

	test("LAW 3: the seven other facets are untouched (the facets do not interact)", async ({
		page,
	}) => {
		await page.goto("/grid");
		await page.getByTestId("rung-select").selectOption("operation");
		await page.getByTestId("facet-select").selectOption("S");
		await page.getByTestId("resolve-submit").click();

		const untouched = page.getByTestId("untouched-facets");
		await expect(untouched).toBeVisible();
		// the changed facet S is NOT among the untouched; B/F/etc are.
		await expect(page.getByTestId("untouched-S")).toHaveCount(0);
		await expect(page.getByTestId("untouched-B")).toBeVisible();
		await expect(page.getByTestId("untouched-F")).toBeVisible();
		await expect(page.getByTestId("untouched-X")).toBeVisible();
	});

	test("LAW 2: a change at the summit (product) marks nothing above", async ({
		page,
	}) => {
		await page.goto("/grid");
		await page.getByTestId("rung-select").selectOption("product");
		await page.getByTestId("facet-select").selectOption("F");
		await page.getByTestId("resolve-submit").click();

		await expect(page.getByTestId("resolved-cell")).toHaveText("product×F");
		// nothing above the summit — the stale list is empty.
		await expect(page.getByTestId("stale-empty")).toBeVisible();
	});
});
