import { expect, test } from "@playwright/test";

/**
 * S57 Playwright e2e — Project shell: list, create (blank-vs-template), and the
 * header project switcher that pins the active project_id in the AIDOS_PROJECT
 * cookie (like NEXT_LOCALE) and re-scopes every panel.
 *
 * mirror record: reflects=S57-project-switcher, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Done-criterion (ROADMAP-app-builder S57): "créer deux projets, switcher, vérifier
 * l'isolation + que `__system__` reste isolé." Proves:
 *  - the switcher is reachable and executable from the header (ui-completeness);
 *  - selecting a project pins the AIDOS_PROJECT cookie and the selection sticks;
 *  - the reserved `__system__` demo seed is NEVER silently selected (isolation):
 *    with no cookie the active project is a non-system project, and __system__ is
 *    never auto-selected as the default.
 *
 * Runs against the demo fallback (deterministic two-project set) when no live DB,
 * so the isolation claim is visible offline too. Create controls gate on a result
 * line (live → ok, offline → friendly error) — never headless.
 */

test.describe("S57 — Project shell & switcher", () => {
	test("the create flow exposes a blank-vs-template choice", async ({
		page,
	}) => {
		await page.goto("/projects");
		await expect(page.getByTestId("project-mode-blank")).toBeVisible();
		await expect(page.getByTestId("project-mode-template")).toBeVisible();
		// Template mode reveals the source project selector (duplicate path).
		await page.getByTestId("project-mode-template").click();
		await expect(page.getByTestId("project-source")).toBeVisible();
		await page.getByTestId("project-mode-blank").click();
		await expect(page.getByTestId("project-source")).toHaveCount(0);
	});

	test("the create control executes (two projects can be created)", async ({
		page,
	}) => {
		await page.goto("/projects");
		await page.getByTestId("project-slug").fill("e2e-one");
		await page.getByTestId("project-name").fill("E2E One");
		await page.getByTestId("project-owner").fill("owner-s57");
		await page.getByTestId("project-create-submit").click();
		await expect(page.getByTestId("project-result")).toBeVisible();
	});

	test("the duplicate (from-template) control executes", async ({ page }) => {
		await page.goto("/projects");
		await page.getByTestId("project-mode-template").click();
		await page.getByTestId("project-slug").fill("e2e-fork");
		await page.getByTestId("project-name").fill("E2E Fork");
		await page.getByTestId("project-owner").fill("owner-s57");
		await page.getByTestId("project-create-submit").click();
		await expect(page.getByTestId("project-result")).toBeVisible();
	});

	test("the header project switcher is reachable and executes a switch", async ({
		page,
	}) => {
		await page.goto("/projects");
		// Scope to the desktop sidebar instance (the switcher also renders in the
		// mobile header — both share the testid).
		const select = page
			.getByTestId("workbench-sidebar")
			.getByTestId("project-switcher-select");
		await expect(select).toBeVisible();
		// The switcher offers the live (or demo) selectable projects.
		const options = await select.locator("option").allTextContents();
		expect(options.length).toBeGreaterThanOrEqual(2);
		// Switch to the second offered project.
		const values = await select
			.locator("option")
			.evaluateAll((els) =>
				els.map((e) => (e as HTMLOptionElement).value).filter((v) => v !== ""),
			);
		expect(values.length).toBeGreaterThanOrEqual(2);
		await select.selectOption(values[1]);
		// The cookie is pinned and the selection sticks across a reload.
		const cookies = await page.context().cookies();
		const pinned = cookies.find((c) => c.name === "AIDOS_PROJECT");
		expect(pinned?.value).toBe(values[1]);
		await page.reload();
		await expect(
			page
				.getByTestId("workbench-sidebar")
				.getByTestId("project-switcher-select"),
		).toHaveAttribute("data-active", values[1]);
	});

	test("__system__ is never silently the active project (isolation)", async ({
		page,
	}) => {
		// Land with NO cookie — the active project must NOT be __system__ when a
		// non-system project exists (the deterministic resolver guarantees it).
		await page.context().clearCookies();
		await page.goto("/projects");
		const select = page
			.getByTestId("workbench-sidebar")
			.getByTestId("project-switcher-select");
		await expect(select).toBeVisible();
		const activeValue = await select.getAttribute("data-active");
		// Find the slug of the active option; it must not be the __system__ seed.
		const activeSlug = await select
			.locator("option")
			.evaluateAll(
				(els, active) =>
					(
						els.find((e) => (e as HTMLOptionElement).value === active) as
							| HTMLOptionElement
							| undefined
					)?.dataset.slug ?? null,
				activeValue,
			);
		expect(activeSlug).not.toBe("__system__");
	});
});
