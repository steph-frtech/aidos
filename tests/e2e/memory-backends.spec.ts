import { expect, test } from "@playwright/test";

/**
 * S31 Playwright e2e — the Memory backends Workbench panel (/memory-backends).
 * mirror record: reflects=archive.brain.memory (the Store write/recall by similarity over the four
 *               indexable KRD memories ; the mock ↔ pgx injection seam), test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: recall returns the nearest memories by similarity; the backends are interchangeable
 *   Given the Workbench is running
 *   When I navigate to /memory-backends
 *   Then the four kind chips (episodic/semantic/procedural/structural) are present
 *   And a recall query returns hits ordered by score descending with the nearest (semantic) first
 *   And each hit shows its score / kind / branch / taint / provenance
 *   And filtering by kind=semantic leaves only semantic hits
 *   And flipping the backend toggle (mock ↔ real) returns the same top hit (interchangeable)
 *   And the "fuel, never truth" banner is present
 */

test.describe("S31 — the Memory backends panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/memory-backends");
		await expect(page.getByTestId("fuel-banner")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the four indexable kind chips are present", async ({ page }) => {
		for (const k of ["episodic", "semantic", "procedural", "structural"]) {
			await expect(page.getByTestId(`kind-chip-${k}`)).toBeVisible();
		}
	});

	test("recall returns hits ordered by score descending with the nearest first", async ({
		page,
	}) => {
		const rows = page.getByTestId("hit-row");
		await expect(rows.first()).toBeVisible();
		const count = await rows.count();
		expect(count).toBeGreaterThan(0);

		// Nearest hit for "shopping cart basket" is the semantic cart term.
		await expect(rows.first().getByTestId("hit-kind")).toHaveText(
			/semantic|sémantique/,
		);

		// Scores are ordered descending.
		const scores: number[] = [];
		for (let i = 0; i < count; i++) {
			const txt =
				(await rows.nth(i).getByTestId("hit-score").textContent()) ?? "";
			const m = txt.match(/([0-9]+\.[0-9]+)/);
			if (m) scores.push(Number.parseFloat(m[1]));
		}
		for (let i = 1; i < scores.length; i++) {
			expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
		}

		// Each hit shows its taint and provenance.
		await expect(rows.first().getByTestId("hit-taint")).toBeVisible();
		await expect(rows.first().getByTestId("hit-provenance")).toBeVisible();
		await expect(rows.first().getByTestId("hit-branch")).toBeVisible();
	});

	test("filtering by kind=semantic leaves only semantic hits", async ({
		page,
	}) => {
		await page.getByTestId("kind-chip-semantic").click();
		const rows = page.getByTestId("hit-row");
		await expect(rows.first()).toBeVisible();
		const count = await rows.count();
		for (let i = 0; i < count; i++) {
			await expect(rows.nth(i)).toHaveAttribute("data-kind", "semantic");
		}
	});

	test("flipping the backend toggle returns the same top hit (interchangeable)", async ({
		page,
	}) => {
		const topBefore = await page
			.getByTestId("hit-row")
			.first()
			.getByTestId("hit-kind")
			.textContent();

		await page.getByTestId("backend-real").click();
		await expect(page.getByTestId("backend-real")).toHaveAttribute(
			"aria-pressed",
			"true",
		);

		const topAfter = await page
			.getByTestId("hit-row")
			.first()
			.getByTestId("hit-kind")
			.textContent();
		expect(topAfter).toBe(topBefore);
	});

	test("the fuel-never-truth banner is present", async ({ page }) => {
		await expect(page.getByTestId("fuel-banner")).toContainText(
			/truth|vérité/i,
		);
	});
});
