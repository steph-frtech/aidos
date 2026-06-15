import { expect, test } from "@playwright/test";

/**
 * ADR 0074 Playwright e2e — the ANTI-SILENT-FALLBACK fault-injection of the /gateway panel.
 * mirror record: reflects=ADR-0074-anti-silent-fallback, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * ADR 0074 §5 (non-negotiable): a screen NEVER claims "live" while serving the twin. When
 * the gateway is UNREACHABLE (AIDOS_GATEWAY_HTTP_URL points at a blackhole / dead port, or
 * is unset), the /gateway surface read MUST fall back DETERMINISTICALLY to the demo twin
 * AND declare it ("démo"/"demo" on the badge) — never a silent false "live". The panel
 * stays fully populated and action-capable through the governed fallback. This is the
 * fault-injection: cut the gateway, assert the screen degrades to a DECLARED preview.
 *
 * Run with:  AIDOS_GATEWAY_HTTP_URL=http://127.0.0.1:9 PLAYWRIGHT_WEB_PORT=3211 \
 *            npx playwright test gateway-cutover    (port 9 = guaranteed-unreachable)
 * The LIVE counterpart (gateway up → "live") is proven by gateway-live-cutover.spec.ts.
 */

test.describe("ADR 0074 — anti-silent-fallback (gateway unreachable → declared demo)", () => {
	test("the surface read falls back to demo deterministically (no live gateway)", async ({
		page,
	}) => {
		await page.goto("/gateway");
		// The cutover badge is present and reads "démo" / "demo" when no live gateway is up.
		const badge = page.getByTestId("surface-source");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveText(/démo|demo/);
	});

	test("the panel stays fully populated from the demo fallback", async ({
		page,
	}) => {
		await page.goto("/gateway");
		// The 13 fronted servers still render — the demo fixture is the deterministic twin.
		const servers = page.getByTestId("server-list");
		await expect(servers).toContainText("store");
		await expect(servers).toContainText("mirror-runner");
		await expect(servers).toContainText("project");
		await expect(page.getByTestId("tool-count")).toBeVisible();
	});

	test("the panel stays action-capable through the fallback (route still executes)", async ({
		page,
	}) => {
		await page.goto("/gateway");
		await page.getByTestId("preset-presetBelow").click();
		await page.getByTestId("route-button").click();
		const ok = page.getByTestId("outcome-route");
		await expect(ok).toBeVisible();
		await expect(ok).toContainText("store_get");
	});

	test("the demo fallback is reproducible across reloads", async ({ page }) => {
		await page.goto("/gateway");
		const first = await page.getByTestId("server-list").textContent();
		await page.reload();
		const second = await page.getByTestId("server-list").textContent();
		expect(first).toBe(second);
	});
});
