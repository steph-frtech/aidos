import { expect, test } from "@playwright/test";

/**
 * EL13 Playwright e2e — the /compound-besoin interview Workbench panel.
 * mirror record: reflects=back/runtime/besoin/interview.go (EnterableLevel computes the rung to work;
 *               DispatchOf is the closed gesture table; RecordAnswer decides the routing by CODE —
 *               record / off_altitude (EL12 schema-mismatch) / spike (the legal three-hop gate) — and
 *               the `resolved` verdict is COMPUTED (CanDescend.enough), NEVER declared by the LLM),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness): every control EXECUTES the pure twin from the screen
 * — "Record the answer" runs recordAnswer, "Enterable level" runs enterableLevel + dispatchOf. The LLM
 * leads the dialogue; the code judges. ABOVE the wall: the interview writes no truth.
 *
 * Scenario A: a sharp product answer closes its branches → routing=record, resolved=true.
 * Scenario B: a fuzzy (unverifiable) answer routes to /spike (the three-hop gate), never a descent.
 * Scenario C: an entity attributes body submitted at product is rejected by schema (off_altitude).
 * Scenario D: a schema-valid product that selects nothing is recorded yet NOT resolved (anti-vacuity).
 * Scenario E: the enterable level of a fresh graph is `product`, dispatched to the `grill` gesture.
 */

test.describe("EL13 — /compound-besoin (the level-by-level forced interview)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin");
		await expect(page.getByTestId("case-select")).toBeVisible({ timeout: 5000 });
	});

	test("a sharp product answer is recorded and resolved", async ({ page }) => {
		await page.getByTestId("case-select").selectOption("productSharp");
		await page.getByTestId("record-cta").click();
		await expect(page.getByTestId("result")).toBeVisible();
		await expect(page.getByTestId("routing")).toHaveAttribute(
			"data-routing",
			"record",
		);
		await expect(page.getByTestId("resolved")).toHaveAttribute(
			"data-resolved",
			"true",
		);
	});

	test("a fuzzy answer routes to /spike via the legal three-hop gate (no descent)", async ({
		page,
	}) => {
		await page.getByTestId("case-select").selectOption("productFuzzy");
		await page.getByTestId("record-cta").click();
		await expect(page.getByTestId("routing")).toHaveAttribute(
			"data-routing",
			"spike",
		);
		await expect(page.getByTestId("resolved")).toHaveAttribute(
			"data-resolved",
			"false",
		);
		const route = page.getByTestId("spike-route");
		await expect(route).toContainText("idea_capture");
		await expect(route).toContainText("idea_grill");
		await expect(route).toContainText("idea_spike");
	});

	test("an entity attributes body at product is rejected by schema (off_altitude)", async ({
		page,
	}) => {
		await page.getByTestId("case-select").selectOption("entityAtProduct");
		await page.getByTestId("record-cta").click();
		await expect(page.getByTestId("routing")).toHaveAttribute(
			"data-routing",
			"off_altitude",
		);
		await expect(page.getByTestId("block-reason")).toContainText("schéma");
	});

	test("a schema-valid product that selects nothing is recorded yet not resolved", async ({
		page,
	}) => {
		await page.getByTestId("case-select").selectOption("productVacant");
		await page.getByTestId("record-cta").click();
		await expect(page.getByTestId("routing")).toHaveAttribute(
			"data-routing",
			"record",
		);
		await expect(page.getByTestId("resolved")).toHaveAttribute(
			"data-resolved",
			"false",
		);
	});

	test("the enterable level of a fresh graph is product, dispatched to grill", async ({
		page,
	}) => {
		await page.getByTestId("enterable-cta").click();
		await expect(page.getByTestId("enterable")).toBeVisible();
		await expect(page.getByTestId("enterable-level")).toContainText("product");
		await expect(page.getByTestId("enterable-gesture")).toContainText("grill");
	});
});
