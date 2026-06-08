import { expect, test } from "@playwright/test";

/**
 * S89 Playwright e2e — the « provisioning du datastore par app » Workbench panel.
 * mirror record: reflects=S89-provision-datastore-per-app, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /provision route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * provisioning control is reachable AND executable from the screen, bound to a Server Action
 * running the REAL pure engine (lib/provision, the TS twin of back/runtime/provision). The S89
 * done-criteria, reached from the screen:
 *   - plain-Postgres is the DEFAULT target; the emitted DDL is shown; the per-project database +
 *     namespace prove isolation; a content address proves determinism;
 *   - vector search adds a pgvector sidecar (plain-Postgres only);
 *   - a Doltgres opt-in (legal under the S88 Go decision) supports `as of` time-travel;
 *   - a historical-impact migration WITHOUT a declared DataTruthScope is REFUSED (the human-gate);
 *   - distinct projects get distinct isolated databases.
 *
 * THE WALL (CLAUDE.md §2): the screen PLANS a supplied spec and renders a record — it writes no
 * truth. Plan = resolution, never an LLM.
 */

test.describe("S89 — per-app datastore provisioning", () => {
	test("the route renders the panel with the provision control", async ({
		page,
	}) => {
		await page.goto("/provision");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Provisioning du datastore par app|Per-app datastore provisioning/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("provision-submit")).toBeVisible();
		await expect(page.getByTestId("field-target")).toBeVisible();
		await expect(page.getByTestId("images")).toBeVisible();
	});

	test("the default plan targets plain-postgres, emits DDL, and isolates per project", async ({
		page,
	}) => {
		await page.goto("/provision");
		await page.getByTestId("provision-submit").click();

		const plan = page.getByTestId("plan");
		await expect(plan).toHaveAttribute("data-target", "plain-postgres");
		await expect(page.getByTestId("plan-target")).toHaveText("plain-postgres");
		// Emitted DDL applies on the default target.
		await expect(page.getByTestId("plan-ddl")).toContainText("CREATE TABLE");
		// Per-project isolation: a derived database + namespace.
		await expect(page.getByTestId("plan-database")).toContainText("app_");
		await expect(page.getByTestId("plan-namespace")).toContainText("proj_");
		// Determinism: a content address.
		await expect(page.getByTestId("plan-id")).toBeVisible();
		// No `as of` on plain-postgres.
		await expect(page.getByTestId("as-of")).toHaveCount(0);
	});

	test("vector search adds a pgvector sidecar", async ({ page }) => {
		await page.goto("/provision");
		await page.getByTestId("field-vector").check();
		await page.getByTestId("provision-submit").click();

		await expect(page.getByTestId("plan-sidecars")).toContainText("pgvector");
		await expect(page.getByTestId("plan-image")).toContainText("pgvector");
	});

	test("a Doltgres opt-in (legal under S88 go) supports `as of`", async ({
		page,
	}) => {
		await page.goto("/provision");
		await page.getByTestId("field-target").selectOption("doltgres");
		await page.getByTestId("provision-submit").click();

		await expect(page.getByTestId("plan")).toHaveAttribute(
			"data-target",
			"doltgres",
		);
		await expect(page.getByTestId("as-of")).toBeVisible();
	});

	test("a historical-impact migration without a declared scope is REFUSED (human-gate)", async ({
		page,
	}) => {
		await page.goto("/provision");
		await page.getByTestId("field-historical").check();
		// migrationDeclared stays unchecked → no DataTruthScope → refused.
		await page.getByTestId("provision-submit").click();

		const block = page.getByTestId("block");
		await expect(block).toHaveAttribute(
			"data-block-code",
			"HISTORICAL_IMPACT_REQUIRES_MIGRATION",
		);
		await expect(page.getByTestId("plan")).toHaveCount(0);
	});

	test("distinct projects get distinct isolated databases", async ({
		page,
	}) => {
		await page.goto("/provision");
		await page.getByTestId("field-project").fill("alpha");
		await page.getByTestId("provision-submit").click();
		await expect(page.getByTestId("plan-database")).toBeVisible();
		const dbA = await page.getByTestId("plan-database").textContent();

		await page.getByTestId("field-project").fill("beta");
		await page.getByTestId("provision-submit").click();
		// Wait for the re-rendered plan to carry the NEW project's isolated database.
		await expect(page.getByTestId("plan-database")).not.toHaveText(dbA ?? "");
		const dbB = await page.getByTestId("plan-database").textContent();

		expect(dbA).not.toBe(dbB);
	});
});
