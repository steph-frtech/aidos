import { expect, test } from "@playwright/test";

/**
 * V3 « Comprendre » — l'ARBRE DES POURQUOI porté EN PROPRE dans la session V3 (/v3/why-tree).
 * mirror record: reflects=FK13-why-tree-build@v3, test_kind=e2e,
 *                cert_language=gherkin, liveness=alive, authority=above
 *
 * La lentille V3 RÉUTILISE le composant action-capable partagé WhyTreePanel (la même Server
 * Action buildAction → readVia(scope,"build",…) → le serveur MCP Go why-tree via la
 * passerelle ; le twin lib/why-tree n'est que le repli demo déterministe) — aucun fork, aucune
 * ré-implémentation du Go (ADR 0007 / 0092). Seul le SHELL diffère : le chrome de la session
 * V3 (V3Nav, V3SessionProvider) hérité du layout.
 *
 * Le geste, exécuté depuis l'écran V3 (CLAUDE.md §7 ui-completeness) :
 *   Given the V3 workbench is running
 *   When I navigate to /v3/why-tree (the lens lives inside the V3 shell)
 *   And I run /why on the incident scenario
 *   Then the reproduced candidate causes appear (createOrder … add_total_col),
 *        the ROOT cause is add_total_col,
 *        and the terminal anti-recurrence mirror is shown (root → /learn → red wave)
 *   When I run /why on the no-mirror scenario      → REFUSED WHYTREE_NO_MIRROR
 *   When I run /why on the non-reproduced scenario → REFUSED WHYTREE_CAUSE_NOT_REPRODUCED
 *   When I run /why on the cyclic scenario         → REFUSED CAUSED_BY_CYCLE, no partial tree
 *
 * LE MUR (le wall) : la lentille LIT + projette l'arbre — elle n'écrit AUCUNE vérité ; figer
 * le miroir terminal passe par propose → /learn → /goal → approbation.
 */

test.describe("V3 Comprendre — la lentille Arbre des pourquoi", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/v3/why-tree");
		// La lentille est bien montée DANS le shell V3 (la nav V3 enveloppe la route).
		await expect(page.getByTestId("v3-shell")).toBeVisible({ timeout: 15000 });
		await expect(page.getByTestId("v3-why-tree")).toBeVisible();
	});

	// Le sélecteur de scénario du panneau — scopé par son aria-label (le commutateur de
	// projets V3 est un bouton, pas une combobox, donc une seule combobox sur la page).
	function caseSelect(page: import("@playwright/test").Page) {
		return page.getByRole("combobox", { name: /scénario|scenario/i });
	}

	async function labelFor(
		page: import("@playwright/test").Page,
		needle: RegExp,
	): Promise<string> {
		const options = caseSelect(page).locator("option");
		const count = await options.count();
		for (let i = 0; i < count; i++) {
			const text = (await options.nth(i).textContent()) ?? "";
			if (needle.test(text)) return text;
		}
		throw new Error(`no option matching ${needle}`);
	}

	async function runWhy(page: import("@playwright/test").Page, label: RegExp) {
		await caseSelect(page).selectOption({ label: await labelFor(page, label) });
		// /why est un VRAI submit du formulaire (la Server Action buildAction →
		// readVia(scope,"build",…)) — il faut donc cliquer « Lancer /why », pas seulement
		// choisir le scénario, sinon view.ok reste faux et l'arbre ne se monte jamais.
		await page.getByRole("button", { name: /lancer \/why|run \/why/i }).click();
		await expect(page.getByTestId("why-tree")).toBeVisible();
	}

	test("the incident scenario builds a tree rooted at the deepest reproduced cause + terminal mirror", async ({
		page,
	}) => {
		await runWhy(page, /incident/i);

		for (const cause of [
			"createOrder",
			"Order",
			"authzPolicy",
			"add_total_col",
		]) {
			await expect(page.getByTestId(`cause-${cause}`)).toBeVisible();
			await expect(page.getByTestId(`cause-${cause}`)).toHaveAttribute(
				"data-reproduced",
				"true",
			);
		}

		const order = async (id: string) =>
			Number(await page.getByTestId(`cause-${id}`).getAttribute("data-order"));
		expect(await order("createOrder")).toBeLessThan(await order("Order"));
		expect(await order("Order")).toBeLessThan(await order("authzPolicy"));
		expect(await order("authzPolicy")).toBeLessThan(
			await order("add_total_col"),
		);

		await expect(page.getByTestId("root-cause")).toHaveText("add_total_col");

		await expect(page.getByTestId("terminal")).toBeVisible();
		await expect(page.getByTestId("terminal-mirror")).toContainText(
			"mir-antirecur",
		);
		await expect(page.getByTestId("red-wave")).toBeVisible();

		// le badge `source` est honnête (live OU demo) — jamais un live cassé silencieux.
		const badge = page.getByTestId("source-badge");
		await expect(badge).toBeVisible();
		const src = await badge.getAttribute("data-source");
		expect(["live", "demo"]).toContain(src);

		const body = await page.getByTestId("tree-body").textContent();
		expect(body).toContain('"link_kind":"why_tree"');
		expect(body).toContain("add_total_col");
	});

	test("a tree with no terminal mirror is REFUSED (WHYTREE_NO_MIRROR)", async ({
		page,
	}) => {
		await runWhy(page, /no terminal mirror|sans miroir terminal/i);
		const refused = page.getByTestId("refused");
		await expect(refused).toBeVisible();
		await expect(refused).toHaveAttribute("data-error", "WHYTREE_NO_MIRROR");
		await expect(page.getByTestId("cause-createOrder")).toHaveCount(0);
	});

	test("a non-reproduced cause is REFUSED (anti-confabulation)", async ({
		page,
	}) => {
		await runWhy(page, /non-reproduced|non reproduite/i);
		const refused = page.getByTestId("refused");
		await expect(refused).toBeVisible();
		await expect(refused).toHaveAttribute(
			"data-error",
			"WHYTREE_CAUSE_NOT_REPRODUCED",
		);
	});

	test("a caused_by cycle is REFUSED with CAUSED_BY_CYCLE and no partial tree", async ({
		page,
	}) => {
		await runWhy(page, /cycle|cyclic/i);
		const refused = page.getByTestId("refused");
		await expect(refused).toBeVisible();
		await expect(refused).toHaveAttribute("data-error", "CAUSED_BY_CYCLE");
		await expect(page.getByTestId("root-cause")).toHaveCount(0);
	});
});
