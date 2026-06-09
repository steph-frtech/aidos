import { expect, test } from "@playwright/test";

/**
 * FK13 Playwright e2e — the WhyTree / `/why` Workbench panel (/why-tree).
 * mirror record: reflects=FK13-why-tree-build, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * The done criteria, executed from the screen (FKE-35.1, ROADMAP FK13):
 *   Given the Workbench is running
 *   When I navigate to /why-tree and run /why on the incident scenario
 *   Then the reproduced candidate causes appear (createOrder … add_total_col),
 *        the ROOT cause is add_total_col,
 *        and the terminal anti-recurrence mirror is shown (root → /learn → red wave)   (incident → tree → root mirror → red wave)
 *   When I run /why on the no-mirror scenario
 *   Then it is REFUSED with WHYTREE_NO_MIRROR                                            (a tree without a terminal mirror is refused)
 *   When I run /why on the non-reproduced scenario
 *   Then it is REFUSED (anti-confabulation: WHYTREE_CAUSE_NOT_REPRODUCED)               (a non-reproducible cause is rejected)
 *   When I run /why on the cyclic scenario
 *   Then it is REFUSED with CAUSED_BY_CYCLE and no partial tree                          (cycle refused)
 *
 * READ-ONLY (the wall): the panel runs the SAME pure `build` the Go whytree.Build computes and
 * projects the tree — it never writes truth. Freezing the terminal mirror goes via /learn → /goal.
 */

test.describe("FK13 — the WhyTree /why panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/why-tree");
		await expect(page.getByRole("heading", { name: /WhyTree/i })).toBeVisible({
			timeout: 10000,
		});
	});

	// The panel's case picker — scoped by its aria-label so it is never confused with the
	// header "Projet" combobox (two comboboxes live on the page; this selects the right one).
	function caseSelect(page: import("@playwright/test").Page) {
		return page.getByRole("combobox", { name: /scénario|scenario/i });
	}

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

	async function runWhy(page: import("@playwright/test").Page, label: RegExp) {
		const select = caseSelect(page);
		await select.selectOption({ label: await labelFor(page, label) });
		await expect(page.getByTestId("why-tree")).toBeVisible();
	}

	test("the incident scenario builds a tree rooted at the deepest reproduced cause + terminal mirror", async ({
		page,
	}) => {
		await runWhy(page, /incident/i);

		// the four reproduced candidate causes are all present.
		for (const cause of [
			"createOrder",
			"Order",
			"authzPolicy",
			"add_total_col",
		]) {
			await expect(page.getByTestId(`cause-${cause}`)).toBeVisible();
			await expect(page.getByTestId(`cause-${cause}`)).toHaveAttribute(
				"data-reproduced",
				"true",
			);
		}

		// nearest-first order: createOrder before Order before authzPolicy before add_total_col.
		const order = async (id: string) =>
			Number(await page.getByTestId(`cause-${id}`).getAttribute("data-order"));
		expect(await order("createOrder")).toBeLessThan(await order("Order"));
		expect(await order("Order")).toBeLessThan(await order("authzPolicy"));
		expect(await order("authzPolicy")).toBeLessThan(
			await order("add_total_col"),
		);

		// the ROOT cause is the deepest (add_total_col).
		await expect(page.getByTestId("root-cause")).toHaveText("add_total_col");

		// the OBLIGATORY terminal anti-recurrence mirror (root → /learn → red wave).
		await expect(page.getByTestId("terminal")).toBeVisible();
		await expect(page.getByTestId("terminal-mirror")).toContainText(
			"mir-antirecur",
		);
		await expect(page.getByTestId("red-wave")).toBeVisible();

		// the content-addressed kernel.link body is shown.
		const body = await page.getByTestId("tree-body").textContent();
		expect(body).toContain('"link_kind":"why_tree"');
		expect(body).toContain("add_total_col");
	});

	test("a tree with no terminal mirror is REFUSED (WHYTREE_NO_MIRROR)", async ({
		page,
	}) => {
		await runWhy(page, /no terminal mirror|sans miroir terminal/i);
		const refused = page.getByTestId("refused");
		await expect(refused).toBeVisible();
		await expect(refused).toHaveAttribute("data-error", "WHYTREE_NO_MIRROR");
		// no tree is rendered when refused (never a partial tree).
		await expect(page.getByTestId("cause-createOrder")).toHaveCount(0);
	});

	test("a non-reproduced cause is REFUSED (anti-confabulation)", async ({
		page,
	}) => {
		await runWhy(page, /non-reproduced|non reproduite/i);
		const refused = page.getByTestId("refused");
		await expect(refused).toBeVisible();
		await expect(refused).toHaveAttribute(
			"data-error",
			"WHYTREE_CAUSE_NOT_REPRODUCED",
		);
	});

	test("a caused_by cycle is REFUSED with CAUSED_BY_CYCLE and no partial tree", async ({
		page,
	}) => {
		await runWhy(page, /cycle|cyclic/i);
		const refused = page.getByTestId("refused");
		await expect(refused).toBeVisible();
		await expect(refused).toHaveAttribute("data-error", "CAUSED_BY_CYCLE");
		await expect(page.getByTestId("root-cause")).toHaveCount(0);
	});
});
