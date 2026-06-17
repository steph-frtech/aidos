import { expect, test } from "@playwright/test";

/**
 * V3 « Faire évoluer » — le CLIQUET STRUCTUREL (arch-fitness) porté EN PROPRE dans la session V3
 * (/v3/arch-fitness).
 * mirror record: reflects=S102-arch-fitness@v3, test_kind=e2e, cert_language=playwright,
 *                liveness=alive, authority=above
 *
 * La lentille V3 est une LENTILLE NATIVE : measureAction → readVia(scope,"measure",…) lit LIVE le
 * serveur MCP Go arch-fitness via la passerelle ; le twin pur lib/arch-fitness n'est que le repli
 * demo déterministe (source:"live"|"demo") — aucun fork, aucune ré-implémentation du Go (ADR
 * 0007 / 0092), le cliquet T5 (twin-as-live-fitness) reste VERT. Seul le SHELL diffère : le chrome
 * de la session V3 (V3Nav, V3SessionProvider) hérité du layout — pas de WorkbenchHeader.
 *
 * Le geste, exécuté depuis l'écran V3 (CLAUDE.md §7 ui-completeness) — les quatre contrôles sont
 * atteignables ET exécutables :
 *   Given the V3 workbench is running
 *   When I navigate to /v3/arch-fitness (the lens lives inside the V3 shell)
 *   Then MEASURE reports the clean cut's metrics (0 boundary violations, 0 inter-cell cycles),
 *        with an honest source badge (live OR demo, never a silent broken-live);
 *   And RATCHET of the clean cut against itself HOLDS;
 *   And THE GATE with a NEW boundary violation REDDENS the ratchet (BROKEN, STRUCTURAL_REGRESSION)
 *        and blocks the cut, independent of behavioural mirrors;
 *   And THE GATE with a NEW inter-cell cycle likewise reddens it;
 *   And PROPOSE returns a DRAFT ChangeSet (the only legal way to move the structural baseline).
 *
 * LE MUR (le wall, §2/§9) : la lentille MESURE + CLIQUETTE + PROPOSE ; propose renvoie une
 * enveloppe DRAFT, elle n'écrit JAMAIS la vérité directement.
 */

test.describe("V3 Faire évoluer — la lentille Cliquet structurel (arch-fitness)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/v3/arch-fitness");
		// La lentille est bien montée DANS le shell V3 (la nav V3 enveloppe la route).
		await expect(page.getByTestId("v3-shell")).toBeVisible({ timeout: 15000 });
		await expect(page.getByTestId("v3-arch-fitness")).toBeVisible();
	});

	test("the lens renders all four action-capable controls", async ({ page }) => {
		await expect(page.getByTestId("measure-submit")).toBeVisible();
		await expect(page.getByTestId("ratchet-submit")).toBeVisible();
		await expect(page.getByTestId("gate-submit")).toBeVisible();
		await expect(page.getByTestId("propose-submit")).toBeVisible();
	});

	test("measure reports the clean cut's metrics with an honest source badge (live|demo)", async ({
		page,
	}) => {
		await page.getByTestId("measure-submit").click();
		await expect(page.getByTestId("measure-metric")).toBeVisible();
		await expect(page.getByTestId("metric-boundary_violations")).toHaveAttribute(
			"data-value",
			"0",
		);
		await expect(page.getByTestId("metric-inter_cell_cycles")).toHaveAttribute(
			"data-value",
			"0",
		);
		// le badge `source` est honnête (live OU demo) — jamais un live cassé silencieux (ADR 0074).
		const badge = page.getByTestId("measure-source");
		await expect(badge).toBeVisible();
		const src = await badge.getAttribute("data-source");
		expect(["live", "demo"]).toContain(src);
	});

	test("the clean cut ratchets HELD (nothing climbs)", async ({ page }) => {
		await page.getByTestId("ratchet-submit").click();
		const verdict = page.getByTestId("ratchet-verdict");
		await expect(verdict).toBeVisible();
		await expect(verdict).toHaveAttribute("data-state", "HELD");
	});

	test("a NEW boundary violation reddens the ratchet and blocks the cut (done-criterion)", async ({
		page,
	}) => {
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
		await page.getByTestId("gate-scenario").selectOption("clean");
		await page.getByTestId("gate-submit").click();
		await expect(page.getByTestId("ratchet-verdict")).toHaveAttribute(
			"data-state",
			"HELD",
		);
	});

	test("propose returns a DRAFT ChangeSet (the wall — never a direct truth-write)", async ({
		page,
	}) => {
		await page.getByTestId("propose-submit").click();
		const cs = page.getByTestId("proposed-changeset");
		await expect(cs).toBeVisible();
		await expect(cs).toHaveAttribute("data-status", "DRAFT");
		await expect(page.getByTestId("proposed-target")).toContainText(
			"structural-metric:",
		);
	});
});
