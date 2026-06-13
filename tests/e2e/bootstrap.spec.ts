import { expect, test } from "@playwright/test";

/**
 * DP12 Playwright e2e — l'écran « émetteur bootstrap one-shot déterministe ».
 * mirror record: reflects=DP12-bootstrap-emit, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Prouve que la route /bootstrap émet et rend la SÉQUENCE déterministe d'amorçage
 * (le done-criterion DP12) : l'action « amorcer la stack » (bootstrap-run) émet
 * l'ensemble CLOS, ORDONNÉ d'events (network-created AVANT urls-printed), les URLs
 * imprimées (bootstrap-urls), et — sur le scénario secret manquant — le BlockReason
 * fail-closed MISSING_SECRET_AT_BOOT (bootstrap-block).
 *
 * LE MUR (CLAUDE.md §2) : l'écran n'écrit AUCUNE vérité ; le .env + secrets vivent
 * dans l'appliance au boot (chmod 600, gitignored), jamais dans le source émis. NOTE
 * HONNÊTE : l'exécution docker réelle est GATÉE (comme le spike DP10) — l'écran
 * montre la séquence ÉMISE, pas un run docker live. La séquence est une projection
 * pure (résolution de ports / ordre = fonctions pures, secrets-check = scan, jamais
 * un LLM).
 */

const ORDERED_KINDS = [
	"network-created",
	"volumes-created",
	"env-materialized",
	"secrets-checked",
	"ports-resolved",
	"traefik-up",
	"datastore-up",
	"server-up",
	"healthy",
	"urls-printed",
];

test.describe("DP12 — deterministic one-shot bootstrap emitter", () => {
	test("the route renders the bundle and the gated note", async ({ page }) => {
		await page.goto("/bootstrap");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Bootstrap one-shot déterministe|Deterministic one-shot bootstrap/,
			}),
		).toBeVisible();
		// the emitted bundle (the DP02 source) is shown, read-only.
		await expect(page.getByTestId("bundle-services").locator("tr")).toHaveCount(
			3,
		);
		// the honest note: real docker execution is gated.
		await expect(page.getByTestId("gated-note")).toBeVisible();
	});

	test("« amorcer la stack » emits the ordered event sequence and prints the URLs", async ({
		page,
	}) => {
		await page.goto("/bootstrap");
		await page.getByTestId("bootstrap-run").click();

		// the ordered log appears.
		const events = page.getByTestId("bootstrap-events");
		await expect(events).toBeVisible();
		const rows = page.getByTestId("bootstrap-event");
		await expect(rows).toHaveCount(10);

		// the events are IN ORDER: network-created … urls-printed.
		const steps = await rows.evaluateAll((els) =>
			els.map((el) => el.getAttribute("data-step")),
		);
		expect(steps).toEqual(ORDERED_KINDS);

		// network-created comes BEFORE urls-printed (the contract).
		expect(steps.indexOf("network-created")).toBeLessThan(
			steps.indexOf("urls-printed"),
		);

		// the printed URLs are a ${VAR} reference (never a hardcoded endpoint — the wall).
		const urls = page.getByTestId("bootstrap-urls");
		await expect(urls).toBeVisible();
		// biome-ignore lint/suspicious/noTemplateCurlyInString: ${APP_SUBDOMAIN} est la réf compose littérale émise, pas un placeholder TS
		await expect(urls).toContainText("${APP_SUBDOMAIN}");
		// biome-ignore lint/suspicious/noTemplateCurlyInString: ${DOMAIN} est la réf compose littérale émise, pas un placeholder TS
		await expect(urls).toContainText("${DOMAIN}");

		// a clean host resolves the base port 80; the hash is byte-stable.
		await expect(page.getByTestId("resolved-port")).toHaveText("80");
		await expect(page.getByTestId("sequence-hash")).toHaveText(/^[0-9a-f]{8}$/);

		// no block on the nominal scenario.
		await expect(page.getByTestId("bootstrap-block")).toHaveCount(0);
	});

	test("a missing required secret fails closed with MISSING_SECRET_AT_BOOT (no event)", async ({
		page,
	}) => {
		await page.goto("/bootstrap");
		await page.getByTestId("bootstrap-run-secret-missing").click();

		const block = page.getByTestId("bootstrap-block");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "MISSING_SECRET_AT_BOOT");
		await expect(page.getByTestId("bootstrap-block-code")).toHaveText(
			"MISSING_SECRET_AT_BOOT",
		);
		// the actionable how_to_fix is present (never a prison).
		await expect(block).toContainText("APP_SECRET_");

		// a blocked bootstrap emits NO event sequence.
		await expect(page.getByTestId("bootstrap-events")).toHaveCount(0);
	});
});
