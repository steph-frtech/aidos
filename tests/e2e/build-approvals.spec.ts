import { expect, test } from "@playwright/test";

/**
 * tests/e2e/build-approvals.spec.ts — the S85 Playwright e2e (action-capable, CLAUDE.md §7).
 *
 * THE STEP (ROADMAP S85): "vérité proposée par l'agent gatée au mur + approbation humaine UI".
 * The /build-approvals route EXECUTES the two ops: PROPOSE a truth the loop implied (proposed,
 * never admitted) and APPROVE a pending proposal (admitted ONLY on a real human holding the scope
 * authority). The e2e proves each control EXECUTES against the live route:
 *
 *   1. proposing a truth appends a `proposed` proposal to the inbox, carrying its mirror;
 *   2. approving as a VIEWER is refused INSUFFICIENT_AUTHORITY — the proposal stays proposed;
 *   3. approving as an OWNER ADMITS the truth — it lands and leaves the inbox;
 *   4. proposing a below-the-line target is refused NOT_A_TRUTH_WRITE (the wall holds: no headless
 *      truth-write — the propose door is for truths only).
 */

test.describe("S85 /build-approvals — propose → human approval", () => {
	test("a viewer cannot admit; an owner admits the proposed truth", async ({ page }) => {
		await page.goto("/build-approvals");

		// The screen is reachable and themed.
		await expect(page.getByTestId("propose-form")).toBeVisible();
		await expect(page.getByTestId("inbox")).toBeVisible();
		await expect(page.getByTestId("inbox-empty")).toBeVisible();

		// (1) PROPOSE a truth the loop implied — a `proposed` proposal appears, with its mirror.
		await page.getByTestId("propose-submit").click();
		await expect(page.getByTestId("propose-ok")).toBeVisible();
		const proposal = page.locator('[data-testid^="proposal-"]').first();
		await expect(proposal).toBeVisible();
		await expect(proposal.getByTestId("proposal-status")).toHaveText("proposed");
		await expect(proposal.getByTestId("proposal-mirror")).toContainText("mirror://");

		// (2) APPROVE as a VIEWER — refused INSUFFICIENT_AUTHORITY, proposal stays proposed.
		await proposal.locator('select[name="member_role"]').selectOption("viewer");
		await proposal.locator('button[type="submit"]').click();
		const decision = page.getByTestId("decision");
		await expect(decision).toHaveAttribute("data-admitted", "false");
		await expect(page.getByTestId("decision-block-code")).toHaveText(
			"INSUFFICIENT_AUTHORITY",
		);
		// The proposal is still pending (un-landed).
		await expect(proposal.getByTestId("proposal-status")).toHaveText("proposed");

		// (3) APPROVE as an OWNER — the truth is ADMITTED and leaves the inbox.
		await proposal.locator('select[name="member_role"]').selectOption("owner");
		await proposal.locator('button[type="submit"]').click();
		await expect(page.getByTestId("decision")).toHaveAttribute(
			"data-admitted",
			"true",
		);
		await expect(page.getByTestId("decision-admitted")).toBeVisible();
		// The inbox is empty again (the admitted truth landed).
		await expect(page.getByTestId("inbox-empty")).toBeVisible();
	});

	test("a below-the-line target is refused NOT_A_TRUTH_WRITE (the wall holds)", async ({
		page,
	}) => {
		await page.goto("/build-approvals");

		await page.getByTestId("f-target").fill("archive.content");
		await page.getByTestId("propose-submit").click();

		const block = page.getByTestId("propose-block");
		await expect(block).toBeVisible();
		await expect(page.getByTestId("propose-block-code")).toHaveText(
			"NOT_A_TRUTH_WRITE",
		);
		// No proposal was minted — the inbox stays empty.
		await expect(page.getByTestId("inbox-empty")).toBeVisible();
	});

	test("a mirror-less truth is refused MISSING_MIRROR (a monster never lands)", async ({
		page,
	}) => {
		await page.goto("/build-approvals");

		await page.getByTestId("f-mirror").fill("");
		await page.getByTestId("propose-submit").click();

		await expect(page.getByTestId("propose-block-code")).toHaveText(
			"MISSING_MIRROR",
		);
		await expect(page.getByTestId("inbox-empty")).toBeVisible();
	});
});
