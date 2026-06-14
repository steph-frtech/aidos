import { expect, test } from "@playwright/test";

/**
 * WB2-22 Playwright e2e — l'écran /v2/deploy : specs → app web → prod (AI Lab ; ADR 0052 · 0007 ; S96).
 * À partir d'une source d'entité (la même que /v2/emetteurs émet), AIDOS planifie DÉTERMINISTIQUEMENT le
 * déploiement de l'app émise : l'URL live (Traefik), le plan de conteneurisation, l'aperçu live. Le bouton
 * est GATÉ (auth + rate-limit) — la parenthèse sécurité d'ADR 0052, fermée. Réutilise emitView/appPreview
 * (WB2-21) via le twin pur lib/v2/deploy.ts (pas de fork, ADR 0007).
 * mirror record: reflects=WB2-22-deploy, test_kind=e2e, cert_language=playwright, liveness=live,
 * authority=below (déployer = émettre une projection + planifier son conteneur — le mur intact, aucune écriture).
 *
 * Les critères de done WB2-22, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - LE BOUTON REFUSE SANS AUTH (la garde) : anonyme → DEPLOY_GATE_UNAUTHENTICATED, AUCUN plan (fail-closed) ;
 *   - DÉPLOIEMENT → URL LIVE + APERÇU : authentifié → on déploie → l'URL Traefik (https://…sagedesk.fr), le
 *     plan de conteneurisation (postgres · app · traefik) et l'aperçu live de la table back-office ;
 *   - PLAN REPRODUCTIBLE : re-planifier → même planId/URL (preuve verte) ;
 *   - Order amputé du discount → l'aperçu live n'a plus la colonne discount (la source suit la source) ;
 *   - LE MUR : aucune requête d'écriture (POST/PUT/PATCH/DELETE) — déployer n'écrit aucune vérité ; modifier
 *     une source PROPOSE → /goal (data-proposes=goal), jamais une écriture directe.
 */

