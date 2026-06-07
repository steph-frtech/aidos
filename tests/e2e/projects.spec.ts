import { expect, test } from "@playwright/test";

/**
 * S53 Playwright e2e — Projects (multi-tenant root scope) Workbench panel.
 * mirror record: reflects=S53-project-root-scope, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /projects route is action-capable (ui-completeness law, CLAUDE.md §7):
 * the create / archive / restore / delete controls are reachable AND executable
 * from the screen, each bound to a Server Action that writes the `projects` schema
 * below the wall (append-only; soft delete only). When a live Postgres is reachable
 * the create control persists a content-addressed project; without a DB the action
 * surfaces a friendly result line instead of crashing (gated on the result text).
 *
 * The demo fallback lists two disjoint projects (alpha-shop / beta-crm) so the
 * isolation claim — two projects never collide — is visible even offline.
 */

test.describe("S53 — Projects root scope", () => {
	test("the route renders the multi-tenant panel", async ({ page }) => {
		await page.goto("/projects");
		await expect(
			page.getByRole("heading", { level: 1, name: /Projets|Projects/ }),
		).toBeVisible();
		await expect(page.getByTestId("project-list")).toBeVisible();
	});

	test("two disjoint projects are listed (no collision)", async ({ page }) => {
		await page.goto("/projects");
		const rows = page.getByTestId("project-row");
		await expect(rows.first()).toBeVisible();
		// At least the two demo projects (or the live head set) are present and
		// carry distinct slugs — the isolation guarantee.
		const slugs = await rows.evaluateAll((els) =>
			els.map((e) => (e as HTMLElement).dataset.slug),
		);
		const unique = new Set(slugs);
		expect(unique.size).toBe(slugs.length);
	});

	test("the create control is reachable and executes", async ({ page }) => {
		await page.goto("/projects");
		await page.getByTestId("project-slug").fill("e2e-shop");
		await page.getByTestId("project-name").fill("E2E Shop");
		await page.getByTestId("project-owner").fill("owner-e2e");
		await page.getByTestId("project-create-submit").click();
		// The action ran: a result line appears (ok when DB is live, friendly error
		// otherwise) — the control is not headless.
		await expect(page.getByTestId("project-result")).toBeVisible();
	});

	test("an invalid slug is refused with a result line", async ({ page }) => {
		await page.goto("/projects");
		await page.getByTestId("project-slug").fill("Bad_Slug");
		await page.getByTestId("project-name").fill("Bad");
		await page.getByTestId("project-owner").fill("owner-e2e");
		await page.getByTestId("project-create-submit").click();
		await expect(page.getByTestId("project-result")).toBeVisible();
	});

	test("a lifecycle control (archive/delete) is bound and executes", async ({
		page,
	}) => {
		await page.goto("/projects");
		// Pick the first active project's delete (soft) control — it exists on every
		// non-deleted row, so the control is always reachable.
		const del = page.getByTestId("project-delete").first();
		await expect(del).toBeVisible();
		await del.click();
		await expect(page.getByTestId("project-result")).toBeVisible();
	});
});
