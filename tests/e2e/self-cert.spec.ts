import { expect, test } from "@playwright/test";

/**
 * S84 Playwright e2e — « Auto-certification » Workbench panel.
 * mirror record: reflects=S84-self-cert, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /self-cert route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * self-certification gate control is reachable AND executable from the screen, bound to a
 * Server Action that COMPUTES the gated battery DETERMINISTICALLY (the pure twin
 * lib/self-cert.certify, byte-identical to back/runtime/buildloop/selfcert.Certify). The screen
 * lets a human drive the done-criterion:
 *   - a clean battery (every sensor passes) certifies GREEN;
 *   - a diff that breaks an ARCH BOUNDARY (the archfit sensor) reddens it and the iteration is
 *     BLOCKED before green with BUILD_LOOP_SENSOR_RED;
 *   - a diff that breaks a PACT CONTRACT (the pact sensor) likewise blocks before green.
 *
 * THE WALL (CLAUDE.md §2): the gate is a read/compute below the line — it writes NO truth. No
 * LLM enters; the judge is the deterministic mirror.
 */

test.describe("S84 — Self-certification", () => {
	test("the route renders the self-cert console", async ({ page }) => {
		await page.goto("/self-cert");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Auto-certification|Self-certification/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("certify-form")).toBeVisible();
		// The full seven-sensor battery is on the screen.
		for (const k of [
			"types",
			"lint",
			"unit",
			"fixture",
			"property",
			"pact",
			"archfit",
		]) {
			await expect(page.getByTestId(`sensor-row-${k}`)).toBeVisible();
		}
	});

	test("a clean battery certifies GREEN", async ({ page }) => {
		await page.goto("/self-cert");
		// Every sensor checkbox is checked by default → all green.
		await page.getByTestId("certify-submit").click();

		const badge = page.getByTestId("gate-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveAttribute("data-green", "true");
		await expect(page.getByTestId("block-code")).toHaveCount(0);
	});

	test("a diff that breaks an arch boundary reddens the sensor and blocks before green", async ({
		page,
	}) => {
		await page.goto("/self-cert");
		// Uncheck the archfit sensor (an arch boundary broke) and add a detail.
		await page.getByTestId("green-archfit").uncheck();
		await page
			.getByTestId("detail-archfit")
			.fill("dependency-cruiser: forbidden edge view→infra");
		await page.getByTestId("certify-submit").click();

		const badge = page.getByTestId("gate-badge");
		await expect(badge).toHaveAttribute("data-green", "false");
		await expect(page.getByTestId("block-code")).toHaveText(
			"BUILD_LOOP_SENSOR_RED",
		);
		await expect(page.getByTestId("red-sensors")).toContainText("archfit");
		await expect(page.getByTestId("battery-sensor-archfit")).toHaveAttribute(
			"data-state",
			"red",
		);
	});

	test("a diff that breaks a Pact contract reddens the sensor and blocks before green", async ({
		page,
	}) => {
		await page.goto("/self-cert");
		await page.getByTestId("green-pact").uncheck();
		await page
			.getByTestId("detail-pact")
			.fill("pact: provider verification failed");
		await page.getByTestId("certify-submit").click();

		await expect(page.getByTestId("gate-badge")).toHaveAttribute(
			"data-green",
			"false",
		);
		await expect(page.getByTestId("block-code")).toHaveText(
			"BUILD_LOOP_SENSOR_RED",
		);
		await expect(page.getByTestId("red-sensors")).toContainText("pact");
	});
});
