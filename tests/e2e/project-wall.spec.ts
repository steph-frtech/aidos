import { expect, test } from "@playwright/test";

/**
 * S55 Playwright e2e — Project-aware wall (two-layer multi-tenant isolation) panel.
 * mirror record: reflects=S55-project-wall, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /project-wall route is action-capable (ui-completeness law,
 * CLAUDE.md §7): the "classify" control is reachable AND executable from the screen,
 * bound to a Server Action that runs the deterministic projectwall.Classify (the
 * same predicate the Postgres RLS enforces). Each verdict branch is exercised:
 *   - same project under the active identity → allow
 *   - cross project (A scope reaching a B row) → deny AGENT_CROSS_PROJECT_WRITE
 *   - forged gateway identity (same project) → deny (the S61 layer)
 * It writes NO truth — this wall only judges scope (the wall is unchanged, §2).
 */

test.describe("S55 — Project-aware wall", () => {
	test("the route renders the two-layer panel with the block code", async ({
		page,
	}) => {
		await page.goto("/project-wall");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Mur project-aware|Project-aware wall/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("block-code")).toHaveText(
			"AGENT_CROSS_PROJECT_WRITE",
		);
	});

	test("classify EXECUTES: same project under active identity → allow", async ({
		page,
	}) => {
		await page.goto("/project-wall");
		await page.getByTestId("preset-presetSame").click();
		await page.getByTestId("classify-button").click();
		await expect(page.getByTestId("verdict-allow")).toBeVisible();
	});

	test("classify EXECUTES: cross project → deny AGENT_CROSS_PROJECT_WRITE", async ({
		page,
	}) => {
		await page.goto("/project-wall");
		await page.getByTestId("preset-presetCross").click();
		await page.getByTestId("classify-button").click();
		const deny = page.getByTestId("verdict-deny");
		await expect(deny).toBeVisible();
		await expect(deny).toContainText("AGENT_CROSS_PROJECT_WRITE");
	});

	test("classify EXECUTES: forged gateway identity → deny (S61 layer)", async ({
		page,
	}) => {
		await page.goto("/project-wall");
		await page.getByTestId("preset-presetForged").click();
		await page.getByTestId("classify-button").click();
		await expect(page.getByTestId("verdict-deny")).toBeVisible();
		await expect(page.getByTestId("verdict-deny")).toContainText(
			"AGENT_CROSS_PROJECT_WRITE",
		);
	});

	test("the user can type a custom scope and classify it", async ({ page }) => {
		await page.goto("/project-wall");
		await page.getByTestId("field-identity").fill("bob");
		await page.getByTestId("field-active-project").fill("proj-x");
		await page.getByTestId("field-target-project").fill("proj-x");
		await page.getByTestId("field-claimed-identity").fill("");
		await page.getByTestId("classify-button").click();
		await expect(page.getByTestId("verdict-allow")).toBeVisible();
	});
});
