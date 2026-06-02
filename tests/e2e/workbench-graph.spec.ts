import { expect, test } from "@playwright/test";

/**
 * S44 Playwright e2e — the full Workbench graph cockpit (/) + the /brain cockpit.
 * mirror record: reflects=front./.workbench-graph, test_kind=e2e,
 *               cert_language=playwright-bdd, liveness=alive, authority=above
 *
 * It walks the deep-navigation path (button → view → action → operation → entity →
 * mirror → scope → incident), asserting each node deep-links to its per-step panel; it
 * asserts the declared color legend reflects truth-type/liveness/red-wave; and it captures
 * stable UI snapshots (graph + legend + /brain) — re-render = unchanged. Green e2e +
 * stable snapshots = the S44 done criterion. The cockpit is READ-ONLY (the wall).
 */

// The deep-nav walk: each node id → the per-step panel route it deep-links to (from truth).
const DEEP_NAV: [string, string][] = [
	["saveOrder", "/web-preview"],
	["checkout-view", "/control"],
	["checkout-submit", "/control"],
	["createOrder", "/operation"],
	["order-entity", "/entity-map"],
	["createOrder-fixture", "/mirrors"],
	["checkout-scope", "/scopes"],
	["oos-incident", "/red-wave"],
];

test.describe("S44 — the full Workbench graph cockpit", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await expect(page.getByTestId("workbench-graph")).toBeVisible({
			timeout: 5000,
		});
	});

	test("every node deep-links to its per-step panel (the deep-nav walk)", async ({
		page,
	}) => {
		for (const [id, route] of DEEP_NAV) {
			const node = page.getByTestId(`node-${id}`);
			await expect(node).toBeVisible();
			await expect(node).toHaveAttribute("data-route", route);
			await expect(node).toHaveAttribute("href", route);
		}
	});

	test("clicking the button node navigates to /web-preview", async ({
		page,
	}) => {
		await page.getByTestId("node-saveOrder").click();
		await expect(page).toHaveURL(/\/web-preview$/);
	});

	test("clicking the operation node navigates to /operation", async ({
		page,
	}) => {
		await page.getByTestId("node-createOrder").click();
		await expect(page).toHaveURL(/\/operation$/);
	});

	test("the color legend reflects truth-type / liveness / red-wave", async ({
		page,
	}) => {
		const legend = page.getByTestId("legend");
		await expect(legend).toBeVisible();
		// above (truth_type), live (liveness), red (red_wave) are all used by the example head.
		await expect(page.getByTestId("legend-truth_type-above")).toBeVisible();
		await expect(page.getByTestId("legend-liveness-live")).toBeVisible();
		await expect(page.getByTestId("legend-red_wave-red")).toBeVisible();
	});

	test("an above-the-line node is colored as above; a red-wave node as red", async ({
		page,
	}) => {
		await expect(page.getByTestId("node-createOrder")).toHaveAttribute(
			"data-truth-type",
			"above",
		);
		await expect(page.getByTestId("node-oos-incident")).toHaveAttribute(
			"data-red-wave",
			"red",
		);
	});

	test("the edges list mirrors the prior link/propagation truth", async ({
		page,
	}) => {
		const edges = page.getByTestId("edges");
		await expect(edges).toBeVisible();
		for (const rel of [
			"triggers",
			"invoke",
			"reads_writes",
			"mirrors",
			"scopes",
			"incidents",
		]) {
			await expect(edges.getByText(rel, { exact: true }).first()).toBeVisible();
		}
	});

	test("the graph is visually stable (graph_hash unchanged on re-render)", async ({
		page,
	}) => {
		const hash = await page
			.getByTestId("workbench-graph")
			.getAttribute("data-graph-hash");
		expect(hash).toBeTruthy();
		await page.reload();
		await expect(page.getByTestId("workbench-graph")).toHaveAttribute(
			"data-graph-hash",
			hash as string,
		);
	});

	test("the graph cockpit matches a stable visual snapshot", async ({
		page,
	}) => {
		await expect(page.getByTestId("workbench-graph")).toHaveScreenshot(
			"workbench-graph.png",
			{ maxDiffPixelRatio: 0.02 },
		);
	});
});

test.describe("S44 — the /brain cockpit", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/brain");
		await expect(page.getByTestId("brain-memory")).toBeVisible({
			timeout: 5000,
		});
	});

	test("renders memory items and reuse decisions (firewall verdicts)", async ({
		page,
	}) => {
		await expect(page.getByTestId("memory-mem-1043")).toBeVisible();
		await expect(page.getByTestId("brain-decisions")).toBeVisible();
		await expect(page.getByTestId("decision-dec-1")).toHaveAttribute(
			"data-verdict",
			"allowed",
		);
		await expect(page.getByTestId("decision-dec-2")).toHaveAttribute(
			"data-verdict",
			"denied",
		);
	});

	test("the /brain cockpit matches a stable visual snapshot", async ({
		page,
	}) => {
		await expect(page.getByTestId("brain-memory")).toHaveScreenshot(
			"brain-memory.png",
			{ maxDiffPixelRatio: 0.02 },
		);
	});
});
