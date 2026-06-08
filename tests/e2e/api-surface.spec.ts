import { expect, test } from "@playwright/test";

/**
 * S90 Playwright e2e — the « surface API émise complète » Workbench panel.
 * mirror record: reflects=S90-api-surface-emission, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /api-surface route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * emission control is reachable AND executable from the screen, bound to a Server Action
 * running the REAL pure twin (lib/api-surface, the twin of back/runtime/apisurface). The S90
 * done-criteria, reached from the screen:
 *   - the per-app OpenAPI 3.1 document is emitted (byte-stable; a content address is shown);
 *   - the Hono/TS router delegates to the Go sidecar interpreter callback;
 *   - the Pact suite carries ONE contract per operation;
 *   - provider-verification PASSES on ALL emitted endpoints;
 *   - a policy (authorize) emits a 403 surface AND verifies (the DENY enforced);
 *   - a read-only listOrders endpoint can be added/removed (CRUD + operation completeness).
 *
 * THE WALL (CLAUDE.md §2): the screen EMITS a supplied spec and renders a projection — it writes
 * no truth. Emission = a pure function, never an LLM.
 */

test.describe("S90 — complete emitted API surface", () => {
	test("the route renders the panel with the emit control", async ({
		page,
	}) => {
		await page.goto("/api-surface");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Surface API émise complète|Complete emitted API surface/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("emit-button")).toBeVisible();
		await expect(page.getByTestId("authorize-toggle")).toBeVisible();
		await expect(page.getByTestId("withlist-toggle")).toBeVisible();
	});

	test("emitting yields a byte-stable per-app OpenAPI with a content address", async ({
		page,
	}) => {
		await page.goto("/api-surface");
		await page.getByTestId("emit-button").click();
		await expect(page.getByTestId("surface-result")).toBeVisible();
		const openapi = page.getByTestId("openapi-bytes");
		await expect(openapi).toContainText("openapi");
		await expect(openapi).toContainText("3.1.0");
		await expect(openapi).toContainText("/orders");
		await expect(page.getByTestId("openapi-hash")).not.toBeEmpty();
	});

	test("the emitted Hono router delegates to the Go sidecar interpreter callback", async ({
		page,
	}) => {
		await page.goto("/api-surface");
		await page.getByTestId("emit-button").click();
		const router = page.getByTestId("router-bytes");
		await expect(router).toContainText("createRouter");
		await expect(router).toContainText("deps.interpret");
		// The policy is enforced (a DENY → 403) since createOrder authorizes by default.
		await expect(router).toContainText("verdict.denied");
		await expect(router).toContainText('{ error: "forbidden" }, 403)');
	});

	test("the Pact suite carries one contract per operation and verification passes", async ({
		page,
	}) => {
		await page.goto("/api-surface");
		await page.getByTestId("emit-button").click();
		// Two operations by default (createOrder + listOrders) → two Pact contracts.
		await expect(page.getByTestId("pact-contract")).toHaveCount(2);
		await expect(page.getByTestId("verify-pass")).toContainText(/VERT|GREEN/);
	});

	test("toggling the policy off still verifies (the authorize control is bound)", async ({
		page,
	}) => {
		await page.goto("/api-surface");
		await page.getByTestId("authorize-toggle").uncheck();
		await page.getByTestId("emit-button").click();
		await expect(page.getByTestId("verify-pass")).toContainText(/VERT|GREEN/);
		// No DENY-enforcement branch in the handler when the policy is off.
		await expect(page.getByTestId("router-bytes")).not.toContainText(
			"verdict.denied",
		);
	});

	test("removing the read endpoint emits a single-operation surface", async ({
		page,
	}) => {
		await page.goto("/api-surface");
		await page.getByTestId("withlist-toggle").uncheck();
		await page.getByTestId("emit-button").click();
		// Only createOrder remains → one Pact contract.
		await expect(page.getByTestId("pact-contract")).toHaveCount(1);
		await expect(page.getByTestId("verify-pass")).toContainText(/VERT|GREEN/);
	});
});
