import { expect, test } from "@playwright/test";

/**
 * S102 Playwright e2e — the « Cliquet structurel (arch-fitness) » Workbench panel.
 * mirror record: reflects=S102-arch-fitness, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /arch-fitness route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * measure + ratchet + gate + propose controls are reachable AND executable from the screen,
 * bound to Server Actions running the REAL pure twin (lib/arch-fitness, the twin of
 * back/kernel/mirror/archfitness). The S102 done-criterion, reached from the screen:
 *   - a NEW boundary violation (uncontracted checkout → catalog) REDDENS the structural ratchet
 *     (BROKEN, STRUCTURAL_REGRESSION) and BLOCKS THE CUT;
 *   - a NEW inter-cell cycle (billing → checkout) likewise reddens it;
 *   - both independent of behavioural mirrors (which are green here);
 *   - the clean cut HOLDS; the baseline persists ONLY via a DRAFT ChangeSet.
 *
 * THE WALL (CLAUDE.md §2/§9): the screen measures + ratchets + proposes; propose returns a DRAFT
 * envelope, it never writes truth directly. Every metric/verdict is a pure function, never an LLM.
 */

test.describe("S102 — structural ratchet (arch-fitness)", () => {
	test("the route renders all four controls", async ({ page }) => {
		await page.goto("/arch-fitness");
		await expect(
			page.getByRole("heading", { level: 1, name: /ratchet|cliquet/i }),
		).toBeVisible();
		await expect(page.getByTestId("measure-submit")).toBeVisible();
		await expect(page.getByTestId("ratchet-submit")).toBeVisible();
		await expect(page.getByTestId("gate-submit")).toBeVisible();
		await expect(page.getByTestId("propose-submit")).toBeVisible();
	});

	test("measure reports the clean cut's metrics (0 violations, 0 cycles)", async ({
		page,
	}) => {
		await page.goto("/arch-fitness");
		await page.getByTestId("measure-submit").click();
		await expect(page.getByTestId("measure-metric")).toBeVisible();
		await expect(
			page.getByTestId("metric-boundary_violations"),
		).toHaveAttribute("data-value", "0");
		await expect(page.getByTestId("metric-inter_cell_cycles")).toHaveAttribute(
			"data-value",
			"0",
		);
	});

	test("the clean cut ratchets HELD (nothing climbs)", async ({ page }) => {
		await page.goto("/arch-fitness");
		await page.getByTestId("ratchet-submit").click();
		const verdict = page.getByTestId("ratchet-verdict");
		await expect(verdict).toBeVisible();
		await expect(verdict).toHaveAttribute("data-state", "HELD");
	});

	test("a NEW boundary violation reddens the ratchet and blocks the cut (done-criterion)", async ({
		page,
	}) => {
		await page.goto("/arch-fitness");
		await page.getByTestId("gate-scenario").selectOption("violation");
		await page.getByTestId("gate-submit").click();
		const verdict = page.getByTestId("ratchet-verdict");
		await expect(verdict).toBeVisible();
		await expect(verdict).toHaveAttribute("data-state", "BROKEN");
		await expect(verdict).toHaveAttribute("data-code", "STRUCTURAL_REGRESSION");
		await expect(page.getByTestId("climb-boundary_violations")).toBeVisible();
	});

	test("a NEW inter-cell cycle reddens the ratchet and blocks the cut", async ({
		page,
	}) => {
		await page.goto("/arch-fitness");
		await page.getByTestId("gate-scenario").selectOption("cycle");
		await page.getByTestId("gate-submit").click();
		const verdict = page.getByTestId("ratchet-verdict");
		await expect(verdict).toBeVisible();
		await expect(verdict).toHaveAttribute("data-state", "BROKEN");
		await expect(page.getByTestId("climb-inter_cell_cycles")).toBeVisible();
	});

	test("the gate with no injected fault HOLDS (clean candidate)", async ({
		page,
	}) => {
		await page.goto("/arch-fitness");
		await page.getByTestId("gate-scenario").selectOption("clean");
		await page.getByTestId("gate-submit").click();
		await expect(page.getByTestId("ratchet-verdict")).toHaveAttribute(
			"data-state",
			"HELD",
		);
	});

	test("propose persists the structural baseline as a DRAFT ChangeSet (the wall)", async ({
		page,
	}) => {
		await page.goto("/arch-fitness");
		await page.getByTestId("propose-submit").click();
		const cs = page.getByTestId("proposed-changeset");
		await expect(cs).toBeVisible();
		await expect(cs).toHaveAttribute("data-status", "DRAFT");
		await expect(page.getByTestId("proposed-target")).toContainText(
			"structural-metric:",
		);
	});
});
