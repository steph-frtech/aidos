import { expect, test } from "@playwright/test";

/**
 * S68 Playwright e2e — the « éditeur par forme » Workbench panel.
 * mirror record: reflects=S68-shape-editor, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /shape-editor route is action-capable (ui-completeness law, CLAUDE.md §7): the three
 * controls are reachable AND executable from the screen, bound to Server Actions running the REAL
 * pure engine (lib/shape-editor, the TS twin of back/runtime/shapeeditor):
 *   - Derive: pick a truth-nature → the DERIVED form (the closed table, never a guess).
 *   - Author: pick a nature + reflected layer + type a source → a RED, project-scoped mirror
 *     proposed as a DRAFT ChangeSet (born red, liveness=dead).
 *   - Concurrency: two authors clash on the same field → a LOCK (both candidates surfaced),
 *     never a silent last-write-wins.
 *
 * THE WALL (CLAUDE.md §2): the screen PROPOSES a ChangeSet, it never writes the mirror — the DRAFT
 * badge stays DRAFT and the RED badge proves the mirror is born red (a proposal, never applied).
 */

test.describe("S68 — Shape editor (three forms + draft-level concurrency)", () => {
	test("the route renders the panel with the three controls", async ({ page }) => {
		await page.goto("/shape-editor");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Éditeur par forme|Shape editor/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("derive-submit")).toBeVisible();
		await expect(page.getByTestId("propose-submit")).toBeVisible();
		await expect(page.getByTestId("merge-submit")).toBeVisible();
	});

	test("deriving the form is deterministic by truth-nature (the closed table)", async ({
		page,
	}) => {
		await page.goto("/shape-editor");
		// acceptance → gherkin
		await page.getByTestId("derive-nature").selectOption("acceptance");
		await page.getByTestId("derive-submit").click();
		await expect(page.getByTestId("derived-shape")).toHaveText("gherkin");
		// workflow → fixture
		await page.getByTestId("derive-nature").selectOption("workflow");
		await page.getByTestId("derive-submit").click();
		await expect(page.getByTestId("derived-shape")).toHaveText("fixture");
		// invariant → property
		await page.getByTestId("derive-nature").selectOption("invariant");
		await page.getByTestId("derive-submit").click();
		await expect(page.getByTestId("derived-shape")).toHaveText("property");
	});

	test("authoring a fixture proposes a RED, project-scoped DRAFT ChangeSet (no write)", async ({
		page,
	}) => {
		await page.goto("/shape-editor");
		await page.getByTestId("author-nature").selectOption("workflow");
		await page.getByTestId("reflects").fill("Order.discount");
		await page
			.getByTestId("source")
			.fill(
				"fixture: discount applied\nstate: cart with item\ncommand: apply discount\nevent: discount applied",
			);
		await page.getByTestId("propose-submit").click();

		const result = page.getByTestId("propose-result");
		await expect(result).toHaveAttribute("data-ok", "true");
		// The wall: a DRAFT ChangeSet proposal, born red.
		await expect(page.getByTestId("draft-badge")).toContainText("DRAFT");
		await expect(page.getByTestId("red-badge")).toBeVisible();
		await expect(page.getByTestId("mirror-id")).not.toBeEmpty();
	});

	test("an unparseable source is refused (never a mirror from invalid text)", async ({
		page,
	}) => {
		await page.goto("/shape-editor");
		await page.getByTestId("author-nature").selectOption("workflow");
		await page.getByTestId("reflects").fill("Order");
		await page.getByTestId("source").fill("this is not a fixture");
		await page.getByTestId("propose-submit").click();

		const result = page.getByTestId("propose-result");
		await expect(result).toHaveAttribute("data-ok", "false");
		await expect(page.getByTestId("propose-error")).toBeVisible();
	});

	test("a same-field clash LOCKS — both candidates surfaced, never last-write-wins", async ({
		page,
	}) => {
		await page.goto("/shape-editor");
		await page.getByTestId("title-a").fill("Alice title");
		await page.getByTestId("title-b").fill("Bob title");
		await page.getByTestId("merge-submit").click();

		const result = page.getByTestId("merge-result");
		await expect(result).toHaveAttribute("data-locked", "true");
		// Both candidate values surface for human resolution.
		const conflict = page.getByTestId("conflict");
		await expect(conflict).toContainText("Alice title");
		await expect(conflict).toContainText("Bob title");
	});
});
