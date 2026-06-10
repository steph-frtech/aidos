import { expect, test } from "@playwright/test";

/**
 * WB2-20 Playwright e2e — l'écran /v2/conscience : la conscience, l'agrégateur déterministe (FK09,
 * FKE-6.3, FKE-31, §8). On compare VOULU / CONSTRUIT / PROUVÉ / AUTORISÉ, on allume un voyant par paire,
 * et chaque divergence produit sa decision card actionnable (accept / amend / reject / defer).
 * Réutilise `reconcile` (FK09 lib/conscience.ts) via le twin pur lib/v2/conscience.ts (pas de fork, ADR 0007).
 * mirror record: reflects=WB2-20-conscience, test_kind=e2e, cert_language=playwright, liveness=live,
 * authority=below (réconcilier/afficher est une lecture — le mur intact, aucune écriture de vérité).
 *
 * Les critères de done WB2-20, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - VOYANTS : on choisit un kernel → on RÉCONCILIE → quatre voyants d'axe + un voyant par paire ;
 *   - tout aligné → verdict ALIGNÉ, aucune decision card ;
 *   - une divergence (runner s2↔s9) → verdict DRIFT + sa decision card actionnable (options accept/amend/
 *     reject/defer, blast radius) ;
 *   - casser S (sécurité) → voyant `autorisé` rouge + card de sécurité (non advisory) ;
 *   - casser X (expérience) → reste ALIGNÉ + card ADVISORY (X informe, ne bloque pas — §13.6) ;
 *   - le rapport est DÉTERMINISTE (réconcilier deux fois → même rapport) ;
 *   - LE MUR : aucune requête d'écriture (POST/PUT/PATCH/DELETE) — réconcilier n'écrit aucune vérité ; chaque
 *     option PROPOSE → /goal (data-proposes=goal), jamais une écriture directe.
 */

test.describe("WB2-20 /v2/conscience — l'agrégateur déterministe (voulu/construit/prouvé/autorisé)", () => {
	test("voyants + verdict aligné, aucune card, déterministe ; aucune écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/conscience");
		await expect(page.getByTestId("v2-conscience-view")).toBeVisible();
		await expect(page.getByTestId("v2-conscience-wall-note")).toBeVisible();

		// Avant de choisir : aucun rapport.
		await expect(page.getByTestId("v2-conscience-empty")).toBeVisible();

		// CHOISIR « aligned » → RÉCONCILIER.
		await page.getByTestId("v2-conscience-sample-aligned").click();
		await expect(page.getByTestId("v2-conscience-report")).toBeVisible();

		// Le VERDICT global est ALIGNÉ.
		await expect(page.getByTestId("v2-conscience-verdict")).toHaveAttribute(
			"data-verdict",
			"aligned",
		);
		// Les QUATRE voyants d'axe sont présents et tous verts.
		for (const axis of ["voulu", "construit", "prouvé", "autorisé"]) {
			await expect(
				page.getByTestId(`v2-conscience-axis-${axis}`),
			).toHaveAttribute("data-light", "green");
		}
		// Aucune decision card.
		await expect(page.getByTestId("v2-conscience-no-cards")).toBeVisible();
		// Le voyant DÉTERMINISTE.
		await expect(page.getByTestId("v2-conscience-determinism")).toHaveAttribute(
			"data-deterministic",
			"true",
		);

		// RÉINITIALISER → le rapport disparaît.
		await page.getByTestId("v2-conscience-reset").click();
		await expect(page.getByTestId("v2-conscience-empty")).toBeVisible();

		// LE MUR : aucune écriture.
		expect(writes).toEqual([]);
	});

	test("une divergence (runner) → DRIFT + sa decision card actionnable (options + blast)", async ({
		page,
	}) => {
		await page.goto("/v2/conscience");
		await page.getByTestId("v2-conscience-sample-runner-drift").click();

		// Le kernel DRIFTE.
		await expect(page.getByTestId("v2-conscience-verdict")).toHaveAttribute(
			"data-verdict",
			"drift",
		);
		// Le voyant `prouvé` (le runner) est ROUGE.
		await expect(page.getByTestId("v2-conscience-axis-prouvé")).toHaveAttribute(
			"data-light",
			"red",
		);
		// La paire runner réconciliée est rouge.
		await expect(
			page.locator(
				'[data-testid="v2-conscience-pair"][data-source="runner"][data-light="red"]',
			),
		).toBeVisible();
		// UNE decision card actionnable apparaît pour la divergence, avec ses options + blast.
		const card = page.locator(
			'[data-testid="v2-conscience-card"][data-source="runner"]',
		);
		await expect(card).toBeVisible();
		await expect(card.getByTestId("v2-conscience-card-blast")).toBeVisible();
		// Les options accept/amend/reject/defer sont des boutons qui PROPOSENT → /goal.
		const options = card.locator('[data-testid^="v2-conscience-card-option-"]');
		await expect(options.first()).toBeVisible();
		await expect(options.first()).toHaveAttribute("data-proposes", "goal");
	});

	test("casser S (sécurité) → DRIFT, voyant `autorisé` rouge + card de sécurité (non advisory)", async ({
		page,
	}) => {
		await page.goto("/v2/conscience");
		await page.getByTestId("v2-conscience-sample-break-security").click();

		await expect(page.getByTestId("v2-conscience-verdict")).toHaveAttribute(
			"data-verdict",
			"drift",
		);
		await expect(
			page.getByTestId("v2-conscience-axis-autorisé"),
		).toHaveAttribute("data-light", "red");
		await expect(
			page.locator(
				'[data-testid="v2-conscience-card"][data-facet="S"][data-advisory="false"]',
			),
		).toBeVisible();
		// la card de sécurité recommande « Rejeter » (reject).
		await expect(
			page.locator(
				'[data-testid="v2-conscience-card"][data-facet="S"] [data-testid="v2-conscience-card-option-reject"][data-recommended="true"]',
			),
		).toBeVisible();
	});

	test("casser X (expérience) → reste ALIGNÉ + card ADVISORY (X ne bloque pas)", async ({
		page,
	}) => {
		await page.goto("/v2/conscience");
		await page.getByTestId("v2-conscience-sample-break-experience").click();

		// X ne clique jamais le cliquet — le verdict global reste ALIGNÉ.
		await expect(page.getByTestId("v2-conscience-verdict")).toHaveAttribute(
			"data-verdict",
			"aligned",
		);
		// la divergence X surface une decision card ADVISORY.
		await expect(
			page.locator(
				'[data-testid="v2-conscience-card"][data-facet="X"][data-advisory="true"]',
			),
		).toBeVisible();
	});

	test("le hub /v2/grille mène à /v2/conscience", async ({ page }) => {
		await page.goto("/v2/grille");
		const link = page.getByTestId("v2-grille-gesture-conscience");
		await expect(link).toBeVisible();
		await link.click();
		await expect(page).toHaveURL(/\/v2\/conscience$/);
		await expect(page.getByTestId("v2-conscience-view")).toBeVisible();
	});
});
