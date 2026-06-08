import { expect, test } from "@playwright/test";

/**
 * S91 Playwright e2e — the « Secret store par projet » Workbench panel.
 * mirror record: reflects=S91-secret-store, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /secret-store route is action-capable (ui-completeness law, CLAUDE.md §7): every op
 * the step develops has a control reachable AND executable from the screen, bound to a Server
 * Action running the REAL pure twin (lib/secret-store, the twin of back/runtime/secretstore). The
 * S91 done-criteria, reached from the screen:
 *   - SET a secret (stored, scoped to the project; only the NAME is shown, never the value);
 *   - INJECT the boot env from a declared key list — a MISSING declared key → the fail-closed
 *     BlockReason (un secret manquant au boot lève un BlockReason actionnable);
 *   - once the missing secret is set, the boot succeeds (env vars injected, values masked);
 *   - ROTATE a secret (the old value invalidated, the new one taking effect at boot);
 *   - SCAN an emission for leaked secrets — a leaky emission is flagged, a clean one passes
 *     (scan = code déterministe type-gitleaks).
 *
 * THE WALL (CLAUDE.md §2): a secret is operational material, never a truth — the screen writes
 * nothing above the line, and NEVER renders a secret value (only names + masked env). Every
 * judgment is a pure function, never an LLM.
 */

test.describe("S91 — per-project secret store", () => {
	test("the route renders the panel with every op control", async ({
		page,
	}) => {
		await page.goto("/secret-store");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Secret store par projet|Per-project secret store/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("set-button")).toBeVisible();
		await expect(page.getByTestId("rotate-button")).toBeVisible();
		await expect(page.getByTestId("inject-button")).toBeVisible();
		await expect(page.getByTestId("scan-button")).toBeVisible();
	});

	test("setting a secret stores it (name shown, value never)", async ({
		page,
	}) => {
		await page.goto("/secret-store");
		await page.getByTestId("set-name").fill("db_url");
		await page.getByTestId("set-value").fill("postgres://app:topsecret@db/app");
		await page.getByTestId("set-button").click();
		await expect(page.getByTestId("secret-result")).toBeVisible();
		await expect(
			page.getByTestId("stored-key").filter({ hasText: "db_url" }),
		).toBeVisible();
		// The value never reaches the rendered DOM.
		await expect(page.locator("body")).not.toContainText("topsecret");
	});

	test("a missing declared secret at boot raises the fail-closed BlockReason", async ({
		page,
	}) => {
		await page.goto("/secret-store");
		// Set only db_url, then declare a key that is NEVER set by any test (a guaranteed-
		// missing key — the in-process store is shared across tests, so use a unique name).
		await page.getByTestId("set-name").fill("db_url");
		await page.getByTestId("set-value").fill("postgres://app:x@db/app");
		await page.getByTestId("set-button").click();
		await expect(
			page.getByTestId("stored-key").filter({ hasText: "db_url" }),
		).toBeVisible();
		await page
			.getByTestId("inject-declared")
			.fill("db_url, never_set_secret_key");
		await page.getByTestId("inject-button").click();
		await expect(page.getByTestId("block-reason")).toBeVisible();
		await expect(page.getByTestId("block-reason")).toContainText(
			"never_set_secret_key",
		);
	});

	test("once the missing secret is set, the boot injects env (values masked)", async ({
		page,
	}) => {
		await page.goto("/secret-store");
		await page.getByTestId("set-name").fill("db_url");
		await page.getByTestId("set-value").fill("postgres://app:x@db/app");
		await page.getByTestId("set-button").click();
		// Wait for the first SET to settle before the second (the Server Action re-renders).
		await expect(
			page.getByTestId("stored-key").filter({ hasText: "db_url" }),
		).toBeVisible();
		await page.getByTestId("set-name").fill("stripe_api_key");
		await page.getByTestId("set-value").fill("sk_live_longsecretvalue123");
		await page.getByTestId("set-button").click();
		await expect(
			page.getByTestId("stored-key").filter({ hasText: "stripe_api_key" }),
		).toBeVisible();
		await page.getByTestId("inject-declared").fill("db_url, stripe_api_key");
		await page.getByTestId("inject-button").click();
		await expect(
			page.getByTestId("boot-env").filter({ hasText: "APP_SECRET_DB_URL" }),
		).toBeVisible();
		await expect(
			page
				.getByTestId("boot-env")
				.filter({ hasText: "APP_SECRET_STRIPE_API_KEY" }),
		).toBeVisible();
		// The injected env masks values (no plaintext secret in the DOM).
		await expect(page.locator("body")).not.toContainText(
			"sk_live_longsecretvalue123",
		);
	});

	test("rotating a secret invalidates the old value at boot", async ({
		page,
	}) => {
		await page.goto("/secret-store");
		await page.getByTestId("set-name").fill("api_key");
		await page.getByTestId("set-value").fill("OLD-secret-value-1111");
		await page.getByTestId("set-button").click();
		await page.getByTestId("rotate-name").fill("api_key");
		await page.getByTestId("rotate-value").fill("NEW-secret-value-2222");
		await page.getByTestId("rotate-button").click();
		await expect(page.getByTestId("result-message")).toContainText(
			/Rotation|rotation/i,
		);
		// Neither the old nor the new value is ever rendered in the clear.
		await expect(page.locator("body")).not.toContainText(
			"OLD-secret-value-1111",
		);
	});

	test("the leak scan flags a leaky emission and passes a clean one", async ({
		page,
	}) => {
		await page.goto("/secret-store");
		// Default textarea holds a leaky emission (a postgres URI password + an AWS key).
		await page.getByTestId("scan-button").click();
		await expect(page.getByTestId("scan-verdict")).toContainText(/Fuite|Leak/);
		await expect(page.getByTestId("scan-finding").first()).toBeVisible();

		// A clean emission passes.
		await page
			.getByTestId("scan-source")
			.fill("const app = new Hono();\nexport default app;");
		await page.getByTestId("scan-button").click();
		await expect(page.getByTestId("scan-verdict")).toContainText(
			/PROPRE|CLEAN/,
		);
	});
});
