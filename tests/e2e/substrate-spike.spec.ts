import { expect, test } from "@playwright/test";

/**
 * DP14 Playwright e2e — the « SPIKE-gate palette substrat open-source-2026 » panel.
 * mirror record: reflects=DP14-substrate-spike, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /substrate-spike route renders the MEASURED matrice (the DP14
 * done-criterion: 12 substrate services × verdict, each row carrying its measured
 * verdict — boot + healthcheck green + reachable, or already-containerised-on-host
 * = a docker ps measure), the coherent go/total counter, and that Windmill is
 * present as the workflow engine (NOT Temporal — hard constraint, §3).
 *
 * THE WALL (CLAUDE.md §2): the screen renders a measurement — it writes no truth
 * (ratchet OFF, /spike zone only). The matrice is sourced from the spike-graven
 * palette file, never an opinion hardcoded in the UI. Verdict = a boot/healthcheck
 * measurement, never an LLM opinion.
 */

test.describe("DP14 — substrate palette spike gate", () => {
	test("the route renders the measured service × verdict matrice", async ({
		page,
	}) => {
		await page.goto("/substrate-spike");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Spike go\/no-go palette substrat open-source-2026|Substrate palette open-source-2026 go\/no-go spike/,
			}),
		).toBeVisible();

		// the matrice is present and carries the full closed set of 12 services.
		const matrix = page.getByTestId("substrate-matrix");
		await expect(matrix).toBeVisible();
		const rows = page.getByTestId("substrate-row");
		await expect(rows).toHaveCount(12);
	});

	test("at least one row is a measured GO, each row carries a measured verdict", async ({
		page,
	}) => {
		await page.goto("/substrate-spike");
		const rows = page.getByTestId("substrate-row");

		// every row carries a verdict attribute — go or nogo, never empty.
		const verdicts = await rows.evaluateAll((trs) =>
			trs.map((tr) => tr.getAttribute("data-verdict")),
		);
		expect(verdicts).toHaveLength(12);
		for (const v of verdicts) {
			expect(v === "go" || v === "nogo").toBe(true);
		}

		// at least one measured GO (Postgres is measured go).
		const goRows = page.locator(
			'[data-testid="substrate-row"][data-verdict="go"]',
		);
		expect(await goRows.count()).toBeGreaterThanOrEqual(1);
		await expect(
			page.locator('[data-testid="substrate-row"][data-service="postgres"]'),
		).toHaveAttribute("data-verdict", "go");
	});

	test("the go/total counter is coherent with the measured rows", async ({
		page,
	}) => {
		await page.goto("/substrate-spike");

		const rows = page.getByTestId("substrate-row");
		const goRows = page.locator(
			'[data-testid="substrate-row"][data-verdict="go"]',
		);
		const total = await rows.count();
		const goCount = await goRows.count();

		// the counter badge reads "<go>/<total> go" — coherent with the rows.
		await expect(page.getByTestId("count-go-total")).toContainText(
			`${goCount}/${total}`,
		);
		// the matrice is the closed set of 12, and the spike measured 11 go / 1 no-go.
		expect(total).toBe(12);
		expect(goCount).toBe(11);
	});

	test("Windmill is present as the workflow engine — NOT Temporal (hard constraint)", async ({
		page,
	}) => {
		await page.goto("/substrate-spike");

		// Windmill is in the palette (the validated workflow slot engine).
		const windmill = page.locator(
			'[data-testid="substrate-row"][data-service="windmill"]',
		);
		await expect(windmill).toBeVisible();
		await expect(windmill).toContainText(/Windmill/i);
		// its no-go is honest (registry-unavailability), and Temporal is refused.
		await expect(windmill).toContainText(/Temporal/i);

		// no service row is keyed on Temporal — Temporal is never an engine here.
		await expect(
			page.locator('[data-testid="substrate-row"][data-service="temporal"]'),
		).toHaveCount(0);
	});
});
