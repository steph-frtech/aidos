import { expect, test } from "@playwright/test";

/**
 * S117 Playwright e2e — the per-account Release v0 panel (/account-release).
 *
 * mirror record: reflects=front.account-release (the PROJECTION of
 *               runtime/adoption/accountrelease.Assemble + adoption.Plan, S117),
 *               test_kind=gherkin, cert_language=playwright-bdd, liveness=alive,
 *               authority=below
 *
 * THE DONE CRITERIA, made visible + EXECUTABLE on screen (action-capable, not read-only):
 *   - the "Assemble the pack" button BINDS the control to the assemble operation;
 *   - the assembled pack enumerates the account's projects with their HONEST
 *     demo-vs-real status (no fabrication);
 *   - the CLI surface lists the 5 core + 6 S117 gateway verbs (the completed surface);
 *   - the honest known-limits are enumerated;
 *   - the next adoption tier is ADVISED (computed), never installed;
 *   - assemble-only — there is NO install/ship/publish affordance.
 */

test.describe("S117 — Account Release v0 (assemble, advise, never install/ship)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/account-release");
		await expect(
			page.getByRole("heading", {
				name: /Release v0 par compte|Account Release v0/i,
			}),
		).toBeVisible({ timeout: 5000 });
	});

	test("the assemble button is reachable and executes the assemble operation", async ({
		page,
	}) => {
		// Before assembling, the pack is not shown.
		await expect(page.getByTestId("ar-pack")).toHaveCount(0);
		await page.getByTestId("ar-assemble").click();
		// After clicking, the assembled pack renders (the control EXECUTED).
		await expect(page.getByTestId("ar-pack")).toBeVisible();
		await expect(page.getByTestId("ar-account")).toBeVisible();
	});

	test("each project carries its honest demo-vs-real status", async ({
		page,
	}) => {
		await page.getByTestId("ar-scenario").selectOption("starter");
		await page.getByTestId("ar-assemble").click();
		await expect(page.getByTestId("ar-status-p-shop")).toHaveText(/réel|real/i);
		await expect(page.getByTestId("ar-status-p-demo")).toHaveText(/démo|demo/i);
	});

	test("the CLI surface lists the core + the six S117 gateway verbs", async ({
		page,
	}) => {
		await page.getByTestId("ar-assemble").click();
		for (const core of ["check", "impact", "stable", "diff", "explain"]) {
			await expect(page.getByTestId(`ar-verb-${core}`)).toBeVisible();
		}
		for (const gw of ["goal", "grill", "spike", "harvest", "trim", "init"]) {
			await expect(page.getByTestId(`ar-verb-${gw}`)).toBeVisible();
		}
	});

	test("the honest known-limits are enumerated for the starter account", async ({
		page,
	}) => {
		await page.getByTestId("ar-scenario").selectOption("starter");
		await page.getByTestId("ar-assemble").click();
		await expect(page.getByTestId("ar-limit-lim-doltgres")).toBeVisible();
		await expect(page.getByTestId("ar-limit-lim-async")).toBeVisible();
	});

	test("the next adoption tier is advised (starter T1 → T2, empty T0 → T1)", async ({
		page,
	}) => {
		await page.getByTestId("ar-scenario").selectOption("starter");
		await page.getByTestId("ar-assemble").click();
		await expect(page.getByTestId("ar-current")).toHaveText("T1");
		await expect(page.getByTestId("ar-next")).toHaveText("T2");

		await page.getByTestId("ar-scenario").selectOption("empty");
		await page.getByTestId("ar-assemble").click();
		await expect(page.getByTestId("ar-current")).toHaveText("T0");
		await expect(page.getByTestId("ar-next")).toHaveText("T1");
	});

	test("assemble-only — no install/ship/publish button", async ({ page }) => {
		await page.getByTestId("ar-assemble").click();
		await expect(
			page.getByRole("button", { name: /install|ship|publish|déploy|livrer/i }),
		).toHaveCount(0);
	});
});
