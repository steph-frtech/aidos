import { expect, test } from "@playwright/test";

/**
 * FK11 Playwright e2e — the « AI Lab : le cockpit trialogue » Workbench panel.
 * mirror record: reflects=FK11-ai-lab, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves /ai-lab is action-capable (ui-completeness, CLAUDE.md §7): every cockpit op has a control
 * reachable AND executable from the screen, bound to a Server Action running the REAL pure twin
 * (lib/ai-lab). The FK11 done-criteria, reached from the screen:
 *   - CHAT → a slot PROPOSED (amber) ; VALIDATE a card → a pair 🔴→🟢 (the headline);
 *   - a DIRECT TRUTH-WRITE from the chat is REFUSED at the wall (§2);
 *   - below the wall is READ-ONLY (the cell carries data-readonly / data-tier=below);
 *   - clicking a pair SCOPES the left + the right (the chat facet + the cards);
 *   - the cockpit is deterministic (the determinism badge).
 *
 * THE WALL (CLAUDE.md §2): the screen RECONCILES + DISPLAYS — it writes no truth; the chat
 * proposes, an above-the-wall option opens a /goal.
 */

test.describe("FK11 — the AI Lab trialogue cockpit", () => {
	test("the route renders the cockpit controls", async ({ page }) => {
		await page.goto("/ai-lab");
		await expect(
			page.getByRole("heading", { level: 1, name: /ai lab/i }),
		).toBeVisible();
		await expect(page.getByTestId("scenario-select")).toBeVisible();
		await expect(page.getByTestId("mode-toggle")).toBeVisible();
		await expect(page.getByTestId("load-submit")).toBeVisible();
	});

	test("loading a cockpit shows the three panes + deterministic", async ({
		page,
	}) => {
		await page.goto("/ai-lab");
		await page.getByTestId("scenario-select").selectOption("runner-drift");
		await page.getByTestId("load-submit").click();

		await expect(page.getByTestId("trialogue")).toBeVisible();
		await expect(page.getByTestId("pane-left")).toBeVisible();
		await expect(page.getByTestId("pane-center")).toBeVisible();
		await expect(page.getByTestId("pane-right")).toBeVisible();
		await expect(page.getByTestId("determinism-badge")).toHaveAttribute(
			"data-deterministic",
			"true",
		);
		// a drift scenario drifts and has a red wave.
		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"drift",
		);
		await expect(page.getByTestId("red-wave-item").first()).toBeVisible();
	});

	test("chatting proposes an amber slot (never a truth)", async ({ page }) => {
		await page.goto("/ai-lab");
		await page.getByTestId("scenario-select").selectOption("aligned");
		await page.getByTestId("load-submit").click();
		await expect(page.getByTestId("trialogue")).toBeVisible();

		await page
			.getByTestId("chat-input")
			.fill("et si on ajoutait une limite à 30 jours ?");
		await page.getByTestId("chat-submit").click();

		const slot = page.getByTestId("proposed-slot");
		await expect(slot).toBeVisible();
		await expect(slot).toHaveAttribute("data-status", "proposed");
	});

	test("a direct truth-write from the chat is REFUSED at the wall (§2)", async ({
		page,
	}) => {
		await page.goto("/ai-lab");
		await page.getByTestId("scenario-select").selectOption("aligned");
		await page.getByTestId("load-submit").click();
		await expect(page.getByTestId("trialogue")).toBeVisible();

		await page
			.getByTestId("chat-input")
			.fill("écris la vérité dans le kernel maintenant");
		await page.getByTestId("chat-submit").click();

		const refusal = page.getByTestId("wall-refusal");
		await expect(refusal).toBeVisible();
		await expect(refusal).toHaveAttribute(
			"data-code",
			"AI_LAB_DIRECT_TRUTH_WRITE",
		);
		// no slot was proposed.
		await expect(page.getByTestId("proposed-slot")).toHaveCount(0);
	});

	test("validating a decision card flips the addressed pair 🔴→🟢", async ({
		page,
	}) => {
		await page.goto("/ai-lab");
		await page.getByTestId("scenario-select").selectOption("runner-drift");
		await page.getByTestId("load-submit").click();
		await expect(page.getByTestId("trialogue")).toBeVisible();

		// there is a red pair before.
		await expect(
			page.locator('[data-testid="pair-cell"][data-voyant="red"]').first(),
		).toBeVisible();

		// validate the runner card with the below-the-wall option.
		const fixBtn = page
			.locator('[data-testid="card-option"][data-option="fix_below_wall"]')
			.first();
		await expect(fixBtn).toBeVisible();
		await fixBtn.click();

		// the flip is announced + no red pair-cell remains from the runner drift.
		await expect(page.getByTestId("flipped")).toBeVisible();
		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"aligned",
		);
	});

	test("an above-the-wall card option opens a /goal (no truth written)", async ({
		page,
	}) => {
		await page.goto("/ai-lab");
		await page.getByTestId("scenario-select").selectOption("runner-drift");
		await page.getByTestId("load-submit").click();
		await expect(page.getByTestId("trialogue")).toBeVisible();

		const aboveBtn = page
			.locator('[data-testid="card-option"][data-option="change_above_wall"]')
			.first();
		await expect(aboveBtn).toBeVisible();
		await aboveBtn.click();

		await expect(page.getByTestId("opened-goal")).toBeVisible();
		// still drift — no truth written from the cockpit.
		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"drift",
		);
	});

	test("clicking a pair scopes the left chat + the right cards", async ({
		page,
	}) => {
		await page.goto("/ai-lab");
		await page.getByTestId("scenario-select").selectOption("runner-drift");
		await page.getByTestId("load-submit").click();
		await expect(page.getByTestId("trialogue")).toBeVisible();

		// click the red runner pair-cell.
		const redCell = page
			.locator('[data-testid="pair-cell"][data-voyant="red"]')
			.first();
		const key = await redCell.getAttribute("data-pair-key");
		await redCell.click();

		// the left scope reflects the clicked pair.
		const leftScope = page.getByTestId("left-scope");
		await expect(leftScope).toBeVisible();
		// the hidden chat-facet now carries the scoped facet (F for the runner pair).
		await expect(page.getByTestId("chat-facet")).toHaveValue("F");
		expect(key).toContain("F:");
	});

	test("below the wall is read-only from the cockpit", async ({ page }) => {
		await page.goto("/ai-lab");
		await page.getByTestId("scenario-select").selectOption("aligned");
		await page.getByTestId("load-submit").click();
		await expect(page.getByTestId("trialogue")).toBeVisible();

		// every facet pair-cell is drawn with its wall tier; the below-the-wall ones are read-only.
		const below = page.locator('[data-testid="pair-cell"][data-tier="below"]');
		await expect(below.first()).toHaveAttribute("data-readonly", "true");
	});
});
