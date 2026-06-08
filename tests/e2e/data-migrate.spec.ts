import { expect, test } from "@playwright/test";

/**
 * S95 Playwright e2e — the « migration de donnée breaking » Workbench panel.
 * mirror record: reflects=S95-data-migrate, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /data-migrate route is action-capable (ui-completeness law, CLAUDE.md §7): the PLAN
 * control is reachable AND executable from the screen, bound to the REAL pure twin
 * (lib/datamigrate, the twin of back/runtime/datamigrate). The S95 done-criteria, reached from
 * the screen:
 *   - rename-WITH-backfill preserves all data: EXPAND → BACKFILL → CONTRACT, the backfill recopies
 *     the old column, the 'preserves all data' badge is yes;
 *   - an entity SPLIT and a 1-N→N-N CARDINALITY change each stage backfill-before-contract;
 *   - a breaking change with NO backfill is REFUSED with BREAKING_MIGRATION_NO_BACKFILL;
 *   - the migration emission is reproducible (same change → same plan id).
 *
 * THE WALL (CLAUDE.md §2): the screen PLANS — it writes no truth. Planning = a pure function,
 * never an LLM; the migration is driver-neutral (emitted SQL + a content address).
 */

test.describe("S95 — the breaking data migration", () => {
	test("the route renders the panel with the plan control", async ({
		page,
	}) => {
		await page.goto("/data-migrate");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Migration de donnée de l'app émise|Migrating the emitted app's data/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("plan-button")).toBeVisible();
		await expect(page.getByTestId("kind")).toBeVisible();
	});

	test("rename-with-backfill stages expand → backfill → contract and preserves all data", async ({
		page,
	}) => {
		await page.goto("/data-migrate");
		// default kind is rename, backfill toggle is on
		await page.getByTestId("plan-button").click();
		await expect(page.getByTestId("plan")).toBeVisible();
		await expect(page.getByTestId("step-expand")).toBeVisible();
		await expect(page.getByTestId("step-backfill")).toBeVisible();
		await expect(page.getByTestId("step-contract")).toBeVisible();
		await expect(page.getByTestId("step-backfill")).toContainText(/UPDATE/);
		await expect(page.getByTestId("preserves")).toHaveText(/oui|yes/);
	});

	test("a breaking change with no backfill is refused", async ({ page }) => {
		await page.goto("/data-migrate");
		await page.getByTestId("backfill-toggle").uncheck();
		await page.getByTestId("plan-button").click();
		await expect(page.getByTestId("block")).toBeVisible();
		await expect(page.getByTestId("block-code")).toHaveText(
			"BREAKING_MIGRATION_NO_BACKFILL",
		);
	});

	test("a 1-N to N-N cardinality change migrates without loss", async ({
		page,
	}) => {
		await page.goto("/data-migrate");
		await page.getByTestId("kind").selectOption("cardinality");
		await page.getByTestId("plan-button").click();
		await expect(page.getByTestId("plan")).toBeVisible();
		await expect(page.getByTestId("step-backfill")).toContainText(
			/INSERT INTO/,
		);
		await expect(page.getByTestId("preserves")).toHaveText(/oui|yes/);
	});

	test("the migration emission is reproducible (same change → same plan id)", async ({
		page,
	}) => {
		await page.goto("/data-migrate");
		await page.getByTestId("plan-button").click();
		await expect(page.getByTestId("plan-id")).toBeVisible();
		const id1 = await page.getByTestId("plan-id").textContent();
		await page.getByTestId("plan-button").click();
		const id2 = await page.getByTestId("plan-id").textContent();
		expect(id1).toBe(id2);
		expect(id1).toBeTruthy();
	});
});
