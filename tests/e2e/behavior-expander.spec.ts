import { expect, test } from "@playwright/test";

/**
 * S76 Playwright e2e — the « AST behavior-macro + expander dry-run déterministe (l'UNIQUE Expand) »
 * Workbench panel.
 * mirror record: reflects=S76-behavior-expander, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /behavior-expander route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * PROPOSE control is reachable AND executable from the screen, bound to a Server Action running the
 * REAL pure engine (lib/behavior-expander over the ONE compound expander, the TS twin of
 * back/kernel/behavior). The done-criteria of S76:
 *   - same behavior+entity → identical, idempotent expansion (the ONE authoritative Expand);
 *   - the expansion is a PROPOSED DRAFT changeset, never an applied truth (the wall);
 *   - authoritative code, single source.
 *
 * THE WALL (CLAUDE.md §2): the screen only VALIDATES the record, runs the ONE Expand and PROPOSES a
 * DRAFT changeset — it writes no truth. The expansion is a pure function (never an LLM).
 */

test.describe("S76 — behavior-macro expander (the ONE Expand)", () => {
	test("the route renders the panel with the propose control", async ({
		page,
	}) => {
		await page.goto("/behavior-expander");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Expander de behavior-macro|Behavior-macro expander/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("behavior-select")).toBeVisible();
		await expect(page.getByTestId("entity-input")).toBeVisible();
		await expect(page.getByTestId("propose-button")).toBeVisible();
	});

	test("proposing ownable on Order opens a DRAFT changeset carrying the expansion (never applied)", async ({
		page,
	}) => {
		await page.goto("/behavior-expander");
		await page.getByTestId("behavior-select").selectOption("ownable");
		await page.getByTestId("entity-input").fill("Order");
		await page.getByTestId("propose-button").click();

		const result = page.getByTestId("proposal-result");
		await expect(result).toBeVisible();
		// THE WALL: the changeset is DRAFT, never applied.
		await expect(page.getByTestId("changeset-status")).toContainText("DRAFT");
		// The §24.6 owner-scoping boilerplate is part of the expansion.
		await expect(result).toContainText("owner_id");
		await expect(result).toContainText("owner-scoping");
		// Content-addressed (expansion + record ids present).
		await expect(page.getByTestId("expansion-id")).not.toBeEmpty();
		await expect(page.getByTestId("record-id")).not.toBeEmpty();
	});

	test("the expansion is deterministic — re-proposing yields the same expansion id", async ({
		page,
	}) => {
		await page.goto("/behavior-expander");
		await page.getByTestId("behavior-select").selectOption("ownable");
		await page.getByTestId("entity-input").fill("Order");
		await page.getByTestId("propose-button").click();
		await expect(page.getByTestId("expansion-id")).toBeVisible();
		const first = await page.getByTestId("expansion-id").textContent();

		await page.getByTestId("propose-button").click();
		await expect(page.getByTestId("expansion-id")).toBeVisible();
		const second = await page.getByTestId("expansion-id").textContent();
		expect(first).toBe(second);
	});

	test("a soft-deletable behavior expands an archive operation", async ({
		page,
	}) => {
		await page.goto("/behavior-expander");
		await page.getByTestId("behavior-select").selectOption("soft-deletable");
		await page.getByTestId("entity-input").fill("Document");
		await page.getByTestId("propose-button").click();
		await expect(page.getByTestId("proposal-result")).toContainText("archive");
		await expect(page.getByTestId("proposal-result")).toContainText(
			"deleted_at",
		);
	});

	test("a malformed record (no owner) is refused with an actionable error", async ({
		page,
	}) => {
		await page.goto("/behavior-expander");
		await page.getByTestId("owner-input").fill("");
		await page.getByTestId("propose-button").click();
		await expect(page.getByTestId("proposal-error")).toBeVisible();
	});
});
