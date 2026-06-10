import { expect, test } from "@playwright/test";

/**
 * WB2-07 Playwright e2e — l'écran /v2/dag : le VERSION DAG (S24, §120-§125) rendu en React Flow.
 * Les nœuds = des versions (phases stables, identité = hash content-addressé), les arêtes = des
 * ChangeSets. APPEND-ONLY : la ligne abandonnée reste dessinée ; deux bandes (above/below, §124).
 * mirror record: reflects=WB2-07-version-dag, test_kind=e2e, cert_language=playwright,
 * liveness=live, authority=above (projection de lecture, le mur intact).
 *
 * Les critères de done WB2-07, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - PAN/ZOOM : le canvas React Flow est navigable (Controls + zoom) ;
 *   - UNE BRANCHE S'AFFICHE : les versions (v0,v1,v2,w1,g1,v2a) + leurs arêtes (ChangeSets), la tête
 *     mise en avant, la ligne abandonnée v2 présente, les deux bandes above/below ;
 *   - ACTION-CAPABLE : cliquer une version l'ouvre (descend dans son détail : hash, parents, strate) ;
 *   - le BAS read-only : aucune requête d'écriture (POST/PUT/PATCH/DELETE) ;
 *   - DÉTERMINISTE : mêmes versions au rechargement (le DAG canonique est pur).
 */

const VERSIONS = ["v0", "v1", "v2", "w1", "g1", "v2a"];

test.describe("WB2-07 /v2/dag — le DAG de versions (React Flow)", () => {
	test("une branche s'affiche : versions + ChangeSets, tête mise en avant, ligne abandonnée présente, deux bandes ; pan/zoom ; action-capable ; jamais une écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/dag");
		await expect(page.getByTestId("v2-dag-title")).toBeVisible();
		await expect(page.getByTestId("v2-dag-wall-note")).toBeVisible();
		await expect(page.getByTestId("v2-dag-canvas")).toBeVisible();

		// UNE BRANCHE S'AFFICHE : les six versions du DAG canonique §120 sont rendues.
		for (const label of VERSIONS) {
			await expect(page.getByTestId(`v2-dag-node-${label}`)).toBeVisible();
		}

		// La tête courante est mise en avant (v1 après checkout_ancestor) ; v2 abandonnée présente.
		await expect(page.getByTestId("v2-dag-node-v1")).toHaveAttribute(
			"data-head",
			"true",
		);
		await expect(page.getByTestId("v2-dag-node-v2")).toHaveAttribute(
			"data-head",
			"false",
		);
		await expect(page.getByTestId("v2-dag-head")).toContainText("v1");

		// Les deux bandes de la ligne de flottaison (§124) : above ∧ below.
		await expect(page.getByTestId("v2-dag-band-above")).toBeVisible();
		await expect(page.getByTestId("v2-dag-band-below")).toBeVisible();
		// g1 est en strate below (évolutionnaire) ; v1 en above (vérité humaine).
		await expect(page.getByTestId("v2-dag-node-g1")).toHaveAttribute(
			"data-stratum",
			"below",
		);
		await expect(page.getByTestId("v2-dag-node-v1")).toHaveAttribute(
			"data-stratum",
			"above",
		);

		// Le résumé compte les nœuds (6) et les arêtes/ChangeSets (5).
		await expect(page.getByTestId("v2-dag-summary")).toHaveAttribute(
			"data-node-count",
			"6",
		);
		await expect(page.getByTestId("v2-dag-summary")).toHaveAttribute(
			"data-edge-count",
			"5",
		);

		// PAN/ZOOM : les Controls React Flow sont présents (zoom in/out, fit) — navigable.
		await expect(page.locator(".react-flow__controls")).toBeVisible();
		await page.locator(".react-flow__controls-zoomin").click();

		// ACTION-CAPABLE : cliquer une version l'ouvre (descend dans son détail).
		await page.getByTestId("v2-dag-node-v2a").click();
		await expect(page.getByTestId("v2-dag-node-detail")).toBeVisible();
		await expect(page.getByTestId("v2-dag-detail-hash")).toBeVisible();
		// v2a est rebranché sur v1 → atteignable depuis la racine v0.
		await expect(page.getByTestId("v2-dag-detail-reachable")).toBeVisible();
		await expect(page.getByTestId("v2-dag-detail-readonly")).toBeVisible();

		// LE MUR : aucune requête d'écriture n'a été émise (bas read-only).
		expect(writes).toEqual([]);
	});

	test("DÉTERMINISTE : mêmes versions au rechargement (le DAG canonique est pur)", async ({
		page,
	}) => {
		const readHashes = async () => {
			const out: Record<string, string | null> = {};
			for (const label of VERSIONS) {
				out[label] = await page
					.getByTestId(`v2-dag-node-${label}`)
					.textContent();
			}
			return out;
		};

		await page.goto("/v2/dag");
		await expect(page.getByTestId("v2-dag-canvas")).toBeVisible();
		const first = await readHashes();

		await page.reload();
		await expect(page.getByTestId("v2-dag-canvas")).toBeVisible();
		const second = await readHashes();

		// Le DAG est content-addressé et pur : mêmes hashes au rechargement.
		expect(second).toEqual(first);
	});
});
