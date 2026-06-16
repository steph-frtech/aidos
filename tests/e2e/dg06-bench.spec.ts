import { expect, type Page, test } from "@playwright/test";

/**
 * DG06 Playwright e2e — /v3/bench : la lentille « BENCH DE COMPLÉTUDE » (ADR 0079 / 0088).
 * mirror record: reflects=DG06-bench-completeness-lens, test_kind=e2e,
 * cert_language=playwright, liveness=live, authority=above (la lentille PROJETTE et
 * envoie un geste de chat ; elle n'écrit AUCUNE vérité — le mur §2).
 *
 * HERMÉTIQUE PAR CONSTRUCTION (§6/§8) : on éteint la bascule « IA conversationnelle »
 * (v3-ai-toggle, défaut ON) → la session tourne en DÉTERMINISTE PUR. La lentille projette
 * le run CANONIQUE hermétique (twin lib/v3/bench-view, byte-cohérent avec le Go
 * back/runtime/requirementbench) — aucun appel réseau, aucune IA. Le bouton
 * « Lancer le bench » ENVOIE un geste canonique au chat via send() (ui-completeness
 * §6/§7 — jamais headless).
 *
 * Les projets persistés sont isolés (AIDOS_PROJECTS_DIR jetable, cf. playwright.config) ;
 * chaque test crée SON projet frais au nom unique (testInfo.testId, sans horloge ni aléa).
 *
 * PORT : PLAYWRIGHT_WEB_PORT=3210 (ou la valeur de la config — JAMAIS :3000 en dur).
 */

/** ÉTEINT l'IA conversationnelle — et PROUVE au passage son défaut ON. */
async function eteindreIA(page: Page): Promise<void> {
	const toggle = page.getByTestId("v3-ai-toggle");
	await expect(toggle).toBeVisible({ timeout: 20_000 });
	await expect(toggle).toHaveAttribute("aria-checked", "true");
	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-checked", "false");
}

/** OUVRE le panneau du commutateur de projets (sans le refermer s'il l'est déjà). */
async function ouvrirPanneau(page: Page): Promise<void> {
	const panneau = page.getByTestId("v3-project-panel");
	if (!(await panneau.isVisible())) {
		await page.getByTestId("v3-project-name").click();
		await expect(panneau).toBeVisible();
	}
}

/** CRÉE un projet depuis le commutateur et attend la BASCULE effective (remontage). */
async function creerProjet(page: Page, nom: string): Promise<void> {
	await ouvrirPanneau(page);
	await page.getByTestId("v3-project-new-name").fill(nom);
	await page.getByTestId("v3-project-create").click();
	await expect(page.getByTestId("v3-project-panel")).toBeHidden({
		timeout: 20_000,
	});
	await expect(page.getByTestId("v3-project-name")).toContainText(nom);
}

/**
 * Ouvre /v3 dans un PROJET FRAIS puis ÉTEINT l'IA (mode déterministe pur). Le projet
 * frais d'abord, l'IA ensuite : la bascule de projet REMONTE le provider (key par id),
 * ce qui réinitialiserait une bascule IA éteinte trop tôt.
 */
async function openDeterministe(
	page: Page,
	nomDeProjet: string,
): Promise<void> {
	await page.goto("/v3/lab");
	await expect(page.getByTestId("v3-project-name")).toBeVisible({
		timeout: 20_000,
	});
	await creerProjet(page, nomDeProjet);
	await eteindreIA(page);
}

/** Navigue vers une lentille PAR LA NAV (Link client — la session du layout survit). */
async function navTo(page: Page, route: string): Promise<void> {
	await page
		.locator(`[data-testid="v3-nav-item"][data-route="${route}"]`)
		.click();
}

test.describe("DG06 — la lentille Bench de complétude (twin pur, hermétique)", () => {
	test("la nav offre la lentille bench ; la section rend le match% et les types", async ({
		page,
	}, testInfo) => {
		await openDeterministe(page, `dg06-render-${testInfo.testId}`);

		// La lentille bench est dans la nav v3 (ajoutée sans toucher les autres entrées).
		const navItem = page.locator(
			'[data-testid="v3-nav-item"][data-route="/v3/bench"]',
		);
		await expect(navItem).toBeVisible();

		// On y navigue PAR LA NAV (Link client — la session partagée du layout survit).
		await navTo(page, "/v3/bench");
		await expect(page.getByTestId("v3-bench")).toBeVisible();

		// La SPEC CANONIQUE rend avec son specId et son match%.
		const spec = page.getByTestId("v3-bench-spec");
		await expect(spec).toBeVisible();
		await expect(spec).toHaveAttribute("data-spec-id", "createOrder");

		// Le match% canonique : l'union single∪A∪B couvre les 7 attendus → 100%.
		const matchPct = page.getByTestId("v3-bench-match-pct");
		await expect(matchPct).toBeVisible();
		await expect(matchPct).toHaveAttribute("data-pct", "1.00");

		// Aucun type manquant (tous couverts par l'union).
		await expect(page.getByTestId("v3-bench-no-missing")).toBeVisible();
		await expect(page.getByTestId("v3-bench-missing-kind")).toHaveCount(0);
	});

	test("le différentiel multi-modèle rend 3 lignes (single / A / B)", async ({
		page,
	}, testInfo) => {
		await openDeterministe(page, `dg06-diff-${testInfo.testId}`);
		await navTo(page, "/v3/bench");
		await expect(page.getByTestId("v3-bench")).toBeVisible();

		// La table du différentiel rend 3 lignes de modèles.
		await expect(page.getByTestId("v3-bench-diff-table")).toBeVisible();
		const modelDiffs = page.getByTestId("v3-bench-model-diff");
		await expect(modelDiffs).toHaveCount(3);

		// Le modèle "single" manque des types (il ne couvre pas les cross-cutting).
		const singleDiff = page.locator(
			'[data-testid="v3-bench-model-diff"][data-role="single"]',
		);
		await expect(singleDiff).toBeVisible();
		const singleMissed = singleDiff.getByTestId("v3-bench-model-missed");
		await expect(singleMissed).toBeVisible();

		// Les modèles "A" et "B" sont présents.
		await expect(
			page.locator('[data-testid="v3-bench-model-diff"][data-role="A"]'),
		).toBeVisible();
		await expect(
			page.locator('[data-testid="v3-bench-model-diff"][data-role="B"]'),
		).toBeVisible();
	});

	test("le bouton « Lancer le bench » EXÉCUTE via send (ui-completeness §6/§7)", async ({
		page,
	}, testInfo) => {
		await openDeterministe(page, `dg06-run-${testInfo.testId}`);
		await navTo(page, "/v3/bench");
		await expect(page.getByTestId("v3-bench")).toBeVisible();

		// Avant : aucun indicateur de bench lancé.
		await expect(page.getByTestId("v3-bench-launched")).toHaveCount(0);

		// Le bouton ENVOIE le geste canonique au chat (send → un tour rejoué par le réducteur).
		await page.getByTestId("v3-bench-run").click();

		// Après : l'indicateur confirme l'envoi — le bouton n'est JAMAIS headless.
		await expect(page.getByTestId("v3-bench-launched")).toBeVisible({
			timeout: 20_000,
		});

		// Le tour est bien entré dans la session : de retour au lab, une carte assistant existe
		// (le transcript a grandi — la preuve que send() a traversé le réducteur).
		await navTo(page, "/v3/lab");
		await expect(page.getByTestId("v3-msg-assistant").first()).toBeVisible({
			timeout: 20_000,
		});
	});
});
