import { expect, test } from "@playwright/test";

/**
 * S81 Playwright e2e — the « Catalogue de templates / starters instanciables » Workbench panel.
 * mirror record: reflects=S81-templates, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /templates route is action-capable (ui-completeness law, CLAUDE.md §7): the INSTANTIATE
 * (duplicate-from-template) and FORK (fork this app at a stable phase) controls are reachable AND
 * executable from the screen, bound to Server Actions running the REAL pure engine (lib/templates, the
 * byte-twin of the Go package). The done-criterion of S81: instantiating a template produces a
 * deterministic GREEN starting project; forking duplicates a project at a stable phase.
 *
 * THE WALL (CLAUDE.md §2): instantiate/fork are dry-run value computations — landing the starter's
 * truths is the legal door (propose → approve), never a direct kernel write. The catalogue is PURE
 * declared data, never an LLM.
 */

test.describe("S81 — templates (curated starter catalogue)", () => {
	test("the route renders the catalogue + instantiate + fork controls", async ({
		page,
	}) => {
		await page.goto("/templates");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Template catalogue|Catalogue de templates/i,
			}),
		).toBeVisible();
		await expect(page.getByTestId("catalogue")).toBeVisible();
		await expect(page.getByTestId("tpl-ecommerce")).toBeVisible();
		await expect(page.getByTestId("tpl-crm")).toBeVisible();
		await expect(page.getByTestId("tpl-booking")).toBeVisible();
		await expect(page.getByTestId("instantiate-submit")).toBeVisible();
		await expect(page.getByTestId("fork-submit")).toBeVisible();
	});

	test("instantiating a template produces a deterministic green starter — the done-criterion", async ({
		page,
	}) => {
		await page.goto("/templates");
		await page.getByTestId("instantiate-template").selectOption("ecommerce");
		await page.getByTestId("instantiate-target").fill("shop-app");
		await page.getByTestId("instantiate-submit").click();
		const result = page.getByTestId("instantiate-result");
		await expect(result).toBeVisible();
		await expect(result).toContainText("template=ecommerce");
		await expect(result).toContainText("target=shop-app");
		await expect(result).toContainText("app-auth");
		// the materialised starter carries the bundle's entities + the app-auth subsystem.
		await expect(result).toContainText("ent:Customer");
		await expect(result).toContainText("ent:User");
		await expect(result).toContainText("mir:order-roundtrips");
		// the starterId is byte-identical to the Go value (determinism, content-addressed).
		await expect(result).toHaveAttribute(
			"data-starter-id",
			"8d9f02770d87f7e5ccbebcab2d389425f55b4de14bd1540d22c868e9a3d22eb3",
		);
	});

	test("forking duplicates a project at a stable phase", async ({ page }) => {
		await page.goto("/templates");
		await page.getByTestId("fork-template").selectOption("crm");
		await page.getByTestId("fork-target").fill("acme-fork");
		await page.getByTestId("fork-phase").fill("phase-stable-1");
		await page.getByTestId("fork-submit").click();
		const result = page.getByTestId("fork-result");
		await expect(result).toBeVisible();
		await expect(result).toContainText("template=crm");
		await expect(result).toContainText("from=phase-stable-1");
		await expect(result).toContainText("ent:Contact");
	});
});
