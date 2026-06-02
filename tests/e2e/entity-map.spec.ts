import { expect, test } from "@playwright/test";

/**
 * S35 Playwright e2e — the Entity-source Workbench panel (/entity-map).
 * mirror record: reflects=kernel.entities.{EmitGo,EmitTS,EmitDDL} (the deterministic, LLM-free
 *               entity emitters; one SOURCE → three faithful projections — Go struct + TS type + DDL,
 *               never double-typed), test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: the Order entity emits a Go struct + a TS type + DDL — the done criterion, visible
 *   Given the Workbench is running
 *   When I navigate to /entity-map
 *   Then the Order SOURCE card lists its attributes (id, customer, total, discount, placed_at)
 *   And the THREE projection panels are present and non-empty: a Go struct `type Order struct`,
 *        a TS type `export type Order`, and DDL `CREATE TABLE "order"` with PRIMARY KEY on id and
 *        discount rendered nullable / optional
 *   And clicking RE-EMIT reports byte-identical (same output_hash — the done criterion)
 *   And MOVE THE HEAD (remove discount) flips the projections to STALE while staying listed
 */

test.describe("S35 — entity source (one source → Go struct + TS type + DDL)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/entity-map");
		await expect(
			page.getByRole("heading", { name: /Entity source/i }),
		).toBeVisible({ timeout: 5000 });
	});

	test("the Order source lists its attributes with type / required / identifier badges", async ({
		page,
	}) => {
		const source = page.getByRole("region", { name: /Source \(.*entity.*\)/i });
		await expect(source).toBeVisible();
		for (const attr of ["id", "customer", "total", "discount", "placed_at"]) {
			await expect(source.getByText(attr, { exact: true })).toBeVisible();
		}
		// the identifier badge (id is the PRIMARY KEY) is shown.
		await expect(source.getByText(/identifier/i).first()).toBeVisible();
	});

	test("all three projections are present and non-empty (Go struct + TS type + DDL)", async ({
		page,
	}) => {
		const projections = page.getByRole("region", {
			name: /Three derived projections|Trois projections/i,
		});
		await expect(projections).toBeVisible();

		// Go struct projection.
		await expect(projections.getByText("type Order struct")).toBeVisible();
		// TS type projection.
		await expect(projections.getByText("export type Order = {")).toBeVisible();
		// DDL projection — CREATE TABLE "order" with PRIMARY KEY on id, discount nullable.
		await expect(projections.getByText(/CREATE TABLE "order"/)).toBeVisible();
		await expect(
			projections.getByText('"id" BIGINT PRIMARY KEY NOT NULL'),
		).toBeVisible();
		// discount is NULLABLE (no NOT NULL) and TS-optional (discount?).
		await expect(projections.getByText('"discount" NUMERIC,')).toBeVisible();
		await expect(projections.getByText("discount?: string;")).toBeVisible();
	});

	test("RE-EMIT reports byte-identical (same output_hash — the done criterion)", async ({
		page,
	}) => {
		// The Go projection panel: click its RE-EMIT and assert the byte-identical confirmation.
		const goPanel = page.locator('[data-target="go-sqlc"]');
		await expect(goPanel).toBeVisible();
		await goPanel.getByRole("button", { name: /RE-EMIT|RÉ-ÉMETTRE/i }).click();
		await expect(
			goPanel.getByText(/byte-identical|byte-identique/i),
		).toBeVisible();
	});

	test("MOVE THE HEAD (remove discount) flips the projections to STALE", async ({
		page,
	}) => {
		// All projections start deterministic (the head matches the emitted source).
		const ddlPanel = page.locator('[data-target="pg-ddl"]');
		await expect(
			ddlPanel.getByText(/deterministic|déterministe/i),
		).toBeVisible();

		await page
			.getByRole("button", { name: /MOVE THE HEAD|BOUGER LA TÊTE/i })
			.click();

		// The prior artifact stays listed but flips to STALE.
		await expect(ddlPanel.getByText(/stale/i)).toBeVisible();
		await expect(ddlPanel.getByText(/CREATE TABLE "order"/)).toBeVisible();
	});
});
