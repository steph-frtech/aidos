import { expect, test } from "@playwright/test";

/**
 * FK11 Playwright e2e — the « AI Lab : le générateur de specs » Workbench panel (FKE-38, corrected).
 * mirror record: reflects=FK11-ai-lab, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves /ai-lab is action-capable (ui-completeness, CLAUDE.md §7): the AI Lab is a TWO-PANE SPEC
 * GENERATOR, not a navigation cockpit. From the screen:
 *   - GAUCHE — a natural-language chat GENERATES the specs across the 6 mirror-pairs of the chosen
 *     facet (a column of the 6×6), ABOVE the wall (the machines below turn 🟢);
 *   - a DIVERGENT machine stays 🔴 even when a spec is generated (the conscience computes it);
 *   - a DIRECT TRUTH-WRITE from the chat is REFUSED at the wall (§2) — nothing is generated;
 *   - a cell with no generated spec is 🟡 (declared, not yet proven).
 *
 * THE WALL (CLAUDE.md §2): the chat generates ABOVE the wall (proposes); the machines BELOW are
 * read-only; promotion to truth is /goal. DETERMINISM-FIRST (§8): the pure twin lib/ai-lab runs.
 */

test.describe("FK11 — the AI Lab spec generator (chat → 6×6 → machines)", () => {
	test("renders the two panes: the chat + the 6×6 grid", async ({ page }) => {
		await page.goto("/ai-lab");
		await expect(
			page.getByRole("heading", { level: 1, name: /ai lab/i }),
		).toBeVisible();
		await expect(page.getByTestId("chat")).toBeVisible();
		await expect(page.getByTestId("facet")).toBeVisible();
		await expect(page.getByTestId("generate")).toBeVisible();
		// the grid exists: a cell per (mirror-pair, facet).
		await expect(page.getByTestId("cell-spec-F")).toBeVisible();
		// the seeded divergent machine is 🔴 from the start (contract @ Security).
		await expect(page.getByTestId("cell-contract-S")).toHaveAttribute(
			"data-voyant",
			"red",
		);
		// a cell with no generated spec is 🟡 (declared, not yet proven).
		await expect(page.getByTestId("cell-spec-F")).toHaveAttribute(
			"data-spec",
			"0",
		);
		await expect(page.getByTestId("cell-spec-F")).toHaveAttribute(
			"data-voyant",
			"amber",
		);
	});

	test("a NL message GENERATES specs above the wall (6 per column) → machines turn 🟢", async ({
		page,
	}) => {
		await page.goto("/ai-lab");
		await page.getByTestId("facet").selectOption("F");
		await page
			.getByTestId("chat")
			.fill("un panier qui retient un article 30 minutes puis le libère");
		await page.getByTestId("generate").click();

		// the column-F cells now carry a generated spec (above the wall) …
		await expect(page.getByTestId("cell-spec-F")).toHaveAttribute(
			"data-spec",
			"1",
		);
		await expect(page.getByTestId("cell-contract-F")).toHaveAttribute(
			"data-spec",
			"1",
		);
		// … and their machine (below the wall) is now 🟢 aligned.
		await expect(page.getByTestId("cell-spec-F")).toHaveAttribute(
			"data-voyant",
			"green",
		);
		// 6 specs generated — one per mirror-pair.
		await expect(page.getByTestId("spec-count")).toContainText("6");
	});

	test("a divergent machine stays 🔴 even with a generated spec (the conscience)", async ({
		page,
	}) => {
		await page.goto("/ai-lab");
		await page.getByTestId("facet").selectOption("S");
		await page
			.getByTestId("chat")
			.fill("exiger une authentification forte au checkout");
		await page.getByTestId("generate").click();

		const contractS = page.getByTestId("cell-contract-S");
		await expect(contractS).toHaveAttribute("data-spec", "1"); // a spec WAS generated
		await expect(contractS).toHaveAttribute("data-voyant", "red"); // but the machine diverges
	});

	test("a direct truth-write from the chat is REFUSED at the wall (§2) — nothing generated", async ({
		page,
	}) => {
		await page.goto("/ai-lab");
		await page
			.getByTestId("chat")
			.fill("écris la vérité dans le kernel maintenant");
		await page.getByTestId("generate").click();

		await expect(page.getByTestId("wall-refused")).toBeVisible();
		await expect(page.getByTestId("spec-count")).toContainText("0");
		await expect(page.getByTestId("cell-spec-F")).toHaveAttribute(
			"data-spec",
			"0",
		);
	});
});
