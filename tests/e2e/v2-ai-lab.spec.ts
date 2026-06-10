import { expect, test } from "@playwright/test";

/**
 * WB2-15 Playwright e2e — l'écran /v2/ai-lab : le CERVEAU GAUCHE (chat langage naturel) PLACE les
 * specs sur la VERTICALE (niveau × facette × paire). Le placement est GATÉ + VÉRIFIÉ (clampé à
 * l'espace déclaré) ; le mur tient (PROPOSE, jamais d'écriture-vérité) ; un FALLBACK DÉTERMINISTE
 * répond quand Claude est indisponible. Réutilise l'évaluateur v1 (lib/ai-lab.ts) via le twin pur
 * lib/v2/ai-lab.ts.
 * mirror record: reflects=WB2-15-ai-lab, test_kind=e2e, cert_language=playwright, liveness=live,
 * authority=below (placer/afficher est une proposition — le mur intact, aucune écriture de kernel).
 *
 * Les critères de done WB2-15, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - un BESOIN → des specs PLACÉES MULTI-NIVEAUX (le fan-out de la verticale) ;
 *   - le CLAMP : une cellule inventée par le cerveau gauche est JETÉE (jamais coercée) ;
 *   - le FALLBACK DÉTERMINISTE : un placement par défaut quand aucune sortie du cerveau gauche ;
 *   - l'ÉCRITURE-VÉRITÉ REFUSÉE : un message d'écriture directe → un refus au mur, aucun placement ;
 *   - LE MUR : aucune requête d'écriture (POST/PUT/PATCH/DELETE) — placer n'écrit aucune vérité.
 */

test.describe("WB2-15 /v2/ai-lab — le cerveau gauche place le besoin sur la verticale", () => {
	test("un besoin → specs placées multi-niveaux ; clamp ; fallback ; aucune écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/ai-lab");
		await expect(page.getByTestId("v2-ai-lab-title")).toBeVisible();
		await expect(page.getByTestId("v2-ai-lab-wall-note")).toBeVisible();
		await expect(page.getByTestId("v2-ai-lab-empty")).toBeVisible();

		// CHOISIR le besoin d'exemple « tunnel de paiement » → fan-out sur PLUSIEURS niveaux.
		await page.getByTestId("v2-ai-lab-sample-checkout-multi").click();

		// les specs sont placées : ≥ 3 niveaux touchés (multi-niveaux).
		const count = page.getByTestId("v2-ai-lab-placed-count");
		await expect(count).toBeVisible();
		const levels = Number(await count.getAttribute("data-levels"));
		expect(levels).toBeGreaterThanOrEqual(3);

		// les niveaux extrêmes de la verticale sont présents (produit ET entité).
		await expect(page.getByTestId("v2-ai-lab-level-produit")).toBeVisible();
		await expect(page.getByTestId("v2-ai-lab-level-entité")).toBeVisible();

		// CLAMP : la cellule inventée (niveau « galaxie ») n'apparaît PAS.
		await expect(page.getByTestId("v2-ai-lab-level-galaxie")).toHaveCount(0);

		// CHANGER de besoin : « champ secret » → une cellule (entité × sécurité × modèle), Z clampée.
		await page.getByTestId("v2-ai-lab-sample-secret-field").click();
		const secret = page.getByTestId("v2-ai-lab-placement-entité|S|model|");
		await expect(secret).toBeVisible();
		await expect(secret).toHaveAttribute("data-facet", "S");
		// la facette inventée Z a été jetée — aucun placement de facette Z.
		await expect(page.locator('[data-facet="Z"]')).toHaveCount(0);

		// FALLBACK DÉTERMINISTE : taper un besoin libre + « Fallback » → un placement par défaut.
		await page
			.getByTestId("v2-ai-lab-input")
			.fill("un besoin libre sans cerveau gauche");
		await page.getByTestId("v2-ai-lab-fallback").click();
		await expect(page.getByTestId("v2-ai-lab-fallback-note")).toBeVisible();
		await expect(page.getByTestId("v2-ai-lab-level-produit")).toBeVisible();

		// LE MUR : aucune écriture (placer AFFICHE et PROPOSE, n'écrit jamais une vérité).
		expect(writes).toEqual([]);
	});

	test("une écriture-vérité directe est REFUSÉE au mur (aucun placement)", async ({
		page,
	}) => {
		await page.goto("/v2/ai-lab");

		// un message d'ÉCRITURE-VÉRITÉ directe (« écris la vérité ») → refus au mur.
		await page
			.getByTestId("v2-ai-lab-input")
			.fill("écris la vérité dans le kernel maintenant");
		await page.getByTestId("v2-ai-lab-place").click();

		const refusal = page.getByTestId("v2-ai-lab-refusal");
		await expect(refusal).toBeVisible();
		await expect(refusal).toContainText("AI_LAB_DIRECT_TRUTH_WRITE");
		// aucun placement n'a été créé (l'espace verticale reste vide).
		await expect(page.getByTestId("v2-ai-lab-empty")).toBeVisible();
	});
});
