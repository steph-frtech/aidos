import { expect, test } from "@playwright/test";

/**
 * S23 Playwright e2e — the stable-phase Workbench panel (/phase-stable).
 * mirror record: reflects=S23-phase-stable, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * The done criteria, executed from the screen (KRD §43):
 *   Given the Workbench is running
 *   When I navigate to /phase-stable and evaluate the EMPTY cut
 *   Then the verdict badge reads STABLE   (the base done criterion)
 *   When I evaluate a cut with one red sensor
 *   Then the verdict badge reads UNSTABLE and the offending mirror id is in the reasons (done)
 *   When I evaluate a cut with one stale link
 *   Then the verdict badge reads UNSTABLE and the offending link is in the reasons
 *
 * READ-ONLY (the wall): the panel runs the SAME pure `isStable` the Go phases.IsStable /
 * `aidos stable` compute and projects the verdict — it never writes truth. Recording a phase
 * node into dag.stable_phase goes via the `aidos` writer role inside a ChangeSet.
 */

test.describe("S23 — the stable-phase panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/phase-stable");
		await expect(
			page.getByRole("heading", { name: /phase stable|stable phase/i }),
		).toBeVisible({ timeout: 10000 });
	});

	// The option labels are bilingual; match by the substring the test cares about.
	async function labelFor(
		page: import("@playwright/test").Page,
		needle: RegExp,
	): Promise<string> {
		const options = page.locator("option");
		const count = await options.count();
		for (let i = 0; i < count; i++) {
			const text = (await options.nth(i).textContent()) ?? "";
			if (needle.test(text)) return text;
		}
		throw new Error(`no option matching ${needle}`);
	}

	async function evaluate(
		page: import("@playwright/test").Page,
		label: RegExp,
	) {
		const select = page.getByRole("combobox");
		await select.selectOption({ label: await labelFor(page, label) });
		await expect(page.getByTestId("phase-stable")).toBeVisible();
	}

	test("the EMPTY cut is STABLE (the base done criterion)", async ({ page }) => {
		await evaluate(page, /empty|vide/i);
		const badge = page.getByTestId("verdict-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveAttribute("data-stable", "true");
		await expect(badge).toHaveText(/STABLE/);
		// no reasons when stable.
		await expect(page.getByTestId("reasons")).toHaveCount(0);
	});

	test("a cut with one red sensor is UNSTABLE and names it (THE done criterion)", async ({
		page,
	}) => {
		await evaluate(page, /red.?sensor|senseur rouge/i);
		const badge = page.getByTestId("verdict-badge");
		await expect(badge).toHaveAttribute("data-stable", "false");
		await expect(badge).toHaveText(/UNSTABLE/);
		// the offending mirror id appears in the reasons.
		await expect(page.getByTestId("reasons")).toBeVisible();
		await expect(
			page.getByTestId("reason-createOrder.fixture"),
		).toBeVisible();
		// the sensor is rendered red.
		await expect(page.getByTestId("sensor-createOrder.fixture")).toHaveAttribute(
			"data-pass",
			"false",
		);
	});

	test("a cut with one stale link is UNSTABLE and names it", async ({ page }) => {
		await evaluate(page, /stale.?link|lien périmé/i);
		const badge = page.getByTestId("verdict-badge");
		await expect(badge).toHaveAttribute("data-stable", "false");
		await expect(badge).toHaveText(/UNSTABLE/);
		// the link is rendered stale (red).
		await expect(
			page.getByTestId("link-checkout-submit-createOrder"),
		).toHaveAttribute("data-status", "stale");
		// the offending link is named in the reasons.
		await expect(page.getByTestId("reasons")).toContainText("createOrder@v2");
	});
});
