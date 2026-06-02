import { expect, test } from "@playwright/test";

/**
 * S22 Playwright e2e — the red-wave Workbench panel (/red-wave).
 * mirror record: reflects=S22-impact-red-wave, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * The done criteria, executed from the screen (KRD §42/§98):
 *   Given the Workbench is running
 *   When I navigate to /red-wave and FIRE the Order entity bump
 *   Then the wave's mirror item (Order.schema.fixture) appears BEFORE the projections
 *   And api / db / types appear as red items   (done criterion part 1)
 *   When I fire the load-bearing submit-btn bump
 *   Then checkout-view appears as a red item   (done criterion part 2)
 *   When I fire the cosmetic label-btn bump
 *   Then checkout-view is NOT in the red set    (the negative)
 *
 * READ-ONLY (the wall): the panel runs the SAME pure `impact` the Go redwave.Impact /
 * `aidos impact` compute and projects the wave — it never writes truth. The real enqueue is
 * the harness-invoked PostKernelChange hook below the waterline.
 */

test.describe("S22 — the red-wave panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/red-wave");
		await expect(
			page.getByRole("heading", { name: /vague de rouge/i }),
		).toBeVisible({ timeout: 10000 });
	});

	async function fire(page: import("@playwright/test").Page, label: RegExp) {
		const select = page.getByRole("combobox");
		await select.selectOption({ label: await labelFor(page, label) });
		await expect(page.getByTestId("red-wave")).toBeVisible();
	}

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

	test("an Order entity bump reddens its mirror FIRST then api/db/types (part 1)", async ({
		page,
	}) => {
		await fire(page, /order/i);

		// The mirror item is present and ranks before any projection (data-order is the
		// rendered, mirror-first index from the pure engine).
		const mirror = page.getByTestId("wave-item-Order.schema.fixture");
		await expect(mirror).toBeVisible();
		await expect(mirror).toHaveAttribute("data-layer", "mirror");
		const mirrorOrder = Number(await mirror.getAttribute("data-order"));

		for (const proj of ["api", "db", "types"]) {
			const item = page.getByTestId(`wave-item-${proj}`);
			await expect(item).toBeVisible();
			await expect(item).toHaveAttribute("data-layer", "projection");
			const order = Number(await item.getAttribute("data-order"));
			// mirror-first: the mirror's order index is strictly before each projection's.
			expect(mirrorOrder).toBeLessThan(order);
		}
	});

	test("a load-bearing submit-btn bump reddens checkout-view (part 2)", async ({
		page,
	}) => {
		await fire(page, /submit-btn/i);
		const view = page.getByTestId("wave-item-checkout-view");
		await expect(view).toBeVisible();
		await expect(view).toHaveAttribute("data-layer", "button");
	});

	test("a cosmetic label-btn bump does NOT redden checkout-view (the negative)", async ({
		page,
	}) => {
		await fire(page, /label-btn/i);
		// The cosmetic edge does not propagate — checkout-view is absent and the wave is empty.
		await expect(page.getByTestId("wave-item-checkout-view")).toHaveCount(0);
		await expect(page.getByTestId("empty-wave")).toBeVisible();
	});
});
