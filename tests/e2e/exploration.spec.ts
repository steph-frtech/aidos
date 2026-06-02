import { expect, test } from "@playwright/test";

/**
 * S28 Playwright e2e — the exploration "Grill & Spike Lab" Workbench panel (/exploration).
 * mirror record: reflects=runtime.exploration (grill verdict routing + spike confinement + harvest
 *               DRAFT-Truth proposal), test_kind=e2e, cert_language=gherkin, liveness=alive,
 *               authority=above
 *
 * Scenario: A fuzzy idea spikes (ratchet OFF, T0); harvest yields a DRAFT Truth
 *   Given the Workbench is running
 *   When I navigate to /exploration
 *   Then grilling a FUZZY intention routes the idea to spiking with a ratchet-OFF / T0 badge
 *   And a sharp intention routes to grilled (skips spike); a bad idea routes to rejected
 *   And the spike write to /spike is allowed while the write to /kernel is blocked with
 *        SPIKE_WRITE_ESCAPES_ZONE and a how_to_fix
 *   And harvesting yields a DRAFT-Truth proposal stating it has no frozen version and no mirror
 */

test.describe("S28 — the exploration Grill & Spike Lab", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/exploration");
		await expect(page.getByTestId("exploration-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("a fuzzy intention routes to spiking with a ratchet-OFF / T0 badge", async ({
		page,
	}) => {
		await page.getByTestId("grill-fuzzy").click();
		await expect(page.getByTestId("grill-routed")).toBeVisible();
		await expect(page.getByTestId("routed-status")).toContainText("spiking");
		const badge = page.getByTestId("ratchet-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toContainText("T0");
	});

	test("a sharp intention routes to grilled (skips spike), a bad idea to rejected", async ({
		page,
	}) => {
		await page.getByTestId("grill-sharp").click();
		await expect(page.getByTestId("routed-status")).toContainText("grilled");
		// sharp skips the spike: no ratchet badge
		await expect(page.getByTestId("ratchet-badge")).toHaveCount(0);

		await page.getByTestId("grill-bad").click();
		await expect(page.getByTestId("routed-status")).toContainText("rejected");
	});

	test("a spike write to /spike is allowed while the write to /kernel is blocked with SPIKE_WRITE_ESCAPES_ZONE", async ({
		page,
	}) => {
		await page.getByTestId("run-spike-writes").click();
		await expect(page.getByTestId("spike-writes")).toBeVisible();

		// the confined write is allowed
		const allowed = page.getByTestId("spike-write-allowed");
		await expect(allowed).toBeVisible();
		await expect(allowed).toContainText("/spike/retry-probe.go");

		// the escaping write is blocked, in red, with the code + a how_to_fix
		const blocked = page.getByTestId("spike-write-blocked");
		await expect(blocked).toBeVisible();
		await expect(blocked).toContainText("/kernel/retry.policy");
		await expect(page.getByTestId("block-code")).toContainText(
			"SPIKE_WRITE_ESCAPES_ZONE",
		);
		await expect(blocked).toContainText("confine_write_to_/spike");
		await expect(page.getByTestId("how-to-fix-item").first()).toBeVisible();
	});

	test("harvesting yields a DRAFT-Truth proposal with no frozen version and no mirror (THE done criterion)", async ({
		page,
	}) => {
		await page.getByTestId("run-harvest").click();
		const proposal = page.getByTestId("draft-truth-proposal");
		await expect(proposal).toBeVisible();
		// the discovered intention is carried
		await expect(proposal).toContainText(
			"retry with capped exponential backoff",
		);
		// the two absences that keep it a DRAFT Truth
		await expect(page.getByTestId("no-version-marker")).toBeVisible();
		await expect(page.getByTestId("no-mirror-marker")).toBeVisible();
		// promotion still needs /goal
		await expect(page.getByTestId("draft-truth-caveat")).toContainText("/goal");
		// the provenance back-link points at the idea
		await expect(page.getByTestId("provenance-link")).toContainText(
			"idea-fuzzy-retries",
		);
	});

	test("the lifecycle track renders draft → grilled → spiking → harvested with rejected off-ramp", async ({
		page,
	}) => {
		const track = page.getByTestId("lifecycle-track");
		await expect(track).toBeVisible();
		await expect(track).toContainText("draft");
		await expect(track).toContainText("grilled");
		await expect(track).toContainText("spiking");
		await expect(track).toContainText("harvested");
		await expect(track).toContainText("rejected");
	});
});
