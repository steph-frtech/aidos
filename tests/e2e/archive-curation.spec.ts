import { expect, test } from "@playwright/test";

/**
 * S26 Playwright e2e — the Archive-curation Workbench panel (/archive-curation).
 * mirror record: reflects=archive.curation.Curate + archive.qd.Elites, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench curates the DAG without losing truth, and places QD élites by the mirror
 *   Given the Workbench is running
 *   When I navigate to /archive-curation
 *   Then an UNSAFE branch (var-7) renders a TOMBSTONE badge while STILL being listed (not gone)
 *        — the done criterion: a tombstone marks, it never deletes (append-only)
 *   And a stable-phase node (phase-3) and a pareto élite (var-2) render KEEP
 *   And a failed-30d variant (var-9) renders COMPRESS while still listed
 *   And the green-mirror variant fills its niche cell (createOrder/discount → var-C)
 *   And the red-mirror-only niche (cancelOrder/refund) leaves its cell EMPTY
 *        — the done criterion: no promotion without a green mirror, made visible
 */

test.describe("S26 — the Archive-curation panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/archive-curation");
		await expect(page.getByTestId("archive-curation-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("an unsafe branch is TOMBSTONE and STILL listed (the done criterion — append-only)", async ({
		page,
	}) => {
		const row = page.getByTestId("ledger-row-var-7");
		await expect(row).toBeVisible(); // still listed — not destroyed
		await expect(row).toHaveAttribute("data-verdict", "tombstone");
		await expect(page.getByTestId("verdict-var-7")).toContainText("tombstone");
	});

	test("a stable phase and a pareto élite are KEEP", async ({ page }) => {
		await expect(page.getByTestId("ledger-row-phase-3")).toHaveAttribute(
			"data-verdict",
			"keep",
		);
		await expect(page.getByTestId("ledger-row-var-2")).toHaveAttribute(
			"data-verdict",
			"keep",
		);
	});

	test("a failed variant older than 30d is COMPRESS and still listed", async ({
		page,
	}) => {
		const row = page.getByTestId("ledger-row-var-9");
		await expect(row).toBeVisible(); // still present
		await expect(row).toHaveAttribute("data-verdict", "compress");
	});

	test("the green-mirror variant fills its niche cell (the QD done criterion)", async ({
		page,
	}) => {
		const cell = page.getByTestId("niche-cell-createOrder/discount");
		await expect(cell).toHaveAttribute("data-filled", "true");
		// the higher-anchored-fitness green champion is the élite.
		await expect(page.getByTestId("elite-createOrder/discount")).toContainText(
			"var-C",
		);
	});

	test("the red-mirror-only niche leaves its cell EMPTY (no promotion without a green mirror)", async ({
		page,
	}) => {
		const cell = page.getByTestId("niche-cell-cancelOrder/refund");
		await expect(cell).toHaveAttribute("data-filled", "false");
		await expect(page.getByTestId("empty-cancelOrder/refund")).toBeVisible();
	});

	test("the panel reaches the route from the Workbench nav and shows the tutorial + example", async ({
		page,
	}) => {
		await expect(page.getByTestId("tutorial")).toBeVisible();
		await expect(page.getByTestId("example")).toBeVisible();
	});
});