test.describe("WB2-22 /v2/deploy — specs → app web → prod (URL live, bouton gaté)", () => {
	test("le bouton refuse sans auth (gate) : anonyme → DEPLOY_GATE_UNAUTHENTICATED, aucun plan", async ({
		page,
	}) => {
		await page.goto("/v2/deploy");
		await expect(page.getByTestId("v2-deploy-view")).toBeVisible();
		await expect(page.getByTestId("v2-deploy-wall-note")).toBeVisible();

		// Par défaut : anonyme (la garde par défaut est fail-closed).
		await expect(page.getByTestId("v2-deploy-auth-toggle")).toHaveAttribute(
			"data-authenticated",
			"false",
		);

		// CHOISIR Order → DÉPLOYER (anonyme).
		await page.getByTestId("v2-deploy-sample-order").click();
		await page.getByTestId("v2-deploy-deploy").click();

		// La garde REFUSE : le BlockReason actionnable, AUCUN plan (pas d'URL).
		const blocked = page.getByTestId("v2-deploy-blocked");
		await expect(blocked).toBeVisible();
		await expect(page.getByTestId("v2-deploy-blocked-code")).toContainText(
			"DEPLOY_GATE_UNAUTHENTICATED",
		);
		await expect(page.getByTestId("v2-deploy-plan")).toHaveCount(0);
		await expect(page.getByTestId("v2-deploy-url")).toHaveCount(0);
	});

	test("déploiement → URL live + aperçu : authentifié → URL Traefik, services, aperçu de l'app servie", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/deploy");

		// S'AUTHENTIFIER (fermer la garde sécurité d'ADR 0052).
		await page.getByTestId("v2-deploy-auth-toggle").click();
		await expect(page.getByTestId("v2-deploy-auth-toggle")).toHaveAttribute(
			"data-authenticated",
			"true",
		);

		// CHOISIR Order → DÉPLOYER.
		await page.getByTestId("v2-deploy-sample-order").click();
		await page.getByTestId("v2-deploy-deploy").click();

		// Le PLAN est calculé (la garde passe).
		await expect(page.getByTestId("v2-deploy-plan")).toBeVisible();
		await expect(page.getByTestId("v2-deploy-blocked")).toHaveCount(0);

		// L'URL LIVE (Traefik) : https://order.sagedesk.fr.
		const url = page.getByTestId("v2-deploy-url");
		await expect(url).toBeVisible();
		await expect(url).toContainText("https://order.sagedesk.fr");
		await expect(url).toHaveAttribute("href", "https://order.sagedesk.fr");

		// Le plan de CONTENEURISATION : postgres · app · traefik.
		await expect(page.getByTestId("v2-deploy-service-postgres")).toBeVisible();
		await expect(page.getByTestId("v2-deploy-service-app")).toBeVisible();
		await expect(page.getByTestId("v2-deploy-service-traefik")).toBeVisible();

		// L'APERÇU LIVE : la table back-office (id en PK, discount nullable).
		await expect(page.getByTestId("v2-deploy-preview-id")).toHaveAttribute(
			"data-pk",
			"true",
		);
		await expect(
			page.getByTestId("v2-deploy-preview-discount"),
		).toHaveAttribute("data-nullable", "true");

		// PLAN REPRODUCTIBLE : re-planifier → même plan (preuve verte).
		await page.getByTestId("v2-deploy-redeploy").click();
		const report = page.getByTestId("v2-deploy-redeploy-report");
		await expect(report).toBeVisible();
		await expect(report).toHaveAttribute("data-stable", "true");

		// LE MUR : aucune écriture.
		expect(writes).toEqual([]);
	});

	test("Order amputé du discount : l'aperçu live n'a plus la colonne discount", async ({
		page,
	}) => {
		await page.goto("/v2/deploy");
		await page.getByTestId("v2-deploy-auth-toggle").click();
		await page.getByTestId("v2-deploy-sample-order-changed").click();
		await page.getByTestId("v2-deploy-deploy").click();

		await expect(page.getByTestId("v2-deploy-plan")).toBeVisible();
		// l'aperçu live suit la source : plus de colonne discount.
		await expect(page.getByTestId("v2-deploy-preview-discount")).toHaveCount(0);
		await expect(page.getByTestId("v2-deploy-preview-id")).toBeVisible();
	});

	test("le mur : modifier une source PROPOSE → /goal (data-proposes=goal)", async ({
		page,
	}) => {
		await page.goto("/v2/deploy");
		const propose = page.getByTestId("v2-deploy-propose");
		await expect(propose).toBeVisible();
		await expect(propose).toHaveAttribute("data-proposes", "goal");
	});

	test("le hub /v2/grille mène à /v2/deploy", async ({ page }) => {
		await page.goto("/v2/grille");
		const gesture = page.getByTestId("v2-grille-gesture-deploy");
		await expect(gesture).toBeVisible();
		await gesture.click();
		await expect(page).toHaveURL(/\/v2\/deploy$/);
		await expect(page.getByTestId("v2-deploy-view")).toBeVisible();
	});

	// ── Item 2 (2026-06-14) — le BOUTON PRIMAIRE lance un VRAI déploiement PULUMI par projet ──
	//
	// Le bouton « Déployer (Pulumi réel) » câble la server action deployStackPulumi(project, entities) →
	// `aidospulumi up --project X --env dev --entities <fichier>` : la full-stack réelle de X montée par
	// Pulumi à X-dev.sagedesk.fr. CES tests assertent le CÂBLAGE + l'affichage de la cible live attendue —
	// ils NE lancent JAMAIS un vrai `pulumi up` (anti-flake : on ancre sur un CHANGEMENT D'ÉTAT
	// déterministe — la présence/le gating du bouton et la cible affichée — exactement comme le bouton de
	// déploiement réel du builder n'est jamais cliqué).

	test("le bouton Pulumi est GATÉ : anonyme → désarmé (fail-closed, le mur)", async ({
		page,
	}) => {
		await page.goto("/v2/deploy");

		// Par défaut anonyme : le bouton Pulumi est présent mais DÉSARMÉ (la garde ADR 0052, fail-closed).
		const pulumiBtn = page.getByTestId("v2-deploy-pulumi-btn");
		await expect(pulumiBtn).toBeVisible();
		await expect(pulumiBtn).toBeDisabled();

		// Même en CHOISISSANT une entité, anonyme reste désarmé (auth d'abord).
		await page.getByTestId("v2-deploy-sample-order").click();
		await expect(pulumiBtn).toBeDisabled();
	});

	test("le bouton Pulumi s'ARME + affiche la cible live X-dev.sagedesk.fr (le câblage par projet)", async ({
		page,
	}) => {
		await page.goto("/v2/deploy");

		// S'AUTHENTIFIER (fermer la garde) + CHOISIR Order → le projet = order.
		await page.getByTestId("v2-deploy-auth-toggle").click();
		await page.getByTestId("v2-deploy-sample-order").click();

		// LE BOUTON PRIMAIRE est armé (la garde passe) et porte le nom du projet (data-project=order).
		const pulumiBtn = page.getByTestId("v2-deploy-pulumi-btn");
		await expect(pulumiBtn).toBeEnabled();
		await expect(pulumiBtn).toHaveAttribute("data-project", "order");

		// La CIBLE LIVE attendue (Traefik) : order-dev.sagedesk.fr — dérivée du projet, jamais devinée.
		const target = page.getByTestId("v2-deploy-pulumi-target");
		await expect(target).toBeVisible();
		await expect(target).toHaveAttribute("data-host", "order-dev.sagedesk.fr");
		await expect(target).toContainText("order-dev.sagedesk.fr");

		// Le panneau Pulumi explique le pipeline réel (aidospulumi up — Pulumi reste le moteur).
		await expect(page.getByTestId("v2-deploy-pulumi")).toContainText(
			"aidospulumi up",
		);

		// Order amputé du discount → le projet/cible suivent la source (toujours order ici : même nom).
		await page.getByTestId("v2-deploy-sample-order-changed").click();
		await expect(page.getByTestId("v2-deploy-pulumi-target")).toHaveAttribute(
			"data-host",
			"order-dev.sagedesk.fr",
		);
		// Le run réel n'est PAS lancé : aucun résultat affiché (on ancre sur l'état, pas sur un exec).
		await expect(page.getByTestId("v2-deploy-pulumi-url")).toHaveCount(0);
		await expect(page.getByTestId("v2-deploy-pulumi-status")).toHaveCount(0);
	});
});
