import { expect, test } from "@playwright/test";

/**
 * WB2-12 Playwright e2e — l'écran /v2/operations/[op] : une fixture Operation DSL (S10)
 * `état → commande → events` rendue + EXÉCUTÉE comme machine XState (KRD §24.3, §93). On REJOUE la
 * fixture pas-à-pas, on voit les events apparaître, et on visualise le graphe d'états (React Flow).
 * mirror record: reflects=WB2-12-operations, test_kind=e2e, cert_language=playwright, liveness=live,
 * authority=below (rejouer une fixture est une LECTURE du comportement — le mur intact).
 *
 * Les critères de done WB2-12, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - REJOUER une fixture : on avance pas-à-pas, les events apparaissent dans l'ordre ;
 *   - les ÉTATS et les EVENTS sont VISIBLES (l'état de la machine, le graphe React Flow, les events) ;
 *   - DÉTERMINISTE : le verdict (events == attendus) est le même au rechargement ;
 *   - LE MUR : aucune requête d'écriture (POST/PUT/PATCH/DELETE) — rejouer n'écrit aucune vérité.
 */

test.describe("WB2-12 /v2/operations/[op] — rejouer une fixture état → commande → events", () => {
	test("on rejoue la fixture pas-à-pas, les events apparaissent ; jamais une écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/operations/createOrder--happy");
		await expect(page.getByTestId("v2-op-title")).toBeVisible();
		await expect(page.getByTestId("v2-op-wall-note")).toBeVisible();
		await expect(page.getByTestId("v2-op-fixture-id")).toContainText(
			"createOrder/happy",
		);

		// La machine démarre à l'état initial (idle), aucun event émis encore.
		await expect(page.getByTestId("v2-op-machine-state")).toContainText("idle");
		await expect(page.getByTestId("v2-op-no-events")).toBeVisible();

		// Le GRAPHE D'ÉTATS (React Flow) est rendu.
		await expect(page.getByTestId("v2-op-graph")).toBeVisible();

		// REJOUER PAS-À-PAS : avancer jusqu'au bout fait apparaître les events dans l'ordre.
		const step = page.getByTestId("v2-op-step");
		for (let i = 0; i < 6; i++) {
			if (await step.isEnabled()) {
				await step.click();
			}
		}

		// À la fin : la machine est `finished`, les deux events sont visibles dans l'ordre.
		await expect(page.getByTestId("v2-op-machine-state")).toContainText(
			"finished",
		);
		await expect(page.getByTestId("v2-op-event-0")).toContainText(
			"OrderCreated",
		);
		await expect(page.getByTestId("v2-op-event-1")).toContainText("CartCleared");

		// Le verdict : PASS (events == attendus dans l'ordre).
		await expect(page.getByTestId("v2-op-verdict")).toContainText("PASS");

		// RECOMMENCER → retour à l'état initial.
		await page.getByTestId("v2-op-restart").click();
		await expect(page.getByTestId("v2-op-machine-state")).toContainText("idle");
		await expect(page.getByTestId("v2-op-no-events")).toBeVisible();

		// LE MUR : aucune écriture (l'écran PROPOSE/lit, n'écrit jamais une vérité).
		expect(writes).toEqual([]);
	});

	test("REJOUER TOUT joue jusqu'au bout d'un coup ; une fixture refusée n'émet aucun event (le mur §93)", async ({
		page,
	}) => {
		await page.goto("/v2/operations/createOrder--denied");
		await expect(page.getByTestId("v2-op-fixture-id")).toContainText(
			"createOrder/denied",
		);

		// REJOUER TOUT : saute à la dernière frame (refusée).
		await page.getByTestId("v2-op-replay-all").click();
		await expect(page.getByTestId("v2-op-machine-state")).toContainText(
			"finished",
		);
		// le refus (authorize DENY) court-circuite : AUCUN event émis.
		await expect(page.getByTestId("v2-op-no-events")).toBeVisible();
		// le pas courant est `denied`.
		await expect(page.getByTestId("v2-op-current-step")).toContainText(
			"denied",
		);
	});
});
