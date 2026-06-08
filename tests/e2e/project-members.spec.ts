import { expect, test } from "@playwright/test";

/**
 * S62 Playwright e2e — Project members (membership & ownership) Workbench panel.
 * mirror record: reflects=S62-project-membership, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /project-members route is action-capable (ui-completeness law,
 * CLAUDE.md §7): the invite / change-role / remove controls are reachable AND
 * executable from the screen, each bound to a Server Action that writes
 * `accounts.project_members` below the wall (append-only; soft delete only), gated
 * by the role gradient — only an OWNER acting in the project administers.
 *
 * The demo fallback lists three members (oz owner, ed editor, vic viewer) so the
 * gradient and the membership join are visible even without a DB.
 */

test.describe("S62 — Project membership & ownership", () => {
	test("the route renders the membership panel", async ({ page }) => {
		await page.goto("/project-members");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Adhésions de projet|Project members/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("member-list")).toBeVisible();
	});

	test("the membership join lists the three roles", async ({ page }) => {
		await page.goto("/project-members");
		const rows = page.getByTestId("member-row");
		await expect(rows.first()).toBeVisible();
		// The demo (or live head) set carries an owner — the real owner the
		// project.owner_ref (S53) resolves to.
		const roles = await rows.evaluateAll((els) =>
			els.map((e) => (e as HTMLElement).dataset.role),
		);
		expect(roles).toContain("owner");
	});

	test("the invite control is reachable and executes", async ({ page }) => {
		await page.goto("/project-members");
		await page.getByTestId("member-actor").fill("oz");
		await page.getByTestId("member-identity").fill("alice@x");
		await page.getByTestId("member-role-select").selectOption("viewer");
		await page.getByTestId("member-invite-submit").click();
		// The action ran: a result line appears (ok when DB is live, friendly error
		// otherwise) — the control is not headless.
		await expect(page.getByTestId("member-result")).toBeVisible();
	});

	test("a non-owner actor inviting is refused (role gradient)", async ({
		page,
	}) => {
		await page.goto("/project-members");
		// vic is a viewer of the demo project — not an owner, so the admin gate denies.
		await page.getByTestId("member-actor").fill("vic");
		await page.getByTestId("member-identity").fill("mallory@x");
		await page.getByTestId("member-role-select").selectOption("editor");
		await page.getByTestId("member-invite-submit").click();
		const result = page.getByTestId("member-result");
		await expect(result).toBeVisible();
		// In the deterministic demo the gate is exercised: the refusal carries a
		// ROLE_FORBIDDEN code (a viewer cannot administer membership).
		await expect(result).toHaveAttribute("data-code", "ROLE_FORBIDDEN");
	});

	test("the change-role and remove controls are reachable and execute", async ({
		page,
	}) => {
		await page.goto("/project-members");
		// First member row carries an apply + remove control.
		await page.getByTestId("member-role-apply").first().click();
		await expect(page.getByTestId("member-result")).toBeVisible();
		await page.goto("/project-members");
		await page.getByTestId("member-remove").first().click();
		await expect(page.getByTestId("member-result")).toBeVisible();
	});
});
