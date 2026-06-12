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
 *   - le CYCLE DE VIE COMPLET est joué sur L'ÉCHELLE ENTIÈRE (ENV_LADDER, une donnée) :
 *     générer → dev → staging → prod (LE CLIQUET GÉNÉRALISÉ : le barreau i exige la MÊME
 *     version au barreau i-1) → delta — la prod est REFUSÉE tant que la version courante
 *     n'a pas gravi chaque barreau, et une nouvelle promotion RÉARME chaque porte ;
 *   - la COUVERTURE : le chat ouvre N'IMPORTE QUEL écran (le registre V2 déclaré + les
 *     écrans V1 scannés côté serveur, injectés en DONNÉES) — « ouvre <titre> » → une puce
 *     de navigation, jamais une route inventée (fail-closed) ;
 *   - le DÉPLOIEMENT RÉEL (ADR 0052) est GATÉ : le bouton ne s'arme que lorsque envs.prod
 *     est posé — et il n'est JAMAIS cliqué ici (run hermétique, pas de docker en e2e) ;
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

		// La session COMPLÈTE : un échantillon de la grammaire fermée + une ambiguïté forcée
		// (le cycle de vie générer → dev → staging → prod → delta a SON test dédié ci-dessous).
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

		// La session a bien eu lieu : 8 tours, et la prod REFUSÉE par le cliquet (pas de
		// dev préalable) — jamais exécutée. Le journal vit dans l'onglet Journal (mêmes
		// testids v2-builder-log/-log-entry : un clic d'onglet d'abord).
		await expect(page.getByTestId("v2-builder-attente")).toHaveCount(8);
		await page
			.locator('[data-testid="v2-builder-tab"][data-tab="journal"]')
			.click();
		const log = page.getByTestId("v2-builder-log");
		await expect(log).toContainText("refus");
		await expect(log).toContainText("le cliquet");

		// LE MUR : aucune requête d'écriture n'a été émise par toute la session.
		expect(writes).toEqual([]);
	});

	test("le CYCLE DE VIE COMPLET — générer → dev → staging → prod (le cliquet généralisé) → delta", async ({
		page,
	}) => {
		// Le mur tient sur TOUT le cycle de vie : on capte chaque requête d'écriture.
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/builder");

		// ① capture + promotion : UN kernel proposé — la matière de l'app à émettre.
		await send(
			page,
			"capture l'idée : au checkout, débiter le compte une seule fois",
		);
		await send(page, "promeus la dernière idée");
		await expect(page.getByTestId("v2-builder-kernel")).toHaveCount(1);

		// ② prod AVANT l'échelle : LE CLIQUET GÉNÉRALISÉ refuse — le barreau prod exige la
		// MÊME version au barreau staging (chaque barreau, dans l'ordre, toujours).
		await send(page, "déploie l'application en prod");
		const refusAvant = page.getByTestId("v2-builder-events").last();
		await expect(refusAvant).toContainText("refus");
		await expect(refusAvant).toContainText("le cliquet");
		await expect(refusAvant).toContainText("staging");

		// ③ dev d'abord : deploiement · dev — l'onglet Environnements montre L'ÉCHELLE
		// ENTIÈRE (trois cartes), la version app:<hash> posée sur la carte dev, ÉCART 0.
		await send(page, "déploie l'application en dev");
		await expect(page.getByTestId("v2-builder-events").last()).toContainText(
			"deploiement · dev",
		);
		await page
			.locator('[data-testid="v2-builder-tab"][data-tab="envs"]')
			.click();
		const envDev = page.getByTestId("v2-builder-env-dev");
		const envStaging = page.getByTestId("v2-builder-env-staging");
		const envProd = page.getByTestId("v2-builder-env-prod");
		await expect(envStaging).toBeVisible();
		await expect(envProd).toBeVisible();
		await expect(envDev).toContainText(/app:[0-9a-f]{8}/);
		await expect(envDev.locator("[data-drift]")).toHaveAttribute(
			"data-drift",
			"0",
		);
		const devVersion = ((await envDev.textContent()) ?? "").match(
			/app:[0-9a-f]{8}/,
		)?.[0];
		expect(devVersion).toBeTruthy();

		// ④ staging APRÈS dev (le barreau intermédiaire) : la MÊME version grimpe d'un cran.
		await send(page, "déploie l'application en staging");
		await expect(page.getByTestId("v2-builder-events").last()).toContainText(
			"deploiement · staging",
		);
		await expect(envStaging).toContainText(devVersion as string);
		await expect(envStaging.locator("[data-drift]")).toHaveAttribute(
			"data-drift",
			"0",
		);

		// ⑤ prod APRÈS staging : le cliquet laisse passer — la MÊME version posée en prod.
		await send(page, "déploie l'application en prod");
		await expect(page.getByTestId("v2-builder-events").last()).toContainText(
			"deploiement · prod",
		);
		await expect(envProd).toContainText(devVersion as string);
		await expect(envProd.locator("[data-drift]")).toHaveAttribute(
			"data-drift",
			"0",
		);

		// ⑥ delta depuis la prod : 0 écart juste après le déploiement (le motif du twin).
		await send(page, "montre le delta depuis la prod");
		const delta0 = page.getByTestId("v2-builder-events").last();
		await expect(delta0).toContainText("delta_calcule");
		await expect(delta0).toContainText("0 kernel(s) d'écart");

		// ⑦ une SECONDE idée promue : la dérive apparaît — l'écart des TROIS cartes ≥ 1.
		await send(
			page,
			"capture l'idée : au catalogue, lister les produits disponibles",
		);
		await send(page, "promeus la dernière idée");
		await expect(page.getByTestId("v2-builder-kernel")).toHaveCount(2);
		const driftDev = Number(
			await envDev.locator("[data-drift]").getAttribute("data-drift"),
		);
		const driftStaging = Number(
			await envStaging.locator("[data-drift]").getAttribute("data-drift"),
		);
		const driftProd = Number(
			await envProd.locator("[data-drift]").getAttribute("data-drift"),
		);
		expect(driftDev).toBeGreaterThanOrEqual(1);
		expect(driftStaging).toBeGreaterThanOrEqual(1);
		expect(driftProd).toBeGreaterThanOrEqual(1);

		// ⑧ générer : app_generee — l'onglet App montre la PROJECTION pure recalculée
		// (version app:<hash>, ≥ 2 entités versionnées k:, les routes émises visibles).
		await send(page, "génère l'application");
		await expect(page.getByTestId("v2-builder-events").last()).toContainText(
			"app_generee",
		);
		await page
			.locator('[data-testid="v2-builder-tab"][data-tab="app"]')
			.click();
		const app = page.getByTestId("v2-builder-app");
		await expect(app).toContainText(/app:[0-9a-f]{8}/);
		const entities = app.locator("li").filter({ hasText: /k:[0-9a-f]{8}/ });
		expect(await entities.count()).toBeGreaterThanOrEqual(2);
		await expect(
			app.getByText("/debit-du-compte", { exact: true }),
		).toBeVisible();
		await expect(app.getByText("/catalogue", { exact: true })).toBeVisible();

		// ⑨ prod à nouveau : le cliquet s'est RÉARMÉ sur CHAQUE barreau — la NOUVELLE
		// version (2 kernels) n'a pas regravi l'échelle, la prod re-refuse (jamais un
		// passe-droit).
		await send(page, "déploie l'application en prod");
		const refusApres = page.getByTestId("v2-builder-events").last();
		await expect(refusApres).toContainText("refus");
		await expect(refusApres).toContainText("le cliquet");

		// LE MUR : zéro requête d'écriture sur TOUT le cycle de vie.
		expect(writes).toEqual([]);
	});

	test("la COUVERTURE : le chat ouvre n'importe quel écran — V2 déclaré ET V1 scanné", async ({
		page,
	}) => {
		await page.goto("/v2/builder");

		// ① un écran du REGISTRE V2 déclaré : « ouvre l'écran code » — l'impératif de
		// navigation commande (règle déclarée), l'événement est ecran_ouvert et la PUCE
		// DE NAVIGATION porte la route résolue (jamais une route inventée, fail-closed).
		await send(page, "ouvre l'écran code");
		const eventsV2 = page.getByTestId("v2-builder-events").last();
		await expect(eventsV2).toContainText("ecran_ouvert");
		await expect(
			page.locator(
				'[data-testid="v2-builder-open-screen"][data-route="/v2/code"]',
			),
		).toBeVisible();

		// ② un écran V1 issu du SCAN serveur (app/why-tree) — l'inventaire V1 est injecté
		// en DONNÉES dans le twin : la couverture atteint TOUT le Workbench, pas que V2.
		await send(page, "ouvre l'écran why-tree");
		const eventsV1 = page.getByTestId("v2-builder-events").last();
		await expect(eventsV1).toContainText("ecran_ouvert");
		await expect(
			page.locator(
				'[data-testid="v2-builder-open-screen"][data-route="/why-tree"]',
			),
		).toBeVisible();
	});

	test("le déploiement RÉEL est GATÉ (ADR 0052) : désarmé avant l'échelle, armé après — JAMAIS cliqué", async ({
		page,
	}) => {
		await page.goto("/v2/builder");

		// AVANT l'échelle : l'onglet Environnements montre le bouton réel DÉSARMÉ
		// (envs.prod est vide — le geste humain n'est offert qu'au sommet du cliquet).
		await page
			.locator('[data-testid="v2-builder-tab"][data-tab="envs"]')
			.click();
		await expect(page.getByTestId("v2-builder-real-deploy")).toBeVisible();
		const realBtn = page.getByTestId("v2-builder-deploy-real");
		await expect(realBtn).toBeDisabled();

		// L'ÉCHELLE ENTIÈRE, barreau par barreau : capture → promotion → dev → staging → prod.
		await send(
			page,
			"capture l'idée : au checkout, débiter le compte une seule fois",
		);
		await send(page, "promeus la dernière idée");
		await send(page, "déploie l'application en dev");
		await send(page, "déploie l'application en staging");
		await send(page, "déploie l'application en prod");
		await expect(page.getByTestId("v2-builder-events").last()).toContainText(
			"deploiement · prod",
		);

		// APRÈS : le bouton s'ARME (envs.prod posé) — et n'est PAS cliqué : le run reste
		// HERMÉTIQUE (pas de docker en e2e ; le pipeline réel /ai-lab a son propre gate).
		await expect(realBtn).toBeEnabled();
	});

	test("le DELTA AU GRAIN CODE (ADR 0056 × 0058) : la section est rendue après une promotion", async ({
		page,
	}) => {
		await page.goto("/v2/builder");

		// Une promotion : un kernel proposé — la matière du delta au grain code.
		await send(
			page,
			"capture l'idée : au checkout, débiter le compte une seule fois",
		);
		await send(page, "promeus la dernière idée");
		await expect(page.getByTestId("v2-builder-kernel")).toHaveCount(1);

		// PRÉSENCE seulement : les ancres dépendent de l'accroche lexicale (codeDeltaFor
		// sur le graphe extrait du source réel) — la section rend ≥ 0 ancres (ancres OU
		// note « vide »), jamais une panne.
		await page
			.locator('[data-testid="v2-builder-tab"][data-tab="envs"]')
			.click();
		await expect(page.getByTestId("v2-builder-code-delta")).toBeVisible();
	});
});
