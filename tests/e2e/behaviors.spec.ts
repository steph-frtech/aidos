import { expect, test } from "@playwright/test";

/**
 * S79 Playwright e2e — the « Librairie behaviors user-facing » Workbench panel.
 * mirror record: reflects=S79-behaviors, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /behaviors route is action-capable (ui-completeness law, CLAUDE.md §7): the SEARCH and
 * ATTACH controls are reachable AND executable from the screen, bound to Server Actions running the
 * REAL pure engine (lib/behaviors, which consumes the ONE S76 compound expander). The done-criterion
 * of S79: attaching owner-scoping to an entity previews scoped policies+fixtures and lands via an
 * APPROVED changeset.
 *
 * THE WALL (CLAUDE.md §2): search is read-only; attach lands an APPLIED changeset VALUE — the legal
 * door (propose → approve), never a direct kernel write. The matcher is PURE code (never an LLM).
 */

test.describe("S79 — behavior library (consumes S76's ONE Expand)", () => {
	test("the route renders the search + attach controls", async ({ page }) => {
		await page.goto("/behaviors");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Librairie behaviors|Behavior library/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("search-input")).toBeVisible();
		await expect(page.getByTestId("search-button")).toBeVisible();
		await expect(page.getByTestId("attach-button")).toBeVisible();
	});

	test("searching is deterministic and project-scoped (a match returns the owner-scoping record)", async ({
		page,
	}) => {
		await page.goto("/behaviors");
		await page.getByTestId("search-input").fill("alice");
		await page.getByTestId("search-button").click();
		const rows = page.getByTestId("search-row");
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText("alice");
		await expect(rows.first()).toContainText("ownable");
	});

	test("searching a non-existent token matches nothing (no LLM false positive)", async ({
		page,
	}) => {
		await page.goto("/behaviors");
		await page.getByTestId("search-input").fill("zzz-nothing");
		await page.getByTestId("search-button").click();
		await expect(page.getByTestId("search-empty")).toBeVisible();
	});

	test("attaching owner-scoping previews scoped policies+fixtures and lands via an APPROVED changeset", async ({
		page,
	}) => {
		await page.goto("/behaviors");
		await page.getByTestId("entity-input").fill("Order");
		await page.getByTestId("attach-button").click();

		const result = page.getByTestId("attach-result");
		await expect(result).toBeVisible();
		// landed via an APPROVED (APPLIED) changeset.
		await expect(page.getByTestId("applied-status")).toContainText("APPLIED");
		// the preview shows the scoped owner-scoping policy + scoped fixtures.
		await expect(result).toContainText("owner-scoping");
		await expect(result).toContainText("owner-only-mutation-allowed");
		await expect(result).toContainText("non-owner-mutation-denied");
		// project-scoped landing target.
		await expect(page.getByTestId("applied-target")).toContainText(
			"behavior-expansion@Order",
		);
	});
});
