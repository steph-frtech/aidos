import { expect, test } from "@playwright/test";

/**
 * S74 Playwright e2e — the « émetteurs relation-aware (+ async + blob) » Workbench panel.
 * mirror record: reflects=S74-relation-emitter, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /relation-emitter route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * control is reachable AND executable from the screen, bound to a Server Action running the REAL
 * pure engine (lib/relation-emitter, the TS twin of back/kernel/entities/relemit). The S74
 * done-criteria, reached from the screen:
 *   - a N-N relation emits a JOIN TABLE (book_tags) in the DDL;
 *   - the DDL's FKs reference REAL tables (REFERENCES "author"("id"));
 *   - an async node emits a WORKER + an OUTBOX table;
 *   - emission is deterministic (a stable source content address).
 *
 * THE WALL (CLAUDE.md §2): the screen only RENDERS code as values — it writes no truth. Emission is
 * a pure function (never an LLM).
 */

test.describe("S74 — relation-aware emitters", () => {
	test("the route renders the panel with the emit control", async ({
		page,
	}) => {
		await page.goto("/relation-emitter");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Émetteurs relation-aware|Relation-aware emitters/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("emit-submit")).toBeVisible();
		await expect(page.getByTestId("emit-target")).toBeVisible();
		await expect(page.getByTestId("emit-async")).toBeVisible();
	});

	test("DDL: a N-N relation emits a join table and FKs reference real tables", async ({
		page,
	}) => {
		await page.goto("/relation-emitter");
		await page.getByTestId("emit-target").selectOption("ddl");
		await page.getByTestId("emit-submit").click();

		const result = page.getByTestId("emit-result");
		await expect(result).toHaveAttribute("data-verdict", "emitted");
		const out = page.getByTestId("emit-output");
		await expect(out).toContainText('CREATE TABLE "book_tags"');
		await expect(out).toContainText('REFERENCES "author"("id")');
		await expect(out).toContainText('PRIMARY KEY ("book_id", "tag_id")');
		// a stable source content address is shown (determinism).
		await expect(page.getByTestId("emit-hash")).toBeVisible();
	});

	test("an async node emits a worker + an outbox table", async ({ page }) => {
		await page.goto("/relation-emitter");
		// DDL with async included → an outbox table.
		await page.getByTestId("emit-target").selectOption("ddl");
		await page.getByTestId("emit-submit").click();
		await expect(page.getByTestId("emit-output")).toContainText(
			'CREATE TABLE "outbox"',
		);

		// the worker target → a dispatch function.
		await page.getByTestId("emit-target").selectOption("worker");
		await page.getByTestId("emit-submit").click();
		await expect(page.getByTestId("emit-result")).toHaveAttribute(
			"data-verdict",
			"emitted",
		);
		await expect(page.getByTestId("emit-output")).toContainText(
			"dispatchSendReminder",
		);
	});

	test("a sync-only schema (no async) emits no outbox; the worker is refused", async ({
		page,
	}) => {
		await page.goto("/relation-emitter");
		// DDL without async → the FK column is present but NO outbox table. (The
		// uncontrolled checkbox resets to its default after each Server Action
		// re-render, so it is unchecked immediately before every submit.)
		await page.getByTestId("emit-async").uncheck();
		await page.getByTestId("emit-target").selectOption("ddl");
		await page.getByTestId("emit-submit").click();
		await expect(page.getByTestId("emit-output")).toContainText(
			'REFERENCES "author"("id")',
		);
		await expect(page.getByTestId("emit-output")).not.toContainText(
			'CREATE TABLE "outbox"',
		);

		// the worker target with no async → refused (nothing to emit).
		await page.getByTestId("emit-async").uncheck();
		await page.getByTestId("emit-target").selectOption("worker");
		await page.getByTestId("emit-submit").click();
		await expect(page.getByTestId("emit-result")).toHaveAttribute(
			"data-verdict",
			"refused",
		);
	});

	test("TS: typed associations + a navigation SDK", async ({ page }) => {
		await page.goto("/relation-emitter");
		await page.getByTestId("emit-target").selectOption("ts");
		await page.getByTestId("emit-submit").click();
		const out = page.getByTestId("emit-output");
		await expect(out).toContainText("export type Book = {");
		await expect(out).toContainText("tags?: Tag[];");
		await expect(out).toContainText("loadBookAuthor");
	});
});
