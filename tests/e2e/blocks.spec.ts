import { expect, test } from "@playwright/test";

/**
 * S60 Playwright e2e — the global BlockReason panel (/blocks) + the live goal stream
 * (/goal-stream).
 * mirror record: reflects=S60-blocks-goal-stream, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the S60 done criteria, executable from the screen (ui-completeness, CLAUDE.md §7):
 *   - DONE CRITERION: a refused truth-write surfaces its actionable BlockReason. The
 *     "attempt the write" control on /blocks runs a truth-zone tool (kernel_write) through
 *     the gateway router (the same server-side wall, §2); the inline toast renders the REAL
 *     BlockReason (code GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET + severity + explanation +
 *     how_to_fix[]).
 *   - the global catalog lists the closed, declared refusal codes.
 *   - the /goal-stream panel streams the open goal's red set / RedWorkQueue / sensors,
 *     tagged live/demo; offline it falls back deterministically to the demo twin whose red
 *     set EQUALS the engine-computed red set.
 * No truth is written — the wall refuses (CLAUDE.md §2).
 */

test.describe("S60 — global BlockReason panel (/blocks)", () => {
	test("the catalog lists the declared refusal codes", async ({ page }) => {
		await page.goto("/blocks");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Refus \(BlockReason\)|Refusals \(BlockReason\)/,
			}),
		).toBeVisible();
		const catalog = page.getByTestId("catalog-list");
		await expect(catalog).toContainText("GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET");
		await expect(catalog).toContainText("AGENT_CROSS_PROJECT_WRITE");
		await expect(catalog).toContainText("GOAL_STILL_RED");
	});

	test("DONE CRITERION: a refused truth-write surfaces its actionable BlockReason", async ({
		page,
	}) => {
		await page.goto("/blocks");
		// kernel_write is the default tool; attempt the write — the wall refuses.
		await page.getByTestId("refuse-button").click();
		const toast = page.getByTestId("block-toast");
		await expect(toast).toBeVisible();
		await expect(page.getByTestId("toast-code")).toHaveText(
			"GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET",
		);
		// The actionable how_to_fix[] is rendered (at least one item).
		await expect(toast.locator("ul li").first()).toBeVisible();
	});

	test("a different truth-zone tool is also refused with the same code", async ({
		page,
	}) => {
		await page.goto("/blocks");
		await page.getByTestId("field-tool").selectOption("mirror_write");
		await page.getByTestId("refuse-button").click();
		await expect(page.getByTestId("toast-code")).toHaveText(
			"GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET",
		);
	});
});

test.describe("S60 — live goal stream (/goal-stream)", () => {
	test("the panel streams the open goal's red set, queue and sensors", async ({
		page,
	}) => {
		await page.goto("/goal-stream");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Goal en direct|Live goal/,
			}),
		).toBeVisible();
		// Offline (no live gateway), the source badge reads demo and the panel is populated.
		const badge = page.getByTestId("stream-source");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveText(/démo|demo/);
		// The red set equals the engine-computed twin's red set (Order.discount.fixture).
		await expect(page.getByTestId("red-set")).toContainText(
			"Order.discount.fixture",
		);
		await expect(page.getByTestId("queue")).toContainText(
			"Order.discount.fixture",
		);
		await expect(page.getByTestId("sensors")).toContainText(
			"Order.discount.fixture",
		);
	});

	test("the refresh control executes (stays populated through the read)", async ({
		page,
	}) => {
		await page.goto("/goal-stream");
		await page.getByTestId("refresh-button").click();
		// After the read the stream stays populated (deterministic demo fallback).
		await expect(page.getByTestId("red-set")).toContainText(
			"Order.discount.fixture",
		);
		await expect(page.getByTestId("stream-source")).toHaveText(/démo|demo/);
	});
});
