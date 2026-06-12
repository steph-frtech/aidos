import { expect, test } from "@playwright/test";

/**
 * WB2-26 Playwright e2e — l'écran /v2/code : la DESCENTE DANS LE CODE (ADR 0056 — graphify + Bazel).
 * mirror record: reflects=WB2-26-code, test_kind=e2e, cert_language=playwright,
 * liveness=live, authority=above (l'écran LIT le code et SIMULE l'impact ; aucune écriture-vérité).
 *
 * Les critères de done WB2-26, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - LA DESCENTE (§49 prolongé sous la feuille) : requirement → fichier → classe → fonction →
 *     version (hash) → LIGNE — l'arbre de contenance montre les fichiers RÉELS du dépôt
 *     (lib/v2/*.ts, extraits de l'AST TypeScript, jamais déclarés à la main ni générés par un
 *     LLM), l'ancrage propose « telle classe, telle fonction », le panneau code surligne le
 *     span et le lien vscode://file ouvre l'éditeur à la ligne exacte ;
 *   - « QUOI TOUCHE QUOI » : impactOf — la vague de rouge (S22) au grain code (le rdeps de
 *     Bazel) : CALCULÉE (arêtes extracted de l'AST + remontée des conteneurs, groupée par
 *     profondeur), jamais estimée ;
 *   - les GOD NODES (graphify) : les points de couplage — le degré entrant est AFFICHÉ ;
 *   - le mur intact (§2) : AUCUNE requête d'écriture — l'écran lit et simule, la promotion
 *     reste idée → miroir → /goal.
 */

test.describe("WB2-26 /v2/code — la descente dans le code", () => {
	test("la descente : requirement → ancrage → fichier → span surligné → lien VS Code à la ligne", async ({
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

		await page.goto("/v2/code");
		await expect(page.getByTestId("v2-code-wall-note")).toBeVisible();

		// L'arbre de contenance montre les fichiers RÉELS du dépôt — pas une liste déclarée :
		// lib/v2/composition.ts (le twin de l'échelle vivante) est un nœud extrait du source.
		await expect(page.getByTestId("v2-code-tree")).toBeVisible();
		await expect(
			page
				.locator(
					'[data-testid="v2-code-node"][data-symbol*="lib/v2/composition.ts"]',
				)
				.first(),
		).toBeVisible();

		// Le requirement (l'arbre composes, ADR 0055) : on choisit la FEUILLE canonique —
		// l'ancrage propose « telle classe, telle fonction » (score lexical déterministe).
		await page
			.getByTestId("v2-code-req")
			.selectOption("app/paiement/checkout/debit-du-compte");
		const anchors = page.getByTestId("v2-code-anchor");
		await expect(anchors.first()).toBeVisible();
		expect(await anchors.count()).toBeGreaterThanOrEqual(1);

		// On clique le premier ancrage : la descente atteint le FICHIER puis la LIGNE.
		const symbol = await anchors.first().getAttribute("data-symbol");
		expect(symbol).toBeTruthy(); // "<fichier>#<nom>"
		const file = (symbol ?? "").split("#")[0];
		expect(file).toMatch(/^lib\/v2\/.+\.ts$/); // un fichier réel du dépôt
		await anchors.first().click();

		// Le panneau code : le source numéroté du fichier, le span du symbole SURLIGNÉ.
		const pane = page.getByTestId("v2-code-pane");
		await expect(pane).toBeVisible();
		expect(await pane.locator("[data-line]").count()).toBeGreaterThan(10);
		expect(
			await pane.locator("[data-line].bg-primary\\/10").count(),
		).toBeGreaterThan(0);

		// Le lien VS Code descend jusqu'à la LIGNE : vscode://file<abs>/<fichier>:<ligne>:1.
		const href = await page.getByTestId("v2-code-vscode").getAttribute("href");
		expect(href?.startsWith("vscode://file")).toBe(true);
		expect(href).toContain(file);

		// LE MUR : aucune requête d'écriture n'a été émise par la descente.
		expect(writes).toEqual([]);
	});

	test("quoi touche quoi : impactOf(slugify) — la vague de rouge au grain code, calculée jamais estimée", async ({
		page,
	}) => {
		await page.goto("/v2/code");

		// On DÉPLIE le fichier composition.ts dans l'arbre de contenance (caret de la ligne).
		// slugify est son PREMIER enfant (L57) : une fois le fichier déplié, sa ligne est rendue
		// juste sous le parent (pas besoin de défiler la liste virtualisée Arborist).
		const fileRow = page.locator(
			'[data-testid="v2-code-node"][data-symbol="lib/v2/composition.ts#lib/v2/composition.ts"]',
		);
		await expect(fileRow).toBeVisible();
		const slugRow = page.locator(
			'[data-testid="v2-code-node"][data-symbol="lib/v2/composition.ts#slugify"]',
		);
		// L'hydratation (mode dev) peut retarder les handlers React : on re-clique le caret
		// jusqu'à ce que l'expansion PRENNE (toPass) — on ne clique que « déplier », jamais
		// « replier », donc la boucle ne peut pas re-fermer le nœud.
		await expect(async () => {
			const caret = fileRow.getByRole("button", { name: "déplier" });
			if (await caret.isVisible()) await caret.click();
			await expect(slugRow).toBeVisible({ timeout: 1_500 });
		}).toPass({ timeout: 15_000 });
		await slugRow.getByRole("button", { name: /slugify/ }).click();

		// L'ACTION « Et si je modifie ? » : la vague est CALCULÉE (impactOf — rdeps + conteneurs).
		const impactBtn = page.getByTestId("v2-code-impact-btn");
		await expect(impactBtn).toBeEnabled();
		await impactBtn.click();
		const impact = page.getByTestId("v2-code-impact");
		await expect(impact).toBeVisible();

		// Au moins un impacté — et des appelants du MÊME fichier (arêtes extracted de l'AST) :
		// growComposes et nodePath APPELLENT slugify dans composition.ts → profondeur 1.
		expect(
			await page.getByTestId("v2-code-impact-item").count(),
		).toBeGreaterThan(0);
		await expect(
			page.locator(
				'[data-testid="v2-code-impact-item"][data-symbol="lib/v2/composition.ts#growComposes"]',
			),
		).toBeVisible();
		await expect(
			page.locator(
				'[data-testid="v2-code-impact-item"][data-symbol="lib/v2/composition.ts#nodePath"]',
			),
		).toBeVisible();

		// Le groupage par PROFONDEUR est visible (1 = directe — l'onde, pas un tas plat).
		await expect(impact.getByText(/profondeur 1/).first()).toBeVisible();

		// La remontée des CONTENEURS : le fichier composition.ts lui-même ROUGIT dans l'arbre.
		await expect(fileRow).toHaveAttribute("data-impacted", "true");

		// RÉINITIALISER éteint la vague (la simulation est un état d'écran, jamais une écriture).
		await page.getByTestId("v2-code-impact-reset").click();
		await expect(page.getByTestId("v2-code-impact")).toHaveCount(0);
	});

	test("god nodes : au moins un point de couplage, son degré entrant affiché", async ({
		page,
	}) => {
		await page.goto("/v2/code");
		const gods = page.getByTestId("v2-code-god");
		await expect(gods.first()).toBeVisible();
		expect(await gods.count()).toBeGreaterThanOrEqual(1);
		// Chaque chip porte son symbole et son DEGRÉ ENTRANT (le badge numérique, graphify).
		expect(await gods.first().getAttribute("data-symbol")).toBeTruthy();
		await expect(gods.first().locator('[title="degré entrant"]')).toHaveText(
			/^\d+$/,
		);
	});
});
