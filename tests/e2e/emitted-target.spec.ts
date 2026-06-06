import { expect, test } from "@playwright/test";

/**
 * EL00 Playwright e2e — the emitted-app target Workbench panel (/emitted-target).
 * mirror record: reflects=agentloop.EmittedTargetEL00 (the declared EL00 target ≡ the enforced
 *               arch-fitness.json emitted_target block — the pure, LLM-free parity verdict
 *               lib/emitted-target.verifyParity, byte-identical twin of the Go parity test),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: the human RUNS the parity check from the screen (action-capable, not read-only).
 *   Given the Workbench is running
 *   When I navigate to /emitted-target and click "Vérifier la parité"
 *   Then a GREEN parity badge appears (declared target ≡ enforced config)
 *   And the per-field parity table renders the trenched frontier (Hono/TS, Go constructrice)
 *   And the wall note states EL00 writes no truth (above-the-line)
 */

test.describe("EL00 — the emitted-app target (ADR 0040)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/emitted-target");
		await expect(page.getByTestId("emitted-target-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("Vérifier la parité runs the parity verdict from the screen", async ({
		page,
	}) => {
		// Before clicking, no verdict is rendered (action-capable: nothing computed yet).
		await expect(page.getByTestId("parity-result")).toHaveCount(0);

		await page.getByTestId("verify-parity").click();

		// The parity badge is green (declared target ≡ enforced config).
		const result = page.getByTestId("parity-result");
		await expect(result).toBeVisible();
		const badge = page.getByTestId("parity-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toContainText(/Parité verte|Parity green/);

		// The per-field parity table renders the trenched frontier.
		await expect(result).toContainText("construite.backend");
		await expect(result).toContainText("hono");
		await expect(result).toContainText("construite.operation_interpreter");
		await expect(result).toContainText("go-service-callback");
	});

	test("renders the constructrice≠construite frontier and the wall note", async ({
		page,
	}) => {
		const panel = page.getByTestId("emitted-target-panel");
		// constructrice stays governable Go
		await expect(panel).toContainText("go");
		await expect(panel).toContainText("rewritten_in_ts");
		// construite is Hono/TS
		await expect(panel).toContainText("typescript");
		await expect(panel).toContainText("postgres");
		// the wall: EL00 is ADR-only, writes no truth
		await expect(panel).toContainText(/AUCUNE vérité|writes NO truth/);
	});
});
