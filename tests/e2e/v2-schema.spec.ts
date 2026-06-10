import { expect, test } from "@playwright/test";

/**
 * WB2-02 Playwright e2e — la page d'accueil /v2 = LE schéma KRD interactif (React Flow,
 * lecture seule), chaque bloc cliquable menant à son écran.
 * mirror record: reflects=WB2-02-schema, test_kind=e2e, cert_language=playwright,
 * liveness=live, authority=below (lecture seule, le mur intact).
 *
 * Les critères de done WB2-02, atteints depuis l'écran :
 *   - /v2 rend le diagramme du schéma (React Flow) ;
 *   - les neuf blocs du schéma sont présents, libellés depuis le glossaire (FR) ;
 *   - CHAQUE bloc du schéma NAVIGUE (exécutable) vers son écran /v2/<slug> ;
 *   - le bon vocabulaire : « Idée » jamais « Idea », « Mur » jamais « Wall » (FR par défaut) ;
 *   - l'empreinte déterministe du schéma est affichée (déterminisme-first).
 *
 * LE MUR : le diagramme PROPOSE / NAVIGUE ; il n'écrit aucune vérité.
 */

const SLUGS = [
	"idee",
	"mur",
	"kernel",
	"verticale",
	"facette",
	"paires-miroir",
	"liens",
	"arbres",
	"cellules",
] as const;

const FR_LABEL: Record<string, string> = {
	idee: "Idée",
	mur: "Mur",
	kernel: "Kernel",
	verticale: "Verticale",
	facette: "Facette",
	"paires-miroir": "Paires-miroir",
	liens: "Liens",
	arbres: "Arbres",
	cellules: "Cellules",
};

test.describe("WB2-02 — la page d'accueil = le schéma KRD interactif", () => {
	test("/v2 rend le diagramme du schéma (React Flow) + son empreinte", async ({
		page,
	}) => {
		await page.goto("/v2");
		await expect(page.getByTestId("v2-schema-diagram")).toBeVisible();
		await expect(page.getByTestId("v2-schema-hash")).toBeVisible();
		await expect(page.getByTestId("v2-schema-hash")).toContainText(
			/empreinte du schéma|schema hash/,
		);
	});

	test("les neuf blocs sont présents, libellés depuis le glossaire (FR)", async ({
		page,
	}) => {
		await page.goto("/v2");
		for (const slug of SLUGS) {
			const node = page.getByTestId(`v2-schema-node-${slug}`);
			await expect(node).toBeVisible();
			await expect(node).toHaveText(FR_LABEL[slug]);
		}
		// le bon vocabulaire : pur français, jamais le franglais.
		await expect(page.getByTestId("v2-schema-node-idee")).toHaveText("Idée");
		await expect(page.getByTestId("v2-schema-node-mur")).toHaveText("Mur");
	});

	test("chaque bloc du schéma navigue (exécutable) vers son écran /v2/<slug>", async ({
		page,
	}) => {
		for (const slug of SLUGS) {
			await page.goto("/v2", { waitUntil: "domcontentloaded" });
			const node = page.getByTestId(`v2-schema-node-${slug}`);
			await expect(node).toBeVisible();
			await node.click();
			await expect(page).toHaveURL(new RegExp(`/v2/${slug}$`));
			await expect(page.getByTestId("v2-concept-title")).toHaveText(
				FR_LABEL[slug],
			);
			await expect(page.getByTestId("v2-concept-def")).toBeVisible();
		}
	});

	test("la coexistence tient : /v2 200 ET l'ancien / 200", async ({ page }) => {
		const v2 = await page.goto("/v2");
		expect(v2?.status()).toBe(200);
		const v1 = await page.goto("/");
		expect(v1?.status()).toBe(200);
	});
});
