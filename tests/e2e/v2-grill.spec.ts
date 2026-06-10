import { expect, test } from "@playwright/test";

/**
 * WB2-10 Playwright e2e — l'écran /v2/grill : le geste GRILL-WITH-DOCS (CLAUDE.md §6 phase 1) comme
 * wizard XState. Affûter une intention AVANT qu'elle n'approche le kernel : borner ses scénarios
 * (≤ 5, mandat A), affûter le langage, seed la doc. Sortie = intention affûtée + ADRs candidats.
 * mirror record: reflects=WB2-10-grill, test_kind=e2e, cert_language=playwright, liveness=live,
 * authority=above (geste au-dessus du mur, PROPOSE — le mur intact).
 *
 * Les critères de done WB2-10, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - PARCOURS GRILL COMPLET : intention → scénarios → revue → AFFÛTER → intention affûtée ;
 *   - STEPPER shadcn : les quatre étapes visibles, l'étape active marquée ;
 *   - le langage AFFÛTÉ (« feature » → « cellule », « bdd » → « miroir ») + ADRs candidats ;
 *   - le verdict CALCULÉ (sharp) ;
 *   - LE MUR : hasMirror=false, wroteKernel=false, aucune requête d'écriture (POST/PUT/PATCH/DELETE) ;
 *   - DÉTERMINISTE : même parcours → même empreinte au rechargement.
 */

test.describe("WB2-10 /v2/grill — le geste grill-with-docs (wizard XState)", () => {
	test("parcours grill complet → intention affûtée + ADRs candidats ; jamais une écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/grill");
		await expect(page.getByTestId("v2-grill-title")).toBeVisible();
		await expect(page.getByTestId("v2-grill-wall-note")).toBeVisible();

		// STEPPER : les quatre étapes, l'étape active = intention.
		const stepper = page.getByTestId("v2-grill-stepper");
		await expect(stepper).toHaveAttribute("data-state", "intention");

		// 1 · L'INTENTION (avec deux termes ambigus à affûter).
		await page
			.getByTestId("v2-grill-intent")
			.fill("Conduire le grill comme une feature affûtée, prouvée en bdd");
		await page.getByTestId("v2-grill-next").click();
		await expect(stepper).toHaveAttribute("data-state", "scenarios");

		// 2 · LES SCÉNARIOS (≤ 5) : ajouter un scénario complet.
		await page.getByTestId("v2-grill-add-scenario").click();
		await page
			.getByTestId("v2-grill-given-0")
			.fill("une intention floue saisie au grill");
		await page
			.getByTestId("v2-grill-when-0")
			.fill("j'affûte le langage et borne les scénarios");
		await page
			.getByTestId("v2-grill-then-0")
			.fill("j'obtiens une intention affûtée sans écrire de vérité");
		await expect(page.getByTestId("v2-grill-scenario-count")).toContainText(
			"1 / 5",
		);
		await page.getByTestId("v2-grill-next").click();
		await expect(stepper).toHaveAttribute("data-state", "revue");

		// 3 · REVUE → AFFÛTER (le geste : appelle le twin pur).
		await page.getByTestId("v2-grill-sharpen").click();
		await expect(stepper).toHaveAttribute("data-state", "affutee");

		// L'INTENTION AFFÛTÉE : verdict sharp, langage affûté.
		const sharpened = page.getByTestId("v2-grill-sharpened");
		await expect(sharpened).toHaveAttribute("data-verdict", "sharp");
		await expect(page.getByTestId("v2-grill-sharpened-intent")).toContainText(
			"cellule",
		);
		await expect(page.getByTestId("v2-grill-sharpened-intent")).toContainText(
			"miroir",
		);

		// Les ADRs candidats (un par terme affûté : feature → cellule, bdd → miroir).
		await expect(page.getByTestId("v2-grill-adrs")).toBeVisible();
		await expect(
			page.getByTestId("v2-grill-adr-adopter-cellule"),
		).toBeVisible();
		await expect(page.getByTestId("v2-grill-adr-adopter-miroir")).toBeVisible();

		// La seed de doc (deux pages Mintlify).
		await expect(page.getByTestId("v2-grill-doc-seed")).toContainText(
			"steps/concept/wb2-10-grill.mdx",
		);
		await expect(page.getByTestId("v2-grill-doc-seed")).toContainText(
			"steps/internals/wb2-10-grill.mdx",
		);

		// LE MUR : aucune écriture-vérité.
		await expect(page.getByTestId("v2-grill-has-mirror")).toContainText(
			"false",
		);
		await expect(page.getByTestId("v2-grill-wrote-kernel")).toContainText(
			"false",
		);
		expect(writes).toEqual([]);
	});

	test("DÉTERMINISTE : même parcours → même empreinte au rechargement", async ({
		page,
	}) => {
		const runJourney = async () => {
			await page.goto("/v2/grill");
			await page.getByTestId("v2-grill-intent").fill("affûter une feature");
			await page.getByTestId("v2-grill-next").click();
			await page.getByTestId("v2-grill-add-scenario").click();
			await page.getByTestId("v2-grill-given-0").fill("un cas");
			await page.getByTestId("v2-grill-when-0").fill("une action");
			await page.getByTestId("v2-grill-then-0").fill("un résultat");
			await page.getByTestId("v2-grill-next").click();
			await page.getByTestId("v2-grill-sharpen").click();
			await expect(page.getByTestId("v2-grill-hash")).toBeVisible();
			return await page.getByTestId("v2-grill-hash").textContent();
		};

		const h1 = await runJourney();
		const h2 = await runJourney();
		expect(h1).toBe(h2);
		expect(h1).not.toBeNull();
	});
});
