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

		// Étape 2 — la coordonnée (niveau × facette × échelle fractale).
		await expect(page.getByTestId("v2-idee-state")).toContainText("coordonnee");
		await page.getByTestId("v2-idee-level").selectOption("operation");
		await page.getByTestId("v2-idee-facet").selectOption("F");
		await page.getByTestId("v2-idee-scale").selectOption("kernel");
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
		await page.getByTestId("v2-idee-intent").fill("Je veux payer en un clic");
		await page.getByTestId("v2-idee-next").click();
		await page.getByTestId("v2-idee-level").selectOption("entity");
		await page.getByTestId("v2-idee-facet").selectOption("I");
		await page.getByTestId("v2-idee-scale").selectOption("feuille");
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

	test("coexistence : /v2/idee 200 et l'ancien Workbench / 200", async ({
		page,
	}) => {
		const idee = await page.goto("/v2/idee");
		expect(idee?.status()).toBe(200);
		const home = await page.goto("/");
		expect(home?.status()).toBe(200);
	});
});
