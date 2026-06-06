import { expect, test } from "@playwright/test";

/**
 * EL03 Playwright e2e — the BesoinGraph record Workbench panel (/compound-besoin-graph).
 * mirror record: reflects=back/runtime/besoin/graph.go (the ordered, append-only, content-addressed
 *               BesoinGraph: same answers → same graph_hash regardless of insertion order; distinct
 *               projects disjoint; NO Version/Mirror field — the double absence = the wall),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness): every control EXECUTES the pure twin from the
 * screen — "Add node" builds the ordered graph, "Compute graph_hash" content-addresses it,
 * "Re-sort" proves insertion-order independence, "Compare projects" proves disjointness, and the
 * "Double absence" panel proves no version/mirror key appears (the wall).
 *
 * Scenario A: building a graph + computing its content-address; order independence.
 *   Given the Workbench is running
 *   When I add a product node and an entity node and compute the graph_hash
 *   Then a 64-char sha256 hex appears
 *   And re-sorting in reverse order yields the SAME hash (insertion-order independent)
 *
 * Scenario B: distinct projects are disjoint + the double absence (the wall).
 *   When I compare against another project then the hashes are DISJOINT
 *   And the canonical body carries NO version/mirror key (it is a need, not a truth)
 *
 * Scenario C: a duplicate rung is REFUSED (overwrite needs a ChangeSet, §9).
 */

test.describe("EL03 — the BesoinGraph record", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin-graph");
		await expect(page.getByTestId("besoin-graph-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("ADD NODE + COMPUTE graph_hash, and re-sorting is order-independent", async ({
		page,
	}) => {
		// Before running, no node and no hash (action-capable).
		await expect(page.getByTestId("nodes-empty")).toBeVisible();
		await expect(page.getByTestId("hash-pending")).toBeVisible();

		// Add a product node (default level=product, status=resolved).
		await page.getByTestId("intent-input").fill("buy goods");
		await page.getByTestId("add-node").click();
		await expect(page.getByTestId("node-product")).toBeVisible();

		// Add an entity node.
		await page.getByTestId("level-select").selectOption("entity");
		await page.getByTestId("intent-input").fill("cart");
		await page.getByTestId("add-node").click();
		await expect(page.getByTestId("node-entity")).toBeVisible();

		// Compute the content-address.
		await page.getByTestId("compute-hash").click();
		await expect(page.getByTestId("graph-hash")).toHaveText(/^[0-9a-f]{64}$/);

		// Re-sorting in reverse order yields the SAME hash (insertion-order independence).
		await page.getByTestId("reorder").click();
		await expect(page.getByTestId("reorder-result")).toBeVisible();
		await expect(page.getByTestId("reorder-result")).toContainText(
			/indépendant|order-independent/i,
		);
	});

	test("COMPARE PROJECTS is disjoint and the canonical body has no version/mirror key", async ({
		page,
	}) => {
		await page.getByTestId("intent-input").fill("buy goods");
		await page.getByTestId("add-node").click();
		await expect(page.getByTestId("node-product")).toBeVisible();

		// Distinct projects → disjoint hashes.
		await page.getByTestId("compare").click();
		await expect(page.getByTestId("compare-result")).toBeVisible();
		await expect(page.getByTestId("compare-result")).toContainText(
			/disjoint/i,
		);

		// The double absence (the wall): no version/mirror key in the canonical body.
		await expect(page.getByTestId("absence-result")).toContainText(
			/besoin, pas une vérité|need, not a truth/,
		);
		const body = await page.getByTestId("canonical-body").textContent();
		expect(body).not.toContain('"version"');
		expect(body).not.toContain('"mirror"');
		expect(body).toContain('"project"');
	});

	test("a DUPLICATE rung is refused (overwrite needs a ChangeSet, §9)", async ({
		page,
	}) => {
		await page.getByTestId("intent-input").fill("buy");
		await page.getByTestId("add-node").click();
		await expect(page.getByTestId("node-product")).toBeVisible();

		// Re-add the same rung (product) — refused.
		await page.getByTestId("intent-input").fill("buy again");
		await page.getByTestId("add-node").click();
		await expect(page.getByTestId("dup-refused")).toBeVisible();
	});
});
