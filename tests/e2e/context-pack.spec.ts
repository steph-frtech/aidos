import { expect, test } from "@playwright/test";

/**
 * S33 Playwright e2e — the ContextRouter/ContextPack Workbench panel (/context-pack).
 * mirror record: reflects=runtime.context.Compile (the deterministic, LLM-free, RAG-free context
 *               compiler ; KRD §143/§144 ; minimal, branch-aware ; the wall as a boundary),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: the checkout goal does NOT receive billing internals; stale memory excluded (the done)
 *   Given the Workbench is running
 *   When I navigate to /context-pack on branch main and click COMPILER
 *   Then the Included panel shows the checkout affected layers, the red mirrors and the crossed
 *        PaymentGateway@hash contract, plus idempotency-for-payment and out-of-stock-incident
 *   And the Excluded panel shows billing:invoice-internals tagged cross-BC and old-promo-rule
 *        tagged stale (the done criterion, rendered)
 *   And the memory does NOT show refund-window (out-of-scope) nor the stale rule
 *   And the Boundaries strip lists /kernel/** and /mirror/** as forbidden, with a non-empty
 *        stop condition and the pack hash shown
 */

test.describe("S33 — the ContextPack compiled from the red-set", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/context-pack");
		await expect(page.getByTestId("context-pack-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("compiling checkout-apply-promo on main includes the checkout subgraph + crossed contract", async ({
		page,
	}) => {
		await page.getByTestId("run-compile").click();
		await expect(page.getByTestId("included-panel")).toBeVisible();

		const affected = page.getByTestId("affected-layers");
		await expect(affected.locator('[data-id="view:cart"]')).toBeVisible();
		await expect(
			affected.locator('[data-id="control:promo-field"]'),
		).toBeVisible();
		await expect(
			affected.locator('[data-id="operation:applyPromo"]'),
		).toBeVisible();

		const mirrors = page.getByTestId("active-mirrors");
		await expect(
			mirrors.locator('[data-id="promo-field.fixture"]'),
		).toBeVisible();
		await expect(
			mirrors.locator('[data-id="applyPromo.workflow"]'),
		).toBeVisible();

		const contracts = page.getByTestId("active-contracts");
		await expect(
			contracts.locator('[data-id="PaymentGateway@hash"]'),
		).toBeVisible();

		await expect(
			page
				.getByTestId("memory-lessons")
				.locator('[data-id="idempotency-for-payment"]'),
		).toBeVisible();
		await expect(
			page
				.getByTestId("memory-incidents")
				.locator('[data-id="out-of-stock-incident"]'),
		).toBeVisible();
	});

	test("the done criterion: billing internals excluded cross-BC, stale memory excluded", async ({
		page,
	}) => {
		await page.getByTestId("run-compile").click();
		await expect(page.getByTestId("excluded-panel")).toBeVisible();

		// billing:invoice-internals is excluded and tagged cross-BC
		const billing = page
			.getByTestId("excluded-item")
			.and(page.locator('[data-id="billing:invoice-internals"]'));
		await expect(billing).toHaveAttribute("data-reason", "cross-BC");

		// old-promo-rule is excluded and tagged stale (the done criterion, rendered)
		const stale = page
			.getByTestId("excluded-item")
			.and(page.locator('[data-id="old-promo-rule"]'));
		await expect(stale).toHaveAttribute("data-reason", "stale");

		// refund-window is excluded out-of-scope
		const refund = page
			.getByTestId("excluded-item")
			.and(page.locator('[data-id="refund-window"]'));
		await expect(refund).toHaveAttribute("data-reason", "out-of-scope");

		// memory must NOT show the stale rule nor the out-of-scope record
		await expect(
			page.getByTestId("memory-lessons").locator('[data-id="old-promo-rule"]'),
		).toHaveCount(0);
		await expect(
			page.getByTestId("memory-lessons").locator('[data-id="refund-window"]'),
		).toHaveCount(0);

		// billing internals must NOT appear in the affected layers
		await expect(
			page
				.getByTestId("affected-layers")
				.locator('[data-id="billing:invoice-internals"]'),
		).toHaveCount(0);
	});

	test("the Boundaries strip renders the wall, a stop condition and the pack hash", async ({
		page,
	}) => {
		await page.getByTestId("run-compile").click();

		const forbidden = page.getByTestId("forbidden-paths");
		await expect(forbidden.locator('[data-path="/kernel/**"]')).toBeVisible();
		await expect(forbidden.locator('[data-path="/mirror/**"]')).toBeVisible();

		await expect(
			page.getByTestId("allowed-paths").locator('[data-id="/src/checkout/**"]'),
		).toBeVisible();

		const stop = page.getByTestId("stop-condition");
		await expect(stop).toContainText("red_set_green");

		const hash = page.getByTestId("pack-hash");
		await expect(hash).toBeVisible();
		await expect(hash).not.toHaveText("");
	});
});
