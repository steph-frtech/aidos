import { expect, test } from "@playwright/test";

/**
 * V3 Playwright e2e — /v3 : UNE session, cinq lentilles (ADR 0060).
 * mirror record: reflects=V3-session-lenses, test_kind=e2e, cert_language=playwright,
 * liveness=live, authority=above (le chat PROPOSE, n'écrit aucune vérité).
 *
 * HERMÉTIQUE PAR CONSTRUCTION : chaque test COMMENCE par éteindre la bascule
 * « IA conversationnelle » (v3-ai-toggle, défaut ON) — la session tourne en
 * déterministe pur : AUCUN appel au CLI claude (zéro coût, zéro aléa), le
 * réducteur (understand/applyIntent — lib/v2/builder) reste LA LOI.
 *
 * Les critères de done V3, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - le SHELL : /v3 redirige vers /v3/lab, la nav offre les cinq lentilles, le hero
 *     d'accueil est ACCUEILLANT (français simple, zéro jargon imposé) ;
 *   - le CHAT AGIT : une phrase canonique envoyée produit une carte assistant AMICALE
 *     (« Votre idée a été ajoutée… ») et le détail technique vit TOUJOURS replié
 *     dans « Détails techniques » (<details data-testid="v3-details">) ;
 *   - UNE SESSION, CINQ LENTILLES : la session vit dans le layout /v3 — la navigation
 *     CLIENT (les Link de la nav, jamais page.goto) préserve l'arbre React, donc
 *     l'historique, les environnements, le parcours et les paramètres LISENT le même
 *     transcript rejoué (turnsOf — l'état n'est jamais stocké) ;
 *   - le VOYAGE DANS LE TEMPS : « Revenir ici » (confirmation douce à DEUX clics,
 *     jamais de window.confirm) tronque le transcript et l'état est REJOUÉ — la
 *     timeline raccourcit et le chat montre la session rembobinée ;
 *   - LE MUR : toute une session IA-éteinte n'émet AUCUNE écriture (POST/PUT/PATCH/
 *     DELETE) — la server-action Claude n'est JAMAIS appelée quand la bascule est off.
 */

/** Ouvre une page V3 puis ÉTEINT l'IA conversationnelle (le mode déterministe pur). */
async function openDeterministe(
	page: import("@playwright/test").Page,
	path = "/v3/lab",
): Promise<void> {
	await page.goto(path);
	// La bascule vit dans le lab — défaut ON (aria-checked=true), un clic l'éteint.
	const toggle = page.getByTestId("v3-ai-toggle");
	await expect(toggle).toBeVisible({ timeout: 20_000 });
	await expect(toggle).toHaveAttribute("aria-checked", "true");
	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-checked", "false");
}

/** Envoie un message au chat : remplir la saisie puis Envoyer (un TOUR re-jugé). */
async function send(
	page: import("@playwright/test").Page,
	text: string,
): Promise<void> {
	await page.getByTestId("v3-input").fill(text);
	await page.getByTestId("v3-send").click();
}

/** Navigue vers une lentille PAR LA NAV (Link client — la session du layout survit). */
async function navTo(
	page: import("@playwright/test").Page,
	route: string,
): Promise<void> {
	await page
		.locator(`[data-testid="v3-nav-item"][data-route="${route}"]`)
		.click();
}

/** La capture canonique prouvée (le twin lib/v2/builder) — réutilisée partout ici. */
const CAPTURE =
	"capture l'idée : au checkout, débiter le compte une seule fois";

