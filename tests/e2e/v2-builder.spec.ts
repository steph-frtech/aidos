import { expect, test } from "@playwright/test";

/**
 * WB2-27 Playwright e2e — l'écran /v2/builder : IA Builder, UN chat qui fait tout (ADR 0057).
 * mirror record: reflects=WB2-27-builder, test_kind=e2e, cert_language=playwright,
 * liveness=live, authority=above (le chat PROPOSE, n'écrit aucune vérité).
 *
 * Les critères de done WB2-27, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - le tour est ULTRA-EXPLICITE : « l'attente » (le verdict understand), « les types de
 *     réponse possibles » (TOUS les candidats, cliquables), « la réponse » (les événements,
 *     jeu clos) et « les impacts » (la vague calculée) sont TOUJOURS visibles ;
 *   - le chat AGIT : une greffe envoyée au chat fait pousser l'arbre composes (à droite) ;
 *   - la promotion PROPOSE, n'applique pas : version k:, ChangeSet DRAFT, wroteKernel=false ;
 *   - l'AMBIGUÏTÉ est OFFERTE (chips), jamais tranchée en silence — cliquer une chip FORCE
 *     l'intention par un texte désambiguïsé qui repasse par le MÊME pipeline déterministe ;
 *   - le mur intact : AUCUNE requête d'écriture sur toute la session (le bouton Claude n'est
 *     JAMAIS cliqué ici — le run reste hermétique, la grammaire fermée suffit).
 */

/** Envoie un message au chat : remplir la saisie puis cliquer Envoyer (un TOUR). */
async function send(
	page: import("@playwright/test").Page,
	text: string,
): Promise<void> {
	await page.getByTestId("v2-builder-input").fill(text);
	await page.getByTestId("v2-builder-send").click();
}

