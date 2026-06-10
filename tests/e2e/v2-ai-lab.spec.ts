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

	// WB2-16 — la DESCENTE de l'anatomie : valider une spec → la paire suivante, chaîner jusqu'au bout.
	test("WB2-16 : la descente chaîne Spec→…→Evidence, la dernière paire est RÉALISÉE (aucune écriture)", async ({
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

		// poser une cellule racine (spec seule) via le fallback déterministe : produit · F · spec.
		await page.getByTestId("v2-ai-lab-input").fill("Un besoin à descendre");
		await page.getByTestId("v2-ai-lab-fallback").click();

		const rootSpec = page.getByTestId("v2-ai-lab-placement-produit|F|spec|");
		await expect(rootSpec).toBeVisible();
		await expect(rootSpec).toHaveAttribute("data-status", "proposed");

		// DESCENDRE l'anatomie : Spec → Comportement → Scénarios → Modèle → Contrat → Evidence.
		// On clique « Valider ↓ » sur chaque paire jusqu'à evidence ; à evidence on clique « Réaliser ✓ ».
		const pairs = ["spec", "behavior", "scenarios", "model", "contract"];
		for (const pair of pairs) {
			await page.getByTestId(`v2-ai-lab-descend-produit|F|${pair}|`).click();
			// le parent passe à VALIDÉ ; la paire suivante apparaît (proposée).
			await expect(
				page.getByTestId(`v2-ai-lab-placement-produit|F|${pair}|`),
			).toHaveAttribute("data-status", "validated");
		}

		// la dernière paire (evidence) est apparue : la RÉALISER.
		const evidence = page.getByTestId(
			"v2-ai-lab-placement-produit|F|evidence|",
		);
		await expect(evidence).toBeVisible();
		await page.getByTestId("v2-ai-lab-descend-produit|F|evidence|").click();
		// la descente est RÉALISÉE : evidence porte le statut « realized ».
		await expect(evidence).toHaveAttribute("data-status", "realized");
		await expect(
			page.getByTestId("v2-ai-lab-status-produit|F|evidence|"),
		).toContainText("RÉALISÉ");

		// les 6 paires de l'anatomie sont présentes dans la cellule.
		for (const pair of [...pairs, "evidence"]) {
			await expect(
				page.getByTestId(`v2-ai-lab-placement-produit|F|${pair}|`),
			).toBeVisible();
		}

		// LE MUR : descendre l'anatomie n'écrit AUCUNE vérité (aucune requête d'écriture).
		expect(writes).toEqual([]);
	});

	// WB2-17 — la VAGUE DE ROUGE : les specs EXISTANTES impactées (rouge) → résolution (rouge → vert)
	// quand le besoin est validé. Le critère de done : valider TOUT → tout le rouge passe vert.
	test("WB2-17 : le besoin impacte des specs existantes (rouge) ; valider tout → tout passe vert (aucune écriture)", async ({
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

		// CHOISIR le besoin « tunnel de paiement » → il PLACE des specs ET impacte des specs existantes.
		await page.getByTestId("v2-ai-lab-sample-checkout-multi").click();

		// la vague de rouge apparaît : les specs existantes impactées sont listées.
		const impacts = page.getByTestId("v2-ai-lab-impacts");
		await expect(impacts).toBeVisible();
		// AU PLACEMENT (rien de validé) : TOUTES les specs impactées sont ROUGES.
		await expect(impacts).toHaveAttribute("data-all-green", "false");
		const tally = page.getByTestId("v2-ai-lab-impact-tally");
		const greenBefore = Number(await tally.getAttribute("data-green"));
		const redBefore = Number(await tally.getAttribute("data-red"));
		expect(greenBefore).toBe(0);
		expect(redBefore).toBeGreaterThan(0);

		// CLAMP : l'id inventé « d-inexistant-ghost » n'apparaît PAS dans la vague de rouge.
		await expect(
			page.getByTestId("v2-ai-lab-impact-d-inexistant-ghost"),
		).toHaveCount(0);

		// chaque ligne d'impact porte le voyant ROUGE (non résolu).
		const rowCount = await page
			.locator('[data-testid^="v2-ai-lab-impact-d-"]')
			.count();
		expect(rowCount).toBe(redBefore);
		for (const el of await page
			.locator('[data-testid^="v2-ai-lab-impact-d-"]')
			.all()) {
			await expect(el).toHaveAttribute("data-voyant", "red");
		}

		// VALIDER TOUT → la RÉSOLUTION : tout le rouge passe au VERT (rouge → vert).
		await page.getByTestId("v2-ai-lab-validate-all").click();

		await expect(impacts).toHaveAttribute("data-all-green", "true");
		await expect(tally).toHaveAttribute("data-red", "0");
		await expect(tally).toHaveAttribute("data-green", String(redBefore));
		// chaque ligne d'impact est maintenant VERTE (résolue) — consistant partout.
		for (const el of await page
			.locator('[data-testid^="v2-ai-lab-impact-d-"]')
			.all()) {
			await expect(el).toHaveAttribute("data-voyant", "green");
		}
		// le bouton « Valider tout » est désormais désactivé (plus rien à résoudre).
		await expect(page.getByTestId("v2-ai-lab-validate-all")).toBeDisabled();

		// LE MUR : résoudre la vague de rouge n'écrit AUCUNE vérité (aucune requête d'écriture).
		expect(writes).toEqual([]);
	});
});
