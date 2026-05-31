import { expect, test } from "@playwright/test";

/**
 * S00 Playwright e2e — Step execution contract Workbench page.
 * mirror record: reflects=S00-exec-contract, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Scenario: The Workbench renders the contract checklist
 *   Given the Workbench route "/contract"
 *   When the page loads
 *   Then the version badge is shown
 *   And each of the nine loop phases is rendered with its gate kind
 */

// The nine phase ids from the contract — must match docs/implementation_contract.md
const PHASE_IDS = [
	"grill-with-docs",
	"bdd-mirror-first",
	"tdd",
	"sensors-green",
	"completeness",
	"diagnose",
	"ui-playwright",
	"improve-architecture",
	"artifacts",
] as const;

// The five granularity property ids
const GRANULARITY_IDS = [
	"minimal",
	"autonomous",
	"visualizable",
	"non-destructive",
	"chainable",
] as const;

test.describe("S00 — Step execution contract", () => {
	test("version badge is shown", async ({ page }) => {
		await page.goto("/contract");
		const badge = page.getByTestId("version-badge");
		await expect(badge).toBeVisible();
		// Must show a semver string
		await expect(badge).toHaveText(/^v\d+\.\d+\.\d+$/);
	});

	test("all nine per-step loop phase rows are rendered", async ({ page }) => {
		await page.goto("/contract");
		for (const id of PHASE_IDS) {
			const row = page.getByTestId(`phase-row-${id}`);
			await expect(row).toBeVisible({ timeout: 5000 });
		}
	});

	test("every phase row shows a gate chip (computational or human)", async ({
		page,
	}) => {
		await page.goto("/contract");
		for (const id of PHASE_IDS) {
			const chip = page.getByTestId(`gate-chip-${id}`);
			await expect(chip).toBeVisible({ timeout: 5000 });
			const text = await chip.innerText();
			expect(["computational", "human"]).toContain(text.trim());
		}
	});

	test("all five granularity properties are rendered", async ({ page }) => {
		await page.goto("/contract");
		for (const id of GRANULARITY_IDS) {
			const card = page.getByTestId(`granularity-${id}`);
			await expect(card).toBeVisible({ timeout: 5000 });
		}
	});

	test("page heading and kind badge are visible", async ({ page }) => {
		await page.goto("/contract");
		await expect(
			page.getByRole("heading", { name: /Step Execution Contract/i }),
		).toBeVisible();
		await expect(page.getByText("step-contract")).toBeVisible();
	});

	// ui-completeness: every screen is self-teaching (tutorial + worked example).
	test("the screen teaches — tutorial with five steps is visible", async ({
		page,
	}) => {
		await page.goto("/contract");
		const tutorial = page.getByTestId("tutorial");
		await expect(tutorial).toBeVisible();
		for (let i = 0; i < 5; i++) {
			await expect(page.getByTestId(`tutorial-step-${i}`)).toBeVisible();
		}
	});

	test("the screen teaches — worked example phase + body is visible", async ({
		page,
	}) => {
		await page.goto("/contract");
		await expect(page.getByTestId("example")).toBeVisible();
		await expect(page.getByTestId("example-phase")).toBeVisible();
		await expect(page.getByTestId("example-body")).toBeVisible();
	});
});
