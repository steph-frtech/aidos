import { expect, test } from "@playwright/test";

/**
 * DP30 Playwright e2e — the « Docs de l'app émise » panel (Fumadocs + Scalar + Pagefind).
 * mirror record: reflects=DP30-docsfragments, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /app-docs route renders the DETERMINISTIC docs PROJECTION the Go emitter
 * (runtime/docsfragments, via cmd/aidosdatafragments -docs) produces from the Kernel + the
 * S90-emitted OpenAPI:
 *   - the THREE docs profile services (Fumadocs site + Scalar reference + Pagefind index,
 *     each data-key + data-profile=docs);
 *   - the Scalar API REFERENCE listing EVERY S90 sync endpoint (createOrder POST /orders +
 *     listOrders GET /orders; the async archiveOrder carries no synchronous route);
 *   - the Fumadocs concept pages of the domain;
 *   - the Pagefind static search FINDING a domain term (a domain term → a result; an
 *     off-domain term → no result — the index is honest);
 *   - the « docs par app ≠ docs AIDOS Mintlify » indicator (the build journal is distinct).
 *
 * THE WALL (CLAUDE.md §2): the screen renders a below-the-line projection — it writes no
 * truth (no kernel/mirrors/fitness). The source is the authoritative Go (the docs emission
 * is a PURE function of the Kernel + the OpenAPI); the docs are a PROJECTION, never a verity.
 * ANTI-FLAKE: the search assertions anchor on a STATE CHANGE (an off-domain query → the
 * no-results state, then a domain query → a populated result list), never a fixed sleep.
 */

// The server action runs `go run ./cmd/aidosdatafragments -docs` — first compile is slow.
const ACTION_TIMEOUT = 60_000;

test.describe("DP30 — the emitted app's docs (additive route)", () => {
	// The SSR seed spawns a Go process; allow for a cold cache.
	test.setTimeout(90_000);

	test("the route renders the three docs profile services (Fumadocs + Scalar + Pagefind)", async ({
		page,
	}) => {
		await page.goto("/app-docs");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Docs de l'app émise|Emitted app docs/,
			}),
		).toBeVisible();

		// the three docs-profile service fragments are emitted (the dev seed).
		const services = page.getByTestId("app-docs-services");
		await expect(services).toBeVisible();
		await expect
			.poll(() => services.getByTestId("app-docs-service").count(), {
				timeout: ACTION_TIMEOUT,
			})
			.toBe(3);

		// each of the three canonical keys is present, all in profile=docs.
		for (const key of ["fumadocs", "scalar", "pagefind"]) {
			const card = services.locator(
				`[data-testid="app-docs-service"][data-key="${key}"]`,
			);
			await expect(card).toBeVisible();
			await expect(card).toHaveAttribute("data-profile", "docs");
			await expect(card).toHaveAttribute("data-role", "docs");
			// a docs service writes NO AIDOS truth (the wall §2).
			await expect(card).toHaveAttribute("data-writes-truth", "false");
		}

		// the capital indicator: docs per app ≠ docs AIDOS Mintlify (the build journal).
		const notAidos = page.getByTestId("app-docs-not-aidos");
		await expect(notAidos).toBeVisible();
		await expect(notAidos).toHaveAttribute("data-not-aidos", "true");
		await expect(notAidos).toHaveAttribute("data-is-projection", "true");
		await expect(notAidos).toHaveAttribute("data-wrote-kernel", "false");
	});

	test("the Scalar reference lists every S90 sync endpoint (createOrder + listOrders; async archiveOrder excluded)", async ({
		page,
	}) => {
		await page.goto("/app-docs");

		const scalar = page.getByTestId("app-docs-scalar");
		await expect(scalar).toBeVisible({ timeout: ACTION_TIMEOUT });

		// Scalar consumes the S90-emitted OpenAPI document.
		await expect(scalar.getByTestId("scalar-openapi-path")).toContainText(
			"openapi.json",
		);
		// the inherited ccup theme (ADR 0010).
		await expect(scalar.getByTestId("scalar-theme")).toContainText("ccup");

		// each S90 sync endpoint is present in the projection.
		const createOrder = scalar.locator(
			'[data-testid="scalar-endpoint"][data-operation="createOrder"]',
		);
		await expect(createOrder).toBeVisible();
		await expect(createOrder).toHaveAttribute("data-verb", "POST");
		await expect(createOrder).toHaveAttribute("data-path", "/orders");

		const listOrders = scalar.locator(
			'[data-testid="scalar-endpoint"][data-operation="listOrders"]',
		);
		await expect(listOrders).toBeVisible();
		await expect(listOrders).toHaveAttribute("data-verb", "GET");
		await expect(listOrders).toHaveAttribute("data-path", "/orders");

		// the async op archiveOrder carries NO synchronous route — absent from Scalar.
		await expect(
			scalar.locator(
				'[data-testid="scalar-endpoint"][data-operation="archiveOrder"]',
			),
		).toHaveCount(0);

		// the Fumadocs concept site renders the domain concept (Order).
		const fumadocs = page.getByTestId("app-docs-fumadocs");
		await expect(fumadocs).toBeVisible();
		await expect(
			fumadocs.locator('[data-testid="fumadocs-page"][data-title="Order"]'),
		).toBeVisible();
	});

	test("Pagefind finds a domain term — an off-domain term yields no result, a domain term yields a hit", async ({
		page,
	}) => {
		await page.goto("/app-docs");

		const pagefind = page.getByTestId("app-docs-pagefind");
		await expect(pagefind).toBeVisible({ timeout: ACTION_TIMEOUT });

		const input = pagefind.getByTestId("pagefind-input");
		const search = pagefind.getByTestId("pagefind-search");

		// 1. an OFF-DOMAIN term → the no-results state (the index is honest, anti-flake anchor).
		await input.fill("zzz-not-a-domain-term");
		await search.click();
		await expect(pagefind.getByTestId("pagefind-no-results")).toBeVisible({
			timeout: ACTION_TIMEOUT,
		});
		await expect(
			pagefind.locator('[data-testid="pagefind-result"]'),
		).toHaveCount(0);

		// 2. a DOMAIN term (the Order entity) → a populated result list (the STATE CHANGE).
		await input.fill("order");
		await search.click();
		const results = pagefind.getByTestId("pagefind-results");
		await expect(results).toBeVisible({ timeout: ACTION_TIMEOUT });
		const hit = pagefind.locator(
			'[data-testid="pagefind-result"][data-page="concepts/order.mdx"]',
		);
		await expect(hit).toBeVisible();
	});
});
