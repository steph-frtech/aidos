import { expect, test } from "@playwright/test";

/**
 * S58 Playwright e2e — MCP-over-HTTP gateway panel.
 * mirror record: reflects=S58-gateway, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /gateway route is action-capable (ui-completeness law, CLAUDE.md §7):
 * the "route" control is reachable AND executable from the screen, bound to a Server
 * Action that runs the deterministic gateway.route (the same router the live HTTP
 * server applies, server-side). Each outcome branch is exercised:
 *   - below-the-line (store_get, same project) → route (the dispatched tool)
 *   - cross project → refused_scope AGENT_CROSS_PROJECT_WRITE
 *   - truth-write (kernel_write) → refused_truth_write GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET
 *   - unknown tool → unknown_tool GATEWAY_UNKNOWN_TOOL
 * It writes NO truth — the gateway routes or refuses (the wall is unchanged, §2).
 */

test.describe("S58 — MCP-over-HTTP gateway", () => {
	test("the route renders the fronted surface (13 servers)", async ({ page }) => {
		await page.goto("/gateway");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Passerelle MCP-over-HTTP|MCP-over-HTTP gateway/,
			}),
		).toBeVisible();
		const servers = page.getByTestId("server-list");
		await expect(servers).toContainText("store");
		await expect(servers).toContainText("changeset");
		await expect(servers).toContainText("project");
		await expect(page.getByTestId("tool-count")).toBeVisible();
	});

	test("route EXECUTES: below-the-line call → route", async ({ page }) => {
		await page.goto("/gateway");
		await page.getByTestId("preset-presetBelow").click();
		await page.getByTestId("route-button").click();
		const ok = page.getByTestId("outcome-route");
		await expect(ok).toBeVisible();
		await expect(ok).toContainText("store_get");
	});

	test("route EXECUTES: cross project → AGENT_CROSS_PROJECT_WRITE", async ({
		page,
	}) => {
		await page.goto("/gateway");
		await page.getByTestId("preset-presetCross").click();
		await page.getByTestId("route-button").click();
		await expect(page.getByTestId("refusal-code")).toHaveText(
			"AGENT_CROSS_PROJECT_WRITE",
		);
	});

	test("route EXECUTES: truth-write → GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET", async ({
		page,
	}) => {
		await page.goto("/gateway");
		await page.getByTestId("preset-presetTruth").click();
		await page.getByTestId("route-button").click();
		await expect(page.getByTestId("refusal-code")).toHaveText(
			"GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET",
		);
	});

	test("route EXECUTES: unknown tool → GATEWAY_UNKNOWN_TOOL", async ({ page }) => {
		await page.goto("/gateway");
		await page.getByTestId("preset-presetUnknown").click();
		await page.getByTestId("route-button").click();
		await expect(page.getByTestId("refusal-code")).toHaveText(
			"GATEWAY_UNKNOWN_TOOL",
		);
	});

	test("the user can type a custom call and route it", async ({ page }) => {
		await page.goto("/gateway");
		await page.getByTestId("field-identity").fill("bob");
		await page.getByTestId("field-active-project").fill("proj-x");
		await page.getByTestId("field-tool").fill("dag_heads");
		await page.getByTestId("field-target-project").fill("proj-x");
		await page.getByTestId("field-claimed-identity").fill("");
		await page.getByTestId("route-button").click();
		const ok = page.getByTestId("outcome-route");
		await expect(ok).toBeVisible();
		await expect(ok).toContainText("dag_heads");
	});
});
