import { expect, test } from "@playwright/test";

/**
 * S80 Playwright e2e — the « Behavior-macro auth & rôles de l'app ÉMISE » Workbench panel.
 * mirror record: reflects=S80-app-auth, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /app-auth route is action-capable (ui-completeness law, CLAUDE.md §7): the CHECK ACCESS
 * and ATTACH controls are reachable AND executable from the screen, bound to Server Actions running
 * the REAL pure engine (lib/app-auth, the byte-twin of the Go ExpandAppAuth/CheckAccess). The
 * done-criteria of S80: a protected operation of the EMITTED app refuses an insufficient role at
 * runtime, and attaching app-auth previews the auth subsystem + lands via an approved changeset.
 *
 * THE WALL (CLAUDE.md §2): check-access is a read-only runtime simulation; attach lands a changeset
 * VALUE — the legal door (propose → approve), never a direct kernel write. The gate is PURE code,
 * never an LLM.
 */

test.describe("S80 — app-auth (emitted-app auth & roles)", () => {
	test("the route renders the check-access + attach controls", async ({ page }) => {
		await page.goto("/app-auth");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /app-auth behavior-macro|Behavior-macro app-auth/i,
			}),
		).toBeVisible();
		await expect(page.getByTestId("role-select")).toBeVisible();
		await expect(page.getByTestId("operation-select")).toBeVisible();
		await expect(page.getByTestId("check-submit")).toBeVisible();
		await expect(page.getByTestId("target-input")).toBeVisible();
		await expect(page.getByTestId("attach-submit")).toBeVisible();
	});

	test("the runtime gate REFUSES an insufficient role (viewer → logout) — the done-criterion", async ({
		page,
	}) => {
		await page.goto("/app-auth");
		await page.getByTestId("role-select").selectOption("viewer");
		await page.getByTestId("operation-select").selectOption("logout");
		await page.getByTestId("check-submit").click();
		const result = page.getByTestId("check-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-allowed", "false");
		await expect(result).toContainText(/required=editor/);
	});

	test("the runtime gate ALLOWS a sufficient role (editor → logout)", async ({ page }) => {
		await page.goto("/app-auth");
		await page.getByTestId("role-select").selectOption("editor");
		await page.getByTestId("operation-select").selectOption("logout");
		await page.getByTestId("check-submit").click();
		const result = page.getByTestId("check-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-allowed", "true");
	});

	test("attaching app-auth previews the auth subsystem and lands it (APPLIED)", async ({
		page,
	}) => {
		await page.goto("/app-auth");
		await page.getByTestId("target-input").fill("shop-app");
		await page.getByTestId("attach-submit").click();
		const landed = page.getByTestId("attach-result");
		await expect(landed).toBeVisible();
		await expect(landed).toContainText("app-auth@shop-app");
		await expect(landed).toContainText("APPLIED");
		// the previewed subsystem carries the User/Role/Session entities + login/logout + authz band.
		await expect(landed).toContainText("ent:User");
		await expect(landed).toContainText("op:login");
		await expect(landed).toContainText("authz-logout");
	});
});
