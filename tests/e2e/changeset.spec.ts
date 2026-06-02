import { expect, test } from "@playwright/test";

/**
 * S20 Playwright e2e — the ChangeSet Workbench panel (/changeset).
 * mirror record: reflects=S20-changeset, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench renders the ChangeSet lifecycle, the atomic spec+mirror envelope, and the
 *           append-only revert lineage (KRD §44, §98)
 *   Given the Workbench is running
 *   When I navigate to /changeset
 *   Then I see the « add order discount » envelope with spec_delta and mirror_delta rendered together
 *   And applying the complete envelope shows status APPLIED with a non-empty applied_at
 *   And the incomplete-apply row shows blocked with INCOMPLETE_CHANGESET
 *   And the edit-after-apply row shows blocked with APPLIED_IS_IMMUTABLE (the done criterion)
 *   And the revert lineage shows source cs-A as REVERTED (still present) linked to inverse cs-B
 */

test.describe("S20 — the ChangeSet panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/changeset");
		await expect(page.getByTestId("envelope-card")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the envelope shows label add order discount with spec_delta and mirror_delta together", async ({
		page,
	}) => {
		const card = page.getByTestId("envelope-card");
		await expect(card).toContainText("add order discount");
		// spec and mirror are rendered together in the one envelope card (they cannot drift).
		await expect(card).toContainText("Order.discount");
		await expect(card).toContainText("Order.discount.fixture");
		// the envelope opens as a DRAFT.
		await expect(card.getByTestId("status-DRAFT")).toBeVisible();
	});

	test("applying the complete envelope shows APPLIED with a non-empty applied_at", async ({
		page,
	}) => {
		await expect(page.getByTestId("status-APPLIED").first()).toBeVisible();
		const appliedAt = page.getByTestId("applied-at");
		await expect(appliedAt).toBeVisible();
		await expect(appliedAt).toContainText("2026-05-31T12:00:00Z");
	});

	test("the incomplete-apply row shows blocked with INCOMPLETE_CHANGESET", async ({
		page,
	}) => {
		const block = page.getByTestId("block-INCOMPLETE_CHANGESET");
		await expect(block).toBeVisible();
		await expect(block).toContainText("add_mirror_for_spec_delta");
	});

	test("the edit-after-apply row shows blocked with APPLIED_IS_IMMUTABLE (the done criterion)", async ({
		page,
	}) => {
		await expect(page.getByTestId("block-APPLIED_IS_IMMUTABLE")).toBeVisible();
	});

	test("the revert lineage shows cs-A REVERTED (still present) linked to inverse cs-B", async ({
		page,
	}) => {
		const source = page.getByTestId("lineage-source");
		await expect(source).toContainText("cs-A");
		await expect(source.getByTestId("status-REVERTED")).toBeVisible();

		const inverse = page.getByTestId("lineage-inverse");
		await expect(inverse).toContainText("cs-B");
		// the inverse reverts the source (append-only — the source is never destroyed).
		await expect(inverse).toContainText("cs-A");
	});
});
