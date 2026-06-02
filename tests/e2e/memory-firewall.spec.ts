import { expect, test } from "@playwright/test";

/**
 * S30 Playwright e2e — the MemoryFirewall Workbench panel (/memory-firewall).
 * mirror record: reflects=archive.brain.firewall (the always-blocked Memory → Kernel edge ;
 *               the mandatory one-way flow Memory → ContextPack → Idea → Mirror → Goal →
 *               Kernel), test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: the firewall blocks the direct Memory → Kernel edge; the only door is via an idea
 *   Given the Workbench is running
 *   When I navigate to /memory-firewall, capture a memory, and attempt Memory → Kernel
 *   Then the memory card shows content/provenance/taint and the "not truth" marker
 *   And the six-stage mandatory flow pipeline is visible with the direct shortcut red & blocked
 *   And the direct Memory → Kernel attempt renders red with MEMORY_CANNOT_DECLARE_TRUTH, the
 *       full flow in how_to_fix, and a "no kernel write" marker (the done criterion)
 *   And routing via an idea shows the memory turning into a draft idea (provenance link, "still
 *       no mirror") that does not by itself reach the kernel
 */

test.describe("S30 — the MemoryFirewall panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/memory-firewall");
		await expect(page.getByTestId("memory-firewall-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the mandatory flow pipeline shows all six stages and the red blocked shortcut", async ({
		page,
	}) => {
		const stages = page.getByTestId("flow-stage");
		await expect(stages).toHaveCount(6);
		for (const stage of [
			"Memory",
			"ContextPack",
			"Idea",
			"Mirror",
			"Goal",
			"Kernel",
		]) {
			await expect(page.locator(`[data-stage="${stage}"]`)).toBeVisible();
		}
		// The direct Memory → Kernel shortcut is red and crossed out.
		const shortcut = page.getByTestId("kernel-shortcut");
		await expect(shortcut).toBeVisible();
		await expect(shortcut).toContainText("Memory → Kernel");
	});

	test("a captured memory shows content, provenance, taint and the 'not truth' marker", async ({
		page,
	}) => {
		await page.getByTestId("capture-memory").click();
		const card = page.getByTestId("memory-card");
		await expect(card).toBeVisible();
		await expect(page.getByTestId("memory-content")).toContainText(
			"regulars always get 20% off",
		);
		await expect(page.getByTestId("memory-provenance")).toContainText(
			"user_claim",
		);
		// taint badges include "stale".
		await expect(
			page.getByTestId("memory-taint").locator('[data-taint="stale"]'),
		).toBeVisible();
		// The explicit "not truth — no mirror, no freeze" marker.
		await expect(page.getByTestId("not-truth-marker")).toBeVisible();
	});

	test("the direct Memory → Kernel attempt is blocked (the done criterion)", async ({
		page,
	}) => {
		await page.getByTestId("capture-memory").click();
		await page.getByTestId("to-kernel").click();

		const block = page.getByTestId("block-reason");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute(
			"data-code",
			"MEMORY_CANNOT_DECLARE_TRUTH",
		);
		await expect(page.getByTestId("block-code")).toContainText(
			"MEMORY_CANNOT_DECLARE_TRUTH",
		);
		// No kernel write.
		await expect(page.getByTestId("no-kernel-write")).toBeVisible();
		// how_to_fix names the full mandatory flow.
		await expect(page.getByTestId("how-to-fix")).toContainText(
			"memory_to_contextpack_to_idea_to_mirror_to_goal_to_kernel",
		);
	});

	test("the ContextPack edge carries the taint forward (allowed read-side)", async ({
		page,
	}) => {
		await page.getByTestId("capture-memory").click();
		await page.getByTestId("propose-to-contextpack").click();
		const entry = page.getByTestId("contextpack-entry");
		await expect(entry).toBeVisible();
		await expect(
			page.getByTestId("entry-taint").locator('[data-taint="stale"]'),
		).toBeVisible();
	});

	test("routing via an idea yields a draft idea that still has no mirror", async ({
		page,
	}) => {
		await page.getByTestId("capture-memory").click();
		await page.getByTestId("via-idea").click();

		const result = page.getByTestId("via-idea-result");
		await expect(result).toBeVisible();
		await expect(page.getByTestId("idea-provenance")).toContainText("memory:");
		// Still short of the kernel: it has no mirror.
		await expect(page.getByTestId("still-no-mirror")).toBeVisible();
		// The link to /ideas (S27).
		await expect(page.getByTestId("ideas-link")).toHaveAttribute(
			"href",
			"/ideas",
		);
	});
});
