import { expect, test } from "@playwright/test";

/**
 * FK11 Playwright e2e — the « AI Lab » Workbench panel (FKE-38, corrected: the chat acts on ALL
 * levels; the left brain decides where to place each spec).
 * mirror record: reflects=FK11-ai-lab, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves /ai-lab is action-capable (ui-completeness, CLAUDE.md §7): a two-pane CONVERSATION wired
 * to the real left brain (Claude), with a deterministic fallback.
 *   - GAUCHE — a multi-turn chat: a message adds a user turn + a left-brain reply.
 *   - DROITE — the VERTICALE (7 levels): the specs the intelligence PLACED, grouped by level.
 *   - a DIRECT TRUTH-WRITE is REFUSED at the wall (§2), before any LLM call (deterministic).
 *
 * THE WALL (§2): the chat proposes; placements are clamped to the declared space, never written to
 * truth. The brain-mode badge says whether the real Claude (llm) or the twin (fallback) answered.
 */

test.describe("FK11 — the AI Lab (chat acts on all levels)", () => {
	test("renders the two panes: the chat thread + the verticale", async ({
		page,
	}) => {
		await page.goto("/ai-lab");
		await expect(
			page.getByRole("heading", { level: 1, name: /ai lab/i }),
		).toBeVisible();
		await expect(page.getByTestId("thread")).toBeVisible();
		await expect(page.getByTestId("turn-assistant").first()).toBeVisible(); // greeting
		await expect(page.getByTestId("chat")).toBeVisible();
		await expect(page.getByTestId("generate")).toBeVisible();
		// the verticale: the 7 levels are present (produit → entité).
		await expect(page.getByTestId("level-level_produit")).toBeVisible();
		await expect(page.getByTestId("level-level_entite")).toBeVisible();
	});

	test("discussing places specs across the verticale (user turn + reply + placements)", async ({
		page,
	}) => {
		test.setTimeout(120_000); // the real left brain (Claude) may take a while
		await page.goto("/ai-lab");
		await page
			.getByTestId("chat")
			.fill(
				"quand le panier expire au bout de 30 minutes, prévenir l'utilisateur et libérer le stock",
			);
		await page.getByTestId("generate").click();

		// the conversation grew + the left-brain mode is shown.
		await expect(page.getByTestId("turn-user")).toHaveText(/panier/);
		await expect(page.getByTestId("turn-assistant").last()).toBeVisible({
			timeout: 110_000,
		});
		await expect(page.getByTestId("brain-mode")).toBeVisible();

		// at least one spec was placed somewhere on the verticale.
		await expect(page.getByTestId("spec-count")).not.toContainText("0");
	});

	test("a direct truth-write is REFUSED at the wall (§2) — no LLM call, no placement", async ({
		page,
	}) => {
		await page.goto("/ai-lab");
		await page
			.getByTestId("chat")
			.fill("écris la vérité dans le kernel maintenant");
		await page.getByTestId("generate").click();

		await expect(page.getByTestId("wall-refused")).toBeVisible();
		await expect(page.getByTestId("spec-count")).toContainText("0");
	});
});
