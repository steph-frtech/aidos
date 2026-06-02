import { expect, test } from "@playwright/test";

/**
 * S48 Playwright e2e — the GlobalInvariant Workbench panel (/global-invariants).
 * mirror record: reflects=S48-global-invariant, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench renders the pii-forgettable-federation cross-cell invariant + the
 *   red-wave fan-out + the live admission decisions (KRD §49.1)
 *   Given the Workbench is running
 *   When I navigate to /global-invariants
 *   Then the invariant card names scope federation_policy, blast_radius global, approval_required
 *        architecture_owner and lists checkout, profile, billing under cells
 *   And the red-wave panel reddens ALL THREE cells on a billing violation (not just billing)
 *   And the admission table shows the cell_owner row BLOCKED with INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS
 *   And the architecture_owner row ADMITTED
 *   And the propose control opens a ChangeSet proposal stub (the wall — never a direct truth-write)
 */

test.describe("S48 — the GlobalInvariant panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/global-invariants");
		await expect(page.getByTestId("invariant-card")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the invariant card names scope, blast_radius, approval_required and the spanned cells", async ({
		page,
	}) => {
		await expect(page.getByTestId("invariant-scope")).toContainText(
			"federation_policy",
		);
		await expect(page.getByTestId("invariant-blast-radius")).toContainText(
			"global",
		);
		await expect(
			page.getByTestId("invariant-approval-required"),
		).toContainText("architecture_owner");
		for (const cell of ["checkout", "profile", "billing"]) {
			await expect(page.getByTestId(`cell-${cell}`)).toBeVisible();
		}
	});

	test("the red-wave panel reddens ALL THREE cells on a billing violation", async ({
		page,
	}) => {
		for (const cell of ["checkout", "profile", "billing"]) {
			await expect(page.getByTestId(`wave-cell-${cell}`)).toHaveAttribute(
				"data-red",
				"true",
			);
		}
	});

	test("the admission table blocks cell_owner and admits architecture_owner", async ({
		page,
	}) => {
		const cellOwnerRow = page.getByTestId("admission-row-cell_owner");
		await expect(cellOwnerRow).toHaveAttribute("data-decision", "blocked");
		await expect(page.getByTestId("block-code-cell_owner")).toContainText(
			"INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS",
		);

		const archRow = page.getByTestId("admission-row-architecture_owner");
		await expect(archRow).toHaveAttribute("data-decision", "admitted");
	});

	test("the propose control opens a ChangeSet proposal stub (the wall)", async ({
		page,
	}) => {
		await page.getByTestId("propose-changeset").click();
		await expect(page.getByTestId("propose-stub")).toBeVisible();
	});
});
