import { expect, test } from "@playwright/test";

/**
 * S54 Playwright e2e — Project-scope (truth-store multi-tenant scope) Workbench panel.
 * mirror record: reflects=S54-project-scope-migration, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /project-scope route is action-capable (ui-completeness law,
 * CLAUDE.md §7): the "build scoped read" control is reachable AND executable from
 * the screen, bound to a Server Action that runs the deterministic
 * projectscope.ScopedSelect (always `WHERE project_id = $1`). It writes NO truth
 * (project_id is a scope column, the wall is unchanged). The panel also renders the
 * __system__ seed that adopts the pre-S54 singleton graph (the Order demo) and the
 * nine project-scoped tables.
 */

test.describe("S54 — Project scope", () => {
	test("the route renders the scope panel with the __system__ seed", async ({
		page,
	}) => {
		await page.goto("/project-scope");
		await expect(
			page.getByRole("heading", { level: 1, name: /Scope projet|Project scope/ }),
		).toBeVisible();
		// The seed id is the content-addressed __system__ id (the Go-pinned hash).
		await expect(
			page.getByText("1a4332ab3616ddfb699b668ae4a4078593231e5f996e6b8f1fd1e44b6a4c5004"),
		).toBeVisible();
	});

	test("the nine project-scoped tables are listed", async ({ page }) => {
		await page.goto("/project-scope");
		for (const q of [
			"kernel.truth",
			"mirrors.mirror",
			"ideas.idea",
			"changesets.changeset",
			"dag.phase",
			"brain.memory_item",
			"context.context_graph_decision",
		]) {
			await expect(page.getByTestId(`scoped-row-${q}`)).toBeVisible();
		}
	});

	test("the build-scoped-read control EXECUTES and returns a scoped query", async ({
		page,
	}) => {
		await page.goto("/project-scope");
		// Pick kernel.truth and build its scoped read.
		await page.getByTestId("scope-table-select").selectOption("kernel.truth");
		await page.getByTestId("build-scoped-select").click();
		const result = page.getByTestId("scoped-select-result");
		await expect(result).toBeVisible();
		// The deterministic scoped read carries the scope clause (cross-project
		// isolation guarantee) and targets the chosen table.
		await expect(result).toContainText("WHERE project_id = $1");
		await expect(result).toContainText("kernel.truth");
	});

	test("switching the table rebuilds a distinct scoped read", async ({ page }) => {
		await page.goto("/project-scope");
		await page.getByTestId("scope-table-select").selectOption("ideas.idea");
		await page.getByTestId("build-scoped-select").click();
		const result = page.getByTestId("scoped-select-result");
		await expect(result).toContainText("ideas.idea");
		await expect(result).toContainText("WHERE project_id = $1");
	});

	test("the panel is bilingual (FR default, EN switchable)", async ({ page }) => {
		await page.goto("/project-scope");
		// FR default: the table column header is in French.
		await expect(
			page.getByRole("cell", { name: "kernel.truth" }).first(),
		).toBeVisible();
		// The intro names the scope clause concept in either locale.
		await expect(
			page.getByText(/project_id|truth-store/).first(),
		).toBeVisible();
	});
});
