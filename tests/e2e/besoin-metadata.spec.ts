import { expect, test } from "@playwright/test";

/**
 * EL04 Playwright e2e — the per-truth-metadata Workbench panel (/compound-besoin-metadata).
 * mirror record: reflects=back/runtime/besoin/metadata.go (CertifyMetadata: attach the 4 per-truth
 *               metadata to a node, reusing truthtyping/scope/authority; one enum source; the four
 *               red fixtures per missing metadata go green; an unverifiable node routes /spike),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness): every control EXECUTES the pure twin from the
 * screen — "Certify" runs certifyMetadata(status, metadata) and surfaces the gaps + routing, and
 * "Prove the single enum source" proves truth_kind is coherent.
 *
 * Scenario A: a complete node certifies complete; routing is the kernel zone.
 * Scenario B: each missing metadata produces its gap (truth_kind / scope / authority).
 * Scenario C: an unverifiable node routes to /spike.
 * Scenario D: truth_kind is a single enum source (truthtyping ≡ authority).
 */

test.describe("EL04 — per-truth metadata", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin-metadata");
		await expect(page.getByTestId("besoin-metadata-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("a COMPLETE node certifies complete and routes to the kernel zone", async ({
		page,
	}) => {
		await expect(page.getByTestId("verdict-pending")).toBeVisible();

		// Defaults: resolved + behavioral + deterministic + region "*" + no authority needed.
		await page.getByTestId("certify").click();
		await expect(page.getByTestId("verdict-result")).toHaveAttribute(
			"data-complete",
			"true",
		);
		await expect(page.getByTestId("routing-result")).toHaveAttribute(
			"data-route-spike",
			"false",
		);
	});

	test("each MISSING metadata produces its gap (truth_kind, scope, authority)", async ({
		page,
	}) => {
		// Missing truth_kind → missing-truth-kind gap, incomplete.
		await page.getByTestId("truth-kind-select").selectOption("");
		await page.getByTestId("certify").click();
		await expect(page.getByTestId("verdict-result")).toHaveAttribute(
			"data-complete",
			"false",
		);
		await expect(page.getByTestId("gap-missing-truth-kind")).toBeVisible();

		// Active node without scope (region "") → missing-scope gap.
		await page.getByTestId("truth-kind-select").selectOption("behavioral");
		await page.getByTestId("region-select").selectOption("");
		await page.getByTestId("certify").click();
		await expect(page.getByTestId("gap-missing-scope")).toBeVisible();

		// Regulatory without legal authority → missing-authority-approval gap.
		await page.getByTestId("region-select").selectOption("*");
		await page.getByTestId("truth-kind-select").selectOption("regulatory");
		await page.getByTestId("authority-select").selectOption("none");
		await page.getByTestId("certify").click();
		await expect(
			page.getByTestId("gap-missing-authority-approval"),
		).toBeVisible();

		// Granting the legal approval clears it → complete.
		await page.getByTestId("authority-select").selectOption("granted");
		await page.getByTestId("certify").click();
		await expect(page.getByTestId("verdict-result")).toHaveAttribute(
			"data-complete",
			"true",
		);
	});

	test("an UNVERIFIABLE node routes to /spike", async ({ page }) => {
		await page.getByTestId("truth-kind-select").selectOption("exploratory");
		await page.getByTestId("verifiability-select").selectOption("unverifiable");
		await page.getByTestId("certify").click();
		await expect(page.getByTestId("routing-result")).toHaveAttribute(
			"data-route-spike",
			"true",
		);
		await expect(page.getByTestId("routing-result")).toContainText(
			/spike/i,
		);
	});

	test("truth_kind is a SINGLE enum source (truthtyping ≡ authority)", async ({
		page,
	}) => {
		await expect(page.getByTestId("coherence-pending")).toBeVisible();
		await page.getByTestId("coherence").click();
		await expect(page.getByTestId("coherence-result")).toContainText(
			/aucun fork|no fork/i,
		);
	});
});
