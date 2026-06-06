import { expect, test } from "@playwright/test";

/**
 * EL16 Playwright e2e — the deterministic emitter Workbench panel (/emit-ideas).
 * mirror record: reflects=back/runtime/besoin/emit_ideas.go + the besoin_emit_ideas MCP tool
 *               (EmitIdeas(graph) → []Idea, governed by the closed table LevelToProposes (EL05): one
 *               draft Idea per RESOLVED MAPPING rung, NoEmit rungs excluded — no silent cast),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness, CLAUDE.md §7): the human shapes the already-decided
 * graph (per-rung status toggles), then "Emit the Ideas" EXECUTES emitIdeas(nodes) from the screen
 * (the besoin_emit_ideas op). ABOVE the wall: every emitted Idea is a DRAFT candidate with no version
 * and no mirror; the panel reflects the byte-identical Go emitter logic.
 *
 * Scenario A: two resolved mapping rungs (product + entity) emit exactly two draft Ideas (human prov).
 * Scenario B: a resolved journey rung is NoEmit — product + journey emits exactly one Idea (no cast).
 * Scenario C: a drafting rung never emits (resolved-only).
 * Scenario D: reset clears the backlog.
 */

test.describe("EL16 — /emit-ideas deterministic emitter", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/emit-ideas");
		await expect(page.getByTestId("emit-cta")).toBeVisible({ timeout: 5000 });
	});

	test("two resolved mapping rungs emit exactly two draft Ideas with human provenance", async ({
		page,
	}) => {
		// product + entity are resolved by default → two mapping rungs.
		await page.getByTestId("status-product").selectOption("resolved");
		await page.getByTestId("status-entity").selectOption("resolved");
		await page.getByTestId("emit-cta").click();
		await expect(page.getByTestId("backlog-count")).toContainText("2");
		await expect(page.getByTestId("idea-product")).toBeVisible();
		await expect(page.getByTestId("idea-entity")).toBeVisible();
		await expect(page.getByTestId("idea-product")).toContainText(/human/);
		await expect(page.getByTestId("idea-product")).toContainText(/draft/);
	});

	test("a resolved journey rung is NoEmit — product + journey emits exactly one Idea", async ({
		page,
	}) => {
		await page.getByTestId("status-product").selectOption("resolved");
		await page.getByTestId("status-entity").selectOption("empty");
		await page.getByTestId("status-journey").selectOption("resolved");
		await page.getByTestId("emit-cta").click();
		await expect(page.getByTestId("backlog-count")).toContainText("1");
		await expect(page.getByTestId("idea-product")).toBeVisible();
		// no journey Idea — journey is NoEmit (there is no idea-journey row).
		await expect(page.getByTestId("idea-journey")).toHaveCount(0);
	});

	test("a drafting rung never emits (resolved-only)", async ({ page }) => {
		await page.getByTestId("status-product").selectOption("resolved");
		await page.getByTestId("status-entity").selectOption("drafting");
		await page.getByTestId("emit-cta").click();
		await expect(page.getByTestId("backlog-count")).toContainText("1");
		await expect(page.getByTestId("idea-product")).toBeVisible();
		await expect(page.getByTestId("idea-entity")).toHaveCount(0);
	});

	test("reset clears the backlog", async ({ page }) => {
		await page.getByTestId("emit-cta").click();
		await expect(page.getByTestId("backlog-list")).toBeVisible();
		await page.getByTestId("reset-cta").click();
		await expect(page.getByTestId("backlog-list")).toHaveCount(0);
	});
});
