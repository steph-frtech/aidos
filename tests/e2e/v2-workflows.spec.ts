import { expect, test } from "@playwright/test";

/**
 * WB2-13 Playwright e2e — l'écran /v2/workflows/[wf] : un SCÉNARIO rendu en PIPELINE FKE-3 (étape · gate ·
 * décision) en React Flow (nœuds custom, pan/zoom). On AFFICHE le pipeline, on DÉPLACE un nœud — une
 * édition PROPOSÉE, jamais écrite (le mur §2). Réutilise les fixtures Operation DSL (WB2-12) via le twin pur.
 * mirror record: reflects=WB2-13-workflows, test_kind=e2e, cert_language=playwright, liveness=live,
 * authority=below (afficher/déplacer est une PROPOSITION de layout — le mur intact, aucune écriture).
 *
 * Les critères de done WB2-13, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - le PIPELINE s'affiche (React Flow, nœuds custom étape/gate/décision, composition comptée) ;
 *   - on DÉPLACE un nœud : l'édition PROPOSÉE (la nouvelle position s'affiche), RÉINITIALISABLE ;
 *   - LE MUR : aucune requête d'écriture (POST/PUT/PATCH/DELETE) — déplacer n'écrit aucune vérité.
 */

test.describe("WB2-13 /v2/workflows/[wf] — le pipeline FKE-3 (étape · gate · décision)", () => {
	test("le pipeline s'affiche, on déplace un nœud (édition proposée) ; jamais une écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/workflows/createOrder--happy");
		await expect(page.getByTestId("v2-wf-screen-title")).toBeVisible();
		await expect(page.getByTestId("v2-wf-wall-note")).toBeVisible();
		await expect(page.getByTestId("v2-wf-fixture-id")).toContainText(
			"createOrder/happy",
		);

		// Le PIPELINE (React Flow) est rendu, avec sa composition : un gate, une décision, des étapes.
		await expect(page.getByTestId("v2-wf-graph")).toBeVisible();
		await expect(page.getByTestId("v2-wf-count-gate")).toContainText("1");
		await expect(page.getByTestId("v2-wf-count-decision")).toContainText("1");
		await expect(page.getByTestId("v2-wf-count-step")).toContainText("5");

		// Au départ : aucun déplacement proposé (layout par défaut).
		const proposed = page.getByTestId("v2-wf-proposed-pos");
		await expect(proposed).toHaveAttribute("data-moved", "false");

		// DÉPLACER le nœud de DÉPART À LA SOURIS (drag React Flow) — l'édition proposée par interaction directe,
		// sur le layout fraîchement ajusté (fitView). On laisse React Flow se stabiliser avant de lire la box.
		const node = page.locator('.react-flow__node[data-id="w0"]');
		await expect(node).toBeVisible();
		await page.waitForTimeout(400);
		const box = await node.boundingBox();
		if (box) {
			const cx = box.x + box.width / 2;
			const cy = box.y + box.height / 2;
			await page.mouse.move(cx, cy);
			await page.mouse.down();
			// un premier petit nudge ARME le drag de React Flow, puis on déplace franchement.
			await page.mouse.move(cx + 8, cy + 8, { steps: 2 });
			await page.mouse.move(cx + 90, cy + 70, { steps: 12 });
			await page.mouse.move(cx + 150, cy + 90, { steps: 12 });
			await page.mouse.up();
		}
		// le drag a proposé un déplacement (un nœud a bougé) — non écrit.
		await expect(proposed).toHaveAttribute("data-moved", "true");

		// ÉDITION PROPOSÉE par bouton : déplacer le nœud de départ de façon DÉTERMINISTE (position reproductible).
		await page.getByTestId("v2-wf-propose-move").click();
		await expect(proposed).toHaveAttribute("data-moved", "true");
		await expect(proposed).toContainText("x=160");

		// RÉINITIALISER : retour au layout par défaut (aucune écriture n'a jamais eu lieu).
		await page.getByTestId("v2-wf-reset-move").click();
		await expect(proposed).toHaveAttribute("data-moved", "false");

		// LE MUR : aucune écriture (l'écran PROPOSE un layout, n'écrit jamais une vérité).
		expect(writes).toEqual([]);
	});

	test("un scénario refusé s'affiche aussi en pipeline branché (la branche deny → arrêt)", async ({
		page,
	}) => {
		await page.goto("/v2/workflows/createOrder--denied");
		await expect(page.getByTestId("v2-wf-fixture-id")).toContainText(
			"createOrder/denied",
		);
		// le pipeline branché est rendu : un gate + une décision (la branche deny mène à l'arrêt).
		await expect(page.getByTestId("v2-wf-graph")).toBeVisible();
		await expect(page.getByTestId("v2-wf-count-gate")).toContainText("1");
		await expect(page.getByTestId("v2-wf-count-decision")).toContainText("1");
	});
});
