import { expect, test } from "@playwright/test";

/**
 * ADR 0074 Playwright e2e — the LIVE front↔Go cutover of the /gateway panel.
 * mirror record: reflects=ADR-0074-gateway-live, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * ADR 0074 makes the MCP-over-HTTP passerelle (back/mcp/gateway) the official front↔Go
 * seam. When the gateway is REACHABLE (AIDOS_GATEWAY_HTTP_URL points at the live :8787
 * server), the /gateway surface read MUST come from the LIVE gateway (source "live"),
 * NOT the deterministic twin. This is the cutover proof: the front genuinely reaches the
 * Go engine over HTTP (the one-shot stateless tools/call honoured by the SDK handler).
 *
 * Run with:  AIDOS_GATEWAY_HTTP_URL=http://127.0.0.1:8787 PLAYWRIGHT_WEB_PORT=3210 \
 *            npx playwright test gateway-live-cutover
 * (the gateway must be up — .claude/scripts/gateway-start.sh). With the gateway DOWN the
 * panel declares "demo" instead (proven by gateway-cutover.spec.ts) — never a silent
 * false "live": that is the anti-silent-fallback invariant of ADR 0074 §5.
 */

test.describe("ADR 0074 — live front↔Go cutover (gateway reachable)", () => {
	test("the surface read is LIVE when the gateway is up", async ({ page }) => {
		await page.goto("/gateway");
		const badge = page.getByTestId("surface-source");
		await expect(badge).toBeVisible();
		// The cutover badge reads "live" — the surface came from the live gateway, not the twin.
		await expect(badge).toHaveText(/live/i);
	});

	test("the live surface carries the real fronted fleet", async ({ page }) => {
		await page.goto("/gateway");
		const servers = page.getByTestId("server-list");
		// The 14 servers the gateway fronts (gateway_servers) render from the live read.
		await expect(servers).toContainText("store");
		await expect(servers).toContainText("provision");
		await expect(page.getByTestId("tool-count")).toBeVisible();
	});

	test("the panel stays action-capable on the live surface (route executes)", async ({
		page,
	}) => {
		await page.goto("/gateway");
		await page.getByTestId("preset-presetBelow").click();
		await page.getByTestId("route-button").click();
		const ok = page.getByTestId("outcome-route");
		await expect(ok).toBeVisible();
		await expect(ok).toContainText("store_get");
	});
});
