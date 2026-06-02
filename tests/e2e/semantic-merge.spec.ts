import { expect, test } from "@playwright/test";

/**
 * S25 Playwright e2e — the Semantic-merge Workbench panel (/semantic-merge).
 * mirror record: reflects=archive.merge.MergeSemantic, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench decides a merge by the MIRROR, not the text diff (KRD §122/§130)
 *   Given the Workbench is running
 *   When I navigate to /semantic-merge
 *   And I merge the no-overlap refund EU/US pair (git would auto-merge — disjoint deltas)
 *   Then I see status CONFLICT, refund in the conflicting mirrors, and a "blocked — override required"
 *        message (THE done criterion: a clean text merge with a red mirror is BLOCKED)
 *   When I merge the disjoint-lines cart pair (pay-button / amount-field — different lines)
 *   Then I see status CONFLICT (the same emergent invariant cart.own_mirror, red git never sees)
 *   When I merge the free-space promo-banner / help-link pair
 *   Then I see status CLEAN (the merged-cut aggregate is green — a candidate stable phase)
 */

test.describe("S25 — the Semantic-merge panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/semantic-merge");
		await expect(page.getByTestId("semantic-merge-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the no-overlap refund EU/US merge is a CONFLICT and is blocked (the done criterion)", async ({
		page,
	}) => {
		await page.getByTestId("merge-refund").click();
		const result = page.getByTestId("merge-result");
		await expect(result).toBeVisible();
		// the mirror, not the diff, decides: a textually-clean merge is BLOCKED. The data-status
		// attribute carries the locale-stable verdict (the badge text is bilingual, FR by default).
		await expect(result).toHaveAttribute("data-status", "conflict");
		await expect(page.getByTestId("status-badge")).toContainText("conflit");
		await expect(page.getByTestId("conflicting-refund")).toBeVisible();
		// blocked — the resolution is an override (required authority surfaced, "humain" in FR).
		await expect(page.getByTestId("requires-authority")).toContainText(
			"humain",
		);
		// the human-language sentence frames the merge as a mirror decision, not a line diff.
		await expect(page.getByTestId("sentence")).toContainText("git");
		// a content-addressed merged cut is referenced.
		await expect(page.getByTestId("merged-cut-hash")).not.toHaveText("—");
	});

	test("the disjoint-lines cart merge is a CONFLICT (same emergent invariant, red git never sees)", async ({
		page,
	}) => {
		await page.getByTestId("merge-cart").click();
		const result = page.getByTestId("merge-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-status", "conflict");
		await expect(page.getByTestId("conflicting-cart.own_mirror")).toBeVisible();
		await expect(page.getByTestId("requires-authority")).toContainText(
			"humain",
		);
	});

	test("the free-space promo-banner / help-link merge is CLEAN (a candidate stable phase)", async ({
		page,
	}) => {
		await page.getByTestId("merge-view").click();
		const result = page.getByTestId("merge-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-status", "clean");
		await expect(page.getByTestId("status-badge")).toContainText("propre");
		// clean ⇒ no conflicting mirrors, no override required.
		await expect(page.getByTestId("conflicting-mirrors")).toHaveCount(0);
		await expect(page.getByTestId("requires-authority")).toHaveText("—");
		await expect(page.getByTestId("merged-cut-hash")).not.toHaveText("—");
	});

	test("the panel reaches the route from the Workbench nav and shows the tutorial + example", async ({
		page,
	}) => {
		await expect(page.getByTestId("tutorial")).toBeVisible();
		await expect(page.getByTestId("example")).toBeVisible();
		// before any action, the awaiting hint is shown (action-capable, not a static dump).
		await expect(page.getByTestId("awaiting")).toBeVisible();
	});
});
