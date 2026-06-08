import { expect, test } from "@playwright/test";

/**
 * S83 Playwright e2e — « Boucle de build » Workbench panel.
 * mirror record: reflects=S83-build-loop, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /build-loop route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * build-loop termination control is reachable AND executable from the screen, bound to a
 * Server Action that COMPUTES the termination decision DETERMINISTICALLY (the pure twin
 * lib/build-loop.terminate, byte-identical to back/runtime/buildloop.Terminate). The screen
 * lets a human drive the three laws:
 *   - GREEN only when the non-gameable Stop passes (full red set green + prior intact +
 *     mutation ≥ floor + no monster);
 *   - a build that SPENDS WITHOUT ADVANCING stops with BUILD_LOOP_NO_PROGRESS;
 *   - termination is a pure function of the history (deterministic).
 *
 * THE WALL (CLAUDE.md §2): the decision is a read/compute below the line — it writes NO
 * truth. No LLM enters; the judge is the mirror verdict + the pure detector.
 */

test.describe("S83 — Build loop", () => {
	test("the route renders the build-loop console", async ({ page }) => {
		await page.goto("/build-loop");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Boucle de build|Build loop/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("evaluate-form")).toBeVisible();
	});

	test("a fully-green red set terminates GREEN (the non-gameable Stop passes)", async ({
		page,
	}) => {
		await page.goto("/build-loop");
		// Red set: two mirrors. Mark BOTH green; defaults give mutation 0.9 ≥ floor 0.7.
		await page
			.getByTestId("field-red-set")
			.fill("Order.checkout.feature\nOrder.total.property");
		await page
			.getByTestId("field-green-sensors")
			.fill("Order.checkout.feature\nOrder.total.property");
		await page
			.getByTestId("field-history")
			.fill(
				"d1 | Order.checkout.feature\nd2 | Order.checkout.feature,Order.total.property",
			);
		// Make the non-gameable Stop conditions explicit: mutation 0.9 ≥ floor 0.7.
		await page.getByTestId("field-mutation").fill("0.9");
		await page.getByTestId("field-mutation-floor").fill("0.7");

		await page.getByTestId("evaluate-submit").click();

		const badge = page.getByTestId("verdict-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveAttribute("data-verdict", "green");
		await expect(page.getByTestId("block-code")).toHaveCount(0);
	});

	test("a build that spends without advancing stops with BUILD_LOOP_NO_PROGRESS", async ({
		page,
	}) => {
		await page.goto("/build-loop");
		await page
			.getByTestId("field-red-set")
			.fill("Order.checkout.feature\nOrder.total.property");
		// One mirror green, the other red ⇒ not green; the history stagnates (identical diffs).
		await page
			.getByTestId("field-green-sensors")
			.fill("Order.checkout.feature");
		await page
			.getByTestId("field-history")
			.fill("same | Order.checkout.feature\nsame | Order.checkout.feature");
		await page.getByTestId("field-stagnation-window").fill("2");

		await page.getByTestId("evaluate-submit").click();

		const badge = page.getByTestId("verdict-badge");
		await expect(badge).toHaveAttribute("data-verdict", "no_progress");
		await expect(page.getByTestId("block-code")).toHaveText(
			"BUILD_LOOP_NO_PROGRESS",
		);
	});

	test("an over-budget run stops, wired to the HarnessCostBudget", async ({
		page,
	}) => {
		await page.goto("/build-loop");
		await page
			.getByTestId("field-red-set")
			.fill("Order.checkout.feature\nOrder.total.property");
		// Not green; an ADVANCING history so the structural breaker is silent — the halt is the budget.
		await page.getByTestId("field-green-sensors").fill("");
		await page
			.getByTestId("field-history")
			.fill("d1 | \nd2 | Order.checkout.feature");
		await page.getByTestId("field-stagnation-window").fill("2");
		await page.getByTestId("field-max-llm-tokens").fill("1000");
		await page.getByTestId("field-spent-llm-tokens").fill("5000");

		await page.getByTestId("evaluate-submit").click();

		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"no_progress",
		);
		await expect(page.getByTestId("over-budget-axes")).toContainText(
			"llm_tokens",
		);
	});
});
