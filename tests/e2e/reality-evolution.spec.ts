import { expect, test } from "@playwright/test";

/**
 * S109 Playwright e2e — the « Cockpit réalité & évolution par projet » Workbench panel (EPIC 12 /
 * E12).
 * mirror record: reflects=S109-reality-evolution, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /reality-evolution COCKPIT is action-capable (ui-completeness law, CLAUDE.md §7):
 * controls reachable AND executable from the screen, bound to Server Actions running the REAL pure
 * twins (lib/reality-evolution composing S106 ingest + S107 learn + S108 QD). The §S109
 * done-criterion, reached from the screen:
 *
 *   « ingérer un incident, approuver le miroir appris, voir le red wave apparaître. »
 *
 * THE WALL (CLAUDE.md §2): the screen only RENDERS values — the cockpit writes no truth
 * (wroteKernel/writesTruth=false). The mirror-breaker is never an élite (anti-Goodhart); a
 * promotion is a PROPOSAL the human freezes at /goal.
 */

test.describe("S109 — reality & evolution cockpit", () => {
	test("the route renders the cockpit controls", async ({ page }) => {
		await page.goto("/reality-evolution");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /miroir appris|learned mirror/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("close-reality")).toBeVisible();
		await expect(page.getByTestId("healthy-toggle")).toBeVisible();
		await expect(page.getByTestId("elites-list")).toBeVisible();
	});

	test("the done-criterion: ingest an incident → approve the learned mirror → the red wave APPEARS", async ({
		page,
	}) => {
		await page.goto("/reality-evolution");
		await page.getByTestId("close-reality").click();

		await expect(page.getByTestId("closure-result")).toBeVisible();
		// Step 1 — the incident was ingested (provenance=incident).
		await expect(page.getByTestId("provenance")).toContainText("incident");
		await expect(page.getByTestId("idea-text")).toContainText(
			/createOrder/,
		);
		// Step 2 — the approved mirror BUMPED the createOrder operation hash (before != after).
		await expect(page.getByTestId("bump-target")).toHaveText("op-createOrder");
		const before = await page.getByTestId("bump-before").textContent();
		const after = await page.getByTestId("bump-after").textContent();
		expect(before).not.toBe(after);
		await expect(page.getByTestId("bump-moved")).toContainText(
			/nouvelle dent|new tooth/,
		);
		// Step 3 — the RED WAVE APPEARED (the done-criterion).
		const wave = page.getByTestId("red-wave-appeared");
		await expect(wave).toBeVisible();
		await expect(wave).toHaveAttribute("data-appeared", "true");
		await expect(wave).toContainText(/red wave/);
		await expect(page.getByTestId("wave-list")).toBeVisible();
		await expect(page.getByTestId("wave-item").first()).toContainText("mirror");
		// THE WALL: the cockpit writes no truth.
		await expect(page.getByTestId("wall-status")).toContainText(
			/n'écrit pas le kernel|writes no kernel/,
		);
		await expect(page.getByTestId("wall-status")).toContainText(
			"REALITY_CANNOT_DECLARE_TRUTH",
		);
	});

	test("a healthy report → no divergence, nothing learned", async ({ page }) => {
		await page.goto("/reality-evolution");
		await page.getByTestId("healthy-toggle").check();
		await page.getByTestId("close-reality").click();

		await expect(page.getByTestId("no-divergence")).toBeVisible();
		await expect(page.getByTestId("closure-result")).toHaveCount(0);
	});

	test("the QD elites archive: the mirror-breaker is NEVER an élite; a green élite promotes to a PROPOSAL", async ({
		page,
	}) => {
		await page.goto("/reality-evolution");
		// the mirror-breaker (var-fast-breaker, fitness 0.99) is absent from the elites.
		const rows = page.getByTestId("elite-row");
		await expect(rows.first()).toBeVisible();
		await expect(page.getByText("var-fast-breaker")).toHaveCount(0);
		await expect(page.getByText("var-fast-green")).toBeVisible();

		// promote the 'fast' niche WITHOUT authority → refused, no truth.
		await page.getByTestId("promote-fast").click();
		await expect(page.getByTestId("promotion-result")).toBeVisible();
		await expect(page.getByTestId("promotion-verdict")).toContainText(
			/refused/,
		);
		await expect(page.getByTestId("promotion-writes-truth")).toContainText(
			/n'écrit aucune vérité|writes no truth/,
		);

		// grant authority and promote → a PROPOSAL that writes no truth.
		await page.getByTestId("authority-fast").check();
		await page.getByTestId("promote-fast").click();
		await expect(page.getByTestId("promotion-verdict")).toContainText(
			/proposed/,
		);
		await expect(page.getByTestId("promotion-writes-truth")).toContainText(
			/n'écrit aucune vérité|writes no truth/,
		);
	});
});
