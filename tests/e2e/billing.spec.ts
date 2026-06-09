import { expect, test } from "@playwright/test";

/**
 * S114 Playwright e2e — Plans, deterministic metering & quotas Workbench panel.
 * mirror record: reflects=S114-billing-plans-metering-quotas, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /billing route is action-capable (ui-completeness, CLAUDE.md §7): every op the
 * step develops has a control reachable AND executable from the screen, each bound to the pure
 * twin (lib/billing.ts):
 *   - metering COUNTS usage from the runs, exactly attributable per project;
 *   - a build over quota is REFUSED with QUOTA_EXCEEDED + an upgrade path (never silent);
 *   - an inbound provider webhook is idempotent (a replay is suppressed);
 *   - the Pact contract with the named provider verifies (ADR 0049).
 */

test.describe("S114 — Plans, metering & quotas", () => {
	test("the route renders the billing panel", async ({ page }) => {
		await page.goto("/billing");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Plans, métrage déterministe & quotas|Plans, deterministic metering & quotas/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("plan-free")).toBeVisible();
	});

	test("metering COUNTS usage from the recorded runs", async ({ page }) => {
		await page.goto("/billing");
		await page.getByTestId("meter-btn").click();
		// default runs: 30000 + 200000 = 230000 tokens.
		await expect(page.getByTestId("usage-tokens")).toHaveText(/230,?000/);
	});

	test("a build over quota is refused QUOTA_EXCEEDED with an upgrade path", async ({
		page,
	}) => {
		await page.goto("/billing");
		await page.getByTestId("plan-free").click();
		await page.getByTestId("meter-btn").click();
		await page.getByTestId("check-quota-btn").click();
		await expect(page.getByTestId("quota-deny")).toBeVisible();
		await expect(page.getByTestId("quota-code")).toContainText(
			"QUOTA_EXCEEDED",
		);
		await expect(page.getByTestId("quota-upgrade")).toContainText(/pro/i);
	});

	test("an inbound provider webhook is idempotent (replay suppressed)", async ({
		page,
	}) => {
		await page.goto("/billing");
		await page.getByTestId("ingest-btn").click();
		await expect(page.getByTestId("webhook-count")).toHaveText("1");
		await page.getByTestId("ingest-again-btn").click();
		// a replay of the same event must be suppressed → still 1.
		await expect(page.getByTestId("webhook-count")).toHaveText("1");
		await expect(page.getByTestId("webhook-applied")).toContainText(/pro/i);
	});

	test("the Pact contract with the named provider verifies", async ({
		page,
	}) => {
		await page.goto("/billing");
		await page.getByTestId("verify-btn").click();
		await expect(page.getByTestId("verify-verdict")).toContainText(
			/HONORÉ|HONOURED/,
		);
	});
});
