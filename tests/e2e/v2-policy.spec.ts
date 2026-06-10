import { expect, test } from "@playwright/test";

/**
 * WB2-14 Playwright e2e — l'écran /v2/policy/[policy] : une POLICY rendue comme un ARBRE RÉCURSIF
 * ALLOW/DENY (combinateurs all/any/not) en React Arborist. On DÉPLIE l'arbre, on CHOISIT un contexte
 * d'exemple → l'arbre est ÉVALUÉ (chaque nœud HOLD/FAIL) et la décision §93 calculée. Réutilise
 * l'évaluateur S09 (lib/policy.ts) via le twin pur lib/v2/policy.ts.
 * mirror record: reflects=WB2-14-policy, test_kind=e2e, cert_language=playwright, liveness=live,
 * authority=below (afficher/évaluer est une lecture — le mur intact, aucune écriture de kernel).
 *
 * Les critères de done WB2-14, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - l'ARBRE se déplie (React Arborist, combinateurs + feuilles, scope/effet affichés) ;
 *   - un CAS ÉVALUE : on choisit un contexte → la décision §93 (ALLOW/DENY) et chaque nœud HOLD/FAIL ;
 *   - la loi DENY DOMINE : une policy DENY bloque dès que sa règle tient ;
 *   - LE MUR : aucune requête d'écriture (POST/PUT/PATCH/DELETE) — évaluer n'écrit aucune vérité.
 */

test.describe("WB2-14 /v2/policy/[policy] — l'arbre de règles ALLOW/DENY (all · any · not)", () => {
	test("l'arbre se déplie ; un contexte évalue → décision ALLOW, nœuds HOLD/FAIL ; jamais une écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/policy/canPlaceOrder");
		await expect(page.getByTestId("v2-policy-screen-title")).toBeVisible();
		await expect(page.getByTestId("v2-policy-wall-note")).toBeVisible();
		await expect(page.getByTestId("v2-policy-name")).toContainText("canPlaceOrder");

		// L'en-tête : scope OPERATION, effet ALLOW, composition (1 combinateur + 3 feuilles).
		await expect(page.getByTestId("v2-policy-scope")).toContainText("OPERATION");
		await expect(page.getByTestId("v2-policy-effect")).toContainText("ALLOW");
		await expect(page.getByTestId("v2-policy-count-combinators")).toContainText("1");
		await expect(page.getByTestId("v2-policy-count-leaves")).toContainText("3");

		// L'ARBRE est rendu et DÉPLIÉ (openByDefault) : la racine `all` (p0) + ses enfants (p0.0…).
		await expect(page.getByTestId("v2-policy-tree")).toBeVisible();
		await expect(page.getByTestId("v2-policy-node-p0")).toBeVisible();
		await expect(page.getByTestId("v2-policy-node-p0.0")).toBeVisible();

		// REPLIER la racine puis la REDÉPLIER (le drill-down de l'arbre).
		await page.getByTestId("v2-policy-toggle-p0").click();
		await expect(page.getByTestId("v2-policy-node-p0.0")).toHaveCount(0);
		await page.getByTestId("v2-policy-toggle-p0").click();
		await expect(page.getByTestId("v2-policy-node-p0.0")).toBeVisible();

		// Avant évaluation : aucune décision affichée.
		await expect(page.getByTestId("v2-policy-decision")).toHaveCount(0);

		// ÉVALUER : choisir le contexte « utilisateur connecté, panier non vide » → ALLOW.
		await page.getByTestId("v2-policy-sample-allow-authed-matching-cart").click();
		const decision = page.getByTestId("v2-policy-decision");
		await expect(decision).toBeVisible();
		await expect(decision).toHaveAttribute("data-decision", "ALLOW");
		// l'arbre est tracé : la racine `all` TIENT (HOLD).
		await expect(page.getByTestId("v2-policy-node-p0")).toHaveAttribute(
			"data-held",
			"true",
		);

		// CHANGER de contexte : « panier vide » → DENY (la règle gt(items.length, 0) échoue).
		await page.getByTestId("v2-policy-sample-deny-empty-cart").click();
		await expect(decision).toHaveAttribute("data-decision", "DENY");
		await expect(page.getByTestId("v2-policy-node-p0")).toHaveAttribute(
			"data-held",
			"false",
		);
		// le nœud gt (la 3e feuille, p0.2) ÉCHOUE.
		await expect(page.getByTestId("v2-policy-node-p0.2")).toHaveAttribute(
			"data-held",
			"false",
		);

		// LE MUR : aucune écriture (l'écran AFFICHE et ÉVALUE, n'écrit jamais une vérité).
		expect(writes).toEqual([]);
	});

	test("une policy DENY (scope FIELD, any/not) : DENY DOMINE — le cas secret bloque", async ({
		page,
	}) => {
		await page.goto("/v2/policy/denySecretField");
		await expect(page.getByTestId("v2-policy-name")).toContainText(
			"denySecretField",
		);
		await expect(page.getByTestId("v2-policy-scope")).toContainText("FIELD");
		await expect(page.getByTestId("v2-policy-effect")).toContainText("DENY");

		// l'arbre any se déplie.
		await expect(page.getByTestId("v2-policy-node-p0")).toBeVisible();

		// le cas « champ secret » → DENY (la règle interdite fire, un DENY bloque, §93).
		await page.getByTestId("v2-policy-sample-deny-secret-field").click();
		await expect(page.getByTestId("v2-policy-decision")).toHaveAttribute(
			"data-decision",
			"DENY",
		);
		// le cas ordinaire → ALLOW (aucune règle DENY ne fire).
		await page.getByTestId("v2-policy-sample-allow-ordinary-field").click();
		await expect(page.getByTestId("v2-policy-decision")).toHaveAttribute(
			"data-decision",
			"ALLOW",
		);
	});
});
