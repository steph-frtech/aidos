import { expect, test } from "@playwright/test";

/**
 * S27 Playwright e2e — the Ideas-lifecycle Workbench panel (/ideas).
 * mirror record: reflects=kernel.ideas.Promote + the draft/grilled/spiking/harvested/rejected
 *               lifecycle, test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench stages ideas above the wall and lets the kernel be reached ONLY via a mirror
 *   Given the Workbench is running
 *   When I navigate to /ideas
 *   Then a captured idea shows status: draft with its intent + provenance and a "no mirror" marker
 *   And the lifecycle lanes advance through grilled, spiking, harvested
 *   And promoting the harvested idea WITHOUT a mirror renders a RED NO_MIRROR_NO_KERNEL row
 *        (with how_to_fix) and the idea STAYS harvested — no kernel write (THE done criterion)
 *   And promoting it WITH a mirror shows the Promoted path with a provenance link back to the idea
 *   And a rejected idea remains visible in the rejected lane (traced, not deleted)
 */

test.describe("S27 — the Ideas-lifecycle panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/ideas");
		await expect(page.getByTestId("ideas-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("a captured idea shows draft with intent + provenance and a no-mirror marker", async ({
		page,
	}) => {
		const card = page.getByTestId("idea-card-idea-draft-1");
		await expect(card).toBeVisible();
		await expect(card).toHaveAttribute("data-status", "draft");
		await expect(page.getByTestId("status-idea-draft-1")).toContainText(
			"draft",
		);
		await expect(card).toContainText("give regulars a discount"); // the intent
		await expect(card).toContainText("finalement je veux une remise"); // the provenance
		await expect(page.getByTestId("no-mirror-idea-draft-1")).toBeVisible(); // no mirror yet
	});

	test("the lifecycle lanes advance through grilled, spiking, harvested", async ({
		page,
	}) => {
		await expect(page.getByTestId("lane-grilled")).toBeVisible();
		await expect(page.getByTestId("lane-spiking")).toBeVisible();
		await expect(page.getByTestId("lane-harvested")).toBeVisible();
		await expect(page.getByTestId("status-idea-grilled-1")).toContainText(
			"grilled",
		);
		await expect(page.getByTestId("status-idea-spiking-1")).toContainText(
			"spiking",
		);
		await expect(page.getByTestId("status-idea-harvested-1")).toContainText(
			"harvested",
		);
	});

	test("promote WITHOUT a mirror is blocked NO_MIRROR_NO_KERNEL; the idea stays harvested (THE done criterion)", async ({
		page,
	}) => {
		await page.getByTestId("promote-no-mirror").click();
		const blocked = page.getByTestId("promotion-blocked");
		await expect(blocked).toBeVisible();
		await expect(page.getByTestId("block-code")).toContainText(
			"NO_MIRROR_NO_KERNEL",
		);
		// the actionable fix path is rendered
		await expect(blocked).toContainText("write_mirror_run_goal_freeze");
		// the idea STAYS harvested — no kernel write
		await expect(page.getByTestId("stays-harvested")).toBeVisible();
		await expect(page.getByTestId("status-idea-harvested-1")).toContainText(
			"harvested",
		);
	});

	test("promote WITH a mirror shows the Promoted path + the provenance link back to the idea", async ({
		page,
	}) => {
		await page.getByTestId("promote-with-mirror").click();
		const promoted = page.getByTestId("promotion-promoted");
		await expect(promoted).toBeVisible();
		await expect(promoted).toContainText("mirror:order-discount-red-bdd");
		// the provenance back-link points at the idea (KRD §119)
		await expect(page.getByTestId("provenance-link")).toContainText(
			"idea-harvested-1",
		);
	});

	test("a rejected idea remains visible in the rejected lane (traced, not deleted)", async ({
		page,
	}) => {
		const lane = page.getByTestId("lane-rejected");
		await expect(lane).toBeVisible();
		await expect(page.getByTestId("idea-card-idea-rejected-1")).toBeVisible();
		await expect(
			page.getByTestId("reject-reason-idea-rejected-1"),
		).toContainText("duplicates existing policy");
	});
});
