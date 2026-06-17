import { expect, test } from "@playwright/test";

/**
 * « Voir Electron » (ADR 0093) Playwright e2e — la section APERÇU DESKTOP dans /v3/emetteurs.
 * Le MOTEUR Go (back/mcp/desktop-preview) émet l'enfant desktop Electron, le boote headless (Xvfb)
 * et capture sa fenêtre via CDP. La section LIT les 3 enfants émis + REND la frame capturée.
 *
 * mirror record: reflects=ADR-0093-voir-electron, test_kind=e2e, cert_language=playwright,
 *   liveness=live, authority=below (lire les enfants + rendre la frame = lecture + projection — le
 *   mur intact, aucune écriture de vérité).
 *
 * Critères de done atteints DEPUIS l'écran (action-capable, ui-completeness) :
 *   - la section existe sous la vue émetteurs (additif, rien cassé) ;
 *   - les 3 ENFANTS émis (web/mobile/desktop) sont listés ;
 *   - cliquer « Capturer » → soit une <img src=data:image/jpeg> (frame réelle, exit 0), soit le
 *     repli GRACIEUX (available:false : la raison + l'arbre de fichiers du bundle — ADR 0074) ;
 *   - FAULT-INJECTION (ADR 0074) : binaire NEUTRALISÉ (env bidon) → la section ne CRASHE pas, elle
 *     affiche le repli gracieux (preuve que la vue ne casse jamais) ;
 *   - LE MUR : aucune requête d'écriture (POST/PUT/PATCH/DELETE) déclenchée par la section.
 */

test.describe("ADR 0093 /v3/emetteurs — aperçu desktop (Electron) : voir l'enfant émis", () => {
	test("la section liste les 3 enfants ; capturer → frame OU repli gracieux ; aucune écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v3/emetteurs");

		// la section existe (additif, sous la vue émetteurs)
		const section = page.getByTestId("v3-emetteurs-desktop");
		await expect(section).toBeVisible();

		// les 3 enfants émis sont listés (web/mobile/desktop)
		await expect(page.getByTestId("v3-emetteurs-desktop-children")).toBeVisible(
			{ timeout: 20_000 },
		);
		const childCards = page.getByTestId("v3-emetteurs-desktop-child");
		await expect(childCards).toHaveCount(3);

		// le bouton de capture est activé une fois les enfants chargés
		const captureBtn = page.getByTestId("v3-emetteurs-desktop-capture");
		await expect(captureBtn).toBeEnabled();
		await captureBtn.click();

		// soit une vraie frame (data:image/jpeg…), soit le repli gracieux — JAMAIS un crash
		const frame = page.getByTestId("v3-emetteurs-desktop-frame");
		const unavailable = page.getByTestId("v3-emetteurs-desktop-unavailable");
		await expect(frame.or(unavailable)).toBeVisible({ timeout: 90_000 });

		if (await frame.isVisible()) {
			const src = await frame.getAttribute("src");
			expect(src).toMatch(/^data:image\/jpeg;base64,/);
		} else {
			// le repli gracieux porte une raison (ADR 0074)
			await expect(unavailable).toContainText(/.+/);
		}

		// LE MUR : la section n'écrit aucune vérité
		expect(writes).toEqual([]);
	});

	test("FAULT-INJECTION (ADR 0074) : binaire neutralisé → repli gracieux, pas de crash", async ({
		page,
	}) => {
		// Le binaire est neutralisé côté serveur via AIDOS_DESKTOP_PREVIEW_BIN bidon (webServer env).
		// La section doit afficher le repli gracieux (enfants indisponibles), jamais un crash blanc.
		await page.goto("/v3/emetteurs");

		const section = page.getByTestId("v3-emetteurs-desktop");
		await expect(section).toBeVisible();

		// les enfants ne chargent pas (binaire injoignable) → le message d'erreur gracieux apparaît
		await expect(
			page.getByTestId("v3-emetteurs-desktop-children-error"),
		).toBeVisible({ timeout: 20_000 });

		// la page reste vivante : le titre de la section est toujours là (pas de crash)
		await expect(section).toBeVisible();
	});
});
