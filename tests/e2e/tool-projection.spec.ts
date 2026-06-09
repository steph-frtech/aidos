import { expect, test } from "@playwright/test";

/**
 * FK15 Playwright e2e — the Tooling-Projection Workbench panel (/tool-projection).
 * mirror record: reflects=FK15-tool-projection, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * The done criteria, executed from the screen (FKE-20, ROADMAP FK15):
 *   Given the Workbench is running
 *   When I navigate to /tool-projection and emit CLAUDE.md
 *   Then the rendered file shows the wall policy + the source-hash + the protection marker  (the projection)
 *   When I emit AGENTS.md
 *   Then the rendered file carries the agent persona, not the wall policy                    (no double-typing)
 *   When I check the clean file
 *   Then there is no drift (green)
 *   When I check the hand-edited file
 *   Then it shows a HAND_EDITED drift                                                         (FK15 fault-injection → red)
 *
 * READ-ONLY (the wall): the panel runs the SAME pure `emit` the Go toolproject.Emit computes and
 * projects the file — it never writes truth. Freezing/updating a ToolingKernel goes via propose → /goal.
 */

test.describe("FK15 — the tooling-projection panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/tool-projection");
		await expect(
			page.getByRole("heading", {
				name: /Tooling projections|Projections d'outillage/i,
			}),
		).toBeVisible({ timeout: 10000 });
	});

	function targetSelect(page: import("@playwright/test").Page) {
		return page.getByRole("combobox", { name: /target|cible/i });
	}

	async function selectTarget(
		page: import("@playwright/test").Page,
		value: string,
	) {
		await targetSelect(page).selectOption({ value });
	}

	test("emitting CLAUDE.md renders the wall policy + the source-hash + the marker", async ({
		page,
	}) => {
		await selectTarget(page, "CLAUDE.md");
		await page.getByTestId("emit-btn").click();
		await expect(page.getByTestId("tool-projection-result")).toBeVisible();
		const file = await page.getByTestId("emitted-file").textContent();
		expect(file).toContain("Le mur");
		expect(file).toContain("AIDOS-TOOLING-SOURCE-HASH");
		const hash = await page.getByTestId("source-hash").textContent();
		expect(hash?.length).toBeGreaterThan(0);
	});

	test("AGENTS.md carries the agent persona, not the wall policy (no double-typing)", async ({
		page,
	}) => {
		await selectTarget(page, "AGENTS.md");
		await page.getByTestId("emit-btn").click();
		const file = await page.getByTestId("emitted-file").textContent();
		expect(file).toContain("step-executor");
		expect(file).not.toContain("Le mur");
	});

	test("checking the clean file shows no drift (green)", async ({ page }) => {
		await selectTarget(page, "CLAUDE.md");
		await page.getByTestId("check-clean-btn").click();
		await expect(page.getByTestId("no-drift")).toBeVisible();
	});

	test("FK15 fault-injection: a hand-edited file is RED with a HAND_EDITED drift", async ({
		page,
	}) => {
		await selectTarget(page, "CLAUDE.md");
		await page.getByTestId("check-edited-btn").click();
		const drift = page.getByTestId("drift");
		await expect(drift).toBeVisible();
		await expect(drift).toHaveAttribute("data-kind", "HAND_EDITED");
	});
});
