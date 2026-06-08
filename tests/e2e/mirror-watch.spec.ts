import { expect, test } from "@playwright/test";

/**
 * S69 Playwright e2e — the « matérialiser-et-le-voir-rougir » Workbench panel.
 * mirror record: reflects=S69-mirror-watch, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /mirror-watch route is action-capable (ui-completeness law, CLAUDE.md §7): the control
 * is reachable AND executable from the screen, bound to a Server Action running the REAL pure engine
 * (lib/mirror-watch, the TS twin of back/kernel/mirror/watch). The done-criterion of S69:
 *   - a Godog (gherkin) author → materialize → RED against absent code (the "watch it fail");
 *   - then a stub (code present) → GREEN.
 * The live run stream (queued → materialized → running → verdict) renders below the control.
 *
 * THE WALL (CLAUDE.md §2): the screen only RUNS the authored, above-the-line mirror — it writes no
 * truth. The verdict is decided by code-presence, a pure function (never an LLM).
 */

test.describe("S69 — Materialize-and-watch-it-redden", () => {
	test("the route renders the panel with the run control", async ({ page }) => {
		await page.goto("/mirror-watch");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Matérialiser-et-le-voir-rougir|Materialize-and-watch-it-redden/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("watch-submit")).toBeVisible();
		await expect(page.getByTestId("watch-code-present")).toBeVisible();
	});

	test("a Godog author materializes and the mirror goes RED against absent code", async ({
		page,
	}) => {
		await page.goto("/mirror-watch");
		await page.getByTestId("watch-nature").selectOption("acceptance");
		await page.getByTestId("watch-reflects").fill("Order.place");
		await page
			.getByTestId("watch-source")
			.fill(
				"Scenario: place an order\nGiven a cart\nWhen I place the order\nThen an order exists",
			);
		// code-present UNCHECKED ⇒ watch it fail.
		await page.getByTestId("watch-submit").click();

		const result = page.getByTestId("watch-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-red", "true");
		await expect(page.getByTestId("verdict-badge")).toHaveText(/ROUGE|RED/);
		// dispatched to Godog (the gherkin form's runner, the closed table).
		await expect(page.getByTestId("watch-runner")).toHaveText("godog");
		// the live stream walked to a verdict carrying RED (dead).
		const stream = page.getByTestId("watch-stream");
		await expect(stream.locator('[data-phase="verdict"]')).toHaveAttribute(
			"data-status",
			"dead",
		);
	});

	test("then a stub (code present) turns the SAME mirror GREEN", async ({
		page,
	}) => {
		await page.goto("/mirror-watch");
		await page.getByTestId("watch-nature").selectOption("acceptance");
		await page.getByTestId("watch-reflects").fill("Order.place");
		await page
			.getByTestId("watch-source")
			.fill(
				"Scenario: place an order\nGiven a cart\nWhen I place the order\nThen an order exists",
			);
		// code present ⇒ the stub passes.
		await page.getByTestId("watch-code-present").check();
		await page.getByTestId("watch-submit").click();

		const result = page.getByTestId("watch-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-red", "false");
		await expect(page.getByTestId("verdict-badge")).toHaveText(/VERT|GREEN/);
		const stream = page.getByTestId("watch-stream");
		await expect(stream.locator('[data-phase="verdict"]')).toHaveAttribute(
			"data-status",
			"alive",
		);
	});

	test("an unparseable source is refused (never a guessed verdict)", async ({
		page,
	}) => {
		await page.goto("/mirror-watch");
		await page.getByTestId("watch-source").fill("garbage that does not parse");
		await page.getByTestId("watch-submit").click();
		const result = page.getByTestId("watch-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-ok", "false");
		await expect(page.getByTestId("watch-error")).toBeVisible();
	});
});