test.describe("WB2-27 /v2/builder — IA Builder : UN chat qui fait tout (grammaire fermée)", () => {
	test("le tour complet est EXPLICITE : attente + types de réponse + réponse + impacts", async ({
		page,
	}) => {
		await page.goto("/v2/builder");
		await expect(page.getByTestId("v2-builder-wall-note")).toBeVisible();
		await expect(page.getByTestId("v2-builder-chat")).toBeVisible();

		// UN tour : la capture canonique (prouvée par le miroir du twin).
		await send(
			page,
			"capture l'idée : au checkout, débiter le compte une seule fois",
		);

		// « L'ATTENTE » : le verdict est comprise (exact — « incomprise » contient « comprise »),
		// et l'intention en tête est la capture d'idée.
		const attente = page.getByTestId("v2-builder-attente");
		await expect(attente.getByText("comprise", { exact: true })).toBeVisible();
		await expect(attente).toContainText("Capturer une idée");

		// « LES TYPES DE RÉPONSE POSSIBLES » : au moins une chip candidate, cliquable.
		const chips = page.getByTestId("v2-builder-candidate");
		await expect(chips.first()).toBeVisible();
		expect(await chips.count()).toBeGreaterThanOrEqual(1);

		// « LA RÉPONSE » : l'événement idee_capturee, placé par le SYSTÈME (niveau × facette ×
		// échelle PRIS DU NŒUD D'ATTACHE — l'accroche lexicale checkout/compte → la feuille seed).
		const events = page.getByTestId("v2-builder-events");
		await expect(events).toContainText("idee_capturee");
		await expect(events).toContainText("app/paiement/checkout/debit-du-compte");

		// « LES IMPACTS » : la vague calculée — au moins une chip (la cible composes + l'idée).
		const impacts = page.getByTestId("v2-builder-impact");
		await expect(impacts.first()).toBeVisible();
		expect(await impacts.count()).toBeGreaterThanOrEqual(1);

		// L'état vivant (à droite) : UNE idée listée, hasMirror=false (au-dessus du mur, §115).
		await expect(page.getByTestId("v2-builder-idea")).toHaveCount(1);
		await expect(page.getByTestId("v2-builder-idea")).toContainText(
			"hasMirror = false",
		);
	});

	test("le chat AGIT sur l'arbre : « greffe pommes sous app/catalogue » fait pousser un nœud", async ({
		page,
	}) => {
		await page.goto("/v2/builder");

		// L'arbre seed ne contient PAS encore pommes.
		await expect(
			page.locator(
				'[data-testid="v2-builder-tree-node"][data-path="app/catalogue/pommes"]',
			),
		).toHaveCount(0);

		await send(page, "greffe pommes sous app/catalogue");

		// La réponse est une greffe, et l'arbre composes (à droite) a POUSSÉ : le nœud existe.
		await expect(page.getByTestId("v2-builder-events")).toContainText(
			"arbre_greffe",
		);
		const grown = page.locator(
			'[data-testid="v2-builder-tree-node"][data-path="app/catalogue/pommes"]',
		);
		await expect(grown).toBeVisible();
		await expect(grown).toContainText("pommes");
	});

	test("la promotion PROPOSE, n'applique pas : version k:, ChangeSet DRAFT, wroteKernel=false", async ({
		page,
	}) => {
		await page.goto("/v2/builder");

		// L'état du scénario 1 (même session de page) : une idée capturée d'abord…
		await send(
			page,
			"capture l'idée : au checkout, débiter le compte une seule fois",
		);
		await expect(page.getByTestId("v2-builder-idea")).toHaveCount(1);

		// …puis la promotion de la DERNIÈRE idée.
		await send(page, "promeus la dernière idée");
		await expect(page.getByTestId("v2-builder-events").last()).toContainText(
			"kernel_propose",
		);

		// Le kernel PROPOSÉ : version gelée k:…, portée par un ChangeSet DRAFT, et le mur
		// VISIBLE — wroteKernel = false (le chat propose, il n'applique jamais).
		const kernel = page.getByTestId("v2-builder-kernel");
		await expect(kernel).toHaveCount(1);
		await expect(kernel).toContainText(/k:[0-9a-f]{8}/);
		await expect(kernel).toContainText("DRAFT");
		await expect(kernel).toContainText("wroteKernel = false");
	});

	test("l'ambiguïté est OFFERTE, pas tranchée : les chips résolvent par le MÊME pipeline", async ({
		page,
	}) => {
		await page.goto("/v2/builder");

		// Deux verbes forts à égalité (greffe / déploie) : l'ambiguïté est DÉTECTÉE et REMONTÉE.
		await send(page, "greffe et déploie le paiement");
		const attente = page.getByTestId("v2-builder-attente").last();
		await expect(attente.getByText("ambiguë", { exact: true })).toBeVisible();

		// L'écran OFFRE les candidats : au moins deux chips cliquables (greffer + deployer).
		const chips = page.getByTestId("v2-builder-candidate");
		expect(await chips.count()).toBeGreaterThanOrEqual(2);

		// Cliquer la chip greffer FORCE l'intention — le texte désambiguïsé repasse par le
		// MÊME pipeline understand/applyIntent (jamais un choix silencieux de l'écran).
		await page
			.locator('[data-testid="v2-builder-candidate"][data-kind="greffer"]')
			.first()
			.click();

		// Un NOUVEAU tour apparaît, RÉSOLU : comprise, et sa réponse est non vide (la greffe).
		await expect(page.getByTestId("v2-builder-attente")).toHaveCount(2);
		const lastAttente = page.getByTestId("v2-builder-attente").last();
		await expect(
			lastAttente.getByText("comprise", { exact: true }),
		).toBeVisible();
		const lastEvents = page.getByTestId("v2-builder-events").last();
		await expect(lastEvents.locator("li").first()).toBeVisible();
		await expect(lastEvents).toContainText("arbre_greffe");
	});

	test("LE MUR : toute la session n'émet AUCUNE écriture (POST/PUT/PATCH/DELETE)", async ({
		page,
	}) => {
		// Capte toute requête d'écriture (le mur) : POST/PUT/PATCH/DELETE = interdit.
		// NE PAS cliquer v2-builder-claude — le run reste hermétique (la seule écriture légale
		// serait la server-action de reformulation, hors périmètre ici).
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/builder");

		// La session COMPLÈTE : les six intentions de la grammaire fermée + une ambiguïté forcée.
		await send(page, "greffe pommes sous app/catalogue");
		await send(
			page,
			"capture l'idée : au checkout, débiter le compte une seule fois",
		);
		await send(page, "promeus la dernière idée");
		await send(page, "quel impact si je modifie app/paiement");
		await send(page, "montre-moi l'état du projet");
		await send(page, "déploie l'application en production");
		await send(page, "greffe et déploie le paiement");
		// .last() : le tour 1 (la greffe) porte AUSSI une chip greffer — on force bien le
		// DERNIER tour (l'ambigu), dont la chip recompose SON message.
		await page
			.locator('[data-testid="v2-builder-candidate"][data-kind="greffer"]')
			.last()
			.click();

		// La session a bien eu lieu : 8 tours, le déploiement PROPOSÉ (gaté), jamais exécuté.
		await expect(page.getByTestId("v2-builder-attente")).toHaveCount(8);
		await expect(page.getByTestId("v2-builder-log")).toContainText(
			"deploiement_propose",
		);

		// LE MUR : aucune requête d'écriture n'a été émise par toute la session.
		expect(writes).toEqual([]);
	});
});
