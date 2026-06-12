import { expect, test } from "@playwright/test";

/**
 * WB2-03 Playwright e2e — l'écran /v2/idee : le WIZARD XState qui capture un besoin → une idée.
 * mirror record: reflects=WB2-03-idea, test_kind=e2e, cert_language=playwright,
 * liveness=live, authority=above (l'idée PROPOSE, n'écrit aucune vérité).
 *
 * Les critères de done WB2-03, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - le parcours wizard COMPLET (intention → coordonnée → provenance → revue → PROPOSER) ;
 *   - aboutit à UNE idée proposée (amber), avec son empreinte, sa coordonnée et sa forme de
 *     miroir attendue ;
 *   - l'ÉCHELLE VIVANTE (ADR 0055, §49/§108) : l'échelle est une POSITION (un chemin) dans
 *     l'arbre composes — le SYSTÈME propose le placement (placeIntent), l'HUMAIN surcharge
 *     (le picker) ou GREFFE (l'arbre pousse, profondeur illimitée) ; racine/cellule/kernel/
 *     feuille sont des rôles DÉRIVÉS de la position, jamais stockés ;
 *   - le mur intact : hasMirror=false ET wroteKernel=false affichés ; AUCUNE requête d'écriture ;
 *   - XState : les états sont VISIBLES (le stepper + l'état courant) et les transitions
 *     exécutables (Suivant / Précédent / Proposer / Recommencer).
 */

