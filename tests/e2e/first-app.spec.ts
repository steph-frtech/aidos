import { expect, test } from "@playwright/test";

/**
 * Playwright-bdd e2e — the S115 REAL onboarding funnel (/first-app).
 * mirror record: reflects=front.first-app.funnel, test_kind=e2e,
 *                cert_language=playwright-bdd, liveness=alive, authority=above
 *
 * Feature: a newcomer completes the funnel and reaches a deployed app driven by the real
 *          engine — each step writes real truth (no simulation). The advanced blank-idea
 *          path is tested separately.
 *
 *   Scenario: template-first — a stranger's first run succeeds
 *     Given I open "/first-app" and the default path is template-first
 *     When I sign up, pick a template + slug, write a first modification, grill it sharp,
 *          and run a green build
 *     Then the checklist's every step is tied to a real artefact and the app is deployed
 *
 *   Scenario: blank-idea — the advanced path, tested separately
 *     Given I switch to the blank-idea path
 *     When I run the funnel green
 *     Then it reaches a deployed app with NO starter artefact
 *
 *   Scenario: honest stop — a non-green build never declares a deploy
 */

test.describe("first-app — the S115 real onboarding funnel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/first-app");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /première application|first application/i,
			}),
		).toBeVisible({ timeout: 15000 });
	});

	test("template-first (default): a new account reaches a deployed app driven by the real engine", async ({
		page,
	}) => {
		const funnel = page.getByTestId("first-app-funnel");
		await expect(funnel).toBeVisible();

		// the default path is template-first (the radio is pre-checked)
		await expect(
			page.getByTestId("path-template").locator("input"),
		).toBeChecked();

		// fill the real form (defaults already happy; just run)
		await page.getByTestId("funnel-email").fill("alice@example.com");
		await page.getByTestId("funnel-slug").fill("ma-boutique");
		await page
			.getByTestId("funnel-intent")
			.fill("ajouter un code promo au paiement");
		await page.getByTestId("funnel-run").click();

		// the funnel returns a REAL state with a checklist tied to real artefacts
		await expect(page.getByTestId("funnel-result")).toBeVisible();
		for (const step of [
			"signup",
			"project",
			"idea",
			"grill",
			"goal",
			"build",
			"deploy",
		]) {
			await expect(page.getByTestId(`checklist-${step}`)).toHaveAttribute(
				"data-done",
				"true",
			);
		}
		// the project step's artefact is a content-addressed starter (template-first)
		await expect(page.getByTestId("artefact-project")).toContainText(
			/starter:/,
		);
		await expect(page.getByTestId("artefact-idea")).toContainText(/idea:/);
		await expect(page.getByTestId("artefact-build")).toContainText(/green/);

		// a deployed app on a content-addressed subdomain — driven by the real engine
		await expect(page.getByTestId("funnel-deployed")).toBeVisible();
		await expect(page.getByTestId("deploy-subdomain")).toContainText(
			/\.deploy\.aidos\.app$/,
		);
		// preview / deploy controls reach the real panels
		await expect(page.getByTestId("funnel-preview-cta")).toHaveAttribute(
			"href",
			"/preview",
		);
		await expect(page.getByTestId("funnel-deploy-cta")).toHaveAttribute(
			"href",
			"/deploy",
		);
	});

	test("blank-idea (advanced path, tested separately): reaches deploy with no starter", async ({
		page,
	}) => {
		await page.getByTestId("path-blank").locator("input").check();
		await page.getByTestId("funnel-email").fill("bob@example.com");
		await page.getByTestId("funnel-slug").fill("mon-app");
		await page
			.getByTestId("funnel-intent")
			.fill("une appli de suivi de plantes");
		await page.getByTestId("funnel-run").click();

		await expect(page.getByTestId("funnel-result")).toBeVisible();
		// the project step is done but its artefact is a plain project, NOT a starter
		await expect(page.getByTestId("checklist-project")).toHaveAttribute(
			"data-done",
			"true",
		);
		await expect(page.getByTestId("artefact-project")).toContainText(
			/project:/,
		);
		await expect(page.getByTestId("artefact-project")).not.toContainText(
			/starter:/,
		);
		await expect(page.getByTestId("funnel-deployed")).toBeVisible();
	});

	test("honest stop: a non-green build never declares a deploy", async ({
		page,
	}) => {
		await page.getByTestId("funnel-email").fill("alice@example.com");
		await page.getByTestId("funnel-slug").fill("ma-boutique");
		await page.getByTestId("funnel-intent").fill("ajouter un code promo");
		await page.getByTestId("funnel-build").selectOption("red");
		await page.getByTestId("funnel-run").click();

		await expect(page.getByTestId("funnel-result")).toBeVisible();
		await expect(page.getByTestId("checklist-build")).toHaveAttribute(
			"data-done",
			"false",
		);
		await expect(page.getByTestId("funnel-not-deployed")).toBeVisible();
		await expect(page.getByTestId("funnel-deployed")).toHaveCount(0);
	});

	test("honest stop: an empty email blocks at signup", async ({ page }) => {
		await page.getByTestId("funnel-email").fill("");
		await page.getByTestId("funnel-run").click();
		await expect(page.getByTestId("checklist-signup")).toHaveAttribute(
			"data-done",
			"false",
		);
		await expect(page.getByTestId("funnel-not-deployed")).toBeVisible();
	});

	test("the real panels are deep-linked, and the slice can be seen green", async ({
		page,
	}) => {
		await expect(page.getByTestId("panel-link-1")).toHaveAttribute(
			"href",
			"/ideas",
		);
		await expect(page.getByTestId("panel-link-8")).toHaveAttribute(
			"href",
			"/phase-stable",
		);
		await expect(page.getByTestId("see-cta")).toHaveAttribute(
			"href",
			"/demo-checkout",
		);
	});

	test("is reachable from the home hero", async ({ page }) => {
		await page.goto("/");
		const cta = page.getByTestId("first-app-link");
		await expect(cta).toBeVisible();
		await expect(cta).toHaveAttribute("href", "/first-app");
	});
});
