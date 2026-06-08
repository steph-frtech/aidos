import { expect, test } from "@playwright/test";

/**
 * S98 Playwright e2e — the « environnements + rollback par ré-projection » Workbench panel.
 * mirror record: reflects=S98-env-rollback, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /env-rollback route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * promote + rollback controls are reachable AND executable from the screen, bound to Server
 * Actions running the REAL pure twin (lib/env-rollback, the twin of back/archive/envrollback).
 * The S98 / DP28 done-criteria, reached from the screen:
 *   - PROMOTE a stable phase to prod → a per-env "prod-…" stack + the re-emitted app hash;
 *   - promoting a NON-STABLE phase is REFUSED with ENV_PROMOTE_NOT_STABLE (the Stop-gate);
 *   - ROLLBACK prod to an earlier phase N-1 → prod serves the app RE-EMITTED from N-1 (the
 *     re-projection property, code-judged), NOT the stale artifact of N; the decision is
 *     provenanced (actor · reason);
 *   - a rollback to the SAME / a NON-ANCESTOR phase is REFUSED with ROLLBACK_NOT_EARLIER.
 *
 * THE WALL (CLAUDE.md §2/§9): a rollback is a recorded DECISION proposed as a ChangeSet — the
 * screen writes no truth. The re-projection equality is a pure function, never an LLM.
 */

test.describe("S98 — environments + rollback by re-projection", () => {
	test("the route renders both controls", async ({ page }) => {
		await page.goto("/env-rollback");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Environnements \+ rollback|Environments \+ rollback/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("promote-button")).toBeVisible();
		await expect(page.getByTestId("rollback-button")).toBeVisible();
	});

	test("promoting a stable phase to prod yields a per-env prod stack", async ({
		page,
	}) => {
		await page.goto("/env-rollback");
		await page.getByTestId("promote-button").click();
		await expect(page.getByTestId("promote-result")).toBeVisible();

		const stack = await page.getByTestId("promote-stack").innerText();
		// per-env prod stack: "prod-<project>-d-<phase>" (the active project is supplied by context).
		expect(stack).toMatch(/^prod-.+-d-/);
		const appHash = await page.getByTestId("promote-app-hash").innerText();
		expect(appHash.trim().length).toBeGreaterThan(0);
	});

	test("linking a custom domain yields a live HTTPS URL (S99/DP29)", async ({
		page,
	}) => {
		await page.goto("/env-rollback");
		// Lier un domaine custom à l'environnement prod.
		await page.getByTestId("promote-domain").fill("shop.example.com");
		await page.getByTestId("promote-button").click();
		await expect(page.getByTestId("promote-result")).toBeVisible();

		// Le domaine lié est surfacé, et l'URL live est en HTTPS (TLS via ACME), pointant le domaine.
		await expect(page.getByTestId("promote-domain-out")).toHaveText(
			"shop.example.com",
		);
		const live = page.getByTestId("promote-live-url");
		await expect(live).toBeVisible();
		const url = await live.getAttribute("href");
		expect(url).toMatch(/^https:\/\//);
		expect(url).toContain("shop.example.com");
		// L'URL live affichée est cliquable (href === texte).
		await expect(live).toHaveText(url ?? "");
	});

	test("promoting a non-stable phase is refused ENV_PROMOTE_NOT_STABLE", async ({
		page,
	}) => {
		await page.goto("/env-rollback");
		await page.getByTestId("promote-red-toggle").check();
		await page.getByTestId("promote-button").click();

		const block = page.getByTestId("block-reason").first();
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "ENV_PROMOTE_NOT_STABLE");
	});

	test("incident → rollback to N-1 serves the re-emitted app, rejects the stale artifact, provenanced", async ({
		page,
	}) => {
		await page.goto("/env-rollback");

		// Promote N to prod first (the served phase).
		await page.getByTestId("promote-button").click();
		await expect(page.getByTestId("promote-result")).toBeVisible();

		// Rollback prod to N-1.
		await page.getByTestId("rollback-button").click();
		await expect(page.getByTestId("rollback-result")).toBeVisible();

		// Prod serves the app re-emitted from N-1 (not N), and the re-projection property holds.
		await expect(page.getByTestId("rollback-to")).toHaveText("phase-n-1");
		await expect(page.getByTestId("serves-fresh")).toHaveAttribute(
			"data-ok",
			"true",
		);
		await expect(page.getByTestId("rejects-stale")).toHaveAttribute(
			"data-ok",
			"true",
		);

		// The decision is provenanced (actor · reason).
		const prov = await page.getByTestId("rollback-provenance").innerText();
		expect(prov).toContain("alice");
		expect(prov).toContain("incident");
	});

	test("rollback to the served phase is refused ROLLBACK_NOT_EARLIER", async ({
		page,
	}) => {
		await page.goto("/env-rollback");
		await page.getByTestId("rollback-same-toggle").check();
		await page.getByTestId("rollback-button").click();

		const block = page.getByTestId("block-reason").last();
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "ROLLBACK_NOT_EARLIER");
	});

	test("rollback to a non-ancestor phase is refused ROLLBACK_NOT_EARLIER", async ({
		page,
	}) => {
		await page.goto("/env-rollback");
		await page.getByTestId("rollback-no-ancestor-toggle").check();
		await page.getByTestId("rollback-button").click();

		const block = page.getByTestId("block-reason").last();
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "ROLLBACK_NOT_EARLIER");
	});
});
