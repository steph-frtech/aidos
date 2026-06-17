import { expect, test } from "@playwright/test";

/**
 * V3 — LA CONSCIENCE (lentille portée NATIVE dans /v3, parcours « Comprendre »).
 * mirror record: reflects=V3-conscience-lens, test_kind=e2e, cert_language=playwright,
 * liveness=live, authority=above (l'écran réconcilie + projette, n'écrit aucune vérité).
 *
 * Prouve que le concept FK09 (« la conscience ») est porté EN PROPRE dans la session V3 :
 * la lentille est ATTEIGNABLE depuis la nav V3 regroupée (section « Comprendre »), et son
 * contrôle RÉCONCILIER est exécutable DANS le shell V3 (action-capable, ui-completeness §7),
 * lié au Server Action `reconcileAction` réutilisé tel quel du concept top-level — il lit le
 * serveur Go `conscience` DISPATCHÉ via la passerelle (`readVia(scope, "reconcile", …)`,
 * S59/ADR 0092), le twin pur `demoReport` n'étant que le repli déterministe.
 *
 * RÉUTILISATION (« twins must die ») : aucune réimplémentation — la lentille V3 monte le MÊME
 * ConsciencePanel que /conscience. On revérifie donc juste, depuis V3, les critères de done :
 *   - la lentille apparaît dans la nav V3 et y NAVIGUE (Link client, jamais page.goto) ;
 *   - tout aligné → ALIGNED, zéro carte, rapport déterministe ;
 *   - une divergence (le drift runner s2↔s9) PRODUIT sa decision card actionnable ;
 *   - la facette molle X reste ALIGNED avec une carte advisory (§13.6 — X ne bloque jamais).
 *
 * LE MUR (§2) : l'écran RÉCONCILIE + AFFICHE — il n'écrit aucune vérité (rapport + cartes =
 * projections ; agir sur une carte passe par idea → mirror → /goal → décision humaine).
 */

test.describe("V3 — la conscience portée native (FK09 dans le shell V3)", () => {
	test("la lentille est dans la nav V3 (« Comprendre ») et y navigue (Link client)", async ({
		page,
	}) => {
		await page.goto("/v3/lab");
		// L'entrée de nav existe, dans la section « Comprendre », et n'est PAS un placeholder.
		const item = page.locator(
			'[data-testid="v3-nav-item"][data-route="/v3/conscience"]',
		);
		await expect(item).toBeVisible();
		await expect(
			page.locator('[data-testid="v3-nav-soon"][data-route="/v3/conscience"]'),
		).toHaveCount(0);
		// Navigation CLIENT (le Link de la nav, jamais page.goto) → la lentille s'affiche.
		await item.click();
		await expect(page).toHaveURL(/\/v3\/conscience$/);
		await expect(page.getByTestId("v3-conscience")).toBeVisible();
		// Le shell V3 enveloppe bien la lentille (la nav reste montée).
		await expect(page.getByTestId("v3-nav")).toBeVisible();
		// Le contrôle RÉCONCILIER est atteignable dans le shell V3.
		await expect(page.getByTestId("scenario-select")).toBeVisible();
		await expect(page.getByTestId("reconcile-submit")).toBeVisible();
	});

	test("tout aligné → ALIGNED, zéro carte, rapport déterministe", async ({
		page,
	}) => {
		await page.goto("/v3/conscience");
		await page.getByTestId("scenario-select").selectOption("aligned");
		await page.getByTestId("reconcile-submit").click();

		await expect(page.getByTestId("report")).toBeVisible();
		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"aligned",
		);
		await expect(page.getByTestId("no-cards")).toBeVisible();
		await expect(page.getByTestId("determinism-badge")).toHaveAttribute(
			"data-deterministic",
			"true",
		);
		// Le badge de source est HONNÊTE (live si le serveur Go répond, sinon demo).
		await expect(page.getByTestId("source-badge")).toBeVisible();
	});

	test("une divergence produit sa decision card actionnable", async ({
		page,
	}) => {
		await page.goto("/v3/conscience");
		await page.getByTestId("scenario-select").selectOption("runner-drift");
		await page.getByTestId("reconcile-submit").click();

		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"drift",
		);
		await expect(
			page.locator(
				'[data-testid="pair"][data-source="runner"][data-verdict="red"]',
			),
		).toBeVisible();
		const card = page.locator(
			'[data-testid="decision-card"][data-source="runner"]',
		);
		await expect(card).toBeVisible();
		await expect(
			card.locator('[data-testid="card-option"]').first(),
		).toBeVisible();
		await expect(card.locator('[data-testid="card-blast"]')).toBeVisible();
	});

	test("la facette molle X reste ALIGNED avec une carte advisory (X ne bloque jamais)", async ({
		page,
	}) => {
		await page.goto("/v3/conscience");
		await page.getByTestId("scenario-select").selectOption("break-experience");
		await page.getByTestId("reconcile-submit").click();

		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"aligned",
		);
		await expect(
			page.locator(
				'[data-testid="decision-card"][data-facet="X"][data-advisory="true"]',
			),
		).toBeVisible();
	});
});
