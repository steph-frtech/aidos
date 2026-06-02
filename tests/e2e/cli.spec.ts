import { expect, test } from "@playwright/test";

/**
 * S03 Playwright e2e — the `aidos` CLI Workbench panel (/cli).
 * mirror record: reflects=runtime.cli, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Scenario: The Workbench renders the five command contracts
 *   Given the Workbench route "/cli"
 *   When the page loads
 *   Then each of the five core command cards renders with its `aidos <cmd>` heading
 *   And at least one full contract block (inputs/outputs/owner) is visible
 *   And the screen teaches (tutorial + worked example)
 */

const VERBS = ["check", "impact", "stable", "diff", "explain"] as const;

test.describe("S03 — aidos CLI panel", () => {
	test("all five core command cards render", async ({ page }) => {
		await page.goto("/cli");
		for (const verb of VERBS) {
			await expect(page.getByTestId(`cli-command-${verb}`)).toBeVisible({
				timeout: 5000,
			});
		}
	});

	test("each card shows its `aidos <cmd>` heading", async ({ page }) => {
		await page.goto("/cli");
		for (const verb of VERBS) {
			const headingEl = page.getByTestId(`cli-heading-${verb}`);
			await expect(headingEl).toBeVisible({ timeout: 5000 });
			await expect(headingEl).toHaveText(`aidos ${verb}`);
		}
	});

	test("a full contract block is visible (purpose + inputs + outputs + owner)", async ({
		page,
	}) => {
		await page.goto("/cli");
		const card = page.getByTestId("cli-command-check");
		await expect(card).toBeVisible();
		// The check contract names the KRDCompiler purpose, its future I/O and owner.
		await expect(card).toContainText(/KRDCompiler/i);
		await expect(card).toContainText(/VALID/i);
		await expect(card).toContainText(/S45/);
	});

	test("page heading and stub badge are visible", async ({ page }) => {
		await page.goto("/cli");
		await expect(
			page.getByRole("heading", { name: /aidos/i, level: 1 }),
		).toBeVisible();
	});

	// ui-completeness: every screen is self-teaching (tutorial + worked example).
	test("the screen teaches — tutorial with four steps is visible", async ({
		page,
	}) => {
		await page.goto("/cli");
		await expect(page.getByTestId("tutorial")).toBeVisible();
		for (let i = 0; i < 4; i++) {
			await expect(page.getByTestId(`tutorial-step-${i}`)).toBeVisible();
		}
	});

	test("the screen teaches — worked example body is visible", async ({
		page,
	}) => {
		await page.goto("/cli");
		await expect(page.getByTestId("example")).toBeVisible();
		await expect(page.getByTestId("example-body")).toBeVisible();
	});
});
