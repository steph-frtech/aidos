import { expect, test } from "@playwright/test";

/**
 * WB2-06 Playwright e2e — l'écran /v2/anatomie/[kernel] : l'ANATOMIE 1-pour-1 d'un kernel, les SIX
 * paires-miroir autour du MUR (Spec↔Doc · Comportement↔Résultats · Scénarios↔Tests · Modèle↔
 * Projection · Contrat↔Code · Evidence-attendue↔Evidence-observée).
 * mirror record: reflects=WB2-06-anatomy, test_kind=e2e, cert_language=playwright,
 * liveness=live, authority=above (projection de lecture, le mur intact).
 *
 * Les critères de done WB2-06, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - LE MUR DESSINÉ : les six paires, chacune avec sa face AU-DESSUS (déclaré) ∧ EN DESSOUS (prouvé) ;
 *   - le BAS read-only : aucun contrôle d'écriture sous le mur, AUCUNE requête d'écriture ;
 *   - voyants DÉTERMINISTES : 🟢/🔴/🟡 par paire, mêmes au rechargement (même kernelId → mêmes voyants) ;
 *   - ACTION-CAPABLE : cliquer une paire l'ouvre (descend dans son détail).
 */

const PAIRS = [
	"spec_doc",
	"behavior_results",
	"scenarios_tests",
	"model_projection",
	"contract_code",
	"evidence",
];
const VOYANTS = ["green", "red", "amber"];

test.describe("WB2-06 /v2/anatomie/[kernel] — les six paires-miroir autour du mur", () => {
	test("le mur dessiné : six paires, déclaré au-dessus ∧ prouvé en dessous, voyants computés, jamais une écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/anatomie/k0");
		await expect(page.getByTestId("v2-anatomie-title")).toBeVisible();
		await expect(page.getByTestId("v2-anatomie-kernel-id")).toHaveText("k0");
		await expect(page.getByTestId("v2-anatomie-wall-note")).toBeVisible();
		await expect(page.getByTestId("v2-anatomie-wall")).toBeVisible();

		// LE MUR DESSINÉ : les six paires, chacune avec sa face au-dessus ∧ en dessous + un voyant.
		for (const k of PAIRS) {
			const pair = page.getByTestId(`v2-anatomie-pair-${k}`);
			await expect(pair).toBeVisible();
			await expect(page.getByTestId(`v2-anatomie-above-${k}`)).toBeVisible();
			await expect(page.getByTestId(`v2-anatomie-below-${k}`)).toBeVisible();
			// Le voyant est un des trois (computé, jamais déclaré).
			const v = await pair.getAttribute("data-voyant");
			expect(VOYANTS).toContain(v);
			await expect(page.getByTestId(`v2-anatomie-voyant-${k}`)).toBeVisible();
		}

		// Le voyant global est computé (data-overall ∈ {green,red,amber}).
		const overall = await page
			.getByTestId("v2-anatomie-overall")
			.getAttribute("data-overall");
		expect(VOYANTS).toContain(overall);

		// ACTION-CAPABLE : cliquer une paire l'ouvre (descend dans son détail).
		await page.getByTestId(`v2-anatomie-pair-${PAIRS[0]}`).click();
		await expect(page.getByTestId("v2-anatomie-pair-detail")).toBeVisible();
		await expect(page.getByTestId("v2-anatomie-detail-declared")).toBeVisible();
		await expect(page.getByTestId("v2-anatomie-detail-proven")).toBeVisible();
		// Le bas reste read-only : le détail le rappelle, aucun contrôle d'écriture.
		await expect(page.getByTestId("v2-anatomie-detail-readonly")).toBeVisible();

		// LE MUR : aucune requête d'écriture n'a été émise (bas read-only).
		expect(writes).toEqual([]);
	});

	test("voyants DÉTERMINISTES : même kernelId → mêmes voyants au rechargement", async ({
		page,
	}) => {
		const read = async () => {
			const out: Record<string, string | null> = {};
			for (const k of PAIRS) {
				out[k] = await page
					.getByTestId(`v2-anatomie-pair-${k}`)
					.getAttribute("data-voyant");
			}
			return out;
		};

		await page.goto("/v2/anatomie/abc123");
		await expect(page.getByTestId("v2-anatomie-wall")).toBeVisible();
		const first = await read();

		await page.reload();
		await expect(page.getByTestId("v2-anatomie-wall")).toBeVisible();
		const second = await read();

		expect(second).toEqual(first);

		// Deux kernels DIFFÉRENTS rendent tous deux six paires (jamais un écran mort).
		await page.goto("/v2/anatomie/zzz999");
		await expect(page.getByTestId("v2-anatomie-wall")).toBeVisible();
		for (const k of PAIRS) {
			expect(VOYANTS).toContain(
				await page
					.getByTestId(`v2-anatomie-pair-${k}`)
					.getAttribute("data-voyant"),
			);
		}
	});
});
