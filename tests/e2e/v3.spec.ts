import { expect, type Page, test } from "@playwright/test";

/**
 * V3 Playwright e2e — /v3 : UNE session, cinq lentilles (ADR 0060) + le PROJET
 * PERSISTANT (ADR 0061). mirror record: reflects=V3-session-lenses,
 * test_kind=e2e, cert_language=playwright, liveness=live, authority=above
 * (le chat PROPOSE, n'écrit aucune vérité).
 *
 * HERMÉTIQUE PAR CONSTRUCTION : chaque test COMMENCE par éteindre la bascule
 * « IA conversationnelle » (v3-ai-toggle, défaut ON) — la session tourne en
 * déterministe pur : AUCUN appel au CLI claude (zéro coût, zéro aléa), le
 * réducteur (understand/applyIntent — lib/v2/builder) reste LA LOI.
 *
 * HERMÉTIQUE FACE AU MAGASIN AUSSI : les projets persistés (.aidos-projects)
 * sont PARTAGÉS entre les tests et entre les runs (esprit append-only — aucune
 * suppression). Chaque test crée donc SON projet frais, au nom unique par test
 * (testInfo.testId — stable, sans horloge ni aléa) ; une collision de nom entre
 * deux runs est inoffensive : l'id reçoit un suffixe déterministe « -2 », « -3 »….
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
 *   - le PROJET PERSISTANT (ADR 0061) : créer une app crée un PROJET ; le rouvrir
 *     (reload, bascule) REJOUE tout l'historique — partout, même état ; deux
 *     projets gardent deux histoires isolées ;
 *   - LE MUR : toute une session IA-éteinte n'émet AUCUNE écriture-vérité — la
 *     server-action Claude n'est JAMAIS appelée quand la bascule est off (la seule
 *     écriture légale est la sauvegarde du projet, au-dessous de la ligne) ;
 *   - LA PALETTE (⌘K) ouvre tout écran ; SPÉCIFICATIONS rend LA GRILLE 7 × 8 et
 *     allume les impacts du dernier tour ; « Voir le résultat » rend l'app TELLE
 *     QUE DÉPLOYÉE par barreau ; INSTANCE expose les outils déclarés + les réglages.
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

/**
 * CRÉE un projet depuis le commutateur et attend la BASCULE effective. Le provider
 * est CLÉ par l'id du projet : le REMONTAGE referme le panneau — c'est LE signal
 * déterministe que le nouveau projet est monté (fiable même quand le nom collisionne
 * avec un run précédent, puisque l'id, lui, reste unique).
 */
async function creerProjet(page: Page, nom: string): Promise<void> {
	await ouvrirPanneau(page);
	await page.getByTestId("v3-project-new-name").fill(nom);
	await page.getByTestId("v3-project-create").click();
	await expect(page.getByTestId("v3-project-panel")).toBeHidden({
		timeout: 20_000,
	});
	await expect(page.getByTestId("v3-project-name")).toContainText(nom);
}

/** L'id du projet ACTIF, lu dans le panneau (aria-current) — unique, lui. */
async function projetActif(page: Page): Promise<string> {
	await ouvrirPanneau(page);
	const id = await page
		.locator('[data-testid="v3-project-item"][aria-current="true"]')
		.getAttribute("data-id");
	expect(id).not.toBeNull();
	return id ?? "";
}

/** BASCULE vers un autre projet par id et attend le remontage (panneau refermé). */
async function basculerVers(page: Page, id: string): Promise<void> {
	await ouvrirPanneau(page);
	await page
		.locator(`[data-testid="v3-project-item"][data-id="${id}"]`)
		.click();
	await expect(page.getByTestId("v3-project-panel")).toBeHidden({
		timeout: 20_000,
	});
}

