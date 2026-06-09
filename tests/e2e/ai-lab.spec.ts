import { expect, test } from "@playwright/test";

/**
 * FK11 Playwright e2e — the « AI Lab » Workbench panel (FKE-38, corrected).
 * mirror record: reflects=FK11-ai-lab, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * GAUCHE — a conversation wired to the left brain (Claude): a message fans a need across the
 * verticale. DROITE — the NAVIGABLE big table (level × facet); clicking a cell opens its ANATOMY
 * (the 6 pairs) where validating Spec → generates Comportement → Scénarios → … (the descent), per
 * facet. Plus the impact on the existing DAG. The wall §2 holds (a truth-write is refused).
 */

test.describe("FK11 — the AI Lab (navigable table + anatomy descent)", () => {
	test("renders the chat + the navigable big table + the impact section", async ({
		page,
	}) => {
		await page.goto("/ai-lab");
		await expect(
			page.getByRole("heading", { level: 1, name: /ai lab/i }),
		).toBeVisible();
		await expect(page.getByTestId("thread")).toBeVisible();
		await expect(page.getByTestId("chat")).toBeVisible();
		// the big table: a cell at produit × F, and at entité × X (the corners).
		await expect(page.getByTestId("cell-level_produit-F")).toBeVisible();
		await expect(page.getByTestId("cell-level_entite-X")).toBeVisible();
		// the impact-on-existing-DAG section.
		await expect(page.getByTestId("impact-count")).toBeVisible();
	});

	test("navigating: clicking a cell opens its anatomy (the 6 pairs)", async ({
		page,
	}) => {
		await page.goto("/ai-lab");
		// before selecting, a hint is shown.
		await expect(page.getByTestId("select-hint")).toBeVisible();
		await page.getByTestId("cell-level_operation-F").click();
		// the anatomy of the selected cell opens, with the 6 mirror-pairs.
		await expect(page.getByTestId("anatomy")).toBeVisible();
		await expect(page.getByTestId("pair-spec")).toBeVisible();
		await expect(page.getByTestId("pair-evidence")).toBeVisible();
	});

	test("a direct truth-write is REFUSED at the wall (§2)", async ({ page }) => {
		await page.goto("/ai-lab");
		await page
			.getByTestId("chat")
			.fill("écris la vérité dans le kernel maintenant");
		await page.getByTestId("generate").click();
		await expect(page.getByTestId("wall-refused")).toBeVisible();
	});
});
