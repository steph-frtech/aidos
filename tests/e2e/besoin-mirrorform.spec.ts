import { expect, test } from "@playwright/test";

/**
 * EL10 Playwright e2e — the mirror-form table + view/journey validators panel
 * (/compound-besoin-mirrorform).
 * mirror record: reflects=back/runtime/besoin/{mirrorform,validators}.go (LevelMirrorForm(level) total
 *               over the 9 rungs; output ≡ derive-mirror for the 5 covered rungs; the new view validator
 *               fails on a zone-less body; the new journey validator fails on non-Gherkin),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness): every control EXECUTES the pure twin from the screen —
 * "Validate view" / "Validate journey" / "Break zones" / "Break Gherkin" / "Reset".
 *
 * Scenario A: the table renders the expected form per rung, marking derive-mirror-delegated rungs.
 * Scenario B: a well-formed view validates; breaking the zones turns it red (fault-injection dir 1).
 * Scenario C: a well-formed journey validates; breaking the Gherkin turns it red (fault-injection dir 2).
 */

test.describe("EL10 — mirror form per level + view/journey validators", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin-mirrorform");
		await expect(page.getByTestId("mirrorform-table")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the table renders the expected mirror form per rung", async ({
		page,
	}) => {
		// product/journey → gherkin_n0 (declared, above the wall), entity → property_n1 (delegated).
		await expect(page.getByTestId("form-product")).toHaveText("gherkin_n0");
		await expect(page.getByTestId("form-journey")).toHaveText("gherkin_n0");
		await expect(page.getByTestId("form-view")).toHaveText("screen_fixture");
		await expect(page.getByTestId("form-entity")).toHaveText("property_n1");
		await expect(page.getByTestId("form-operation")).toHaveText("fixture_n2");
		// entity is derive-mirror-delegated; view is freshly declared by EL10.
		await expect(page.getByTestId("source-entity")).toContainText("delegated");
		await expect(page.getByTestId("source-view")).toContainText("declared");
	});

	test("a well-formed view validates; breaking the zones turns red", async ({
		page,
	}) => {
		await page.getByTestId("validate-view-cta").click();
		await expect(page.getByTestId("view-verdict-valid")).toHaveAttribute(
			"data-valid",
			"true",
		);
		await page.getByTestId("break-zones-cta").click();
		await expect(page.getByTestId("view-verdict-valid")).toHaveAttribute(
			"data-valid",
			"false",
		);
		await page.getByTestId("reset-view-cta").click();
		await expect(page.getByTestId("view-verdict-pending")).toBeVisible();
	});

	test("a well-formed journey validates; breaking the Gherkin turns red", async ({
		page,
	}) => {
		await page.getByTestId("validate-journey-cta").click();
		await expect(page.getByTestId("journey-verdict-valid")).toHaveAttribute(
			"data-valid",
			"true",
		);
		await page.getByTestId("break-gherkin-cta").click();
		await expect(page.getByTestId("journey-verdict-valid")).toHaveAttribute(
			"data-valid",
			"false",
		);
		await page.getByTestId("reset-journey-cta").click();
		await expect(page.getByTestId("journey-verdict-pending")).toBeVisible();
	});
});
