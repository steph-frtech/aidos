import { expect, test } from "@playwright/test";

/**
 * S42 Playwright e2e — the evolution-sandbox panel (/evolution-sandbox).
 *
 * mirror record: reflects=front.evolutionSandbox (the PROJECTION of
 *               runtime.evolve.Confine + Promote, S42), test_kind=gherkin,
 *               cert_language=playwright-bdd, liveness=alive, authority=below
 *
 * THE DONE CRITERION (visible in the UI): a /branches/evolution write is shown
 * ALLOWED while a /kernel write is shown BLOCKED with SANDBOX_WRITE_ESCAPES_ZONE +
 * a how_to_fix; an all-three-pills-lit candidate shows a PROPOSAL needing /goal; and
 * a RED-mirror candidate (with a HIGHER score) is shown NOT promotable.
 */

test.describe("S42 — Evolution Sandbox (/evolve writes only branches/reports/ideas; promotion needs a green mirror)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/evolution-sandbox");
		await expect(
			page.getByRole("heading", {
				name: /Evolution Sandbox/i,
			}),
		).toBeVisible({ timeout: 5000 });
	});

	test("an allowed /branches/evolution write and a blocked /kernel write are rendered", async ({
		page,
	}) => {
		// an allowed can_write write is shown allowed.
		await expect(page.getByText("/branches/evolution/var-7")).toBeVisible();

		// the /kernel write is rendered RED with SANDBOX_WRITE_ESCAPES_ZONE + how_to_fix.
		const blocked = page.getByTestId("ledger-blocked").filter({
			hasText: "/kernel/createOrder.operation",
		});
		await expect(blocked).toBeVisible();
		await expect(blocked.getByTestId("block-code")).toContainText(
			"SANDBOX_WRITE_ESCAPES_ZONE",
		);
		await expect(
			blocked.getByText(/open_a_\/goal_to_promote_a_candidate/),
		).toBeVisible();
	});

	test("an all-three-pills-lit candidate shows a PROPOSAL needing /goal", async ({
		page,
	}) => {
		const promotable = page
			.getByTestId("candidate-card")
			.filter({ has: page.getByText("var-7", { exact: true }) });
		await expect(promotable).toHaveAttribute("data-promotable", "true");

		const proposal = promotable.getByTestId("proposal-card");
		await expect(proposal).toBeVisible();
		await expect(proposal).toContainText(/\/goal/);
	});

	test("a RED-mirror candidate with a higher score is shown NOT promotable", async ({
		page,
	}) => {
		const redMirror = page
			.getByTestId("candidate-card")
			.filter({ has: page.getByText("var-9", { exact: true }) });
		await expect(redMirror).toHaveAttribute("data-promotable", "false");
		await expect(redMirror.getByTestId("not-promotable")).toBeVisible();
	});

	test("closing the /evolve run lifts confinement (the sandbox is the quarantine of an active run)", async ({
		page,
	}) => {
		// with the run active, /kernel is blocked.
		await expect(page.getByTestId("ledger-blocked").first()).toBeVisible();
		// close the run — confinement no longer applies to THIS hook's concern.
		await page.getByTestId("toggle-run").click();
		await expect(page.getByTestId("run-state")).toContainText("OFF");
		await expect(page.getByTestId("ledger-blocked")).toHaveCount(0);
	});
});
