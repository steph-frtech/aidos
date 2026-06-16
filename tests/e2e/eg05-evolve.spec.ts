import { expect, type Page, test } from "@playwright/test";

/**
 * EG05 Playwright e2e — /v3/evolve : la lentille « GÉNÉRATEUR D'ÉVOLUTION » (ADR 0089).
 * mirror record: reflects=EG05-evolve-generator-lens, test_kind=e2e,
 * cert_language=playwright, liveness=live, authority=above (la lentille PROJETTE et
 * envoie un geste de chat ; elle n'écrit AUCUNE vérité — le mur §2).
 *
 * HERMÉTIQUE PAR CONSTRUCTION (§6/§8) : on éteint la bascule « IA conversationnelle »
 * (v3-ai-toggle, défaut ON) → la session tourne en DÉTERMINISTE PUR. La lentille rejoue
 * le RUN CANONIQUE seedé (twin lib/v3/evolve-view, byte-cohérent avec le Go
 * back/runtime/evolve) — aucun appel réseau, aucune IA, le sampler déterministe/seedé
 * est le seul jeu. Le bouton « Lancer une exploration » ENVOIE un geste canonique au
 * chat via send() (ui-completeness §6/§7 — jamais headless).
 *
 * Les projets persistés sont isolés (AIDOS_PROJECTS_DIR jetable, cf. playwright.config) ;
 * chaque test crée SON projet frais au nom unique (testInfo.testId, sans horloge ni aléa).
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

test.describe("EG05 — la lentille Générateur d'évolution (le miroir déterministe juge)", () => {
	test("la nav offre la lentille ; la section rend les variantes + leurs verdicts", async ({
		page,
	}, testInfo) => {
		await openDeterministe(page, `eg05-render-${testInfo.testId}`);

		// La lentille est dans la nav v3 (ajoutée sans toucher les autres entrées).
		const navItem = page.locator(
			'[data-testid="v3-nav-item"][data-route="/v3/evolve"]',
		);
		await expect(navItem).toBeVisible();

		// On y navigue PAR LA NAV (Link client — la session partagée du layout survit).
		await navTo(page, "/v3/evolve");
		await expect(page.getByTestId("v3-evolve")).toBeVisible();

		// La TABLE des variantes rend (le run canonique self-play par défaut : 8 lignes).
		await expect(page.getByTestId("v3-evolve-variants")).toBeVisible();
		const variantRows = page.getByTestId("v3-evolve-variant");
		await expect(variantRows).toHaveCount(8);

		// Chaque variante porte un VERDICT DE GATE (promue ou refusée) — le critère EG05.
		const verdicts = page.getByTestId("v3-evolve-verdict");
		expect(await verdicts.count()).toBe(8);

		// Au moins une variante PROMUE et au moins une REFUSÉE (le gate discrimine).
		await expect(
			page.locator(
				'[data-testid="v3-evolve-verdict"][data-verdict="proposed"]',
			),
		).not.toHaveCount(0);
		await expect(
			page.locator('[data-testid="v3-evolve-verdict"][data-verdict="refused"]'),
		).not.toHaveCount(0);

		// Les NICHES GAGNÉES + la couverture (le gain EG04 rendu visible) : self-play → 2.
		await expect(page.getByTestId("v3-evolve-coverage")).toHaveAttribute(
			"data-coverage",
			"2",
		);
		await expect(page.getByTestId("v3-evolve-niche-won")).toHaveCount(2);
	});

	test("le sampler déterministe ne gagne aucune niche (la baseline non approuvée)", async ({
		page,
	}, testInfo) => {
		await openDeterministe(page, `eg05-det-${testInfo.testId}`);
		await navTo(page, "/v3/evolve");
		await expect(page.getByTestId("v3-evolve")).toBeVisible();

		// On bascule sur le générateur DÉTERMINISTE (le repli figé du seam).
		await page
			.locator('[data-testid="v3-evolve-sampler"][data-sampler="deterministe"]')
			.click();

		// Une seule variante (la baseline), refusée, 0 niche gagnée — le run Go FallbackSampler.
		await expect(page.getByTestId("v3-evolve-variant")).toHaveCount(1);
		await expect(
			page.locator('[data-testid="v3-evolve-verdict"][data-verdict="refused"]'),
		).toHaveCount(1);
		await expect(page.getByTestId("v3-evolve-coverage")).toHaveAttribute(
			"data-coverage",
			"0",
		);
		await expect(page.getByTestId("v3-evolve-niche-won")).toHaveCount(0);
	});

	test("le bouton « Lancer une exploration » EXÉCUTE via send (ui-completeness §6/§7)", async ({
		page,
	}, testInfo) => {
		await openDeterministe(page, `eg05-run-${testInfo.testId}`);
		await navTo(page, "/v3/evolve");
		await expect(page.getByTestId("v3-evolve")).toBeVisible();

		// Avant : aucun indicateur d'exploration lancée.
		await expect(page.getByTestId("v3-evolve-launched")).toHaveCount(0);

		// Le bouton ENVOIE le geste canonique au chat (send → un tour rejoué par le réducteur).
		await page.getByTestId("v3-evolve-run").click();

		// Après : l'indicateur confirme l'envoi — le bouton n'est JAMAIS headless.
		await expect(page.getByTestId("v3-evolve-launched")).toBeVisible({
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
