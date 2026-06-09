import { expect, test } from "@playwright/test";

/**
 * S108 Playwright e2e — the « boucle médiane par projet » Workbench panel (EPIC 12 / E12).
 * mirror record: reflects=S108-project-evolve, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves /project-evolve is action-capable (ui-completeness law, CLAUDE.md §7): controls are
 * reachable AND executable from the screen, bound to the REAL pure medium-loop engine
 * (lib/project-evolve, the TS twin of back/archive/projectevolve). The S108 done-criteria, all
 * reached from the screen:
 *
 *   1. « une variante cassant le miroir est tuée » — the break-mirror toggle flips v-broken to
 *      red; it appears in the « tuées » list and is NEVER an élite (despite its higher fitness).
 *   2. « une élite verte n'est promouvable qu'avec approbation » — Promote without authority is
 *      refused; with authority it is proposed.
 *   3. « la sandbox ne peut écrire de vérité » — a promotion is a PROPOSAL (writes no truth).
 *
 * THE WALL (CLAUDE.md §2): the screen only RENDERS values; promotion is a PROPOSAL, never a truth
 * write. The Judge is the deterministic mirror, never an LLM.
 */

test.describe("S108 — per-project medium loop (/evolve + QD)", () => {
	test("the route renders the controls and the Pareto niches", async ({
		page,
	}) => {
		await page.goto("/project-evolve");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Boucle médiane|Medium loop/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("break-mirror-toggle")).toBeVisible();
		await expect(page.getByTestId("grant-authority-toggle")).toBeVisible();
		// By default v-broken (higher fitness, green) is the élite of createOrder/fast.
		await expect(page.getByTestId("niche-v-broken")).toBeVisible();
	});

	test("a variant breaking the mirror is killed and never an élite", async ({
		page,
	}) => {
		await page.goto("/project-evolve");
		// Break v-broken's mirror → it must be killed and NEVER the élite (despite fitness 0.99).
		await page.getByTestId("break-mirror-toggle").check();
		await expect(page.getByTestId("killed-v-broken")).toBeVisible();
		await expect(page.getByTestId("niche-v-broken")).toHaveCount(0);
		// The green v-fast survives as the niche élite instead.
		await expect(page.getByTestId("niche-v-fast")).toBeVisible();
	});

	test("a green élite is promotable only with authority — and only as a proposal", async ({
		page,
	}) => {
		await page.goto("/project-evolve");
		// Promote without authority → refused.
		await page.getByTestId("promote-v-broken").click();
		await expect(page.getByTestId("promote-verdict")).toHaveText("refused");

		// Grant authority, promote again → proposed, and it writes NO truth.
		await page.getByTestId("grant-authority-toggle").check();
		await page.getByTestId("promote-v-broken").click();
		await expect(page.getByTestId("promote-verdict")).toHaveText("proposed");
		await expect(page.getByTestId("promote-wall")).toContainText(
			/PROPOSAL|PROPOSITION/,
		);
	});
});