/**
 * Ouvre une page V3 dans un PROJET FRAIS puis ÉTEINT l'IA (le mode déterministe pur).
 * Le projet frais d'abord, l'IA ensuite : la bascule de projet REMONTE le provider
 * (key par id), ce qui réinitialiserait une bascule IA éteinte trop tôt.
 */
async function openDeterministe(
	page: Page,
	nomDeProjet: string,
	path = "/v3/lab",
): Promise<void> {
	await page.goto(path);
	await expect(page.getByTestId("v3-project-name")).toBeVisible({
		timeout: 20_000,
	});
	await creerProjet(page, nomDeProjet);
	await eteindreIA(page);
}

/** Envoie un message au chat : remplir la saisie puis Envoyer (un TOUR re-jugé). */
async function send(page: Page, text: string): Promise<void> {
	await page.getByTestId("v3-input").fill(text);
	await page.getByTestId("v3-send").click();
}

/** Navigue vers une lentille PAR LA NAV (Link client — la session du layout survit). */
async function navTo(page: Page, route: string): Promise<void> {
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
	}, testInfo) => {
		// HERMÉTIQUE d'abord : un projet frais, puis la bascule IA éteinte (son
		// défaut ON est PROUVÉ dans eteindreIA, sur le projet fraîchement monté).
		await openDeterministe(page, `shell-${testInfo.testId}`, "/v3");

		// /v3 a REDIRIGÉ vers /v3/lab (la porte d'entrée est le chat).
		await expect(page).toHaveURL(/\/v3\/lab$/);

		// La nav offre les HUIT entrées (AI Lab · Parcours · Spécifications ·
		// Historique · Environnements · Code · Instance · Paramètres) + le retour
		// Workbench V2 en pied.
		await expect(page.getByTestId("v3-nav")).toBeVisible();
		await expect(page.getByTestId("v3-nav-item")).toHaveCount(8);
		await expect(page.getByTestId("v3-nav-workbench")).toBeVisible();

		// Le HERO d'accueil — accueillant, en français simple — et ses 4 amorces.
		await expect(page.getByTestId("v3-chat")).toContainText(
			"Construisons votre application ensemble",
		);
		await expect(page.getByTestId("v3-suggestion")).toHaveCount(4);
	});

	test("le chat agit : capture puis promotion — copie amicale, détail replié", async ({
		page,
	}, testInfo) => {
		await openDeterministe(page, `chat-${testInfo.testId}`);

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
	}, testInfo) => {
		await openDeterministe(page, `lentilles-${testInfo.testId}`);

		// UN PROJET NEUF EST NU : l'arbre se CONSTRUIT par le chat (plus aucun seed de
		// démo) — deux greffes canoniques, puis la capture + la promotion (même session).
		await send(page, "greffe le paiement sous app");
		await send(page, "greffe le checkout sous app/paiement");
		await send(page, CAPTURE);
		await send(page, "promeus la dernière idée");
		await expect(page.getByTestId("v3-msg-user")).toHaveCount(4);

		// ① HISTORIQUE : la timeline montre les QUATRE tours (la même session rejouée —
		// le provider vit dans le layout /v3, la nav client préserve l'arbre React).
		await navTo(page, "/v3/history");
		await expect(page.getByTestId("v3-history")).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByTestId("v3-history-turn")).toHaveCount(4);

		// ② ENVIRONNEMENTS : l'échelle entière est rendue (la carte dev au moins).
		await navTo(page, "/v3/environnements");
		await expect(page.getByTestId("v3-env-dev")).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByTestId("v3-env-staging")).toBeVisible();
		await expect(page.getByTestId("v3-env-prod")).toBeVisible();

		// ③ PARCOURS : le graphe (React Flow) rend l'arbre GREFFÉ PAR LE CHAT — au
		// moins 3 cartes (app → paiement → checkout) et la branche « paiement » est
		// sélectionnable (le sélecteur lit le même arbre rejoué).
		await navTo(page, "/v3/parcours");
		await expect(page.getByTestId("v3-parcours-graph")).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.locator(".react-flow__node").first()).toBeVisible({
			timeout: 20_000,
		});
		expect(
			await page.locator(".react-flow__node").count(),
		).toBeGreaterThanOrEqual(3);
		const paiementPick = page.locator(
			'[data-testid="v3-parcours-pick"][data-path="app/paiement"]',
		);
		await expect(paiementPick).toBeVisible();
		await expect(paiementPick).toContainText("paiement");

		// ④ PARAMÈTRES : les vérités déclarées listées — au moins 5 lignes.
		await navTo(page, "/v3/parametrage");
		await expect(page.getByTestId("v3-params")).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByTestId("v3-param").first()).toBeVisible();
		const totalRows = await page.getByTestId("v3-param").count();
		expect(totalRows).toBeGreaterThanOrEqual(5);

		// Le catalogue est COMPLET (paramCatalog — le twin lib/v3/params) : TOUTES
		// les vérités déclarées V1+V2, au moins 14 sections repliables (chat,
		// environnements, niveaux, facettes, preuves, seuils, écrans, agents,
		// modèles, autonomie, budgets, adoption, mur, autorités, liens, anatomie…).
		expect(
			await page.getByTestId("v3-param-section").count(),
		).toBeGreaterThanOrEqual(14);

		// « Les types d'agent avec leur harness » : la section agents expose le
		// modèle gouverné (claude-fable-5) noir sur blanc — la spec entière vient
		// de lib/agentlayer-data.ts, jamais découverte à l'exécution.
		await expect(
			page
				.locator('[data-testid="v3-param-section"][data-section="agents"]')
				.getByTestId("v3-param")
				.filter({ hasText: "claude-fable-5" })
				.first(),
		).toBeVisible();

		// La RECHERCHE filtre les lignes (repli des accents, côté client) :
		// « autonomie » réduit le compte sans jamais le vider — et l'effacer
		// rend le catalogue ENTIER (le filtre ne mute jamais le catalogue).
		await page.getByTestId("v3-param-search").fill("autonomie");
		await expect
			.poll(() => page.getByTestId("v3-param").count())
			.toBeLessThan(totalRows);
		expect(await page.getByTestId("v3-param").count()).toBeGreaterThanOrEqual(
			1,
		);
		await page.getByTestId("v3-param-search").fill("");
		await expect
			.poll(() => page.getByTestId("v3-param").count())
			.toBe(totalRows);

		// L'ANNEXE « Tous les écrans » existe (repliée par défaut — 180+ liens) : la
		// preuve VISIBLE que chaque écran « se trouve quelque part » (la loi de
		// couverture lib/v3/coverage.test.ts le prouve ; l'annexe le montre).
		await expect(page.getByTestId("v3-param-screens")).toBeAttached();
	});

	test("un projet neuf est NU : aucune branche de démo, l'état vide amical", async ({
		page,
	}, testInfo) => {
		// HERMÉTIQUE d'abord (projet frais + IA éteinte), puis la lentille Parcours
		// par la nav CLIENT — la session fraîche est rejouée sur l'arbre NU (bareTree).
		await openDeterministe(page, `nu-${testInfo.testId}`);
		await navTo(page, "/v3/parcours");

		// L'état vide AMICAL : pas de branches → le message + le CTA vers le chat.
		const empty = page.getByTestId("v3-parcours-empty");
		await expect(empty).toBeVisible({ timeout: 20_000 });
		await expect(empty).toContainText("Aucun parcours pour l'instant");
		await expect(empty.locator('a[href="/v3/lab"]')).toBeVisible();

		// AUCUN parcours pré-rempli : la branche de démo « paiement » N'EXISTE PAS
		// (le seed V2 ne fuit plus dans un projet neuf — bug utilisateur 2026-06-12).
		await expect(
			page.locator(
				'[data-testid="v3-parcours-pick"][data-path="app/paiement"]',
			),
		).toHaveCount(0);
	});

	test("l'historique revient en arrière : deux clics doux, la timeline raccourcit", async ({
		page,
	}, testInfo) => {
		await openDeterministe(page, `retour-${testInfo.testId}`);

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

	test("LE MUR : une session de 3 tours IA-éteinte n'émet AUCUNE écriture-vérité", async ({
		page,
	}, testInfo) => {
		// Le projet frais + l'IA éteinte D'ABORD (la mise en place écrit au magasin de
		// projets — une écriture LÉGALE, au-dessous de la ligne) ; on capte les requêtes
		// d'écriture (POST/PUT/PATCH/DELETE) à partir d'ICI, corps inclus.
		await openDeterministe(page, `mur-${testInfo.testId}`);
		const writes: Array<{ ligne: string; corps: string }> = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push({
					ligne: `${m} ${req.url()}`,
					corps: req.postData() ?? "",
				});
			}
		});

		// TROIS tours déterministes : capture → promotion → déploiement en dev.
		await send(page, CAPTURE);
		await send(page, "promeus la dernière idée");
		await send(page, "déploie l'application en dev");

		// La session a bien eu lieu : 3 bulles utilisateur, et le dernier tour est
		// le déploiement AMICAL (le cliquet a laissé passer le premier barreau).
		await expect(page.getByTestId("v3-msg-user")).toHaveCount(3);
		await expect(page.getByTestId("v3-msg-assistant").last()).toContainText(
			"Application déployée en dev",
		);

		// LE MUR : la SEULE écriture tolérée est la sauvegarde débondée du projet
		// (son corps porte le champ « transcript » — ADR 0061, un transcript de
		// PROPOSITIONS, jamais une vérité). Tout le reste — la server-action Claude
		// en tête (un POST sans « transcript ») — est interdit, bascule éteinte.
		const interdites = writes.filter((w) => !w.corps.includes("transcript"));
		expect(interdites.map((w) => w.ligne)).toEqual([]);
	});
});

