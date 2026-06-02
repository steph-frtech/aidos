import { expect, test } from "@playwright/test";

/**
 * S38 Playwright e2e — the web-projection Workbench panel (/web-preview), driven by the
 * playwright-bdd feature tests/e2e/web-preview.feature (materialized from the S11
 * control-spec state fixture + action event fixture).
 *
 * mirror record: reflects=front.web-preview.checkout-button (the EMITTED Next component,
 *               a PROJECTION of the control-spec/action-spec, S11/S38), test_kind=gherkin,
 *               cert_language=playwright-bdd, liveness=alive, authority=above
 *
 * THE DONE CRITERION: the rendered button respects its control-spec fixture — for each
 * given the button's visible/enabled match EvalState(control, given) (S11), and a click
 * on the enabled button declares invoke == Plan(action, click).invoke == createOrder
 * (S11). The component is the EMITTED _generated/checkout-button.tsx (never hand-authored).
 */

test.describe("S38 — Web projection (control-spec → emitted button respects its fixture)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/web-preview");
		await expect(
			page.getByRole("heading", { name: /Web projection|Projection web/i }),
		).toBeVisible({ timeout: 5000 });
	});

	test("the button is visible AND enabled when the control-spec's situation says so", async ({
		page,
	}) => {
		await page
			.getByTestId("fixture-row-filled-cart-valid-form-enabled")
			.click();
		const button = page.getByTestId("aidos-control-checkout-button");
		await expect(button).toBeVisible();
		await expect(button).toBeEnabled();
		await expect(button).toHaveAttribute("data-aidos-visible", "true");
		await expect(button).toHaveAttribute("data-aidos-enabled", "true");
		// The live-state mirrors the fixture, and the respects-fixture badge is green.
		await expect(page.getByTestId("live-visible")).toContainText(/oui|yes/i);
		await expect(page.getByTestId("live-enabled")).toContainText(/oui|yes/i);
		await expect(page.getByTestId("respects-badge")).toContainText(
			/respecte|respects/i,
		);
	});

	test("the button is HIDDEN when the control-spec's situation says so", async ({
		page,
	}) => {
		await page.getByTestId("fixture-row-empty-cart-hides").click();
		// The emitted component returns null when not visible — the marker shows instead.
		await expect(
			page.getByTestId("aidos-control-checkout-button"),
		).toHaveCount(0);
		await expect(page.getByTestId("hidden-marker")).toBeVisible();
		await expect(page.getByTestId("respects-badge")).toContainText(
			/respecte|respects/i,
		);
	});

	test("the button is visible but DISABLED when the form is invalid", async ({
		page,
	}) => {
		await page
			.getByTestId("fixture-row-filled-cart-invalid-form-disabled")
			.click();
		const button = page.getByTestId("aidos-control-checkout-button");
		await expect(button).toBeVisible();
		await expect(button).toBeDisabled();
		await expect(button).toHaveAttribute("data-aidos-enabled", "false");
		await expect(page.getByTestId("respects-badge")).toContainText(
			/respecte|respects/i,
		);
	});

	test("clicking the enabled button DECLARES the bound action's invoke (createOrder)", async ({
		page,
	}) => {
		await page
			.getByTestId("fixture-row-filled-cart-valid-form-enabled")
			.click();
		const button = page.getByTestId("aidos-control-checkout-button");
		// The declared invoke is on the data attribute (Plan(action, click).invoke).
		await expect(button).toHaveAttribute("data-aidos-invoke", "createOrder");
		await button.click();
		await expect(page.getByTestId("invoke-state")).toContainText("createOrder");
	});

	test("the projection is deterministic (RE-EMIT byte-identical) and not stale", async ({
		page,
	}) => {
		await page.getByTestId("reemit-cta").click();
		await expect(page.getByTestId("reemit-ok")).toContainText(
			/octet-pour-octet|byte-for-byte/i,
		);
		await expect(page.getByTestId("stale-badge")).toContainText(
			/à jour|up to date/i,
		);
	});

	test("the emitted component carries the protected header + source hash (provenance visible)", async ({
		page,
	}) => {
		await expect(page.getByTestId("source-hash")).toContainText("8ebfb46f");
		await expect(page.getByTestId("respects-badge")).toBeVisible();
	});
});
