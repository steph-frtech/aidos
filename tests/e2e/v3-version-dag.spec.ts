import { expect, test } from "@playwright/test";

/**
 * V3 — LE DAG DE VERSIONS (lentille portée NATIVE dans /v3, parcours « Comprendre »).
 * mirror record: reflects=V3-version-dag-lens, test_kind=e2e, cert_language=playwright,
 * liveness=live, authority=above (l'écran LIT + projette l'espace des versions, n'écrit rien).
 *
 * Prouve que le concept S24 (« le DAG de versions », KRD §120–§125) est porté EN PROPRE dans
 * la session V3 : la lentille est ATTEIGNABLE depuis la nav V3 regroupée (section
 * « Comprendre »), montée DANS le shell V3, et elle lit EN DIRECT l'espace des versions du
 * projet actif via la passerelle — `liveHeads` (`dag_heads`) + `liveGraph` (`dag_get`), les
 * deux lectures en dessous de la ligne dispatchées sur le serveur Go `dag` (S59/ADR 0092). Le
 * décodeur pur + le graphe de démo (§120 canonique) sont RÉUTILISÉS du concept top-level
 * `app/version-dag/live.ts` (« twins must die » — aucune logique Go ré-implémentée) ; le
 * graphe de démo n'est que le repli déterministe honnête (ADR 0074).
 *
 * Critères de done revérifiés depuis V3 :
 *   - la lentille apparaît dans la nav V3 (section « Comprendre ») et y NAVIGUE (Link client,
 *     jamais un page.goto) — ce n'est PLUS un placeholder « bientôt » ;
 *   - les deux blocs LIVE (têtes + graphe entier) s'affichent avec un badge de source HONNÊTE
 *     (en direct si le serveur Go répond, sinon démo) ;
 *   - le graphe stratifié par la ligne de flottaison montre la bande « au-dessus » (vérité
 *     humaine) ET la bande « en dessous » (variantes évolutives, §124), la (les) tête(s)
 *     surlignée(s), et les arêtes (ChangeSets) — le §120 canonique en repli.
 *
 * LE MUR (§2) : l'écran LIT + AFFICHE — il n'écrit aucune vérité (têtes/nœuds/arêtes =
 * projections ; enregistrer un nœud/une arête passe par le rôle `aidos` via le MCP dag).
 */

test.describe("V3 — le DAG de versions porté native (S24 dans le shell V3)", () => {
	test("la lentille est dans la nav V3 (« Comprendre ») et y navigue (Link client)", async ({
		page,
	}) => {
		await page.goto("/v3/lab");
		// L'entrée de nav existe, n'est PLUS un placeholder « bientôt ».
		const item = page.locator(
			'[data-testid="v3-nav-item"][data-route="/v3/version-dag"]',
		);
		await expect(item).toBeVisible();
		await expect(
			page.locator('[data-testid="v3-nav-soon"][data-route="/v3/version-dag"]'),
		).toHaveCount(0);
		// Elle est sous l'en-tête du parcours « Comprendre ».
		await expect(
			page.locator('[data-testid="v3-nav-group"][data-group="navGroupComprendre"]'),
		).toBeVisible();
		// Navigation CLIENT (le Link de la nav, jamais page.goto) → la lentille s'affiche.
		await item.click();
		await expect(page).toHaveURL(/\/v3\/version-dag$/);
		await expect(page.getByTestId("v3-version-dag")).toBeVisible();
		// Le shell V3 enveloppe bien la lentille (la nav reste montée).
		await expect(page.getByTestId("v3-nav")).toBeVisible();
	});

	test("les deux blocs LIVE (têtes + graphe) s'affichent avec un badge de source honnête", async ({
		page,
	}) => {
		await page.goto("/v3/version-dag");
		await expect(page.getByTestId("v3-version-dag-lens")).toBeVisible();

		// Bloc « Têtes du DAG (en direct) » — un badge de source (en direct | démo).
		await expect(page.getByTestId("v3-dag-heads")).toBeVisible();
		const headsSource = page.getByTestId("v3-dag-heads-source");
		await expect(headsSource).toBeVisible();
		await expect(headsSource).toHaveAttribute("data-source", /^(live|demo)$/);
		await expect(page.getByTestId("v3-dag-heads-list")).toBeVisible();

		// Bloc « DAG complet (en direct) » — un badge de source (en direct | démo).
		await expect(page.getByTestId("v3-dag-graph")).toBeVisible();
		const graphSource = page.getByTestId("v3-dag-graph-source");
		await expect(graphSource).toBeVisible();
		await expect(graphSource).toHaveAttribute("data-source", /^(live|demo)$/);
	});

	test("le graphe est stratifié par la ligne de flottaison — têtes surlignées + arêtes (§120/§124)", async ({
		page,
	}) => {
		await page.goto("/v3/version-dag");

		// Les deux bandes de la ligne de flottaison (§124) — le §120 canonique en repli :
		// trois nœuds au-dessus (vérité humaine), un en dessous (variante évolutive).
		await expect(page.getByTestId("v3-dag-band-above")).toBeVisible();
		await expect(page.getByTestId("v3-dag-band-below")).toBeVisible();

		// Au moins une tête est surlignée (data-head="true") dans le graphe.
		await expect(
			page.locator('[data-testid="v3-dag-graph"] li[data-head="true"]').first(),
		).toBeVisible();

		// Les arêtes (ChangeSets, S20) sont listées (l'ajout-seul rendu visible).
		await expect(page.getByTestId("v3-dag-graph-edges")).toBeVisible();
	});
});
