import { expect, test } from "@playwright/test";

/**
 * EL15 Playwright e2e — the besoin-intake capability-door Workbench panel (/besoin-intake).
 * mirror record: reflects=back/mcp/besoin-intake/main.go (the capability door over the BesoinGraph:
 *               besoin_level_schema returns the required fields + EL05 mapping; a capture on a MAPPING
 *               rung emits an Idea, a NoEmit rung emits none — no silent cast; every backend op is an
 *               MCP tool, ADR 0009), test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness, CLAUDE.md §7): every control EXECUTES the deterministic
 * twin from the screen — "Read the level schema" runs besoinLevelSchema(level), "Project the capture"
 * runs captureProjection(level). The full tool inventory enumerates every backend op, reachable from a
 * screen. ABOVE the wall: the door writes no truth; the panel reflects the byte-identical Go MCP logic.
 *
 * Scenario A: reading the product schema shows its required fields + the EL05 mapping emit:product.
 * Scenario B: projecting a product capture shows it EMITS an Idea{Proposes:product} (a MAPPING rung).
 * Scenario C: projecting a journey capture shows it is NoEmit (no Idea — no silent cast).
 * Scenario D: the tool inventory enumerates every capture tool (ui-completeness).
 * Scenario E: reset clears the panel.
 */

test.describe("EL15 — /besoin-intake capability door", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/besoin-intake");
		await expect(page.getByTestId("level-select")).toBeVisible({
			timeout: 5000,
		});
	});

	test("reading the product schema shows required fields + the EL05 mapping", async ({
		page,
	}) => {
		await page.getByTestId("level-select").selectOption("product");
		await page.getByTestId("schema-cta").click();
		await expect(page.getByTestId("schema-required")).toContainText("intent");
		await expect(page.getByTestId("schema-required")).toContainText(
			"scenarios",
		);
		await expect(page.getByTestId("schema-mapping")).toContainText(
			"emit:product",
		);
	});

	test("projecting a product capture shows it EMITS an Idea{Proposes:product}", async ({
		page,
	}) => {
		await page.getByTestId("level-select").selectOption("product");
		await page.getByTestId("project-cta").click();
		await expect(page.getByTestId("projection-tool")).toContainText(
			"besoin_capture_product",
		);
		await expect(page.getByTestId("projection-proposes")).toContainText(
			"product",
		);
	});

	test("projecting a journey capture shows it is NoEmit (no silent cast)", async ({
		page,
	}) => {
		await page.getByTestId("level-select").selectOption("journey");
		await page.getByTestId("project-cta").click();
		await expect(page.getByTestId("projection-tool")).toContainText(
			"besoin_capture_journey",
		);
		await expect(page.getByTestId("no-emit-note")).toBeVisible();
	});

	test("the tool inventory enumerates every capture tool (ui-completeness)", async ({
		page,
	}) => {
		const inventory = page.getByTestId("tools-inventory");
		await expect(inventory).toContainText("besoin_graph_state");
		await expect(inventory).toContainText("besoin_level_schema");
		await expect(inventory).toContainText("besoin_validate_level");
		for (const level of [
			"product",
			"journey",
			"view",
			"control",
			"action",
			"operation",
			"entity",
		]) {
			await expect(page.getByTestId(`tool-${level}`)).toBeVisible();
		}
	});

	test("reset clears the panel", async ({ page }) => {
		await page.getByTestId("level-select").selectOption("entity");
		await page.getByTestId("schema-cta").click();
		await expect(page.getByTestId("schema-required")).toContainText(
			"attributes",
		);
		await page.getByTestId("reset-cta").click();
		await expect(page.getByTestId("schema-result")).toContainText(
			/En attente|Awaiting/,
		);
	});
});
