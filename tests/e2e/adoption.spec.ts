import { expect, test } from "@playwright/test";

/**
 * S47 Playwright e2e — the adoption + release panel (/adoption).
 *
 * mirror record: reflects=front.adoption (the PROJECTION of runtime.adoption.Plan +
 *               runtime.adoption.release.Assemble + the fitness.release_pack read, S47),
 *               test_kind=gherkin, cert_language=playwright-bdd, liveness=alive,
 *               authority=below
 *
 * THE DONE CRITERIA, made visible on screen:
 *   - the ladder shows the five tiers T0..T4 with the current tier highlighted;
 *   - T1 shows NO QualityDiversity requirement (the §82.6 fact);
 *   - T2 renders as blocked with a RealityMirror gap when no RealityMirror is live;
 *   - T4 renders as blocked with an EvolutionSandbox gap when no sandbox exists;
 *   - the release pack renders CLI surface + routes + test inventory + changelog +
 *     known limits with NO install/ship/publish button (assemble only);
 *   - an empty view renders the empty-but-valid pack state.
 */

test.describe("S47 — Adoption ladder + Release v0 (assemble, never install/ship)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/adoption");
		await expect(
			page.getByRole("heading", { name: /Adoption \+ Release v0/i }),
		).toBeVisible({ timeout: 5000 });
	});

	test("the ladder shows the five tiers with the current tier highlighted", async ({
		page,
	}) => {
		for (const tier of ["T0", "T1", "T2", "T3", "T4"]) {
			await expect(page.getByTestId(`tier-${tier}`)).toBeVisible();
		}
		// floor scenario: current == T0.
		await page.getByTestId("scenario-select").selectOption("floor-t0");
		await expect(page.getByTestId("current-T0")).toBeVisible();
		await expect(page.getByTestId("next-T1")).toBeVisible();
	});

	test("T1 shows no QualityDiversity requirement (KRD §82.6)", async ({
		page,
	}) => {
		await expect(page.getByTestId("t1-no-qd")).toBeVisible();
		// T1's requires list never names quality_diversity.
		await expect(page.getByTestId("tier-T1")).not.toContainText(
			/quality_diversity/,
		);
	});

	test("T2 is blocked with a RealityMirror gap when none is live", async ({
		page,
	}) => {
		await page.getByTestId("scenario-select").selectOption("t1-cell");
		await expect(page.getByTestId("tier-T2")).toHaveAttribute(
			"data-satisfiable",
			"false",
		);
		await expect(page.getByTestId("gap-T2-reality_mirror_live")).toContainText(
			/RealityMirror/i,
		);
	});

	test("T2 unlocks once the RealityMirror is live", async ({ page }) => {
		await page.getByTestId("scenario-select").selectOption("t2-reality");
		await expect(page.getByTestId("tier-T2")).toHaveAttribute(
			"data-satisfiable",
			"true",
		);
		await expect(page.getByTestId("gap-T2-reality_mirror_live")).toHaveCount(0);
	});

	test("T4 is blocked with an EvolutionSandbox gap when none exists", async ({
		page,
	}) => {
		await page
			.getByTestId("scenario-select")
			.selectOption("t4-sandbox-blocked");
		await expect(page.getByTestId("tier-T4")).toHaveAttribute(
			"data-satisfiable",
			"false",
		);
		await expect(page.getByTestId("gap-T4-evolution_sandbox")).toContainText(
			/EvolutionSandbox/i,
		);
	});

	test("the release pack renders the inventory with no install/ship/publish button", async ({
		page,
	}) => {
		await page.getByTestId("scenario-select").selectOption("floor-t0");
		await expect(page.getByTestId("pack-cli")).toBeVisible();
		await expect(page.getByTestId("pack-routes")).toContainText("/adoption");
		await expect(page.getByTestId("pack-tests")).toBeVisible();
		await expect(page.getByTestId("pack-changelog")).toContainText(/cs-/);
		await expect(page.getByTestId("pack-limits")).toContainText(/OQ-S47/);

		// assemble only: NO install / ship / publish / deploy button anywhere.
		await expect(
			page.getByRole("button", {
				name: /install|installer|ship|livrer|publish|publier|deploy|déployer/i,
			}),
		).toHaveCount(0);

		await expect(page.getByTestId("assemble-only-note")).toBeVisible();
	});

	test("an empty view renders the empty-but-valid pack state", async ({
		page,
	}) => {
		await page.getByTestId("scenario-select").selectOption("empty");
		await expect(page.getByTestId("empty-pack")).toBeVisible();
	});
});
