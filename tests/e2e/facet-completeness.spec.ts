import { expect, test } from "@playwright/test";

/**
 * FK04 Playwright e2e — the « la complétude facet-aware » Workbench panel.
 * mirror record: reflects=FK04-facetcomplete, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /facet-completeness route is action-capable (ui-completeness law, CLAUDE.md §7):
 * the RUN-THE-LAW control (with a FAULT-INJECTION) is reachable AND executable from the screen,
 * bound to a Server Action running the REAL pure twin (lib/facetcomplete, the TS twin of
 * back/kernel/mirror/facetcomplete). The FK04 done-criteria, reached from the screen:
 *   - FAULT-INJECTION: remove a pair of an instantiated facet → a MONSTER is detected;
 *   - a COLLAPSED legal kernel passes — the conformant cut returns COMPLETE;
 *   - X (experience) is soft — its missing pair is advisory, never a hard monster.
 *
 * THE WALL (CLAUDE.md §2): the screen only COMPUTES + DISPLAYS — it writes no truth. The law is
 * a pure function (never an LLM).
 */

test.describe("FK04 — facet-aware completeness", () => {
	test("the route renders the demo cut + the run-the-law control", async ({
		page,
	}) => {
		await page.goto("/facet-completeness");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /La complétude facet-aware|Facet-aware completeness/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("check-submit")).toBeVisible();
		await expect(page.getByTestId("remove-facet")).toBeVisible();
		// the demo cut shows op-checkout instantiating F + S.
		await expect(page.getByTestId("layer-op-checkout")).toBeVisible();
		await expect(page.getByTestId("layer-op-checkout-facet-S")).toBeVisible();
	});

	test("the conformant cut passes (COMPLETE) — a collapsed legal kernel passes", async ({
		page,
	}) => {
		await page.goto("/facet-completeness");
		await page.getByTestId("check-submit").click();

		await expect(page.getByTestId("result")).toBeVisible();
		await expect(page.getByTestId("verdict")).toHaveAttribute(
			"data-verdict",
			"COMPLETE",
		);
		// no hard monster on the conformant cut.
		await expect(page.getByTestId("monsters-empty")).toBeVisible();
	});

	test("FAULT-INJECTION: removing the S pair of op-checkout produces a monster", async ({
		page,
	}) => {
		await page.goto("/facet-completeness");
		// remove the SECURITY pair of op-checkout.
		await page.getByTestId("remove-facet").selectOption("S");
		await page.getByTestId("remove-layer").selectOption("op-checkout");
		await page.getByTestId("check-submit").click();

		await expect(page.getByTestId("result")).toBeVisible();
		// the verdict flips to RED_MONSTER.
		await expect(page.getByTestId("verdict")).toHaveAttribute(
			"data-verdict",
			"RED_MONSTER",
		);
		// the monster names op-checkout × S.
		await expect(page.getByTestId("monster-op-checkout-S")).toBeVisible();
	});

	test("SOFT X: a missing X pair is advisory, never a hard monster", async ({
		page,
	}) => {
		await page.goto("/facet-completeness");
		// view-cart instantiates X but has no X pair in the demo cut → advisory by default.
		await page.getByTestId("check-submit").click();

		await expect(page.getByTestId("result")).toBeVisible();
		// the verdict stays COMPLETE (X never hard-blocks).
		await expect(page.getByTestId("verdict")).toHaveAttribute(
			"data-verdict",
			"COMPLETE",
		);
		// the X miss surfaces as an advisory finding.
		await expect(page.getByTestId("advisory-view-cart-X")).toBeVisible();
	});
});
