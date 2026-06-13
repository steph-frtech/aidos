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
		// Scope the count to the DATA container — the async section (DP16) also renders
		// `substrate-service` cards, so a global count would now mix the two slices.
		await expect
			.poll(() => services.getByTestId("substrate-service").count(), {
				timeout: ACTION_TIMEOUT,
			})
			.toBe(4);

		// each of the four canonical keys is present in the data container.
		for (const key of ["postgres", "doltgres", "valkey", "pgbouncer"]) {
			await expect(
				services.locator(
					`[data-testid="substrate-service"][data-key="${key}"]`,
				),
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

		// the three core data services remain and the set is scoped to prod.
		const dataServices = page.getByTestId("substrate-services");
		await expect(dataServices).toHaveAttribute("data-env", "prod");
		// Scope the count to the DATA container (the async section adds its own cards).
		await expect
			.poll(() => dataServices.getByTestId("substrate-service").count())
			.toBe(3);
		for (const key of ["postgres", "valkey", "pgbouncer"]) {
			await expect(
				dataServices.locator(
					`[data-testid="substrate-service"][data-key="${key}"]`,
				),
			).toBeVisible();
		}
	});
});

/**
 * DP16 Playwright e2e — the « Exécution asynchrone » section of the /substrate route.
 * mirror record: reflects=DP16-asyncfragments, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the async slice renders the TWO async-layer service fragments the Go emitter
 * (runtime/asyncfragments, via cmd/aidosdatafragments -async) produces — Windmill (the
 * workflow engine, core, marked « moteur de workflows », NEVER Temporal) + NATS (the
 * bus, core) — each carrying image / port / volume / healthcheck / profile; and that the
 * MINI DEMO TRIGGER (ui-completeness CLAUDE.md §7) executes from the screen: triggering
 * the demo job realises the canonical scheduled operation (sendReminder) at its echeance
 * on an INJECTED clock and shows the ORDERED dispatch sequence via the S73 transactional
 * outbox — the `write-effect` step ALWAYS precedes the `ack` step.
 *
 * THE WALL (CLAUDE.md §2): below-the-line projection — it writes no truth (no kernel/
 * mirrors/fitness; a worker writes no truth). The scheduler is code on an injected clock,
 * never the real clock; Windmill is the slot's engine, Temporal is refused.
 */
test.describe("DP16 — the async-service fragments + the demo job (additive section)", () => {
	test.setTimeout(90_000);

	test("the async section renders Windmill (workflow engine, never Temporal) and NATS (bus)", async ({
		page,
	}) => {
		await page.goto("/substrate");

		const asyncSection = page.getByTestId("substrate-async");
		await expect(asyncSection).toBeVisible();

		// the two async fragments are emitted (the dev seed).
		const services = page.getByTestId("substrate-async-services");
		await expect
			.poll(() => services.getByTestId("substrate-service").count(), {
				timeout: ACTION_TIMEOUT,
			})
			.toBe(2);

		// Windmill = the workflow engine (core), marked « moteur de workflows ».
		const windmill = asyncSection.locator(
			'[data-testid="substrate-service"][data-key="windmill"]',
		);
		await expect(windmill).toBeVisible();
		await expect(windmill).toHaveAttribute("data-role", "workflow");
		await expect(windmill).toHaveAttribute("data-profile", "core");
		await expect(windmill.getByTestId("badge-workflow-engine")).toBeVisible();
		await expect(windmill.getByTestId("service-image")).toContainText(
			"windmill",
		);
		await expect(windmill.getByTestId("service-port")).toContainText("8000");

		// the hard constraint: the workflow-engine IMAGE is a Windmill image, NEVER a
		// Temporal one (the engine is Windmill; the honest note may *mention* Temporal as
		// refused — the constraint is on the emitted image, not the prose).
		await expect(windmill.getByTestId("service-image")).not.toContainText(
			/temporal/i,
		);

		// NATS = the bus (core).
		const nats = asyncSection.locator(
			'[data-testid="substrate-service"][data-key="nats"]',
		);
		await expect(nats).toBeVisible();
		await expect(nats).toHaveAttribute("data-role", "bus");
		await expect(nats.getByTestId("service-image")).toContainText("nats");
		await expect(nats.getByTestId("service-port")).toContainText("4222");
	});

	test("triggering the demo job shows the ordered dispatch sequence — write-effect before ack", async ({
		page,
	}) => {
		await page.goto("/substrate");

		// before the trigger: no events are shown.
		await expect(page.getByTestId("substrate-async")).toBeVisible();
		await expect(page.getByTestId("async-events")).toHaveCount(0);
		await expect(page.getByTestId("async-events-empty")).toBeVisible();

		// the gesture: trigger the demo job — realises sendReminder on the injected clock.
		await page.getByTestId("async-trigger").click();

		// the ordered dispatch sequence appears (write-effect → ack), at least two steps.
		const events = page.getByTestId("async-events");
		await expect(events).toBeVisible({ timeout: ACTION_TIMEOUT });
		const steps = page.getByTestId("async-event");
		await expect.poll(() => steps.count()).toBeGreaterThanOrEqual(2);

		// step 1 is the write-effect (the effect is written PENDING) — BEFORE the ack.
		const step1 = page.locator('[data-testid="async-event"][data-step="1"]');
		await expect(step1).toHaveAttribute("data-phase", "write-effect");

		// step 2 is the ack (the dispatcher delivered it) — AFTER the write.
		const step2 = page.locator('[data-testid="async-event"][data-step="2"]');
		await expect(step2).toHaveAttribute("data-phase", "ack");

		// the canonical scheduled operation drove it.
		await expect(step1).toContainText("sendReminder");
		await expect(step2).toContainText("sendReminder");
	});
});
