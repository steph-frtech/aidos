import { expect, test } from "@playwright/test";

/**
 * S24 Playwright e2e — the version-DAG Workbench panel (/version-dag).
 * mirror record: reflects=S24-version-dag, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * The done criteria, executed from the screen (KRD §120–§125): you can branch, checkout an
 * ancestor, and rebranch all work — and the abandoned line is never destroyed (append-only).
 *
 *   Given the Workbench is running
 *   When I navigate to /version-dag
 *   Then the graph shows v0, v1, v2 (the trunk) with v2 the head, plus the two waterline bands.
 *   When I branch off v1
 *   Then a NEW head appears parented on v1 while v2 is still present (a parallel line, §125).
 *   When I checkout the ancestor v1
 *   Then the head is back on v1 with v2/w1 still rendered (dimmed, not gone — append-only).
 *   When I rebranch from v1
 *   Then a NEW node appears parented on v1 with the abandoned line still visible (THE done case).
 *
 * READ-ONLY (the wall): the panel runs the SAME pure branch / checkoutAncestor / rebranch the Go
 * dag package / the dag MCP run and animates local state — it never writes truth. Recording a
 * node/edge into dag.node/dag.edge goes via the `aidos` writer role through the dag MCP.
 */

test.describe("S24 — the version-DAG panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/version-dag");
		await expect(
			page.getByRole("heading", { name: /dag de versions|version dag/i }),
		).toBeVisible({ timeout: 10000 });
	});

	test("renders the canonical §120 trunk with v2 as the head and the two waterline bands", async ({
		page,
	}) => {
		// the trunk nodes are present.
		await expect(page.getByTestId("node-v0")).toBeVisible();
		await expect(page.getByTestId("node-v1")).toBeVisible();
		await expect(page.getByTestId("node-v2")).toBeVisible();
		// v2 is the head; v0/v1 are not.
		await expect(page.getByTestId("node-v2")).toHaveAttribute(
			"data-head",
			"true",
		);
		await expect(page.getByTestId("node-v1")).toHaveAttribute(
			"data-head",
			"false",
		);
		// the two waterline bands (§124).
		await expect(page.getByTestId("band-above")).toBeVisible();
		await expect(page.getByTestId("band-below")).toBeVisible();
		// the evolutionary variant w1 lives below the waterline.
		await expect(page.getByTestId("node-w1")).toHaveAttribute(
			"data-stratum",
			"below",
		);
	});

	test("branch off v1 opens a parallel head while v2 stays present (§125)", async ({
		page,
	}) => {
		await page.getByTestId("action-branch").click();
		await expect(page.getByTestId("last-event")).toContainText(/Branched/i);
		// v2 is still present (the from-line is never deleted).
		await expect(page.getByTestId("node-v2")).toBeVisible();
		// two heads now live (the new branch + v2) — parallel lines of truth (§125).
		const heads = await page.getByTestId("heads").textContent();
		expect(
			(heads ?? "").split(",").filter((s) => s.trim().length > 0).length,
		).toBe(2);
	});

	test("checkout the ancestor v1 moves the head back with v2/w1 still present (append-only)", async ({
		page,
	}) => {
		await page.getByTestId("action-checkout").click();
		await expect(page.getByTestId("last-event")).toContainText(/HeadMoved/i);
		// v1 is now the head.
		await expect(page.getByTestId("node-v1")).toHaveAttribute(
			"data-head",
			"true",
		);
		// v2 and w1 are STILL rendered (dimmed, not gone — the abandoned line stays).
		await expect(page.getByTestId("node-v2")).toBeVisible();
		await expect(page.getByTestId("node-w1")).toBeVisible();
		await expect(page.getByTestId("node-v2")).toHaveAttribute(
			"data-live",
			"false",
		);
	});

	test("rebranch from v1 opens a new line while the abandoned line stays visible (THE done case)", async ({
		page,
	}) => {
		// first checkout v1 (the backward move), then rebranch from it.
		await page.getByTestId("action-checkout").click();
		await page.getByTestId("action-rebranch").click();
		await expect(page.getByTestId("last-event")).toContainText(/Rebranched/i);
		// the abandoned line v2 is STILL present (never destroyed — append-only).
		await expect(page.getByTestId("node-v2")).toBeVisible();
		// a new head exists, distinct from v0/v1/v2/w1, parented on v1.
		const heads = await page.getByTestId("heads").textContent();
		expect(heads ?? "").toMatch(/v1/); // v1 stays a base/head after checkout+rebranch
		// at least one fresh node beyond the seed (v0,v1,v2,w1) — the new line.
		const nodeCount = await page.locator('[data-testid^="node-"]').count();
		expect(nodeCount).toBeGreaterThan(4);
	});

	test("reset restores the canonical seed", async ({ page }) => {
		await page.getByTestId("action-branch").click();
		await page.getByTestId("action-reset").click();
		await expect(page.getByTestId("last-event")).not.toContainText(
			/Branched|HeadMoved|Rebranched/i,
		);
		await expect(page.getByTestId("node-v2")).toHaveAttribute(
			"data-head",
			"true",
		);
		const nodeCount = await page.locator('[data-testid^="node-"]').count();
		expect(nodeCount).toBe(4);
	});
});
