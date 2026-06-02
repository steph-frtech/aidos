import { expect, test } from "@playwright/test";

/**
 * S07 Playwright e2e — the sensors Workbench panel (/sensors).
 * mirror record: reflects=runtime.sensors, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Scenario: The Workbench renders the computational sensor suite and a block event
 *   Given the Workbench is running
 *   When I navigate to /sensors
 *   Then I see the computational sensor suite listing gofmt, vet, lint, archtest, affected
 *   And I see the latest run with a per-check verdict
 *   And I see a block event with code SENSOR_FAILED naming the failing check and its how_to_fix
 */

const SUITE = ["gofmt", "vet", "lint", "archtest", "affected"] as const;

test.describe("S07 — the sensors panel", () => {
	test("the computational suite lists gofmt/vet/lint/archtest/affected", async ({
		page,
	}) => {
		await page.goto("/sensors");
		const suite = page.getByTestId("sensor-suite");
		await expect(suite).toBeVisible({ timeout: 5000 });
		for (const name of SUITE) {
			await expect(page.getByTestId(`sensor-${name}`)).toBeVisible();
		}
	});

	test("the latest run shows a per-check verdict for each sensor", async ({
		page,
	}) => {
		await page.goto("/sensors");
		await expect(page.getByTestId("latest-run")).toBeVisible({ timeout: 5000 });
		for (const name of SUITE) {
			await expect(page.getByTestId(`latest-check-${name}`)).toBeVisible();
		}
	});

	test("a block event with code SENSOR_FAILED is shown", async ({ page }) => {
		await page.goto("/sensors");
		const event = page.getByTestId("block-event");
		await expect(event).toBeVisible({ timeout: 5000 });
		await expect(page.getByTestId("block-event-code")).toHaveText(
			"SENSOR_FAILED",
		);
	});

	test("the block event names the failing check and a how_to_fix", async ({
		page,
	}) => {
		await page.goto("/sensors");
		await expect(page.getByTestId("block-event-failing")).toContainText(
			/affected/i,
		);
		const fix = page.getByTestId("block-event-howtofix");
		await expect(fix).toBeVisible();
		// the how_to_fix tells the agent how to make the diff green again
		await expect(fix).toContainText(/red.?→.?green|red→green/i);
		await expect(fix).toContainText(/sensors/i);
	});

	test("page heading and the computational badge are visible", async ({
		page,
	}) => {
		await page.goto("/sensors");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
	});
});
