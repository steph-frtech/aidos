import { expect, test } from "@playwright/test";

/**
 * S66 Playwright e2e — « /goal piloté » Workbench panel.
 * mirror record: reflects=S66-goal-piloting, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /goal-piloting route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * TWO controls are reachable AND executable from the screen, bound to Server Actions that run
 * the REAL engine.
 *   - Propose: a real authority-bearing actor opens a goal from a grilled idea → a DRAFT
 *     ChangeSet PROPOSAL + the live red set; a placeholder actor / mirror-less idea is refused.
 *   - Stop: the live NON-GAMEABLE close gate — refused (GOAL_STILL_RED) until all four
 *     conditions hold (red set→green ∧ prior intact ∧ mutation ≥ floor ∧ no monster).
 *
 * THE WALL (CLAUDE.md §2): the screen PROPOSES a ChangeSet, it never writes the Kernel — the
 * DRAFT badge stays DRAFT (a proposal), and closing is computed, never declared.
 */

test.describe("S66 — Piloted /goal", () => {
	test("the route renders the goal-piloting panel with both controls", async ({
		page,
	}) => {
		await page.goto("/goal-piloting");
		await expect(
			page.getByRole("heading", { level: 1, name: /\/goal piloté|Piloted \/goal/ }),
		).toBeVisible();
		await expect(page.getByTestId("propose-form")).toBeVisible();
		await expect(page.getByTestId("close-form")).toBeVisible();
	});

	test("an authority-bearing user proposes a DRAFT ChangeSet + a live red set", async ({
		page,
	}) => {
		await page.goto("/goal-piloting");
		await page.getByTestId("actor-identity").fill("u-amelie");
		await page.getByTestId("actor-display").fill("Amélie Roy");
		await page.getByTestId("idea-id").fill("idea-order-discount");
		await page.getByTestId("propose-red-set").fill("Order.discount.fixture");
		await page.getByTestId("propose-submit").click();
		// The action ran: the DRAFT ChangeSet proposal + the live red-set worklist appear.
		await expect(page.getByTestId("propose-result")).toBeVisible();
		await expect(page.getByTestId("draft-badge")).toContainText("DRAFT");
		await expect(page.getByTestId("live-red-set")).toBeVisible();
		await expect(page.getByTestId("red-mirror").first()).toContainText(
			"Order.discount.fixture",
		);
	});

	test("a placeholder actor is refused (the wall: no goal for nobody)", async ({
		page,
	}) => {
		await page.goto("/goal-piloting");
		await page.getByTestId("actor-identity").fill("agent");
		await page.getByTestId("actor-display").fill("agent");
		await page.getByTestId("idea-id").fill("idea-order-discount");
		await page.getByTestId("propose-red-set").fill("Order.discount.fixture");
		await page.getByTestId("propose-submit").click();
		const block = page.getByTestId("propose-block");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "PLACEHOLDER_ACTOR");
	});

	test("the close is refused while a condition fails (non-gameable Stop)", async ({
		page,
	}) => {
		await page.goto("/goal-piloting");
		// Leave red-set-green UNCHECKED ⇒ a red mirror remains ⇒ refused.
		await page.getByTestId("close-submit").click();
		await expect(page.getByTestId("close-verdict")).toHaveAttribute(
			"data-closeable",
			"false",
		);
		await expect(page.getByTestId("close-block")).toHaveAttribute(
			"data-code",
			"GOAL_STILL_RED",
		);
	});

	test("the close is admitted only when all four conditions hold", async ({
		page,
	}) => {
		await page.goto("/goal-piloting");
		await page.getByTestId("cond-red-green").check();
		// prior-intact defaults checked; mutation 0.9 ≥ floor 0.8; no monster.
		await page.getByTestId("close-submit").click();
		await expect(page.getByTestId("close-verdict")).toHaveAttribute(
			"data-closeable",
			"true",
		);
	});
});
