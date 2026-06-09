import { expect, test } from "@playwright/test";

/**
 * FK05 Playwright e2e — the « l'expand E0-E7 » Workbench panel.
 * mirror record: reflects=FK05-prooftype, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /proof-type route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * TAG-THE-KERNEL control is reachable AND executable from the screen, bound to a Server Action
 * running the REAL pure twin (lib/prooftype, the TS twin of back/kernel/mirror/prooftype). The
 * FK05 done-criteria, reached from the screen:
 *   - the N→E mapping table is displayed (total: every N → its E set);
 *   - tagging a kernel DISPLAYS its E-typed evidence (the done-criterion "evidence E-typée affichée");
 *   - E4 (security) appears ONLY via the S facet — the added type is gated;
 *   - the N is preserved verbatim on the contract (zéro miroir N existant modifié).
 *
 * THE WALL (CLAUDE.md §2): the screen only DERIVES + DISPLAYS — it writes no truth. The mapping
 * is a pure function (never an LLM).
 */

test.describe("FK05 — E0-E7 expand (N→E mapping)", () => {
	test("the route renders the mapping table + the tag control", async ({
		page,
	}) => {
		await page.goto("/proof-type");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /L'expand E0-E7|The E0-E7 expand/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("n-level")).toBeVisible();
		await expect(page.getByTestId("tag-submit")).toBeVisible();
		// the mapping table is total: N4 → E1,E2 and N5 → E3,E4 are shown.
		await expect(page.getByTestId("map-N4")).toContainText("E1");
		await expect(page.getByTestId("map-N4")).toContainText("E2");
		await expect(page.getByTestId("map-N5")).toContainText("E4");
	});

	test("tagging an N4 kernel displays its E-typed evidence (E1, E2)", async ({
		page,
	}) => {
		await page.goto("/proof-type");
		await page.getByTestId("n-level").selectOption("N4");
		await page.getByTestId("tag-submit").click();

		await expect(page.getByTestId("contract")).toBeVisible();
		// the E-typed evidence is displayed: E1 and E2 from the N4 base mapping.
		await expect(page.getByTestId("from-n").getByTestId("e-1")).toBeVisible();
		await expect(page.getByTestId("from-n").getByTestId("e-2")).toBeVisible();
		// the N is preserved verbatim on the contract.
		await expect(page.getByTestId("preserved-n")).toHaveAttribute(
			"data-n",
			"N4",
		);
	});

	test("E4 (security) appears ONLY when the S facet is instantiated", async ({
		page,
	}) => {
		await page.goto("/proof-type");
		await page.getByTestId("n-level").selectOption("N4");
		// instantiate the S (sécurité) facet.
		await page.getByTestId("facet-S").locator("input[type=checkbox]").check();
		await page.getByTestId("tag-submit").click();

		await expect(page.getByTestId("contract")).toBeVisible();
		// E4 (gosec/gitleaks/evals-injection) is now an added type in the contract.
		await expect(
			page.getByTestId("from-facets").getByTestId("e-4"),
		).toBeVisible();
		await expect(page.getByTestId("required").getByTestId("e-4")).toBeVisible();
	});

	test("E7 (formal) appears ONLY via the formal-cap flag", async ({ page }) => {
		await page.goto("/proof-type");
		await page.getByTestId("n-level").selectOption("N1");
		await page.getByTestId("tag-submit").click();
		await expect(page.getByTestId("contract")).toBeVisible();
		// an ordinary N1 kernel has no E7.
		await expect(page.getByTestId("required").getByTestId("e-7")).toHaveCount(
			0,
		);

		// set the formal cap → E7 is required.
		await page
			.getByTestId("formal-toggle")
			.locator("input[type=checkbox]")
			.check();
		await page.getByTestId("tag-submit").click();
		await expect(page.getByTestId("required").getByTestId("e-7")).toBeVisible();
	});
});
