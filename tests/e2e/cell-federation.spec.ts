import { expect, test } from "@playwright/test";

/**
 * S100 Playwright e2e — the « fédération de cellules (bounded contexts) » Workbench panel.
 * mirror record: reflects=S100-cell-federation, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /cell-federation route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * partition + cell-pack + check-access controls are reachable AND executable from the screen,
 * bound to Server Actions running the REAL pure twin (lib/cell-federation, the twin of
 * back/kernel/cell). The S100 done-criteria, reached from the screen:
 *   - PARTITION the project Kernel into per-cell sub-Kernels (checkout/billing/catalog) + show
 *     which cells SHIP (§43 fractal: green checkout & catalog ship, red billing does not);
 *   - the CELL PACK of checkout carries its OWN Kernel + billing's PUBLIC contract only, and
 *     EXCLUDES billing's internals + catalog (no contract) — no neighbor internal leaks
 *     (done-criterion 1);
 *   - a cross-cell access checkout→catalog (no contract) is REFUSED CROSS_CELL_NO_CONTRACT, and
 *     checkout→billing (honored contract) is ALLOWED (done-criterion 2).
 *
 * THE WALL (CLAUDE.md §2/§9): the screen projects + checks; the Context-Map persists via a
 * ChangeSet (S101). Every verdict is a pure function, never an LLM.
 */

test.describe("S100 — cell federation (bounded contexts)", () => {
	test("the route renders all three controls", async ({ page }) => {
		await page.goto("/cell-federation");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Cellules|Cells/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("partition-submit")).toBeVisible();
		await expect(page.getByTestId("pack-submit")).toBeVisible();
		await expect(page.getByTestId("access-submit")).toBeVisible();
	});

	test("partition splits the Kernel into per-cell sub-Kernels with fractal shipping", async ({
		page,
	}) => {
		await page.goto("/cell-federation");
		await page.getByTestId("partition-submit").click();
		await expect(page.getByTestId("cells")).toBeVisible();

		// the three demo cells exist
		await expect(page.getByTestId("cell-checkout")).toBeVisible();
		await expect(page.getByTestId("cell-billing")).toBeVisible();
		await expect(page.getByTestId("cell-catalog")).toBeVisible();

		// fractal shipping: checkout & catalog green (ship), billing red (does not ship)
		await expect(page.getByTestId("cell-checkout")).toHaveAttribute(
			"data-ratchet",
			"green",
		);
		await expect(page.getByTestId("cell-billing")).toHaveAttribute(
			"data-ratchet",
			"red",
		);
		const shippable = await page.getByTestId("shippable").innerText();
		expect(shippable).toContain("checkout");
		expect(shippable).toContain("catalog");
		expect(shippable).not.toContain("billing");
	});

	test("the checkout cell pack excludes neighbor internals (done-criterion 1)", async ({
		page,
	}) => {
		await page.goto("/cell-federation");
		await page.getByTestId("pack-target").selectOption("checkout");
		await page.getByTestId("pack-submit").click();
		await expect(page.getByTestId("pack")).toBeVisible();

		// no neighbor internal leaked
		await expect(page.getByTestId("pack")).toHaveAttribute(
			"data-leaked",
			"false",
		);

		// billing's PUBLIC contract crossed; catalog (no contract) did not; billing internals excluded
		const neighbor = await page.getByTestId("neighbor-contracts").innerText();
		expect(neighbor).toContain("bl-pact");
		expect(neighbor).not.toContain("cat-pact");
		expect(neighbor).not.toContain("bl-op");

		const excluded = await page.getByTestId("excluded").innerText();
		expect(excluded).toContain("bl-op");
		expect(excluded).toContain("cat-pact");
	});

	test("a cross-cell access without a contract is refused (done-criterion 2)", async ({
		page,
	}) => {
		await page.goto("/cell-federation");
		await page.getByTestId("access-from").selectOption("checkout");
		await page.getByTestId("access-to").selectOption("catalog");
		await page.getByTestId("access-submit").click();

		const refused = page.getByTestId("access-refused");
		await expect(refused).toBeVisible();
		await expect(refused).toHaveAttribute(
			"data-code",
			"CROSS_CELL_NO_CONTRACT",
		);
	});

	test("a contracted cross-cell access is allowed", async ({ page }) => {
		await page.goto("/cell-federation");
		await page.getByTestId("access-from").selectOption("checkout");
		await page.getByTestId("access-to").selectOption("billing");
		await page.getByTestId("access-submit").click();
		await expect(page.getByTestId("access-allowed")).toBeVisible();
	});
});
