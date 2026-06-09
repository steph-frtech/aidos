import { expect, test } from "@playwright/test";

/**
 * FK02 Playwright e2e — the « les 8 facettes déclarées » Workbench panel.
 * mirror record: reflects=FK02-facets, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /facets route is action-capable (ui-completeness law, CLAUDE.md §7): the FILTER
 * BY FACET control (the done-criterion "panel filtre par facette") is reachable AND executable
 * from the screen, bound to a Server Action running the REAL pure validator (lib/facets, the TS
 * twin of back/kernel/facets). The FK02 done-criteria, reached from the screen:
 *   - the octuor shows the eight lenses (F → X), X marked soft;
 *   - filtering by a facet returns only the kernels instantiating it;
 *   - a legal collapsed kernel (F+I+M) is 🟢; a kernel with no functional facet, or with a
 *     declared facet missing its proof pair, is 🔴 (a monster);
 *   - each kernel carries its content-addressed facet signature.
 *
 * THE WALL (CLAUDE.md §2): the screen only COMPUTES + DISPLAYS — it writes no truth. The
 * validator is a pure function (never an LLM).
 */

test.describe("FK02 — the 8 declared facets", () => {
	test("the route renders the octuor + the filter control", async ({
		page,
	}) => {
		await page.goto("/facets");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Les 8 facettes déclarées|The 8 declared facets/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("filter-select")).toBeVisible();
		await expect(page.getByTestId("filter-submit")).toBeVisible();
		// the octuor shows the eight canonical lenses (F and X visible).
		await expect(page.getByTestId("facet-F")).toBeVisible();
		await expect(page.getByTestId("facet-X")).toBeVisible();
	});

	test("filter = all: every kernel is returned; legal 🟢 and monster 🔴 both rendered", async ({
		page,
	}) => {
		await page.goto("/facets");
		await page.getByTestId("filter-select").selectOption("all");
		await page.getByTestId("filter-submit").click();

		await expect(page.getByTestId("results")).toBeVisible();
		await expect(page.getByTestId("results-count")).toHaveText("5 / 5");

		// a legal collapsed kernel (F+I+M) is valid.
		await expect(page.getByTestId("validity-k-sort")).toHaveAttribute(
			"data-valid",
			"true",
		);
		// the PII endpoint (all eight) is valid.
		await expect(page.getByTestId("validity-k-pii")).toHaveAttribute(
			"data-valid",
			"true",
		);
		// a kernel with NO functional facet is a monster (the done-criterion "refused").
		await expect(page.getByTestId("validity-k-nof")).toHaveAttribute(
			"data-valid",
			"false",
		);
		// a declared facet without its proof pair is a monster.
		await expect(page.getByTestId("validity-k-nopair")).toHaveAttribute(
			"data-valid",
			"false",
		);
		// each kernel carries a content-addressed signature.
		await expect(page.getByTestId("signature-k-sort")).not.toBeEmpty();
	});

	test("filter by the security facet returns only kernels instantiating S", async ({
		page,
	}) => {
		await page.goto("/facets");
		await page.getByTestId("filter-select").selectOption("S");
		await page.getByTestId("filter-submit").click();

		// only the PII endpoint and the no-pair monster declare S.
		await expect(page.getByTestId("results-count")).toHaveText("2 / 5");
		await expect(page.getByTestId("kernel-k-pii")).toBeVisible();
		await expect(page.getByTestId("kernel-k-nopair")).toBeVisible();
		// a kernel that does not declare S is NOT shown.
		await expect(page.getByTestId("kernel-k-sort")).toHaveCount(0);
	});

	test("filter by the experience facet (X, soft) returns its kernels", async ({
		page,
	}) => {
		await page.goto("/facets");
		await page.getByTestId("filter-select").selectOption("X");
		await page.getByTestId("filter-submit").click();
		// the PII endpoint and the declarative view declare X.
		await expect(page.getByTestId("results-count")).toHaveText("2 / 5");
		await expect(page.getByTestId("kernel-k-view")).toHaveAttribute(
			"data-valid",
			"true",
		);
	});
});
