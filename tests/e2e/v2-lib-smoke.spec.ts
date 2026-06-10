import { expect, test } from "@playwright/test";

/**
 * WB2-01 Playwright e2e — le banc de sondes des librairies V2 (/v2/lab).
 * mirror record: reflects=WB2-01-lib-smoke, test_kind=e2e, cert_language=playwright,
 * liveness=live, authority=below (lecture seule, le mur intact).
 *
 * Critères de done WB2-01, atteints + exécutés depuis l'écran :
 *   - chaque librairie monte client-only (un arbre, un bouton accessible, une machine XState,
 *     un formulaire validé, un React Flow) ;
 *   - le banc est ATTEIGNABLE depuis l'en-tête V2 (lien) et chaque sonde S'EXÉCUTE ;
 *   - bpmn-js est DIFFÉRÉ (déclaré, non monté) ;
 *   - COEXISTENCE : /v2/lab 200 ET l'ancien / 200.
 */

test.describe("WB2-01 — le banc de sondes des librairies V2", () => {
	test("le banc est atteignable depuis l'en-tête V2", async ({ page }) => {
		await page.goto("/v2");
		const link = page.getByTestId("v2-lab-link");
		await expect(link).toBeVisible();
		await link.click();
		await page.waitForURL(/\/v2\/lab$/, { timeout: 30000 });
		await expect(page.getByTestId("v2-lab-title")).toBeVisible();
		await expect(page.getByTestId("v2-lab-hash")).toBeVisible();
	});

	test("react-arborist : un arbre monte", async ({ page }) => {
		await page.goto("/v2/lab");
		await expect(page.getByTestId("v2-smoke-arborist")).toBeVisible();
		await expect(
			page.getByTestId("v2-smoke-arborist").getByText("Produit"),
		).toBeVisible();
	});

	test("react-aria-components : un bouton accessible s'exécute", async ({
		page,
	}) => {
		await page.goto("/v2/lab");
		await expect(page.getByTestId("v2-smoke-aria-btn")).toBeVisible();
		await page.getByTestId("v2-smoke-aria-btn").click();
		await expect(page.getByTestId("v2-smoke-aria-count")).toContainText("1");
	});

	test("xstate : une machine transite", async ({ page }) => {
		await page.goto("/v2/lab");
		await expect(page.getByTestId("v2-smoke-xstate-state")).toContainText(
			"repos",
		);
		await page.getByTestId("v2-smoke-xstate-start").click();
		await expect(page.getByTestId("v2-smoke-xstate-state")).toContainText(
			"actif",
		);
		await page.getByTestId("v2-smoke-xstate-stop").click();
		await expect(page.getByTestId("v2-smoke-xstate-state")).toContainText(
			"tours : 1",
		);
	});

	test("react-hook-form + zod : un formulaire valide", async ({ page }) => {
		await page.goto("/v2/lab");
		await page.getByTestId("v2-smoke-rhf-input").fill("ab");
		await page.getByTestId("v2-smoke-rhf-submit").click();
		await expect(page.getByTestId("v2-smoke-rhf-error")).toBeVisible();
		await page.getByTestId("v2-smoke-rhf-input").fill("besoin valide");
		await page.getByTestId("v2-smoke-rhf-submit").click();
		await expect(page.getByTestId("v2-smoke-rhf-ok")).toBeVisible();
	});

	test("@xyflow/react : un diagramme monte", async ({ page }) => {
		await page.goto("/v2/lab");
		await expect(page.getByTestId("v2-smoke-flow")).toBeVisible();
		await expect(
			page.getByTestId("v2-smoke-flow").getByText("Idée"),
		).toBeVisible();
	});

	test("bpmn-js est différé (déclaré, non monté) ∧ coexistence", async ({
		page,
	}) => {
		const lab = await page.goto("/v2/lab");
		expect(lab?.status()).toBe(200);
		await expect(page.getByTestId("v2-lab-deferred")).toContainText("bpmn-js");
		const v1 = await page.goto("/");
		expect(v1?.status()).toBe(200);
	});
});
