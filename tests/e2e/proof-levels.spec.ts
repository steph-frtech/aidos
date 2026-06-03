import { expect, test } from "@playwright/test";

/**
 * Playwright e2e — the interactive N0→N5 proof-levels explorer (/proof-levels).
 * mirror record: reflects=front.proof-levels.explorer, test_kind=e2e,
 *                cert_language=playwright-bdd, liveness=alive, authority=below
 *
 * Click a level → see its certification language, proof form and who certifies; a
 * waterline divides the human-anchored levels (N0–N2) from the self-certified ones (N3–N5).
 */

test.describe("proof-levels — the N0→N5 explorer", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/proof-levels");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /couches de preuve|proof levels/i,
			}),
		).toBeVisible({ timeout: 15000 });
	});

	test("renders the 6 levels, a waterline, and N0 open by default", async ({
		page,
	}) => {
		await expect(page.getByTestId("proof-levels-explorer")).toBeVisible();
		await expect(page.getByTestId("waterline")).toBeVisible();
		for (const k of ["n0", "n1", "n2", "n3", "n4", "n5"]) {
			await expect(page.getByTestId(`level-card-${k}`)).toBeVisible();
		}
		// N0 open by default → its cert language (gherkin) is shown
		await expect(page.getByTestId("level-detail-n0")).toBeVisible();
		await expect(page.getByTestId("level-cert-n0")).toContainText(/gherkin/i);
	});

	test("clicking a level reveals its certification language and verdict", async ({
		page,
	}) => {
		// N1 → property test (rapid / fast-check), human-anchored
		await page.getByTestId("level-card-n1").click();
		await expect(page.getByTestId("level-cert-n1")).toContainText(
			/rapid|fast-check/i,
		);

		// N3 → contract (pact / zod), AI self-certifies
		await page.getByTestId("level-card-n3").click();
		await expect(page.getByTestId("level-cert-n3")).toContainText(/pact/i);
		await expect(page.getByTestId("level-detail-n3")).toContainText(
			/auto-certifie|self-certif/i,
		);
	});
});