test.describe("V3 — la palette, les spécifications, l'aperçu par env, l'instance", () => {
	test("la palette ouvre tout : ⌘K, filtrer « code », Entrée navigue", async ({
		page,
	}, testInfo) => {
		await openDeterministe(page, `palette-${testInfo.testId}`);

		// ⌘K / Ctrl+K OUVRE la palette (l'écouteur vit sur window — montée au layout).
		await page.keyboard.press("Control+k");
		await expect(page.getByTestId("v3-palette")).toBeVisible();

		// Filtrer « code » : les résultats incluent la lentille Code (data-route) —
		// les huit lentilles V3 passent D'ABORD, avant les écrans de la session.
		await page.getByTestId("v3-palette-input").fill("code");
		await expect(
			page.locator('[data-testid="v3-palette-item"][data-route="/v3/code"]'),
		).toBeVisible();

		// Entrée OUVRE le premier résultat : la palette NAVIGUE (router.push — elle
		// n'écrit rien, le mur §2) puis se referme.
		await page.getByTestId("v3-palette-input").press("Enter");
		await expect(page).toHaveURL(/\/v3\/code$/);
		await expect(page.getByTestId("v3-palette")).toBeHidden();
	});

	test("les spécifications : la grille s'allume sur les impacts, cliquer filtre", async ({
		page,
	}, testInfo) => {
		await openDeterministe(page, `specs-${testInfo.testId}`);

		// Deux tours canoniques : la capture puis la promotion — le DERNIER tour
		// impacte la version gelée + son idée (la même case product × F).
		await send(page, CAPTURE);
		await send(page, "promeus la dernière idée");
		await expect(page.getByTestId("v3-msg-assistant")).toHaveCount(2);

		// La lentille Spécifications PAR LA NAV (la même session rejouée).
		await navTo(page, "/v3/specs");
		await expect(page.getByTestId("v3-specs-grid")).toBeVisible({
			timeout: 20_000,
		});

		// LA GRILLE entière : 7 niveaux (SOURCE_ORDER) × 8 facettes = 56 cases.
		await expect(page.getByTestId("v3-specs-cell")).toHaveCount(56);

		// LA CASE IMPACTÉE par le dernier tour : product × F (le bare tree place la
		// capture à la racine « app »), compte ≥ 1, allumée en ambre (data-impacted)
		// — « quand le chat propose un changement, je VOIS dans la grille les impacts ».
		const impactee = page.locator(
			'[data-testid="v3-specs-cell"][data-impacted="true"]',
		);
		await expect(impactee).toHaveCount(1);
		await expect(impactee).toHaveAttribute("data-level", "product");
		await expect(impactee).toHaveAttribute("data-facet", "F");
		expect(
			Number.parseInt((await impactee.textContent()) ?? "0", 10),
		).toBeGreaterThanOrEqual(1);

		// CLIQUER la case FILTRE la liste : ≥ 1 ligne — la spec promue (statut
		// kernel), son scénario REPLIÉ présent (« contrôler, voir les scénarios »).
		await impactee.click();
		await expect(page.getByTestId("v3-specs-clear")).toBeVisible();
		const lignes = page.getByTestId("v3-specs-row");
		expect(await lignes.count()).toBeGreaterThanOrEqual(1);
		await expect(lignes.first()).toHaveAttribute("data-status", "kernel");
		await expect(lignes.first()).toContainText("au checkout");
		await expect(lignes.first().getByTestId("v3-specs-scenario")).toBeVisible();
	});

	test("voir le résultat par environnement : l'aperçu rend l'app telle que déployée", async ({
		page,
	}, testInfo) => {
		await openDeterministe(page, `apercu-${testInfo.testId}`);

		// Capture → promotion → déploiement en dev (le premier barreau du cliquet).
		await send(page, CAPTURE);
		await send(page, "promeus la dernière idée");
		await send(page, "déploie l'application en dev");
		await expect(page.getByTestId("v3-msg-assistant").last()).toContainText(
			"Application déployée en dev",
		);

		// La lentille Environnements (nav client) : la carte dev porte SA version
		// posée (content-adressée — app:<hash>).
		await navTo(page, "/v3/environnements");
		const carteDev = page.getByTestId("v3-env-dev");
		await expect(carteDev).toBeVisible({ timeout: 20_000 });
		const version = (await carteDev.locator("p.font-mono").textContent()) ?? "";
		expect(version).toMatch(/^app:/);

		// « VOIR le résultat » : l'aperçu s'ouvre (aria-pressed) et porte la PUCE DE
		// VERSION — l'app telle que déployée LÀ, reconstruite des seules versions
		// embarquées par le déploiement (projectionAt × emitApp), jamais des kernels
		// courants.
		await page.getByTestId("v3-env-view-dev").click();
		await expect(page.getByTestId("v3-env-view-dev")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		const apercu = page.getByTestId("v3-env-preview");
		await expect(apercu).toBeVisible();
		await expect(apercu).toContainText(version);
	});

	test("l'instance : les outils déclarés en tuiles + le formulaire de réglages", async ({
		page,
	}, testInfo) => {
		await openDeterministe(page, `instance-${testInfo.testId}`);
		await navTo(page, "/v3/instance");

		// La lentille Instance : le jeu DÉCLARÉ d'outils (INSTANCE_TOOLS — 7 tuiles,
		// ≥ 6 attendues), chacune adressée par sa clé.
		await expect(page.getByTestId("v3-instance")).toBeVisible({
			timeout: 20_000,
		});
		expect(
			await page.getByTestId("v3-inst-tool").count(),
		).toBeGreaterThanOrEqual(6);

		// VOS RÉGLAGES : le formulaire persisté (fail-closed via le twin) — une
		// entrée par outil déclaré + le bouton Enregistrer, actionnable.
		const form = page.getByTestId("v3-inst-config");
		await expect(form).toBeVisible();
		expect(await form.locator("input").count()).toBeGreaterThanOrEqual(6);
		await expect(page.getByTestId("v3-inst-save")).toBeEnabled();
	});
});

test.describe("V3 — le projet persistant (créer une app crée un projet, ADR 0061)", () => {
	test("créer une app crée un PROJET : on atterrit dans un projet, le neuf naît nu", async ({
		page,
	}, testInfo) => {
		// On atterrit TOUJOURS dans un projet persisté (auto-créé au tout premier
		// passage, sinon le plus récemment sauvé) : le commutateur porte un nom.
		await page.goto("/v3/lab");
		const nomActif = page.getByTestId("v3-project-name");
		await expect(nomActif).toBeVisible({ timeout: 20_000 });
		await expect(nomActif).not.toHaveText("—");
		await eteindreIA(page); // hermétique d'abord, comme toujours

		// Le panneau : l'astuce amicale + au moins le projet actif listé.
		await ouvrirPanneau(page);
		await expect(page.getByTestId("v3-project-panel")).toContainText(
			"Vos projets — chacun garde tout son historique.",
		);
		expect(
			await page.getByTestId("v3-project-item").count(),
		).toBeGreaterThanOrEqual(1);

		// « Créer » est GARDÉ tant que le nom est vide (le fail-closed, depuis l'écran).
		await expect(page.getByTestId("v3-project-create")).toBeDisabled();

		// LA CRÉATION : le commutateur affiche le nouveau projet… et le chat est NU
		// (le hero d'accueil, zéro bulle) — créer une app crée un projet VIERGE.
		const nom = `boutique-${testInfo.testId}`;
		await creerProjet(page, nom);
		await expect(page.getByTestId("v3-chat")).toContainText(
			"Construisons votre application ensemble",
		);
		await expect(page.getByTestId("v3-msg-user")).toHaveCount(0);
		await expect(page.getByTestId("v3-msg-assistant")).toHaveCount(0);
	});

	test("rouvrir = TOUT retrouver, partout, même état : reload puis rejeu du projet", async ({
		page,
	}, testInfo) => {
		const nom = `boutique-${testInfo.testId}`;
		await openDeterministe(page, nom);

		// Capte les sauvegardes (les POST de server action) à partir d'ICI : attendre
		// CELLE qui porte le tour 2 (« promeus ») rend le reload DÉTERMINISTE — la
		// sauvegarde est débondée (800 ms), rien ne doit se perdre en rechargeant.
		const sauvegardes: string[] = [];
		page.on("response", (res) => {
			const req = res.request();
			if (req.method() === "POST" && res.ok()) {
				sauvegardes.push(req.postData() ?? "");
			}
		});

		// Deux tours déterministes — les deux cartes amicales apparaissent.
		await send(page, CAPTURE);
		await send(page, "promeus la dernière idée");
		const cartes = page.getByTestId("v3-msg-assistant");
		await expect(cartes).toHaveCount(2);
		await expect(cartes.first()).toContainText("Votre idée a été ajoutée");
		await expect(cartes.last()).toContainText("Une version a été figée");

		// La sauvegarde portant le tour 2 est ÉCRITE (réponse reçue) — reload sûr.
		await expect
			.poll(() => sauvegardes.some((corps) => corps.includes("promeus")), {
				timeout: 15_000,
			})
			.toBe(true);

		// ROUVRIR : un VRAI rechargement — l'état client est jeté, le projet est
		// rechargé (cookie) puis REJOUÉ (turnsOf). La bascule IA peut revenir à son
		// défaut ON : aucun tour n'est envoyé après, le run reste hermétique.
		await page.reload();

		// MÊME PROJET, MÊME ÉTAT : le nom, les 2 bulles utilisateur, les cartes
		// amicales re-rendues depuis le REJEU (jamais depuis un état stocké).
		await expect(page.getByTestId("v3-project-name")).toContainText(nom, {
			timeout: 20_000,
		});
		await expect(page.getByTestId("v3-msg-user")).toHaveCount(2);
		await expect(page.getByTestId("v3-msg-user").first()).toContainText(
			"au checkout",
		);
		await expect(page.getByTestId("v3-msg-assistant")).toHaveCount(2);
		await expect(page.getByTestId("v3-msg-assistant").first()).toContainText(
			"Votre idée a été ajoutée",
		);
		await expect(page.getByTestId("v3-msg-assistant").last()).toContainText(
			"Une version a été figée",
		);

		// PARTOUT ① : l'historique montre les DEUX tours (la même session rejouée).
		await navTo(page, "/v3/history");
		await expect(page.getByTestId("v3-history-turn")).toHaveCount(2, {
			timeout: 20_000,
		});

		// PARTOUT ② : les environnements rendent l'échelle du MÊME état (rien n'a
		// été déployé dans ce projet : les trois cartes sont là, inchangées).
		await navTo(page, "/v3/environnements");
		await expect(page.getByTestId("v3-env-dev")).toBeVisible({
			timeout: 20_000,
		});
		await expect(page.getByTestId("v3-env-staging")).toBeVisible();
		await expect(page.getByTestId("v3-env-prod")).toBeVisible();

		// Le projet n'a pas bougé pendant le voyage (la nav cliente, même session).
		await expect(page.getByTestId("v3-project-name")).toContainText(nom);
	});

	test("deux projets, deux histoires : l'isolation des historiques, dans les deux sens", async ({
		page,
	}, testInfo) => {
		await page.goto("/v3/lab");
		await expect(page.getByTestId("v3-project-name")).toBeVisible({
			timeout: 20_000,
		});

		// LE PREMIER projet (celui où l'on atterrit) : son id — unique — et son nombre
		// de tours, lu sur le badge du panneau (tolérant à son contenu réel).
		const premierId = await projetActif(page);
		const badge = page
			.locator(`[data-testid="v3-project-item"][data-id="${premierId}"]`)
			.locator("span[title]");
		const premierTours = Number.parseInt(
			(await badge.textContent()) ?? "0",
			10,
		);

		// LE PROJET FRAIS : créé, IA éteinte (le remontage l'a réarmée), 2 tours.
		const nom = `isolation-${testInfo.testId}`;
		await creerProjet(page, nom);
		await eteindreIA(page);
		await send(page, CAPTURE);
		await send(page, "promeus la dernière idée");
		await expect(page.getByTestId("v3-msg-user")).toHaveCount(2);
		await expect(page.getByTestId("v3-msg-assistant")).toHaveCount(2);
		const fraisId = await projetActif(page);
		expect(fraisId).not.toBe(premierId);

		// BASCULE vers le premier (la bascule FLUSH la sauvegarde — aucun tour perdu) :
		// le chat montre SON histoire à lui, pas les 2 tours du frais — le compte de
		// bulles égale exactement son badge (l'assertion tolérante à son contenu).
		await basculerVers(page, premierId);
		await expect(page.getByTestId("v3-msg-user")).toHaveCount(premierTours);
		expect(await projetActif(page)).toBe(premierId);

		// BASCULE retour : le frais retrouve EXACTEMENT ses 2 tours, cartes amicales
		// rejouées — l'isolation tient dans les deux sens.
		await basculerVers(page, fraisId);
		await expect(page.getByTestId("v3-project-name")).toContainText(nom);
		await expect(page.getByTestId("v3-msg-user")).toHaveCount(2);
		await expect(page.getByTestId("v3-msg-assistant")).toHaveCount(2);
		await expect(page.getByTestId("v3-msg-assistant").first()).toContainText(
			"Votre idée a été ajoutée",
		);
		expect(await projetActif(page)).toBe(fraisId);
	});
});
