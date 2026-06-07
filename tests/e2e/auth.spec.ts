import { expect, test } from "@playwright/test";

/**
 * S61 Playwright e2e — the authentication & session panel (/auth).
 * mirror record: reflects=S61-auth-sessions, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the S61 done criteria, executable from the screen (ui-completeness, CLAUDE.md §7):
 *   - LOGIN → SESSION → propagated identity: signing in resolves a verified principal whose
 *     identity is shown (the one value that descends to BOTH walls — gateway scope + RLS);
 *   - DONE CRITERION (property): an unauthenticated call to a truth-write endpoint is
 *     refused UNAUTHENTICATED and reaches no data. The "attempt unauthenticated" control
 *     runs the call through the same gate the live server applies (auth → scope → zone);
 *     the inline toast renders the REAL UNAUTHENTICATED BlockReason + a how_to_fix item;
 *   - no anonymous door: signing in with a blank subject is refused UNAUTHENTICATED.
 * No truth is written — auth lives outside the Kernel (CLAUDE.md §2).
 */

test.describe("S61 — authentication & session panel (/auth)", () => {
	test("login → session → propagated identity", async ({ page }) => {
		await page.goto("/auth");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Authentification & sessions|Authentication & sessions/,
			}),
		).toBeVisible();

		await page.getByTestId("signin-button").click();
		const card = page.getByTestId("session-card");
		await expect(card).toBeVisible();
		// The resolved identity is the propagated subject (default "user-alice").
		await expect(page.getByTestId("session-identity")).toHaveText("user-alice");
	});

	test("DONE CRITERION: an unauthenticated truth-write is refused UNAUTHENTICATED", async ({
		page,
	}) => {
		await page.goto("/auth");
		// kernel_write is the default truth-write endpoint; attempt it WITHOUT a session.
		await page.getByTestId("attempt-button").click();
		const toast = page.getByTestId("attempt-toast");
		await expect(toast).toBeVisible();
		await expect(page.getByTestId("attempt-code")).toHaveText("UNAUTHENTICATED");
		// The actionable how_to_fix[] is rendered (at least one item).
		await expect(toast.locator("ul li").first()).toBeVisible();
	});

	test("a different truth-write endpoint is also refused UNAUTHENTICATED", async ({
		page,
	}) => {
		await page.goto("/auth");
		await page.getByTestId("field-tool").selectOption("mirror_write");
		await page.getByTestId("attempt-button").click();
		await expect(page.getByTestId("attempt-code")).toHaveText("UNAUTHENTICATED");
	});

	test("no anonymous door: a blank subject is refused UNAUTHENTICATED at sign-in", async ({
		page,
	}) => {
		await page.goto("/auth");
		await page.getByTestId("field-subject").fill("");
		await page.getByTestId("signin-button").click();
		await expect(page.getByTestId("signin-block-code")).toHaveText(
			"UNAUTHENTICATED",
		);
	});

	test("the nav exposes the /auth route", async ({ page }) => {
		await page.goto("/auth");
		await expect(
			page.locator('a[href="/auth"]').first(),
		).toBeAttached();
	});
});
