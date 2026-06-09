import { expect, test } from "@playwright/test";

/**
 * S103 Playwright e2e — the « composition des invariants de fédération » Workbench panel (§51).
 * mirror record: reflects=S103-federation, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /federation route is action-capable (ui-completeness law, CLAUDE.md §7): TWO controls
 * are reachable AND executable from the screen, bound to Server Actions running the REAL pure
 * composition engine (lib/federation, the TS twin of back/runtime/federation). The S103 done-criteria,
 * reached from the screen:
 *   - the saga (payment_captured ⇒ order_confirmed ∨ compensation) holds on two REAL cells (happy);
 *   - breaking a leg triggers compensation (the saga settles satisfied VIA compensation);
 *   - a global policy expressed ONCE fans out to a RedWorkQueue PER CELL — order + payment redden,
 *     shipping (non-violating) stays GREEN.
 *
 * THE WALL (CLAUDE.md §2): the screen only COMPOSES + RENDERS values — it writes no truth. The
 * composition is a pure function (never an LLM).
 */

test.describe("S103 — cross-cell federation", () => {
	test("the route renders the panel with both controls", async ({ page }) => {
		await page.goto("/federation");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Composition des invariants de fédération|Composing federation invariants/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("run-saga")).toBeVisible();
		await expect(page.getByTestId("run-fanout")).toBeVisible();
	});

	test("saga holds on two real cells on the happy path", async ({ page }) => {
		await page.goto("/federation");
		await page.getByTestId("run-saga").click();
		const result = page.getByTestId("saga-result");
		await expect(result).toBeVisible();
		await expect(page.getByTestId("saga-leg")).toHaveText("happy");
		await expect(page.getByTestId("saga-outcome")).toHaveText("satisfied");
	});

	test("breaking a leg triggers compensation", async ({ page }) => {
		await page.goto("/federation");
		await page.getByTestId("break-leg").check();
		await page.getByTestId("run-saga").click();
		await expect(page.getByTestId("saga-leg")).toHaveText("compensated");
		await expect(page.getByTestId("saga-outcome")).toHaveText("satisfied");
		await expect(page.getByTestId("saga-compensation")).toContainText("refundPayment@v3");
		await expect(page.getByTestId("saga-compensation")).toContainText("compensation_executed");
	});

	test("a global policy fans out to a RedWorkQueue per cell; non-affected cells stay green", async ({
		page,
	}) => {
		await page.goto("/federation");
		await page.getByTestId("run-fanout").click();
		const result = page.getByTestId("fanout-result");
		await expect(result).toBeVisible();

		// order + payment are reddened (they violate the policy).
		await expect(page.getByTestId("cell-status-order")).toHaveText(/rouge|red/);
		await expect(page.getByTestId("cell-status-payment")).toHaveText(/rouge|red/);
		// shipping (non-violating) stays GREEN — the §51 invariant.
		await expect(page.getByTestId("cell-status-shipping")).toHaveText(/verte|green/);

		// the affected-cells projection lists exactly order + payment.
		await expect(page.getByTestId("fanout-affected")).toContainText("order");
		await expect(page.getByTestId("fanout-affected")).toContainText("payment");
		await expect(page.getByTestId("fanout-affected")).not.toContainText("shipping");
	});
});
