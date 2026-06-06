import { expect, test } from "@playwright/test";

/**
 * MK03 Playwright e2e — the ingestion door from the Workbench panel (/ingestion).
 * mirror record: reflects=mcp.idea-intake.convert_to_markdown (the MK03 door: a document →
 *               markdown via the MK02 DocConverter port (ADR 0039) → an idea draft with
 *               provenance preserved ; deterministic/idempotent ; « même fichier → même
 *               markdown » ; the captured idea is a candidate-truth, NEVER a kernel write — the
 *               wall), test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: the human ingests a document → an idea draft with provenance, below the wall
 *   Given the Workbench is running
 *   When I navigate to /ingestion and click CONVERTIR
 *   Then the markdown output appears with the idempotence badge (same file → same markdown)
 *   When I click PROPOSER UNE IDÉE
 *   Then an idea draft appears with status="draft" and the document kept in its provenance
 *        (a candidate-truth, never a kernel write — the only door to truth is idea → mirror → /goal)
 */

test.describe("MK03 — the ingestion door (convert → idea draft with provenance)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/ingestion");
		await expect(page.getByTestId("ingestion-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("converting the default document yields idempotent markdown", async ({
		page,
	}) => {
		await page.getByTestId("convert-cta").click();
		await expect(page.getByTestId("markdown-output")).toBeVisible();
		// The markdown carries the document's title heading (the conversion did real work).
		await expect(page.getByTestId("markdown-output")).toContainText(
			"# Checkout Service Specification",
		);
		// The idempotence badge proves « même fichier → même markdown » (byte-deterministic).
		await expect(page.getByTestId("idempotent-badge")).toContainText(
			"idempotent",
		);
	});

	test("proposing an idea yields a status=draft candidate-truth (the wall)", async ({
		page,
	}) => {
		await page.getByTestId("convert-cta").click();
		await page.getByTestId("propose-cta").click();
		await expect(page.getByTestId("idea-draft")).toBeVisible();
		// The wall: ingestion proposes a candidate-truth — status is "draft", never a kernel write.
		await expect(page.getByTestId("draft-status")).toHaveText("draft");
		await expect(page.getByTestId("draft-title")).toHaveText(
			"Checkout Service Specification",
		);
		await expect(page.getByTestId("draft-provenance")).toContainText(
			"ingested document",
		);
	});
});
