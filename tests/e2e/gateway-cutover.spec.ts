import { expect, test } from "@playwright/test";

/**
 * S59 Playwright e2e — the typed-SDK cutover of the /gateway panel.
 * mirror record: reflects=S59-gateway-sdk, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * S59 routes the panel's surface read through the typed SDK (lib/gateway-sdk:
 * callMeta → decodeVia) instead of the static twin, with the deterministic demo fixture
 * preserved as the fallback (`source: "live" | "demo"`). With NO live gateway endpoint
 * configured in the e2e environment (AIDOS_GATEWAY_HTTP_URL unset), the read MUST fall
 * back deterministically to the demo surface — and the panel stays fully populated and
 * action-capable. This is the "decoder falls back deterministically when the DB is
 * unreachable" done-criterion, proven on a converted panel.
 */

test.describe("S59 — typed-SDK cutover (deterministic fallback)", () => {
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
