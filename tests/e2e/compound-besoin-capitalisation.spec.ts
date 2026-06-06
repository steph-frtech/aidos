import { expect, test } from "@playwright/test";

/**
 * EL18 Playwright e2e — the deterministic need-capitalisation Workbench panel
 * (/compound-besoin-capitalisation).
 * mirror record: reflects=back/runtime/besoin/capitalisation.go + the besoin_capitalise MCP tool
 *               (CapitaliseBesoin(resolve): the reusable anchor + the candidate besoin-behaviour via
 *               firewall.ViaIdea, NEVER ToKernel/fitness; the idea's provenance reconstructs to the
 *               graph_hash; cross-app reuse is a name-match on canonicalised keys),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness, CLAUDE.md §7): the human enters a first resolved
 * need's verbatim intents, then "Capitaliser le besoin" EXECUTES anchor() from the screen (the
 * besoin_capitalise op) → the reusable anchor (graph_hash + canonicalised units), the DRAFT behaviour
 * candidate, the provenance reconstructing to the graph_hash, the wall note. A second need + "Mesurer
 * la réutilisation" runs the CE05 name-match. ABOVE the wall: writes no truth, strictly via ViaIdea.
 *
 * Scenario A: capitalising a resolved need shows the anchor (graph_hash + units), the provenance
 *             reconstructing to the graph_hash.
 * Scenario B: a similar second need (cosmetic variants) replays ≥1 unit → saved tokens > 0.
 * Scenario C: a dissimilar second need fabricates NO reuse (the anti-false-positive note).
 * Scenario D: reset clears the anchor.
 */

test.describe("EL18 — /compound-besoin-capitalisation", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin-capitalisation");
		await expect(page.getByTestId("capitalise-cta")).toBeVisible({
			timeout: 5000,
		});
	});

	test("capitalising a resolved need shows the anchor + provenance reconstructing to the graph_hash", async ({
		page,
	}) => {
		await page.getByTestId("capitalise-cta").click();
		const anchor = page.getByTestId("anchor");
		await expect(anchor).toBeVisible();
		const graphHash = await page.getByTestId("graph-hash").innerText();
		expect(graphHash.length).toBeGreaterThan(10);
		// provenance carries the graph_hash; the reconstructed value equals it.
		await expect(page.getByTestId("behavior-prov")).toContainText(
			`besoin:${graphHash}`,
		);
		await expect(page.getByTestId("reconstructed-hash")).toHaveText(graphHash);
		// at least one canonicalised unit.
		await expect(
			page.getByTestId("anchor-units").locator("li"),
		).not.toHaveCount(0);
	});

	test("a similar second need replays ≥1 unit (saved tokens > 0)", async ({
		page,
	}) => {
		await page.getByTestId("capitalise-cta").click();
		await page.getByTestId("reuse-cta").click();
		await expect(page.getByTestId("reuse-result")).toBeVisible();
		const reused = Number(await page.getByTestId("reused-count").innerText());
		expect(reused).toBeGreaterThanOrEqual(1);
		const saved = Number(await page.getByTestId("saved-tokens").innerText());
		expect(saved).toBeGreaterThan(0);
	});

	test("a dissimilar second need fabricates NO reuse", async ({ page }) => {
		await page.getByTestId("capitalise-cta").click();
		// overwrite the second need's intents with dissimilar ones.
		await page.getByTestId("second-product").fill("schedule meetings");
		await page.getByTestId("second-entity").fill("a Calendar entity");
		await page.getByTestId("reuse-cta").click();
		await expect(page.getByTestId("reused-count")).toHaveText("0");
		await expect(page.getByTestId("dissimilar-note")).toBeVisible();
	});

	test("reset clears the anchor", async ({ page }) => {
		await page.getByTestId("capitalise-cta").click();
		await expect(page.getByTestId("anchor")).toBeVisible();
		await page.getByTestId("reset-cta").click();
		await expect(page.getByTestId("anchor")).toHaveCount(0);
	});
});
