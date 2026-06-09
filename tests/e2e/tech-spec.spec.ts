import { expect, test } from "@playwright/test";

/**
 * FK15 part (b) Playwright e2e — the Tech-Spec Workbench panel (/tech-spec).
 * mirror record: reflects=FK15-tech-spec, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * The done criteria, executed from the screen (FKE-20.1, ROADMAP FK15 part b):
 *   Given the Workbench is running
 *   When I navigate to /tech-spec and assemble the Fiche for the networked CheckoutAPI
 *   Then the rendered file shows the Contrat + the OSI stack + the source-hash + the marker  (the assembly)
 *   And the zero-new-truth verdict is OK (declared refs === assembled refs)                  (zero new truth)
 *   When I assemble the Suite
 *   Then it carries the test refs, not the F5 contract spec ref                               (no double-typing)
 *   When I pick the pure-function Scorer
 *   Then the Fiche carries NO OSI section                                                     (a pure fn has no OSI)
 *   When I check the clean file
 *   Then there is no drift (green)
 *   When I check the hand-edited file
 *   Then it shows a HAND_EDITED drift                                                         (FK15 fault-injection → red)
 *
 * READ-ONLY (the wall): the panel runs the SAME pure `assemble` the Go techspec.Assemble computes and
 * projects the file — it never writes truth. Freezing a projection goes via propose → /goal.
 */

test.describe("FK15 part b — the tech-spec panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/tech-spec");
		await expect(
			page.getByRole("heading", {
				name: /Technical spec & technical tests|Spécification technique & Tests techniques/i,
			}),
		).toBeVisible({ timeout: 10000 });
	});

	function projSelect(page: import("@playwright/test").Page) {
		return page.getByRole("combobox", { name: /projection/i });
	}
	function kernelSelect(page: import("@playwright/test").Page) {
		return page.getByRole("combobox", { name: /kernel/i });
	}

	test("assembling the Fiche renders the contract + OSI + the marker, with zero new truth", async ({
		page,
	}) => {
		await projSelect(page).selectOption({
			value: "fiche-specification-technique",
		});
		await page.getByTestId("assemble-btn").click();
		await expect(page.getByTestId("tech-spec-result")).toBeVisible();
		const file = await page.getByTestId("assembled-file").textContent();
		expect(file).toContain("contract:CheckoutAPI");
		expect(file).toContain("Pile de communication (OSI)");
		expect(file).toContain("AIDOS-TECHSPEC-SOURCE-HASH");
		// Zero-new-truth verdict is OK.
		await expect(page.getByTestId("zero-new-truth")).toHaveAttribute(
			"data-ok",
			"true",
		);
	});

	test("the Suite carries test refs, not the F5 contract spec (no double-typing)", async ({
		page,
	}) => {
		await projSelect(page).selectOption({ value: "suite-tests-techniques" });
		await page.getByTestId("assemble-btn").click();
		const file = await page.getByTestId("assembled-file").textContent();
		expect(file).toContain("test:N4:unit-total");
		expect(file).not.toContain("contract:CheckoutAPI");
	});

	test("the pure-function Scorer kernel assembles a Fiche with NO OSI section", async ({
		page,
	}) => {
		await kernelSelect(page).selectOption({ value: "scorer" });
		await projSelect(page).selectOption({
			value: "fiche-specification-technique",
		});
		await page.getByTestId("assemble-btn").click();
		const file = await page.getByTestId("assembled-file").textContent();
		expect(file).toContain("model:Score");
		expect(file).not.toContain("Pile de communication (OSI)");
	});

	test("checking the clean file shows no drift (green)", async ({ page }) => {
		await projSelect(page).selectOption({
			value: "fiche-specification-technique",
		});
		await page.getByTestId("check-clean-btn").click();
		await expect(page.getByTestId("no-drift")).toBeVisible();
	});

	test("FK15 fault-injection: a hand-edited file is RED with a HAND_EDITED drift", async ({
		page,
	}) => {
		await projSelect(page).selectOption({
			value: "fiche-specification-technique",
		});
		await page.getByTestId("check-edited-btn").click();
		const drift = page.getByTestId("drift");
		await expect(drift).toBeVisible();
		await expect(drift).toHaveAttribute("data-kind", "HAND_EDITED");
	});
});
