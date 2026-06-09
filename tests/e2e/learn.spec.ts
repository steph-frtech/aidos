import { expect, test } from "@playwright/test";

/**
 * S107 Playwright e2e — the « /learn — incident → nouveau miroir → nouvelle dent » Workbench panel
 * (EPIC 12 / E12).
 * mirror record: reflects=S107-learn, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /learn route is action-capable (ui-completeness law, CLAUDE.md §7): a control is
 * reachable AND executable from the screen, bound to a Server Action running the REAL pure
 * loop-closure engine (lib/learn, the TS twin of back/runtime/learn). The S107 done-criterion,
 * reached from the screen:
 *
 *   « un RealityMirror (idée draft, provenance=incident) re-rentre à idée→grill→goal ; sur
 *     approbation humaine un NOUVEAU miroir est attaché, le hash policy/operation CHANGE, et un
 *     RED WAVE CIBLÉ devient la worklist. »
 *
 * THE WALL (CLAUDE.md §2): the screen only RENDERS values — the loop writes no truth (wroteKernel
 * is false; the direct Reality→Kernel edge is refused). The hash bump AND the red wave are pure
 * code; nothing learns its own fitness.
 */

test.describe("S107 — /learn (incident → new mirror → red wave)", () => {
	test("the route renders the loop-closure control", async ({ page }) => {
		await page.goto("/learn");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /nouveau miroir|new mirror/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("close-loop")).toBeVisible();
		await expect(page.getByTestId("re-reflect-toggle")).toBeVisible();
	});

	test("the done-criterion: incident → approved mirror → hash bump → targeted red wave", async ({
		page,
	}) => {
		await page.goto("/learn");
		await page.getByTestId("close-loop").click();

		await expect(page.getByTestId("learn-result")).toBeVisible();
		// provenance = incident (the loop traces back to the production incident).
		await expect(page.getByTestId("provenance")).toContainText("incident");
		await expect(page.getByTestId("provenance")).toContainText("#1042");
		// the operation hash BUMPED (before != after).
		await expect(page.getByTestId("bump-target")).toHaveText("op-createOrder");
		const before = await page.getByTestId("bump-before").textContent();
		const after = await page.getByTestId("bump-after").textContent();
		expect(before).not.toBe(after);
		await expect(page.getByTestId("bump-moved")).toContainText(/BUMP/);
		// a TARGETED red wave became the worklist, mirror-first.
		await expect(page.getByTestId("wave-list")).toBeVisible();
		const items = page.getByTestId("wave-item");
		await expect(items.first()).toContainText("mirror");
		// THE WALL: the loop writes no truth.
		await expect(page.getByTestId("wall-status")).toHaveText(
			/n'écrit pas le kernel|writes no kernel/,
		);
		await expect(page.getByTestId("wall-code")).toHaveText(
			"REALITY_CANNOT_DECLARE_TRUTH",
		);
	});

	test("a no-op re-reflection (mirror already attached) produces NO bump and an EMPTY wave", async ({
		page,
	}) => {
		await page.goto("/learn");
		await page.getByTestId("re-reflect-toggle").check();
		await page.getByTestId("close-loop").click();

		await expect(page.getByTestId("learn-result")).toBeVisible();
		// no bump: a cosmetic re-reflection is not a new tooth.
		await expect(page.getByTestId("bump-moved")).toContainText(
			/re-réflexion cosmétique|cosmetic re-reflection/,
		);
		// the wave is empty (no work).
		await expect(page.getByTestId("wave-empty")).toBeVisible();
		await expect(page.getByTestId("wave-item")).toHaveCount(0);
	});

	test("the wall holds and nothing learns its own fitness (wroteKernel=false)", async ({
		page,
	}) => {
		await page.goto("/learn");
		await page.getByTestId("close-loop").click();
		await expect(page.getByTestId("wall-status")).toHaveText(
			/n'écrit pas le kernel|writes no kernel/,
		);
	});
});