test.describe("V3 — une session, cinq lentilles (le réducteur est la loi)", () => {
	test("le shell : /v3 redirige vers le lab, cinq lentilles, hero accueillant", async ({
		page,
	}) => {
		// HERMÉTIQUE d'abord : la bascule IA éteinte (et son défaut ON est PROUVÉ ici).
		await openDeterministe(page, "/v3");

		// /v3 a REDIRIGÉ vers /v3/lab (la porte d'entrée est le chat).
		await expect(page).toHaveURL(/\/v3\/lab$/);

		// La nav offre les CINQ lentilles (AI Lab · Parcours · Historique ·
		// Environnements · Paramètres) + le retour Workbench V2 en pied.
		await expect(page.getByTestId("v3-nav")).toBeVisible();
		await expect(page.getByTestId("v3-nav-item")).toHaveCount(5);
		await expect(page.getByTestId("v3-nav-workbench")).toBeVisible();

		// Le HERO d'accueil — accueillant, en français simple — et ses 4 amorces.
		await expect(page.getByTestId("v3-chat")).toContainText(
			"Construisons votre application ensemble",
		);
		await expect(page.getByTestId("v3-suggestion")).toHaveCount(4);
	});

	test("le chat agit : capture puis promotion — copie amicale, détail replié", async ({
		page,
	}) => {
		await openDeterministe(page);

		// ① la capture canonique : la bulle utilisateur + la carte assistant AMICALE.
		await send(page, CAPTURE);
		const cards = page.getByTestId("v3-msg-assistant");
		await expect(cards).toHaveCount(1);
		await expect(cards.first()).toContainText("Votre idée a été ajoutée");

		// Le détail technique est PRÉSENT mais REPLIÉ : le <details> est visible,
		// son contenu (le genre d'événement brut) reste caché tant qu'on n'ouvre pas.
		const details = cards.first().getByTestId("v3-details");
		await expect(details).toBeVisible();
		await expect(details.getByText("idee_capturee")).toBeHidden();

		// ② la promotion canonique : la copie amicale du kernel proposé (jamais appliqué).
		await send(page, "promeus la dernière idée");
		await expect(cards).toHaveCount(2);
		await expect(cards.last()).toContainText("Une version a été figée");
	});

	test("une session, cinq lentilles : l'état du chat est LU partout (nav client)", async ({
		page,
	}) => {
		await openDeterministe(page);

		// L'état du scénario 2 : capture + promotion (deux tours, même session).
		await send(page, CAPTURE);
		await send(page, "promeus la dernière idée");
		await expect(page.getByTestId("v3-msg-user")).toHaveCount(2);

		// ① HISTORIQUE : la timeline montre les DEUX tours (la même session rejouée —
		// le provider vit dans le layout /v3, la nav client préserve l'arbre React).
		await navTo(page, "/v3/history");
		await expect(page.getByTestId("v3-history")).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByTestId("v3-history-turn")).toHaveCount(2);

		// ② ENVIRONNEMENTS : l'échelle entière est rendue (la carte test au moins).
		await navTo(page, "/v3/environnements");
		await expect(page.getByTestId("v3-env-test")).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByTestId("v3-env-staging")).toBeVisible();
		await expect(page.getByTestId("v3-env-prod")).toBeVisible();

		// ③ PARCOURS : le graphe (React Flow) rend l'arbre seed — au moins 5 cartes.
		await navTo(page, "/v3/parcours");
		await expect(page.getByTestId("v3-parcours-graph")).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.locator(".react-flow__node").first()).toBeVisible({
			timeout: 20_000,
		});
		expect(
			await page.locator(".react-flow__node").count(),
		).toBeGreaterThanOrEqual(5);

		// ④ PARAMÈTRES : les vérités déclarées listées — au moins 5 lignes.
		await navTo(page, "/v3/parametrage");
		await expect(page.getByTestId("v3-params")).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByTestId("v3-param").first()).toBeVisible();
		expect(await page.getByTestId("v3-param").count()).toBeGreaterThanOrEqual(
			5,
		);
	});

	test("l'historique revient en arrière : deux clics doux, la timeline raccourcit", async ({
		page,
	}) => {
		await openDeterministe(page);

		// Deux tours (capture + promotion), puis la lentille Historique (nav client).
		await send(page, CAPTURE);
		await send(page, "promeus la dernière idée");
		await expect(page.getByTestId("v3-msg-user")).toHaveCount(2);
		await navTo(page, "/v3/history");
		const rows = page.getByTestId("v3-history-turn");
		await expect(rows).toHaveCount(2, { timeout: 20_000 });

		// « Revenir ici » sur l'Étape 2 : le PREMIER clic ARME (la confirmation douce,
		// jamais de window.confirm) — le SECOND clic, même testid, exécute le retour.
		const rewind = rows.nth(1).getByTestId("v3-history-rewind");
		await rewind.click();
		await expect(
			rows.nth(1).getByText("seront retirées de la session"),
		).toBeVisible();
		await rewind.click();

		// La timeline a RACCOURCI : un seul tour (l'état est REJOUÉ, rien n'est perdu
		// dans le concept — le voyage dans le temps est un rejeu de préfixe).
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText(CAPTURE);

		// Retour au chat (nav client) : la session REMBOBINÉE — une seule bulle
		// utilisateur, et sa carte assistant amicale rejouée.
		await navTo(page, "/v3/lab");
		await expect(page.getByTestId("v3-msg-user")).toHaveCount(1);
		await expect(page.getByTestId("v3-msg-user")).toContainText("au checkout");
		await expect(page.getByTestId("v3-msg-assistant")).toContainText(
			"Votre idée a été ajoutée",
		);
	});

	test("LE MUR : une session de 3 tours IA-éteinte n'émet AUCUNE écriture", async ({
		page,
	}) => {
		// Capte toute requête d'écriture (le mur) : POST/PUT/PATCH/DELETE = interdit.
		// La bascule IA éteinte garantit que la server-action Claude (un POST) n'est
		// JAMAIS déclenchée — le run reste hermétique, la grammaire fermée suffit.
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await openDeterministe(page);

		// TROIS tours déterministes : capture → promotion → déploiement en test.
		await send(page, CAPTURE);
		await send(page, "promeus la dernière idée");
		await send(page, "déploie l'application en test");

		// La session a bien eu lieu : 3 bulles utilisateur, et le dernier tour est
		// le déploiement AMICAL (le cliquet a laissé passer le premier barreau).
		await expect(page.getByTestId("v3-msg-user")).toHaveCount(3);
		await expect(page.getByTestId("v3-msg-assistant").last()).toContainText(
			"Application déployée en test",
		);

		// LE MUR : aucune requête d'écriture n'a été émise par toute la session.
		expect(writes).toEqual([]);
	});
});
