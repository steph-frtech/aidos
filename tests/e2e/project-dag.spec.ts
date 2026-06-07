import { expect, test } from "@playwright/test";

/**
 * S56 Playwright e2e — Per-project DAG + content namespace + frontier panel.
 * mirror record: reflects=S56-project-dag, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /project-dag route is action-capable (ui-completeness law, CLAUDE.md §7):
 * every gesture this step develops has a control reachable AND executable from the
 * screen, bound to a Server Action that runs the deterministic projectDag twin
 * (byte-identical to back/archive/projectdag). The three done-criteria, executed:
 *   - branch cuts a phase inside the frontier (isolation);
 *   - merge across two projects → deny CROSS_PROJECT_MERGE;
 *   - duplicate forks an ISOLATED root (shares no node with the source);
 *   - archive masks without destroying (kept count survives the mask).
 * It writes NO truth — recording a node rides the S24 dag MCP (the wall, §2).
 */

test.describe("S56 — Per-project DAG", () => {
	test("the route renders the panel with both refusal codes", async ({
		page,
	}) => {
		await page.goto("/project-dag");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /DAG par projet|Per-project DAG/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("code-merge")).toHaveText(
			"CROSS_PROJECT_MERGE",
		);
		await expect(page.getByTestId("code-node")).toHaveText("CROSS_PROJECT_NODE");
	});

	test("branch EXECUTES: a phase is cut inside the project frontier", async ({
		page,
	}) => {
		await page.goto("/project-dag");
		await page.getByTestId("branch-button").click();
		await expect(page.getByTestId("dag-view")).toBeVisible();
		// the new line appears as a head (the genesis head moved to it)
		await expect(page.getByTestId("heads-count")).toContainText("heads: 1");
	});

	test("merge EXECUTES: cross-project → deny CROSS_PROJECT_MERGE", async ({
		page,
	}) => {
		await page.goto("/project-dag");
		// default presets are proj-a (left) and proj-b (right) → different projects
		await page.getByTestId("merge-button").click();
		await expect(page.getByTestId("refusal-code")).toHaveText(
			"CROSS_PROJECT_MERGE",
		);
	});

	test("merge EXECUTES: same project → allowed", async ({ page }) => {
		await page.goto("/project-dag");
		await page.getByTestId("field-merge-right").fill("proj-a");
		await page.getByTestId("merge-button").click();
		await expect(page.getByTestId("merge-allow")).toBeVisible();
	});

	test("duplicate EXECUTES: forks an isolated root", async ({ page }) => {
		await page.goto("/project-dag");
		await page.getByTestId("dup-button").click();
		await expect(page.getByTestId("dup-isolated")).toBeVisible();
		await expect(page.getByTestId("dup-isolated")).toContainText(
			/isolée|isolated/i,
		);
	});

	test("archive EXECUTES: masks without destroying, restore brings heads back", async ({
		page,
	}) => {
		await page.goto("/project-dag");
		await page.getByTestId("archive-button").click();
		await expect(page.getByTestId("heads-count")).toContainText("masked");
		// kept count > 0 proves nodes survive the mask (append-only): heads:0 but kept:1
		await expect(page.getByTestId("heads-count")).toContainText("heads: 0");
		await expect(page.getByTestId("heads-count")).toContainText("kept: 1");
		await page.getByTestId("restore-button").click();
		await expect(page.getByTestId("heads-count")).not.toContainText("masked");
	});
});