test.describe("WB2-03 /v2/idee — wizard XState de capture d'idée", () => {
	test("parcours wizard complet → une idée proposée (amber), jamais une écriture-vérité", async ({
		page,
	}) => {
		// Capte toute requête d'écriture (le mur) : POST/PUT/PATCH/DELETE = interdit.
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/idee");
		await expect(page.getByTestId("v2-idee-title")).toBeVisible();
		await expect(page.getByTestId("v2-idee-wall-note")).toBeVisible();

		// État VISIBLE : on démarre à l'intention.
		await expect(page.getByTestId("v2-idee-state")).toContainText("intention");
		await expect(page.getByTestId("v2-idee-stepper")).toHaveAttribute(
			"data-state",
			"intention",
		);

		// Étape 1 — l'intention.
		await page.getByTestId("v2-idee-intent").fill("Je veux payer en un clic");
		await page.getByTestId("v2-idee-next").click();

		// Étape 2 — la coordonnée (niveau × facette × échelle = une POSITION dans l'arbre
		// composes, ADR 0055). Ici l'humain SURCHARGE le placement proposé : il clique un
		// nœud du picker (§49 — les frontières sont posées par jugement humain).
		await expect(page.getByTestId("v2-idee-state")).toContainText("coordonnee");
		await page.getByTestId("v2-idee-level").selectOption("operation");
		await page.getByTestId("v2-idee-facet").selectOption("F");
		await page
			.locator(
				'[data-testid="v2-idee-scale-node"][data-path="app/paiement/checkout"]',
			)
			.click();
		// le chemin choisi + son rôle DÉRIVÉ de la position (jamais stocké) : checkout = kernel.
		await expect(page.getByTestId("v2-idee-scale-path")).toHaveText(
			"app/paiement/checkout",
		);
		await expect(page.getByTestId("v2-idee-scale-role")).toContainText(
			"Kernel",
		);
		await page.getByTestId("v2-idee-next").click();

		// Étape 3 — la provenance.
		await expect(page.getByTestId("v2-idee-state")).toContainText("provenance");
		await page.getByTestId("v2-idee-provenance-humain").click();
		await page.getByTestId("v2-idee-next").click();

		// Étape 4 — la revue, puis PROPOSER.
		await expect(page.getByTestId("v2-idee-state")).toContainText("revue");
		await expect(page.getByTestId("v2-idee-review")).toContainText(
			"Je veux payer en un clic",
		);
		await page.getByTestId("v2-idee-propose").click();

		// Étape 5 — l'idée PROPOSÉE (amber), content-adressée, le mur affiché.
		await expect(page.getByTestId("v2-idee-state")).toContainText("proposee");
		const proposed = page.getByTestId("v2-idee-proposed");
		await expect(proposed).toBeVisible();
		await expect(page.getByTestId("v2-idee-hash")).toHaveText(/^[0-9a-f]{8}$/);
		await expect(page.getByTestId("v2-idee-mirror-form")).toContainText(
			"fixture_n2",
		);
		await expect(page.getByTestId("v2-idee-has-mirror")).toContainText("false");
		await expect(page.getByTestId("v2-idee-wrote-kernel")).toContainText(
			"false",
		);

		// LE MUR : aucune requête d'écriture n'a été émise par le parcours.
		expect(writes).toEqual([]);
	});

	test("transition PRÉCÉDENT recule d'un étage (état visible)", async ({
		page,
	}) => {
		await page.goto("/v2/idee");
		await page.getByTestId("v2-idee-intent").fill("un besoin valide");
		await page.getByTestId("v2-idee-next").click();
		await expect(page.getByTestId("v2-idee-state")).toContainText("coordonnee");
		await page.getByTestId("v2-idee-back").click();
		await expect(page.getByTestId("v2-idee-state")).toContainText("intention");
	});

	test("RECOMMENCER remet le wizard à zéro après une proposition", async ({
		page,
	}) => {
		await page.goto("/v2/idee");
		await page
			.getByTestId("v2-idee-intent")
			.fill("Au checkout, débiter le compte une seule fois");
		await page.getByTestId("v2-idee-next").click();
		await page.getByTestId("v2-idee-level").selectOption("entity");
		await page.getByTestId("v2-idee-facet").selectOption("I");
		// le SYSTÈME propose le placement (placeIntent — accroche lexicale « checkout » /
		// « compte » → la feuille canonique du seed) ; l'humain l'ADOPTE d'un clic.
		await expect(page.getByTestId("v2-idee-placement")).toBeVisible();
		await expect(page.getByTestId("v2-idee-placement")).toContainText(
			"app/paiement/checkout/debit-du-compte",
		);
		await page.getByTestId("v2-idee-placement-use").click();
		await expect(page.getByTestId("v2-idee-scale-path")).toHaveText(
			"app/paiement/checkout/debit-du-compte",
		);
		await expect(page.getByTestId("v2-idee-scale-role")).toContainText(
			"Feuille",
		);
		await page.getByTestId("v2-idee-next").click();
		await page.getByTestId("v2-idee-provenance-incident").click();
		await page.getByTestId("v2-idee-next").click();
		await page.getByTestId("v2-idee-propose").click();
		await expect(page.getByTestId("v2-idee-proposed")).toBeVisible();
		// entity → property_n1 (la table EL10, réutilisée).
		await expect(page.getByTestId("v2-idee-mirror-form")).toContainText(
			"property_n1",
		);
		await page.getByTestId("v2-idee-restart").click();
		await expect(page.getByTestId("v2-idee-state")).toContainText("intention");
		await expect(page.getByTestId("v2-idee-intent")).toHaveValue("");
	});

	test("GREFFER fait pousser l'arbre (profondeur illimitée) et auto-sélectionne le nouveau nœud", async ({
		page,
	}) => {
		await page.goto("/v2/idee");
		await page
			.getByTestId("v2-idee-intent")
			.fill("faire pousser l'arbre des échelles");
		await page.getByTestId("v2-idee-next").click();
		await expect(page.getByTestId("v2-idee-state")).toContainText("coordonnee");

		// On sélectionne la feuille LA PLUS PROFONDE du seed…
		const leaf = page.locator(
			'[data-testid="v2-idee-scale-node"][data-path="app/paiement/checkout/debit-du-compte"]',
		);
		await leaf.click();
		await expect(page.getByTestId("v2-idee-scale-role")).toContainText(
			"Feuille",
		);

		// …et on GREFFE dessous : l'arbre POUSSE (append-only, §9), AU-DELÀ de la
		// profondeur du seed — la profondeur est ILLIMITÉE (fractal, §49).
		await page.getByTestId("v2-idee-grow-label").fill("preuve d'idempotence");
		await page.getByTestId("v2-idee-grow").click();

		const grown = page.locator(
			'[data-testid="v2-idee-scale-node"][data-path="app/paiement/checkout/debit-du-compte/preuve-d-idempotence"]',
		);
		await expect(grown).toBeVisible(); // le nœud EXISTE : l'arbre a poussé
		await expect(grown).toHaveAttribute("aria-pressed", "true"); // et il est AUTO-SÉLECTIONNÉ
		await expect(page.getByTestId("v2-idee-scale-path")).toHaveText(
			"app/paiement/checkout/debit-du-compte/preuve-d-idempotence",
		);
		await expect(page.getByTestId("v2-idee-scale-role")).toContainText(
			"Feuille",
		);
		// la MÊME donnée change de rôle quand l'arbre pousse : l'ancienne feuille DEVIENT
		// kernel (le rôle est une lecture DÉRIVÉE de la position, jamais stocké — ADR 0055).
		await expect(leaf).toContainText("Kernel");
		// le champ de greffe est vidé après la greffe.
		await expect(page.getByTestId("v2-idee-grow-label")).toHaveValue("");
	});

	test("coexistence : /v2/idee 200 et l'ancien Workbench / 200", async ({
		page,
	}) => {
		const idee = await page.goto("/v2/idee");
		expect(idee?.status()).toBe(200);
		const home = await page.goto("/");
		expect(home?.status()).toBe(200);
	});
});
