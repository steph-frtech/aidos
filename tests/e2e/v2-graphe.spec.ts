import { expect, test } from "@playwright/test";

/**
 * WB2-18 Playwright e2e — l'écran /v2/graphe : le GRAPHE 3D façon Obsidian. Chaque spec (placée) +
 * chaque spec du DAG existant est un NŒUD sur 3 axes (x = niveau, y = facette, z = profondeur
 * d'anatomie). Les liens = la descente + l'impact. Les couleurs portent l'état (proposé/validé/
 * réalisé ; impacté/résolu). La donnée est `buildSpecGraph` (réutilisé de v1, ADR 0007) via le twin
 * pur lib/v2/ai-lab.ts — positions déterministes.
 * mirror record: reflects=WB2-18-graphe, test_kind=e2e, cert_language=playwright, liveness=live,
 * authority=below (le graphe LIT et PROPOSE — le mur intact, aucune écriture de kernel).
 *
 * Les critères de done WB2-18, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - le GRAPHE MONTE (le canvas WebGL apparaît, les nœuds sont présents) ;
 *   - il TOURNE / ZOOME (glisser + molette n'erreurent pas, le canvas reste) ;
 *   - la VAGUE DE ROUGE : au placement le DAG impacté est ROUGE → « Valider tout » → VERT (résolu) ;
 *   - LE MUR : aucune requête d'écriture (POST/PUT/PATCH/DELETE) — le graphe n'écrit aucune vérité.
 */

test.describe("WB2-18 /v2/graphe — le graphe 3D façon Obsidian", () => {
	test("le graphe monte, tourne/zoome ; la vague de rouge se résout ; aucune écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/graphe");
		await expect(page.getByTestId("v2-graphe-wall-note")).toBeVisible();
		await expect(page.getByTestId("v2-graphe")).toBeVisible();

		// CHOISIR le besoin « tunnel de paiement » → ses specs + le DAG existant + sa vague de rouge montent.
		await page.getByTestId("v2-graphe-sample-checkout-multi").click();

		// LE GRAPHE MONTE : le conteneur porte un nombre de nœuds > 0, et un <canvas> WebGL apparaît.
		const container = page.getByTestId("v2-graphe-3d");
		await expect(container).toBeVisible();
		const nodeCount = Number(await container.getAttribute("data-node-count"));
		expect(nodeCount).toBeGreaterThan(0);
		const canvas = container.locator("canvas");
		await expect(canvas.first()).toBeVisible({ timeout: 15000 });

		// le résumé (tally) : des specs placées, des specs du DAG, des impactées (la vague de rouge).
		const tally = page.getByTestId("v2-graphe-tally");
		const impacted = Number(await tally.getAttribute("data-impacted"));
		const resolvedBefore = Number(await tally.getAttribute("data-resolved"));
		expect(impacted).toBeGreaterThan(0);
		expect(resolvedBefore).toBe(0); // au placement : rien de résolu → tout rouge.
		await expect(page.getByTestId("v2-graphe")).toHaveAttribute(
			"data-all-green",
			"false",
		);

		// IL TOURNE / ZOOME : glisser sur le canvas (rotation) puis molette (zoom) — sans erreur.
		const box = await canvas.first().boundingBox();
		expect(box).not.toBeNull();
		if (box) {
			const cx = box.x + box.width / 2;
			const cy = box.y + box.height / 2;
			await page.mouse.move(cx, cy);
			await page.mouse.down();
			await page.mouse.move(cx + 80, cy + 40, { steps: 8 });
			await page.mouse.move(cx + 120, cy - 20, { steps: 8 });
			await page.mouse.up();
			await page.mouse.wheel(0, -240); // zoom in
			await page.mouse.wheel(0, 160); // zoom out
		}
		// le canvas est toujours là après rotation/zoom (le graphe n'a pas planté).
		await expect(canvas.first()).toBeVisible();

		// VALIDER TOUT → la vague de rouge se RÉSOUT (rouge → vert) — le même verdict que liste/grille.
		await page.getByTestId("v2-graphe-validate-all").click();
		await expect(page.getByTestId("v2-graphe")).toHaveAttribute(
			"data-all-green",
			"true",
		);
		await expect(tally).toHaveAttribute("data-resolved", String(impacted));
		await expect(page.getByTestId("v2-graphe-validate-all")).toBeDisabled();
		// le canvas est toujours monté après la résolution.
		await expect(canvas.first()).toBeVisible();

		// RÉINITIALISER : la vague de rouge revient (rouge à nouveau).
		await page.getByTestId("v2-graphe-reset").click();
		await expect(page.getByTestId("v2-graphe")).toHaveAttribute(
			"data-all-green",
			"false",
		);

		// LE MUR : afficher/tourner/résoudre le graphe n'écrit AUCUNE vérité (aucune requête d'écriture).
		expect(writes).toEqual([]);
	});
});
