/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: the DP08 e2e asserts LITERAL ${VAR} env-references (never values) on screen. */
import { expect, test } from "@playwright/test";

/**
 * DP08 Playwright e2e — the EMITTED_NO_HARDCODED_ENDPOINT sensor on the
 * /endpoints-fitness panel.
 * mirror record: reflects=DP08-endpoint-fitness, test_kind=e2e,
 * cert_language=playwright, liveness=live
 *
 * Proves the sensor screen is ACTION-CAPABLE (ui-completeness): the resolved
 * DP07 endpoints render as ${VAR} references (never localhost, never an IP),
 * the sensor is GREEN on the canonical emitted tree at the Go-pinned address,
 * INJECTING a hardcoded endpoint (the sandbox fault-injection control) turns
 * it RED naming the file and blocking the cut, REMOVING the literal turns it
 * green again, and MEASURING twice yields the same address (« même arbre →
 * même verdict »).
 *
 * THE WALL (CLAUDE.md §2): every control is a sandboxed measure — the screen
 * writes no truth; the declared rule is above-the-line (arch-fitness.json).
 */

// The Go-authoritative content addresses (pinned by the fixture mirror
// back/runtime/endpointfitness + the vitest twin lib/endpoint-fitness.test.ts).
const GO_GREEN_ADDRESS =
	"43f2e914534d162173904514b6e5e0d916584092df50ce47944564a264a52970";
const GO_RED_ADDRESS =
	"5164a99a4a7d189cbbe25d0741ffee776720f841328e4c4c80e86e87d5546a0a";

test.describe("DP08 — the EMITTED_NO_HARDCODED_ENDPOINT sensor", () => {
	test("the panel renders: resolved endpoints are ${VAR} references, the sensor is green at the Go-pinned address", async ({
		page,
	}) => {
		await page.goto("/endpoints-fitness");
		await expect(page.getByTestId("endpoints-card")).toBeVisible();

		// the DP07 references — never localhost, never an IP, never a domain value.
		await expect(page.getByTestId("endpoint-row-db")).toContainText(
			"${APP_NAME}-db:5432",
		);
		await expect(page.getByTestId("endpoint-row-crm")).toContainText(
			"${CRM_MANAGED_URL}",
		);
		await expect(page.getByTestId("endpoint-row-server")).toContainText(
			"https://${APP_SUBDOMAIN}.${DOMAIN}",
		);
		const table = await page.getByTestId("endpoints-table").textContent();
		expect(table).not.toContain("localhost");
		expect(table).not.toContain("sagedesk");

		// the sensor is green on the canonical emitted tree, Go-pinned.
		await expect(page.getByTestId("sensor-state")).toHaveAttribute(
			"data-state",
			"green",
		);
		await expect(page.getByTestId("sensor-address")).toHaveText(
			GO_GREEN_ADDRESS,
		);
		await expect(page.getByTestId("no-findings")).toBeVisible();
	});

	test("fault-injection: injecting a hardcoded endpoint turns the sensor red, names the file and blocks the cut", async ({
		page,
	}) => {
		await page.goto("/endpoints-fitness");
		await page.getByTestId("inject-leak").click();

		await expect(page.getByTestId("sensor-state")).toHaveAttribute(
			"data-state",
			"red",
		);
		await expect(page.getByTestId("finding")).toContainText(
			"gen/app/leak.ts:2 — https://1.2.3.4:5432 — ip_literal",
		);
		await expect(page.getByTestId("sensor-block")).toContainText(
			"EMITTED_NO_HARDCODED_ENDPOINT",
		);
		await expect(page.getByTestId("sensor-address")).toHaveText(GO_RED_ADDRESS);
	});

	test("removing the literal turns the sensor green again (the ratchet releases)", async ({
		page,
	}) => {
		await page.goto("/endpoints-fitness");
		await page.getByTestId("inject-leak").click();
		await expect(page.getByTestId("sensor-state")).toHaveAttribute(
			"data-state",
			"red",
		);

		await page.getByTestId("remove-leak").click();
		await expect(page.getByTestId("sensor-state")).toHaveAttribute(
			"data-state",
			"green",
		);
		await expect(page.getByTestId("sensor-address")).toHaveText(
			GO_GREEN_ADDRESS,
		);
		await expect(page.getByTestId("no-findings")).toBeVisible();
	});

	test("measure twice → same Go-pinned address (même arbre → même verdict)", async ({
		page,
	}) => {
		await page.goto("/endpoints-fitness");

		await page.getByTestId("measure-verdict").click();
		await expect(page.getByTestId("measure-count")).toHaveText("1");
		await expect(page.getByTestId("sensor-address")).toHaveText(
			GO_GREEN_ADDRESS,
		);

		await page.getByTestId("measure-verdict").click();
		await expect(page.getByTestId("measure-count")).toHaveText("2");
		await expect(page.getByTestId("sensor-address")).toHaveText(
			GO_GREEN_ADDRESS,
		);
	});
});
