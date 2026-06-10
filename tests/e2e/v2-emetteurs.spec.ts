import { expect, test } from "@playwright/test";

/**
 * WB2-21 Playwright e2e — l'écran /v2/emetteurs : l'émission DEPUIS les entités (S34/S35, ADR 0007).
 * À partir d'une source d'entité, AIDOS rend DÉTERMINISTIQUEMENT le DDL Postgres, le struct Go (sqlc) et le
 * type TS, plus le contrat partagé et l'aperçu de l'app émise. Réutilise `emit`/`project` (S35
 * lib/entity-source.ts) via le twin pur lib/v2/emetteurs.ts (pas de fork, ADR 0007).
 * mirror record: reflects=WB2-21-emetteurs, test_kind=e2e, cert_language=playwright, liveness=live,
 * authority=below (émettre/afficher est une lecture + projection — le mur intact, aucune écriture de vérité).
 *
 * Les critères de done WB2-21, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - VOIR LE DDL + LES TYPES ÉMIS : on choisit Order → on ÉMET → le DDL (CREATE TABLE), le struct Go et le
 *     type TS sont visibles, avec leur chemin et leur output_hash ;
 *   - le CONTRAT partagé liste les champs de la source (ni ajout, ni retrait, ni renommage) ;
 *   - l'APERÇU de l'app émise montre la table, ses colonnes (nullabilité, PK), le type de chaque ligne ;
 *   - RE-ÉMISSION BYTE-IDENTIQUE : ré-émettre N fois → les trois cibles byte-identiques (preuve verte) ;
 *   - Order amputé du discount → le DDL n'a plus la colonne `discount` (la source suit la source) ;
 *   - LE MUR : aucune requête d'écriture (POST/PUT/PATCH/DELETE) — émettre n'écrit aucune vérité ; modifier
 *     une source PROPOSE → /goal (data-proposes=goal), jamais une écriture directe.
 */

test.describe("WB2-21 /v2/emetteurs — l'émission depuis les entités (DDL · Go · TS, byte-stable)", () => {
	test("voir le DDL + les types émis, le contrat, l'aperçu ; aucune écriture", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/emetteurs");
		await expect(page.getByTestId("v2-emetteurs-view")).toBeVisible();
		await expect(page.getByTestId("v2-emetteurs-wall-note")).toBeVisible();

		// Avant de choisir : aucun résultat.
		await expect(page.getByTestId("v2-emetteurs-empty")).toBeVisible();

		// CHOISIR Order → ÉMETTRE.
		await page.getByTestId("v2-emetteurs-sample-order").click();
		await expect(page.getByTestId("v2-emetteurs-result")).toBeVisible();

		// VOIR LE DDL : CREATE TABLE "order" + PRIMARY KEY.
		const ddl = page.getByTestId("v2-emetteurs-bytes-pg-ddl");
		await expect(ddl).toBeVisible();
		await expect(ddl).toContainText('CREATE TABLE "order"');
		await expect(ddl).toContainText("PRIMARY KEY");

		// VOIR LES TYPES ÉMIS : le struct Go + le type TS.
		await expect(page.getByTestId("v2-emetteurs-bytes-go-sqlc")).toContainText(
			"type Order struct",
		);
		await expect(page.getByTestId("v2-emetteurs-bytes-ts-types")).toContainText(
			"export type Order",
		);

		// le CONTRAT partagé liste les cinq champs de la source.
		const contract = page.getByTestId("v2-emetteurs-contract");
		await expect(contract).toBeVisible();
		for (const f of ["id", "customer", "total", "discount", "placed_at"]) {
			await expect(
				page.getByTestId(`v2-emetteurs-contract-${f}`),
			).toBeVisible();
		}

		// l'APERÇU de l'app émise : la table, la colonne id en PK, la colonne discount nullable.
		await expect(page.getByTestId("v2-emetteurs-preview")).toBeVisible();
		await expect(page.getByTestId("v2-emetteurs-preview-id")).toHaveAttribute(
			"data-pk",
			"true",
		);
		await expect(
			page.getByTestId("v2-emetteurs-preview-discount"),
		).toHaveAttribute("data-nullable", "true");
		await expect(
			page.getByTestId("v2-emetteurs-preview-customer"),
		).toHaveAttribute("data-nullable", "false");

		// LE MUR : aucune écriture.
		expect(writes).toEqual([]);
	});

	test("re-émission byte-identique : ré-émettre N fois → les trois cibles byte-identiques", async ({
		page,
	}) => {
		await page.goto("/v2/emetteurs");
		await page.getByTestId("v2-emetteurs-sample-order").click();
		await expect(page.getByTestId("v2-emetteurs-result")).toBeVisible();

		// avant la re-émission : seulement l'invite.
		await expect(page.getByTestId("v2-emetteurs-reemit-prompt")).toBeVisible();

		// RE-ÉMETTRE → la preuve byte-stable.
		await page.getByTestId("v2-emetteurs-reemit").click();
		const report = page.getByTestId("v2-emetteurs-reemit-report");
		await expect(report).toBeVisible();
		await expect(report).toHaveAttribute("data-all-stable", "true");

		// les trois cibles sont byte-identiques.
		for (const tgt of ["pg-ddl", "go-sqlc", "ts-types"]) {
			await expect(
				page.getByTestId(`v2-emetteurs-reemit-${tgt}`),
			).toHaveAttribute("data-stable", "true");
		}
		await expect(page.getByTestId("v2-emetteurs-all-stable")).toBeVisible();
	});

	test("Order amputé du discount : le DDL émis n'a plus la colonne discount", async ({
		page,
	}) => {
		await page.goto("/v2/emetteurs");
		await page.getByTestId("v2-emetteurs-sample-order-changed").click();
		await expect(page.getByTestId("v2-emetteurs-result")).toBeVisible();

		const ddl = page.getByTestId("v2-emetteurs-bytes-pg-ddl");
		await expect(ddl).toContainText('CREATE TABLE "order"');
		await expect(ddl).not.toContainText("discount");
		// le contrat n'a plus de pastille discount.
		await expect(
			page.getByTestId("v2-emetteurs-contract-discount"),
		).toHaveCount(0);
	});

	test("le mur : modifier une source PROPOSE → /goal (data-proposes=goal)", async ({
		page,
	}) => {
		await page.goto("/v2/emetteurs");
		await page.getByTestId("v2-emetteurs-sample-order").click();
		const propose = page.getByTestId("v2-emetteurs-propose");
		await expect(propose).toBeVisible();
		await expect(propose).toHaveAttribute("data-proposes", "goal");
	});

	test("le hub /v2/grille mène à /v2/emetteurs", async ({ page }) => {
		await page.goto("/v2/grille");
		const gesture = page.getByTestId("v2-grille-gesture-emetteurs");
		await expect(gesture).toBeVisible();
		await gesture.click();
		await expect(page).toHaveURL(/\/v2\/emetteurs$/);
		await expect(page.getByTestId("v2-emetteurs-view")).toBeVisible();
	});
});
