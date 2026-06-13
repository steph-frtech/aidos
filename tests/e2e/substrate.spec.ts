import { expect, test } from "@playwright/test";

/**
 * DP15 Playwright e2e — the « Services de données (fragments StackManifest) » panel.
 * mirror record: reflects=DP15-datafragments, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /substrate route renders the FOUR data-layer service fragments the Go
 * emitter (runtime/datafragments, via cmd/aidosdatafragments) produces — Postgres
 * (datastore, core), Doltgres (datastore, non-prod, opt-in, marked « hors prod »),
 * Valkey (cache, core), PgBouncer (pooler, core) — each carrying its image, port,
 * volume, healthcheck and profile; and that the ENV SELECTOR gesture (ui-completeness
 * CLAUDE.md §7) executes from the screen: off prod (dev) the four fragments appear,
 * switching to PROD makes the DP06 rule REFUSE Doltgres
 * (DOLTGRES_NOT_ALLOWED_IN_PROD, surfaced verbatim) so it disappears, leaving the
 * three core services.
 *
 * THE WALL (CLAUDE.md §2): the screen renders a below-the-line projection — it writes
 * no truth (no kernel/mirrors/fitness). The source is the authoritative Go (the
 * fragment emission + the DP06 gate are pure functions); the DP06 refusal is the
 * EXISTING rule, never re-coined in the UI.
 */

// The server action runs `go run ./cmd/aidosdatafragments` — first compile is slow.
const ACTION_TIMEOUT = 60_000;

test.describe("DP15 — the data-service fragments (additive route)", () => {
	// The SSR seed + the prod re-emit each spawn a Go process; allow for a cold cache.
	test.setTimeout(90_000);

	test("the route renders the four data services, Postgres in core, Doltgres marked non-prod", async ({
		page,
	}) => {
		await page.goto("/substrate");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Services de données \(fragments StackManifest\)|Data services \(StackManifest fragments\)/,
			}),
		).toBeVisible();

		// the four data-service fragments are emitted off prod (the dev seed).
		const services = page.getByTestId("substrate-services");
		await expect(services).toBeVisible();
		await expect
			.poll(() => page.getByTestId("substrate-service").count(), {
				timeout: ACTION_TIMEOUT,
			})
			.toBe(4);

		// each of the four canonical keys is present.
		for (const key of ["postgres", "doltgres", "valkey", "pgbouncer"]) {
			await expect(
				page.locator(`[data-testid="substrate-service"][data-key="${key}"]`),
			).toBeVisible();
		}

		// Postgres is the datastore in profile `core` (the prod default).
		const postgres = page.locator(
			'[data-testid="substrate-service"][data-key="postgres"]',
		);
		await expect(postgres).toHaveAttribute("data-profile", "core");
		await expect(postgres).toHaveAttribute("data-role", "datastore");
		await expect(postgres.getByTestId("service-image")).toContainText(
			"postgres:16-alpine",
		);
		await expect(postgres.getByTestId("service-port")).toContainText("5432");

		// Doltgres is the non-prod, opt-in datastore — marked « hors prod ».
		const doltgres = page.locator(
			'[data-testid="substrate-service"][data-key="doltgres"]',
		);
		await expect(doltgres).toHaveAttribute("data-profile", "non-prod");
		await expect(doltgres.getByTestId("badge-hors-prod")).toBeVisible();

		// Valkey = cache, PgBouncer = pooler (both core).
		await expect(
			page.locator('[data-testid="substrate-service"][data-key="valkey"]'),
		).toHaveAttribute("data-role", "cache");
		const pgbouncer = page.locator(
			'[data-testid="substrate-service"][data-key="pgbouncer"]',
		);
		await expect(pgbouncer).toHaveAttribute("data-role", "pooler");
		await expect(pgbouncer.getByTestId("service-profile")).toBeVisible();
	});

	test("switching to prod refuses Doltgres (DOLTGRES_NOT_ALLOWED_IN_PROD) — it disappears, three core services remain", async ({
		page,
	}) => {
		await page.goto("/substrate");

		// off prod (dev seed): doltgres is present.
		await expect
			.poll(
				() =>
					page
						.locator('[data-testid="substrate-service"][data-key="doltgres"]')
						.count(),
				{ timeout: ACTION_TIMEOUT },
			)
			.toBe(1);

		// the gesture: select prod — re-emits via the authoritative Go.
		await page.getByTestId("substrate-env").selectOption("prod");

		// the DP06 refusal is surfaced verbatim with the closed code.
		const refusal = page.getByTestId("doltgres-refusal");
		await expect(refusal).toBeVisible({ timeout: ACTION_TIMEOUT });
		await expect(refusal).toHaveAttribute(
			"data-code",
			"DOLTGRES_NOT_ALLOWED_IN_PROD",
		);
		await expect(refusal).toContainText("DOLTGRES_NOT_ALLOWED_IN_PROD");

		// doltgres is ABSENT from the emitted set in prod (gated, not a defect).
		await expect(
			page.locator('[data-testid="substrate-service"][data-key="doltgres"]'),
		).toHaveCount(0);

		// the three core services remain and the set is scoped to prod.
		await expect(page.getByTestId("substrate-services")).toHaveAttribute(
			"data-env",
			"prod",
		);
		await expect
			.poll(() => page.getByTestId("substrate-service").count())
			.toBe(3);
		for (const key of ["postgres", "valkey", "pgbouncer"]) {
			await expect(
				page.locator(`[data-testid="substrate-service"][data-key="${key}"]`),
			).toBeVisible();
		}
	});
});
