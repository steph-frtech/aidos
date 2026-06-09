import { expect, test } from "@playwright/test";

/**
 * S112 Playwright e2e — the « Jardinage du KernelDebt + /trim par projet » Workbench panel
 * (KRD §82.4).
 * mirror record: reflects=S112-kernel-garden, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /kernel-garden cockpit is action-capable (ui-completeness law, CLAUDE.md §7):
 * controls reachable AND executable from the screen, bound to Server Actions running the REAL
 * pure twin (lib/kernel-garden composing KernelDebt S41 + economics S51 + cost meter S111). The
 * §S112 done-criteria, reached from the screen:
 *
 *   « /trim ne supprime JAMAIS une vérité automatiquement ; accepter une proposition de trim
 *     OUVRE une idée → miroir → /goal ; le scan est SCOPÉ PAR PROJET ; une UI pour trier la dette. »
 *
 * THE WALL (CLAUDE.md §2): the cockpit writes no truth; /trim deletes nothing — accepting a
 * proposal opens an idea (never a removal).
 */

test.describe("S112 — per-project KernelDebt gardening & /trim cockpit", () => {
	test("the route renders the project selector + the tend control", async ({
		page,
	}) => {
		await page.goto("/kernel-garden");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
		await expect(page.getByTestId("project-select")).toBeVisible();
		await expect(page.getByTestId("tend-submit")).toBeVisible();
	});

	test("done-criterion: gardening a project surfaces the five rots incl. the two S112 adds", async ({
		page,
	}) => {
		await page.goto("/kernel-garden");
		await page.getByTestId("tend-submit").click();
		await expect(page.getByTestId("garden-result")).toBeVisible();

		// The scan is scoped to the selected project (§82.4).
		await expect(page.getByTestId("scoped-project")).toHaveText(
			"proj-checkout",
		);

		// The two S112 adds are surfaced: a dead-liveness proof and a low-value constraint.
		await expect(
			page.locator('[data-testid="debt-item"][data-kind="dead_liveness"]'),
		).toBeVisible();
		await expect(
			page.locator(
				'[data-testid="debt-item"][data-kind="low_value_constraint"]',
			),
		).toBeVisible();

		// /trim suggests only — the no-delete rule is stated on the screen.
		await expect(page.getByTestId("suggest-only")).toContainText(
			/ne supprime rien|deletes nothing/,
		);
	});

	test("done-criterion: project-scoped — proj-billing never shows proj-checkout's debt", async ({
		page,
	}) => {
		await page.goto("/kernel-garden");
		await page.getByTestId("project-select").selectOption("proj-billing");
		await page.getByTestId("tend-submit").click();
		await expect(page.getByTestId("scoped-project")).toHaveText("proj-billing");

		// proj-billing only has its own dead-liveness mirror; its justified costly cell is
		// NOT debt (it earned its keep) — so no low_value_constraint here.
		await expect(
			page.locator('[data-testid="debt-item"][data-kind="dead_liveness"]'),
		).toBeVisible();
		await expect(
			page.locator(
				'[data-testid="debt-item"][data-kind="low_value_constraint"]',
			),
		).toHaveCount(0);
		// no orphan/stale/surviving from proj-checkout leaks in.
		await expect(
			page.locator('[data-testid="debt-item"][data-kind="orphan_mirror"]'),
		).toHaveCount(0);
	});

	test("done-criterion: accepting a trim proposal OPENS an idea and NEVER deletes", async ({
		page,
	}) => {
		await page.goto("/kernel-garden");
		await page.getByTestId("tend-submit").click();
		await expect(page.getByTestId("garden-result")).toBeVisible();

		// Accept the first proposal.
		await page.getByTestId("accept-submit").first().click();
		await expect(page.getByTestId("accept-result")).toBeVisible();
		await expect(page.getByTestId("opens-idea-badge")).toContainText(
			/OUVRE UNE IDÉE|OPENS AN IDEA/,
		);
		await expect(page.getByTestId("never-deletes-badge")).toContainText(
			/NE SUPPRIME JAMAIS|NEVER DELETES/,
		);
		// the door is the only path.
		await expect(page.getByTestId("the-door")).toContainText(
			"idea → mirror → /goal → human approval",
		);
	});
});
