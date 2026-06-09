import { expect, test } from "@playwright/test";

/**
 * Playwright e2e — the /proof-levels route after the FK16 bascule (E0-E7, contract half).
 * mirror record: reflects=FK16-evidence-bascule, test_kind=e2e,
 *                cert_language=playwright-bdd, liveness=alive, authority=below
 *
 * Proves the route is action-capable (ui-completeness law, CLAUDE.md §7): the panel now renders the
 * E0-E7 ladder AND a RELABEL-THE-CORPUS control bound to a Server Action running the REAL pure twin
 * (lib/contracte, the TS twin of back/kernel/mirror/contracte). The FK16 done-criteria, reached
 * from the screen:
 *   - the panel renders E0-E7 (the bascule — panels rendent E);
 *   - throwing the switch re-labels each N mirror to its derived E (zéro perte: chaque miroir N
 *     porte son E), and shows the NoLoss verdict;
 *   - the N-label is PRESERVED and marked deprecated (jamais supprimé) — never deleted;
 *   - the legacy N0-N5 ladder stays inspectable (anti-overwrite §9).
 *
 * THE WALL (CLAUDE.md §2): the screen only DERIVES + DISPLAYS — it writes no truth; the real
 * schema switch is the gated expand-contract migration.
 */

test.describe("proof-levels — the FK16 E0-E7 bascule", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/proof-levels");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /couches de preuve|proof layers/i,
			}),
		).toBeVisible({ timeout: 15000 });
	});

	test("renders the E0-E7 ladder (panels rendent E)", async ({ page }) => {
		await expect(page.getByTestId("evidence-bascule")).toBeVisible();
		for (let e = 0; e <= 7; e++) {
			await expect(page.getByTestId(`e-level-${e}`)).toBeVisible();
		}
		await expect(page.getByTestId("bascule-btn")).toBeVisible();
	});

	test("throwing the switch re-labels the sample corpus to E with zero loss", async ({
		page,
	}) => {
		// empty corpus → the panel uses the representative sample.
		await page.getByTestId("bascule-btn").click();

		await expect(page.getByTestId("bascule-result")).toBeVisible();
		// NoLoss verdict shows.
		await expect(page.getByTestId("no-loss")).toBeVisible();
		await expect(page.getByTestId("no-loss")).toContainText(
			/zéro perte|zero loss/i,
		);

		// Each mirror gains its derived E (the N-invariant mirror → E5, the prose mirror → E0).
		await expect(page.getByTestId("tag-e-m-invariant")).toContainText("E5");
		await expect(page.getByTestId("tag-e-m-journey")).toContainText("E3");
		await expect(page.getByTestId("tag-e-m-prose")).toContainText("E0");

		// The N-label is PRESERVED and DEPRECATED (never deleted).
		const row = page.getByTestId("tag-row-m-invariant");
		await expect(row).toContainText("N1");
		await expect(row).toContainText(/deprecated/i);

		// The E histogram renders all eight rungs.
		await expect(page.getByTestId("hist-5")).toContainText("E5: 1");
	});

	test("re-labels a custom corpus submitted as JSON", async ({ page }) => {
		await page
			.getByTestId("corpus-input")
			.fill(
				'[{"mirrorId":"x1","testKind":"meter","certLanguage":"k6","n":"N5"}]',
			);
		await page.getByTestId("bascule-btn").click();

		await expect(page.getByTestId("bascule-result")).toBeVisible();
		// meter/k6 → E6 (runtime observation).
		await expect(page.getByTestId("tag-e-x1")).toContainText("E6");
		await expect(page.getByTestId("tag-row-x1")).toContainText("N5");
	});

	test("the legacy N0-N5 ladder stays inspectable (anti-overwrite)", async ({
		page,
	}) => {
		await page.getByTestId("legacy-n-toggle").click();
		await expect(page.getByTestId("proof-levels-explorer")).toBeVisible();
		// N1 still shows its cert language.
		await page.getByTestId("level-card-n1").click();
		await expect(page.getByTestId("level-cert-n1")).toContainText(
			/rapid|fast-check/i,
		);
	});
});
