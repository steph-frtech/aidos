import { expect, test } from "@playwright/test";

/**
 * FK14 Playwright e2e — the Lexicon Kernel / inter-layer linter Workbench panel (/lexicon).
 * mirror record: reflects=FK14-lexicon-lint, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * The done criteria, executed from the screen (FKE-21, ROADMAP FK14):
 *   Given the Workbench is running
 *   When I navigate to /lexicon and run the linter on the in-lexicon scenario
 *   Then the verdict is CLEAN (no drift) and the content-addressed lexicon body is shown   (green)
 *   When I run the linter on the renamed-table scenario
 *   Then it shows exactly one RENAMED drift (orders_returns, expected return_requests)      (FK14 fault-injection → red)
 *   When I run the linter on the unknown-symbol scenario
 *   Then it shows an UNKNOWN_SYMBOL drift                                                    (a layer the lexicon does not pin)
 *   When I run the linter on the unknown-layer scenario
 *   Then it shows an UNKNOWN_LAYER drift                                                     (a layer outside the 16)
 *
 * READ-ONLY (the wall): the panel runs the SAME pure `lint` the Go lexicon.Lint computes and
 * projects the drifts — it never writes truth. Freezing/updating a lexicon goes via propose → /goal.
 */

test.describe("FK14 — the Lexicon Kernel inter-layer linter panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/lexicon");
		await expect(
			page.getByRole("heading", { name: /Lexicon Kernel/i }),
		).toBeVisible({ timeout: 10000 });
	});

	// The panel's case picker — scoped by its aria-label so it is never confused with the header
	// "Projet" combobox (two comboboxes live on the page; this selects the right one).
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

	async function runLint(page: import("@playwright/test").Page, label: RegExp) {
		const select = caseSelect(page);
		await select.selectOption({ label: await labelFor(page, label) });
		await expect(page.getByTestId("lexicon-result")).toBeVisible();
	}

	test("the in-lexicon scenario lints CLEAN (green) and shows the content-addressed body", async ({
		page,
	}) => {
		await runLint(page, /in lexicon|dans le lexique/i);
		await expect(page.getByTestId("clean-note")).toBeVisible();
		await expect(page.getByTestId("drifts")).toHaveCount(0);
		const body = await page.getByTestId("lexicon-body").textContent();
		expect(body).toContain('"link_kind":"lexicon"');
		expect(body).toContain("return_requests");
	});

	test("FK14 fault-injection: a renamed table is RED with one RENAMED drift", async ({
		page,
	}) => {
		await runLint(page, /renamed table|table renommée/i);
		await expect(page.getByTestId("clean-note")).toHaveCount(0);
		const drift = page.getByTestId("drift-0");
		await expect(drift).toBeVisible();
		await expect(drift).toHaveAttribute("data-kind", "RENAMED");
		await expect(drift).toHaveAttribute("data-layer", "db");
		await expect(drift).toContainText("orders_returns");
		await expect(drift).toContainText("return_requests"); // the expected symbol
		// exactly one drift (the renamed table) — the in-lexicon code symbol is clean.
		await expect(page.getByTestId("drifts").locator("li")).toHaveCount(1);
	});

	test("a layer the lexicon does not pin → UNKNOWN_SYMBOL", async ({
		page,
	}) => {
		await runLint(page, /not named|non nommée/i);
		const drift = page.getByTestId("drift-0");
		await expect(drift).toBeVisible();
		await expect(drift).toHaveAttribute("data-kind", "UNKNOWN_SYMBOL");
	});

	test("a layer outside the 16 → UNKNOWN_LAYER", async ({ page }) => {
		await runLint(page, /outside the 16|hors des 16/i);
		const drift = page.getByTestId("drift-0");
		await expect(drift).toBeVisible();
		await expect(drift).toHaveAttribute("data-kind", "UNKNOWN_LAYER");
	});
});
