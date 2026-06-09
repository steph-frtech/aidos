import { expect, test } from "@playwright/test";

/**
 * FK12 Playwright e2e — the caused_by Workbench panel (/caused-by).
 * mirror record: reflects=FK12-caused-by-trace, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * The done criteria, executed from the screen (FKE-35.1, ROADMAP FK12):
 *   Given the Workbench is running
 *   When I navigate to /caused-by and TRACE the checkout chain
 *   Then the candidate causes appear ordered nearest-first
 *        (createOrder → Order → authzPolicy → add_total_col)        (round-trip / deterministic trace)
 *   When I trace the root-leaf graph
 *   Then no further cause is shown (the root cause)                  (the leaf)
 *   When I trace the cyclic graph
 *   Then the trace is REFUSED with CAUSED_BY_CYCLE                   (cycle refused)
 *   And the first edge's content-addressed kernel.link body is shown (round-trip versionné)
 *
 * READ-ONLY (the wall): the panel runs the SAME pure `trace` the Go causedby.Trace computes and
 * projects the chain — it never writes truth. A new caused_by row goes via propose → ChangeSet.
 */

test.describe("FK12 — the caused_by panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/caused-by");
		await expect(page.getByRole("heading", { name: /caused_by/i })).toBeVisible(
			{ timeout: 10000 },
		);
	});

	// The panel's case picker — scoped by its aria-label so it is never confused with the
	// header "Projet" combobox (two comboboxes live on the page; this selects the right one).
	function caseSelect(page: import("@playwright/test").Page) {
		return page.getByRole("combobox", { name: /graphe causal|causal graph/i });
	}

	// The option labels are bilingual; match by the substring the test cares about, scoped to
	// the panel's case picker (never the header project selector's options).
	async function labelFor(
		page: import("@playwright/test").Page,
		needle: RegExp,
	): Promise<string> {
		const options = caseSelect(page).locator("option");
		const count = await options.count();
		for (let i = 0; i < count; i++) {
			const text = (await options.nth(i).textContent()) ?? "";
			if (needle.test(text)) return text;
		}
		throw new Error(`no option matching ${needle}`);
	}

	async function trace(page: import("@playwright/test").Page, label: RegExp) {
		const select = caseSelect(page);
		await select.selectOption({ label: await labelFor(page, label) });
		await expect(page.getByTestId("cause-chain")).toBeVisible();
	}

	test("tracing the checkout chain shows candidate causes nearest-first (deterministic trace)", async ({
		page,
	}) => {
		await trace(page, /checkout/i);

		// the four candidate causes are all present.
		for (const cause of [
			"createOrder",
			"Order",
			"authzPolicy",
			"add_total_col",
		]) {
			await expect(page.getByTestId(`cause-${cause}`)).toBeVisible();
		}

		// nearest-first order: createOrder (dist 1) before Order/authzPolicy (dist 2), both
		// before add_total_col (dist 3); ties (Order, authzPolicy) by id.
		const createOrder = Number(
			await page.getByTestId("cause-createOrder").getAttribute("data-order"),
		);
		const order = Number(
			await page.getByTestId("cause-Order").getAttribute("data-order"),
		);
		const authz = Number(
			await page.getByTestId("cause-authzPolicy").getAttribute("data-order"),
		);
		const migration = Number(
			await page.getByTestId("cause-add_total_col").getAttribute("data-order"),
		);
		expect(createOrder).toBeLessThan(order);
		expect(order).toBeLessThan(authz); // Order < authzPolicy by id at equal distance
		expect(authz).toBeLessThan(migration);

		// the content-addressed kernel.link body is shown (round-trip versionné).
		const body = await page.getByTestId("edge-body").textContent();
		expect(body).toContain('"link_kind":"caused_by"');
		expect(body).toContain("checkout-accept");
	});

	test("a root cause (leaf) shows no upstream cause", async ({ page }) => {
		await trace(page, /root cause|cause racine/i);
		await expect(page.getByTestId("empty-chain")).toBeVisible();
	});

	test("a cyclic graph is REFUSED with CAUSED_BY_CYCLE (cycle refused)", async ({
		page,
	}) => {
		await trace(page, /cycl/i);
		const refused = page.getByTestId("cycle-refused");
		await expect(refused).toBeVisible();
		await expect(refused).toContainText("CAUSED_BY_CYCLE");
		// no cause chain is rendered when a cycle is refused (never a partial chain).
		await expect(page.getByTestId("cause-createOrder")).toHaveCount(0);
	});
});
