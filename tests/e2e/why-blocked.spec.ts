import { expect, test } from "@playwright/test";

/**
 * S13 Playwright e2e — the BlockReason Workbench panel (/why-blocked).
 * mirror record: reflects=S13-blockreason, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench renders an actionable BlockReason for each canonical code
 *   Given the Workbench is running
 *   When I navigate to /why-blocked
 *   Then I see a block with code MISSING_MIRROR, its severity, and its explanation
 *   And I see its how_to_fix steps including "write_mirror"
 *   And switching to MISSING_AUTHORITY shows an "assign_authority" fix step
 *   And OUT_OF_SCOPE shows a fix step naming the in-scope target or owner
 */

test.describe("S13 — the why-blocked / BlockReason panel", () => {
	test("renders MISSING_MIRROR with code, severity, explanation and write_mirror fix", async ({
		page,
	}) => {
		await page.goto("/why-blocked");

		const reason = page.getByTestId("block-reason");
		await expect(reason).toBeVisible({ timeout: 5000 });
		// MISSING_MIRROR is the default-focused code (first canonical).
		await expect(reason).toHaveAttribute("data-code", "MISSING_MIRROR");
		await expect(page.getByTestId("block-reason-code")).toContainText(
			"MISSING_MIRROR",
		);
		await expect(page.getByTestId("block-reason-severity")).toContainText(
			"blocking",
		);
		await expect(page.getByTestId("block-reason-explanation")).not.toBeEmpty();

		const fix = page.getByTestId("block-reason-howtofix");
		await expect(fix).toContainText("write_mirror");
		await expect(fix).toContainText("rerun aidos check");
	});

	test("switching to MISSING_AUTHORITY shows an assign_authority fix step", async ({
		page,
	}) => {
		await page.goto("/why-blocked");
		await page.getByTestId("select-MISSING_AUTHORITY").click();

		const reason = page.getByTestId("block-reason");
		await expect(reason).toHaveAttribute("data-code", "MISSING_AUTHORITY");
		await expect(page.getByTestId("block-reason-howtofix")).toContainText(
			"assign_authority",
		);
	});

	test("OUT_OF_SCOPE shows a fix step naming the in-scope target or owner", async ({
		page,
	}) => {
		await page.goto("/why-blocked");
		await page.getByTestId("select-OUT_OF_SCOPE").click();

		const reason = page.getByTestId("block-reason");
		await expect(reason).toHaveAttribute("data-code", "OUT_OF_SCOPE");
		const fix = page.getByTestId("block-reason-howtofix");
		// Names the scope owner / in-scope target — never a fabricated name.
		await expect(fix).toContainText(/owner|scope|périmètre|propriétaire/i);
	});

	test("shows the tutorial and a worked example (ui-completeness)", async ({
		page,
	}) => {
		await page.goto("/why-blocked");
		await expect(page.getByTestId("tutorial")).toBeVisible();
		await expect(page.getByTestId("example")).toContainText(
			"aidos explain MISSING_MIRROR",
		);
	});
});
