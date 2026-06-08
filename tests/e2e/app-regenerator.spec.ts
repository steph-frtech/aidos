import { expect, test } from "@playwright/test";

/**
 * S78 Playwright e2e — the « Régénérer mon app » Workbench panel.
 * mirror record: reflects=S78-app-regenerator, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /app-regenerator route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * control is reachable AND executable from the screen, bound to a Server Action running the REAL
 * pure engine (lib/app-regenerator, the TS twin of back/runtime/regen). The S78 done-criteria,
 * reached from the screen:
 *   - a clean regeneration re-emits the whole project deterministically and classifies the files
 *     (stale by source-hash / fresh / unchanged);
 *   - a hand-edited generated file REFUSES the regeneration with GEN_FILE_HAND_EDITED (the tree is
 *     never silently overwritten).
 *
 * THE WALL (CLAUDE.md §2): the screen only RUNS the projection — it writes no truth. Regeneration
 * is a pure function (never an LLM); the drift verdict is a pure hash inequality.
 */

test.describe("S78 — regenerate my app", () => {
	test("the route renders the panel with the regenerate control", async ({
		page,
	}) => {
		await page.goto("/app-regenerator");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Régénérer mon app|Regenerate my app/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("regen-submit")).toBeVisible();
		await expect(page.getByTestId("regen-scenario")).toBeVisible();
	});

	test("a clean regeneration re-emits the project and classifies the files", async ({
		page,
	}) => {
		await page.goto("/app-regenerator");
		await page.getByTestId("regen-scenario").selectOption("clean");
		await page.getByTestId("regen-submit").click();

		const result = page.getByTestId("regen-result");
		await expect(result).toHaveAttribute("data-verdict", "regenerated");
		// Artifacts were emitted (the whole project — at least the DDL + TS files).
		const list = page.getByTestId("artifact-list");
		await expect(list).toBeVisible();
		await expect(list.locator("li")).not.toHaveCount(0);
		// The demo runs over a FAITHFUL ledger+tree → every file is classified unchanged
		// (a clean, byte-stable no-op rewrite); nothing drifted, nothing stale.
		await expect(page.getByTestId("count-unchanged")).not.toHaveText("0");
		await expect(page.getByTestId("count-stale")).toHaveText("0");
	});

	test("a hand-edited generated file refuses the regeneration", async ({
		page,
	}) => {
		await page.goto("/app-regenerator");
		await page.getByTestId("regen-scenario").selectOption("handedit");
		await page.getByTestId("regen-submit").click();

		const result = page.getByTestId("regen-result");
		await expect(result).toHaveAttribute("data-verdict", "refused");
		await expect(page.getByTestId("block-code")).toHaveText(
			"GEN_FILE_HAND_EDITED",
		);
		// The refusal names a door out (no prison).
		await expect(page.getByTestId("block-explanation")).toBeVisible();
		// No artifact list is shown — a refused regeneration overwrites nothing.
		await expect(page.getByTestId("artifact-list")).toHaveCount(0);
	});
});
