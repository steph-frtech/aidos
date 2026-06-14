import { expect, test } from "@playwright/test";

/**
 * S96 Playwright e2e — the « déployer cette phase » Workbench panel.
 * mirror record: reflects=S96-phase-keyed-deploy, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /deploy route is action-capable (ui-completeness law, CLAUDE.md §7): the deploy
 * control is reachable AND executable from the screen, bound to a Server Action running the REAL
 * pure twin (lib/deploy, the twin of back/runtime/deploy). The S96 done-criteria, reached from
 * the screen:
 *   - DEPLOY a deterministic, content-addressed deploy plan keyed on the content-addressed phase
 *     (a per-phase deploy URL "d-…", `pulumi up` boot, `pulumi destroy` teardown, the re-emitted
 *     app hash) — ONLY from a stable phase;
 *   - a NON-STABLE phase is REFUSED with PHASE_NOT_STABLE (the Stop-gate, from the screen);
 *   - the migration runs FORWARD-ONLY (expand → backfill → contract);
 *   - the PROBE: the served-app hash EQUALS the emitted-app hash (the re-projection property —
 *     the deployed artifact is re-projected from the phase, never a stale sandbox artifact);
 *   - the plan is reproducible (same input → same plan id + URL).
 *
 * THE WALL (CLAUDE.md §2): the screen PLANS over a supplied surface — it writes no truth.
 * Planning = a pure function, never an LLM.
 */

test.describe("S96 — the phase-keyed deploy", () => {
	test("the route renders the panel with the deploy control", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Déployer cette phase|Deploy this phase/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("deploy-button")).toBeVisible();
		await expect(page.getByTestId("phase-input")).toBeVisible();
		await expect(page.getByTestId("unstable-toggle")).toBeVisible();
	});

	test("deploying a stable phase yields a phase-keyed deploy URL and pulumi up/destroy", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("deploy-button").click();
		await expect(page.getByTestId("deploy-result")).toBeVisible();

		// The URL is a per-phase DEPLOY subdomain ("d-…", distinct from preview's "p-…").
		const url = await page.getByTestId("deploy-url").innerText();
		expect(url).toMatch(/^https:\/\/d-[a-z0-9]+\./);

		// The plan echoes the content-addressed phase.
		const phase = await page.getByTestId("plan-phase").innerText();
		expect(phase.trim()).toBe("phase-0123456789abcdef");

		// Boot runs `pulumi up`, teardown runs `pulumi destroy`.
		const boot = await page.getByTestId("plan-boot").innerText();
		expect(boot).toContain("pulumi up");
		const teardown = await page.getByTestId("plan-teardown").innerText();
		expect(teardown).toContain("pulumi destroy");
	});

	test("a NON-STABLE phase is refused PHASE_NOT_STABLE (the Stop-gate)", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("unstable-toggle").check();
		await expect(page.getByTestId("unstable-toggle")).toBeChecked();
		await page.getByTestId("deploy-button").click();

		const block = page.getByTestId("block-reason");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "PHASE_NOT_STABLE");
		// No deploy result is produced for a non-stable phase.
		await expect(page.getByTestId("deploy-result")).toHaveCount(0);
	});

	test("the migration runs forward-only (expand → backfill → contract)", async ({
		page,
	}) => {
		await page.goto("/deploy");
		// The migration toggle is on by default; deploy and inspect the staged steps.
		await expect(page.getByTestId("migration-toggle")).toBeChecked();
		await page.getByTestId("deploy-button").click();
		await expect(page.getByTestId("deploy-result")).toBeVisible();

		const fwd = page.getByTestId("forward-only");
		await expect(fwd).toBeVisible();
		await expect(fwd).toHaveAttribute("data-forward", "true");

		// The three forward-only stages are present, in order.
		const steps = page.getByTestId("migration-steps").locator("li");
		await expect(steps).toHaveCount(3);
		await expect(steps.nth(0)).toHaveAttribute("data-stage", "expand");
		await expect(steps.nth(1)).toHaveAttribute("data-stage", "backfill");
		await expect(steps.nth(2)).toHaveAttribute("data-stage", "contract");
	});

	test("the probe asserts the deployed artifact is re-projected from the phase", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("deploy-button").click();
		const match = page.getByTestId("served-match");
		await expect(match).toBeVisible();
		await expect(match).toHaveAttribute("data-match", "true");
	});

	test("the deploy plan is reproducible (same input → same plan id and URL)", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("deploy-button").click();
		await expect(page.getByTestId("deploy-result")).toBeVisible();
		const id1 = (await page.getByTestId("plan-id").innerText()).trim();
		const url1 = (await page.getByTestId("deploy-url").innerText()).trim();

		await page.getByTestId("deploy-button").click();
		await expect(page.getByTestId("deploy-result")).toBeVisible();
		expect((await page.getByTestId("plan-id").innerText()).trim()).toBe(id1);
		expect((await page.getByTestId("deploy-url").innerText()).trim()).toBe(
			url1,
		);
	});
});

/**
 * DP25 Playwright e2e — the « Preview éphémère » tab (EPIC F opens, extends S94, never
 * duplicates). mirror record: reflects=DP25-preview-profile-bootstrap, test_kind=e2e,
 * cert_language=playwright, liveness=live.
 *
 * Proves the /deploy route's preview tab is action-capable (ui-completeness, CLAUDE.md §7):
 * a DP11 profile selector + a launch / emitted / demount control, each reachable AND executable
 * from the screen, bound to a Server Action running the REAL pure twin (lib/preview-bootstrap,
 * the twin of back/runtime/preview DP25). The DP25 done-criteria, reached from the screen:
 *   - LAUNCH a preview keyed on the content-addressed phase → the preview URL ("p-…"), the
 *     re-emitted app hash, and the CAPITAL invariant (preview app-hash == phase emitted-hash,
 *     hash-matches=ok), the bootstrap services the DP11 profile amorces;
 *   - CHANGING the profile keeps the APP url/hash IDENTICAL (the invariant) while the bootstrap
 *     services / sequence-hash change (the profile selects the SERVICES, never the app-hash);
 *   - the EMITTED button declares the linked operation (web-preview sidecar);
 *   - DEMOUNT is deterministic (services unwind in reverse boot order).
 *
 * THE WALL (CLAUDE.md §2): the preview trigger is BELOW-THE-LINE — it PLANS over a supplied
 * surface, it writes no truth. Planning = a pure function, never an LLM.
 */
test.describe("DP25 — the ephemeral preview (profile + bootstrap, EPIC F)", () => {
	test("the preview tab exposes the profile selector and the launch control", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("preview-tab").click();
		await expect(page.getByTestId("preview-profile-select")).toBeVisible();
		await expect(page.getByTestId("preview-launch")).toBeVisible();
		// the closed DP11 set is offered (core default, full = complete preview).
		await expect(
			page.getByTestId("preview-profile-select").locator("option"),
		).toHaveCount(9);
	});

	test("launching a preview shows the URL, the app hash and hash-matches=ok", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("preview-tab").click();
		await page.getByTestId("preview-profile-select").selectOption("core");
		await page.getByTestId("preview-launch").click();

		await expect(page.getByTestId("preview-result")).toBeVisible();
		// the preview URL is a per-phase preview subdomain ("p-…").
		const url = await page.getByTestId("preview-url").innerText();
		expect(url).toMatch(/^https:\/\/p-[a-z0-9]+\./);
		// the re-emitted app hash is shown.
		const hash = (
			await page.getByTestId("preview-app-hash").innerText()
		).trim();
		expect(hash.length).toBeGreaterThan(0);
		// the CAPITAL invariant — preview app-hash EQUALS the phase emitted-hash.
		await expect(page.getByTestId("preview-hash-matches")).toHaveAttribute(
			"data-ok",
			"true",
		);
		// the bootstrap services the profile amorces are surfaced.
		await expect(page.getByTestId("preview-bootstrap-services")).toBeVisible();
	});

	test("changing the profile keeps the APP url + hash identical (the invariant)", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("preview-tab").click();

		// First: a narrowing profile (`git` boots fewer services than full).
		await page.getByTestId("preview-profile-select").selectOption("git");
		await page.getByTestId("preview-launch").click();
		await expect(page.getByTestId("preview-result")).toBeVisible();
		const urlGit = (await page.getByTestId("preview-url").innerText()).trim();
		const hashGit = (
			await page.getByTestId("preview-app-hash").innerText()
		).trim();
		const planGit = (
			await page.getByTestId("preview-plan-id").innerText()
		).trim();
		const svcGit = await page
			.getByTestId("preview-bootstrap-services")
			.locator("li")
			.count();

		// Then: the complete `full` profile.
		await page.getByTestId("preview-profile-select").selectOption("full");
		await page.getByTestId("preview-launch").click();
		// preview-result stays visible from the first launch, so toBeVisible() is a no-op
		// wait for the SECOND submission. Anchor on the plan id actually changing (git→full)
		// before reading, else useActionState races and we read the stale `git` values.
		await expect(page.getByTestId("preview-plan-id")).not.toHaveText(planGit);
		await expect(page.getByTestId("preview-result")).toBeVisible();
		const urlFull = (await page.getByTestId("preview-url").innerText()).trim();
		const hashFull = (
			await page.getByTestId("preview-app-hash").innerText()
		).trim();
		const planFull = (
			await page.getByTestId("preview-plan-id").innerText()
		).trim();
		const svcFull = await page
			.getByTestId("preview-bootstrap-services")
			.locator("li")
			.count();

		// THE INVARIANT: the APP url + hash are IDENTICAL across profiles.
		expect(urlFull).toBe(urlGit);
		expect(hashFull).toBe(hashGit);
		// BUT the bootstrap differs: full boots strictly more services, distinct plan id.
		expect(svcFull).toBeGreaterThan(svcGit);
		expect(planFull).not.toBe(planGit);
		// the invariant indicator stays ok for the new profile.
		await expect(page.getByTestId("preview-hash-matches")).toHaveAttribute(
			"data-ok",
			"true",
		);
	});

	test("the emitted button declares the linked operation", async ({ page }) => {
		await page.goto("/deploy");
		await page.getByTestId("preview-tab").click();
		await page.getByTestId("preview-launch").click();
		await expect(page.getByTestId("preview-result")).toBeVisible();

		await page.getByTestId("preview-emitted-button").click();
		await expect(page.getByTestId("preview-emitted-result")).toBeVisible();
		await expect(page.getByTestId("preview-emitted-op")).toContainText(
			"createOrder",
		);
	});

	test("demounting is deterministic (services unwind in reverse boot order)", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("preview-tab").click();
		await page.getByTestId("preview-profile-select").selectOption("full");
		await page.getByTestId("preview-launch").click();
		await expect(page.getByTestId("preview-result")).toBeVisible();

		// capture the bootstrap (boot) order before demounting.
		const bootServices = await page
			.getByTestId("preview-bootstrap-services")
			.locator("li")
			.allInnerTexts();

		await page.getByTestId("preview-teardown").click();
		await expect(page.getByTestId("preview-teardown-result")).toBeVisible();
		const teardownServices = await page
			.getByTestId("preview-teardown-services")
			.locator("li")
			.allInnerTexts();

		// the teardown services are the EXACT reverse of the boot order (deterministic demount).
		expect(teardownServices).toEqual([...bootServices].reverse());
	});

	test("an unknown profile is refused UNKNOWN_PROFILE (set-membership, never coerced)", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("preview-tab").click();
		// drive a bogus profile through the form via the underlying select value.
		await page.getByTestId("preview-profile-select").evaluate((el) => {
			const sel = el as HTMLSelectElement;
			const opt = document.createElement("option");
			opt.value = "observabilty"; // the nearest-miss typo
			opt.text = "observabilty";
			sel.add(opt);
			sel.value = "observabilty";
		});
		await page.getByTestId("preview-launch").click();
		const block = page.getByTestId("preview-block-reason");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "UNKNOWN_PROFILE");
		await expect(page.getByTestId("preview-result")).toHaveCount(0);
	});
});

/**
 * DP26 Playwright e2e — the « Déployer cette phase » section (EPIC F, EXTENDS S96, never
 * duplicates). mirror record: reflects=DP26-deploy-this-phase-complete-order, test_kind=e2e,
 * cert_language=playwright, liveness=live.
 *
 * Proves the /deploy route's deploy section is action-capable (ui-completeness, CLAUDE.md §7):
 * a « Déployer cette phase » control, ENABLED only from a stable phase (the INHERITED Stop-gate,
 * never a separate deploy-approval gate), bound to a Server Action running the REAL pure twin
 * (lib/deploy, the twin of back/runtime/deploy DP26). The DP26 done-criteria, reached from the
 * screen:
 *   - a STABLE phase shows the deployed URL, the artefact hash with the hash-artefact = hash-phase
 *     indicator (ok — the re-projection: the deployed artefact IS the phase's app, never a stale
 *     sandbox artifact), and the COMPLETE ORDER (network → volumes → datastore → migration →
 *     bootstrap → healthcheck → URL);
 *   - a NON-STABLE phase is REFUSED with PHASE_NOT_STABLE, naming the gate reasons.
 *
 * THE WALL (CLAUDE.md §2): the screen RE-PROJECTS a phase — it writes no truth. The deploy
 * inherits the Stop-gate (no separate gate). Planning = a pure function, never an LLM.
 */
test.describe("DP26 — « Déployer cette phase » (complete order, EPIC F)", () => {
	const ORDER = [
		"network",
		"volumes",
		"datastore-provision",
		"migration",
		"bootstrap",
		"healthcheck",
		"url",
	];

	test("the section exposes the gate state and the launch control", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await expect(page.getByTestId("deploy-phase-section")).toBeVisible();
		const gate = page.getByTestId("deploy-gate");
		await expect(gate).toBeVisible();
		// before any submit, the default form deploys a STABLE phase → the gate is stable.
		await expect(gate).toHaveAttribute("data-stable", "true");
		await expect(page.getByTestId("deploy-launch")).toBeVisible();
		await expect(page.getByTestId("deploy-launch")).toBeEnabled();
	});

	test("deploying a STABLE phase shows the URL, hash-matches=ok and the ordered steps", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("deploy-launch").click();
		await expect(page.getByTestId("deploy-result")).toBeVisible();

		// the per-phase DEPLOY URL ("d-…").
		const url = await page.getByTestId("deploy-url").innerText();
		expect(url).toMatch(/^https:\/\/d-[a-z0-9]+\./);

		// the artefact hash + the hash-artefact = hash-phase indicator (the re-projection).
		const artifact = (
			await page.getByTestId("deploy-artifact-hash").innerText()
		).trim();
		expect(artifact.length).toBeGreaterThan(0);
		await expect(page.getByTestId("deploy-hash-matches")).toHaveAttribute(
			"data-ok",
			"true",
		);

		// the COMPLETE ORDER — the seven stages in the canonical sequence.
		const steps = page.getByTestId("deploy-step");
		await expect(steps).toHaveCount(7);
		for (let i = 0; i < ORDER.length; i++) {
			await expect(steps.nth(i)).toHaveAttribute("data-step", ORDER[i]);
		}
	});

	test("a NON-STABLE phase is refused PHASE_NOT_STABLE, naming the reasons", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("unstable-toggle").check();
		await expect(page.getByTestId("unstable-toggle")).toBeChecked();
		// the legacy deploy control submits the (now non-stable) form.
		await page.getByTestId("deploy-button").click();

		const block = page.getByTestId("deploy-blockreason");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "PHASE_NOT_STABLE");
		// the refusal names the gate reason (the red fixture mirror).
		await expect(block).toContainText("createOrder.fixture");
		// no deploy result is produced for a non-stable phase.
		await expect(page.getByTestId("deploy-result")).toHaveCount(0);
		// the gate badge flips to non-stable, and the launch control is disabled.
		await expect(page.getByTestId("deploy-gate")).toHaveAttribute(
			"data-stable",
			"false",
		);
		await expect(page.getByTestId("deploy-launch")).toBeDisabled();
	});
});

/**
 * DP27 Playwright e2e — the « Domaine custom + TLS » section (EPIC F, EXTENDS S97 domainbind,
 * never duplicates). mirror record: reflects=DP27-custom-domain-tls-binding, test_kind=e2e,
 * cert_language=playwright, liveness=live.
 *
 * Proves the /deploy route's domain section is action-capable (ui-completeness, CLAUDE.md §7):
 * a domain field + an environment selector + a « Lier » control, reachable AND executable from
 * the screen, bound to a Server Action running the REAL pure twin (lib/env-domainbind, the twin
 * of back/runtime/domainbind/envdomain.go DP27). The DP27 done-criteria, reached from the screen:
 *   - cabling a custom domain into a TLS-terminating environment SERVES the app over HTTPS — the
 *     HTTPS URL, the TLS status (the ACME certresolver), the EMITTED DP03 Traefik labels
 *     (websecure + tls.certresolver + redirect HTTP→HTTPS) ;
 *   - a domain owned by ANOTHER project is refused DOMAIN_ALREADY_BOUND, naming the owner (the
 *     domain→project binding is INJECTIVE).
 *
 * THE WALL (CLAUDE.md §2): resolving the cabling writes NO truth; the domain IN the Environment
 * moves through propose → ChangeSet → approval. Resolving = a pure function, never an LLM.
 */
test.describe("DP27 — custom domain + TLS (EPIC F)", () => {
	test("the section exposes the domain field, environment selector and bind control", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("domain-tab").click();
		await expect(page.getByTestId("domain-section")).toBeVisible();
		await expect(page.getByTestId("domain-input")).toBeVisible();
		await expect(page.getByTestId("domain-environment-select")).toBeVisible();
		await expect(page.getByTestId("domain-bind")).toBeVisible();
	});

	test("cabling a custom domain shows the HTTPS URL, the TLS status and the Traefik labels", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("domain-tab").click();
		await page.getByTestId("domain-input").fill("shop.example.com");
		await page.getByTestId("domain-environment-select").selectOption("prod");
		await page.getByTestId("domain-bind").click();

		await expect(page.getByTestId("domain-result")).toBeVisible();
		// the HTTPS URL the custom domain serves the app at.
		const url = await page.getByTestId("domain-https-url").innerText();
		expect(url.trim()).toBe("https://shop.example.com");
		// the TLS status — the ACME certresolver mints the certificate (data-resolver=letsencrypt).
		const tls = page.getByTestId("domain-tls-status");
		await expect(tls).toBeVisible();
		await expect(tls).toHaveAttribute("data-resolver", "letsencrypt");
		await expect(tls).toHaveAttribute("data-tls", "true");
		// the EMITTED DP03 Traefik labels — websecure + tls.certresolver + the HTTP→HTTPS redirect.
		const labels = page.getByTestId("domain-traefik-label");
		expect(await labels.count()).toBeGreaterThan(0);
		// the websecure entrypoint label is emitted (the HTTPS router).
		await expect(
			page
				.getByTestId("domain-traefik-label")
				.filter({ hasText: "entrypoints" })
				.filter({ hasText: "websecure" }),
		).toBeVisible();
		// the ACME certresolver label is emitted.
		await expect(
			page
				.getByTestId("domain-traefik-label")
				.filter({ hasText: "tls.certresolver" })
				.filter({ hasText: "letsencrypt" }),
		).toBeVisible();
		// the HTTP→HTTPS redirect middleware label is emitted.
		await expect(
			page
				.getByTestId("domain-traefik-label")
				.filter({ hasText: "redirectscheme.scheme" })
				.filter({ hasText: "https" }),
		).toBeVisible();
		// no refusal for a free domain in a TLS-terminating env.
		await expect(page.getByTestId("domain-blockreason")).toHaveCount(0);
	});

	test("a domain already bound to another project is refused DOMAIN_ALREADY_BOUND, naming the owner", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("domain-tab").click();
		// "billing.acme.com" is pinned to project "billing" in the registry; claim it for "shop".
		await page.getByTestId("domain-project-input").fill("shop");
		await page.getByTestId("domain-input").fill("billing.acme.com");
		await page.getByTestId("domain-environment-select").selectOption("prod");
		await page.getByTestId("domain-bind").click();

		const block = page.getByTestId("domain-blockreason");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "DOMAIN_ALREADY_BOUND");
		// the refusal names the owner project (the injectivity violation).
		await expect(block).toHaveAttribute("data-owner", "billing");
		await expect(block).toContainText("billing");
		// no result is produced for a refused (already-bound) domain.
		await expect(page.getByTestId("domain-result")).toHaveCount(0);
	});

	test("cabling a custom HTTPS domain into local (no TLS) is refused", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("domain-tab").click();
		await page.getByTestId("domain-input").fill("shop.example.com");
		await page.getByTestId("domain-environment-select").selectOption("local");
		await page.getByTestId("domain-bind").click();

		const block = page.getByTestId("domain-blockreason");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "OUT_OF_SCOPE");
		await expect(page.getByTestId("domain-result")).toHaveCount(0);
	});
});

/**
 * DP28 Playwright e2e — the « Promotion d'environnement + porte de validation humaine + rollback »
 * tab (EPIC F, EXTENDS S98 envrollback, never duplicates). mirror record:
 * reflects=DP28-env-promotion-human-gate-rollback, test_kind=e2e, cert_language=playwright,
 * liveness=live.
 *
 * Proves the /deploy route's env tab is action-capable (ui-completeness, CLAUDE.md §7), bound to a
 * Server Action running the REAL pure twin (lib/env-rollback, the verdict-for-verdict twin of Go
 * back/archive/envrollback DP28). THE USER-CAPITAL REQUIREMENT, reached from the screen:
 *   - THE HUMAN-VALIDATION GATE — the human SEES the live dev/preview deployment (the real app's
 *     URL) and VALIDATES it; tenter de promouvoir vers staging SANS validation est REFUSÉ
 *     DEV_NOT_HUMAN_VALIDATED (fail-closed); APRÈS validation la promotion vers staging est permise
 *     (staging sert l'app re-émise); un REFUS (validated=false) maintient le refus; la validation
 *     est PAR PHASE (un nouveau déploiement dev redemande une validation);
 *   - the ENV LADDER (preview/dev → staging → prod) + an executable ROLLBACK to an earlier phase —
 *     prod serves the RE-EMITTED app of N-1 (the rollback-app-hash carries the N-1 phase).
 *
 * THE WALL (CLAUDE.md §2/§9): la validation_humaine + le rollback sont des décisions HITL RUNTIME
 * below-the-line (provenancées, append-only), JAMAIS authority.Decide / une écriture-vers-le-kernel.
 * La porte = une comparaison PURE fail-closed (set-membership par phase), jamais un LLM.
 */
test.describe("DP28 — env promotion + human gate + rollback (EPIC F)", () => {
	test("the env tab exposes the human-validation gate with the live dev URL", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("env-tab").click();
		await expect(page.getByTestId("env-section")).toBeVisible();
		await expect(page.getByTestId("human-validation-gate")).toBeVisible();
		// the live dev/preview deployment URL the human SEES (DP25 — the real app).
		const devUrl = await page.getByTestId("dev-deploy-url").innerText();
		expect(devUrl).toMatch(/^https:\/\/preview-/);
		await expect(page.getByTestId("dev-validate")).toBeVisible();
		await expect(page.getByTestId("dev-refuse")).toBeVisible();
		// the closed env ladder is rendered (preview → staging → prod).
		await expect(page.getByTestId("env-rung")).toHaveCount(3);
	});

	test("promoting to staging WITHOUT a human validation is refused DEV_NOT_HUMAN_VALIDATED", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("env-tab").click();
		// no validation recorded yet → fail-closed.
		await page.getByTestId("promote-staging").click();

		const block = page.getByTestId("promote-blockreason");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "DEV_NOT_HUMAN_VALIDATED");
		// no staging promotion is produced without a validation.
		await expect(page.getByTestId("staging-promoted")).toHaveCount(0);
	});

	test("VALIDATING the dev unlocks the promotion to staging (staging serves the re-emitted app)", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("env-tab").click();

		// (1) the human SEES the dev deployment and VALIDATES this exact phase.
		await page.getByTestId("dev-validate").click();
		await expect(page.getByTestId("dev-validated-badge")).toBeVisible();
		await expect(page.getByTestId("human-validation-gate")).toHaveAttribute(
			"data-validated",
			"true",
		);

		// (2) promotion to staging is now permitted.
		await page.getByTestId("promote-staging").click();
		await expect(page.getByTestId("staging-promoted")).toBeVisible();
		// staging serves the RE-EMITTED app of the validated phase (the re-projection).
		const appHash = await page.getByTestId("promoted-app-hash").innerText();
		expect(appHash.length).toBeGreaterThan(0);
		// no refusal once validated.
		await expect(page.getByTestId("promote-blockreason")).toHaveCount(0);
	});

	test("REFUSING the dev keeps the promotion to staging blocked", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("env-tab").click();

		await page.getByTestId("dev-refuse").click();
		await expect(page.getByTestId("dev-refused-badge")).toBeVisible();

		await page.getByTestId("promote-staging").click();
		const block = page.getByTestId("promote-blockreason");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "DEV_NOT_HUMAN_VALIDATED");
		await expect(page.getByTestId("staging-promoted")).toHaveCount(0);
	});

	test("validation is PER PHASE — a new dev deploy re-requires a validation", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("env-tab").click();

		// validate the current dev phase, then re-deploy the dev (a NEW phase).
		await page.getByTestId("dev-validate").click();
		await expect(page.getByTestId("dev-validated-badge")).toBeVisible();
		await page.getByTestId("dev-redeploy").click();
		// the new dev phase has NO validation badge (per-phase: the old validation does not carry).
		await expect(page.getByTestId("dev-validated-badge")).toHaveCount(0);
		await expect(page.getByTestId("human-validation-gate")).toHaveAttribute(
			"data-validated",
			"false",
		);

		// promoting the NEW phase to staging is refused (the prior validation was for another phase).
		await page.getByTestId("promote-staging").click();
		const block = page.getByTestId("promote-blockreason");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "DEV_NOT_HUMAN_VALIDATED");
	});

	test("promoting, then rolling back to an earlier phase, serves the re-emitted app of N-1", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("env-tab").click();

		// promote to prod (not gated by the dev validation door), then incident → rollback to N-1.
		await page.getByTestId("promote-prod").click();
		await expect(page.getByTestId("prod-promoted")).toBeVisible();

		await page.getByTestId("rollback-launch").click();
		await expect(page.getByTestId("rollback-done")).toBeVisible();
		// the rolled-back app is the RE-EMISSION of the earlier phase N-1 (phase-dev-prev).
		await expect(page.getByTestId("rollback-to-phase")).toHaveText(
			"phase-dev-prev",
		);
		await expect(page.getByTestId("rollback-app-hash")).toHaveAttribute(
			"data-phase",
			"phase-dev-prev",
		);
		const appHash = await page.getByTestId("rollback-app-hash").innerText();
		expect(appHash.length).toBeGreaterThan(0);
	});
});

/**
 * DP29 Playwright e2e — the « Cockpit déploiement & environnements » tab (EPIC F, CLÔTURE — ÉTEND
 * S99, ASSEMBLE DP25-28 en UN écran). mirror record: reflects=DP29-deploy-cockpit, test_kind=e2e,
 * cert_language=playwright, liveness=live.
 *
 * Proves the /deploy route's cockpit tab is action-capable (ui-completeness, CLAUDE.md §7), the
 * read-side companion of the DP25-28 action tabs, bound to a Server Action running the REAL pure
 * projection (lib/deploy-cockpit.project, the twin of Go back/runtime/deploycockpit) + the DP28
 * audit reducer. The DP29 done-criteria, reached from the cockpit:
 *   - the PHASES are shown with their LIVENESS (vert/rouge/inconnu — a PURE projection of the DAG
 *     cut, S23, never an estimation): a stable head is green, a red phase is red ;
 *   - the ENVIRONMENTS (preview/staging/prod/future_cloud) are SWITCHABLE, each with the phase it
 *     serves and its live HTTPS URL (cockpit-live-url) ;
 *   - deploying a GREEN phase yields a per-phase deploy URL ; an action on a NON-STABLE phase is
 *     refused PHASE_NOT_STABLE (the inherited Stop-gate) ;
 *   - a rollback re-projects an earlier phase (the re-emitted app of N-1) ;
 *   - the audit TIMELINE shows the incident/rollback history (provenance §9) ;
 *   - a custom domain (+ TLS) is reachable and shown.
 *
 * THE WALL (CLAUDE.md §2): the cockpit READS already-projected facts below the line and ASSEMBLES
 * the read model — it writes NO truth. The projection is a PURE function of the DAG, never an LLM.
 */
test.describe("DP29 — the deploy & environments cockpit (EPIC F, clôture)", () => {
	test("the cockpit tab renders the phases with their liveness (vert/rouge/inconnu)", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("cockpit-tab").click();
		// wait for the projection to load.
		const cockpit = page.getByTestId("deploy-cockpit");
		await expect(cockpit).toBeVisible();
		// the phases render with a data-liveness attribute (the pure DAG-cut projection).
		const phases = page.getByTestId("cockpit-phase");
		await expect(phases.first()).toBeVisible();
		// the stable head phase is GREEN.
		await expect(
			page.getByTestId("cockpit-phase").filter({ hasText: "phase N (tête)" }),
		).toHaveAttribute("data-liveness", "green");
		// the red phase is RED (a non-deployable phase, never painted green on a red cut).
		const red = page
			.getByTestId("cockpit-phase")
			.filter({ hasText: "phase rouge" });
		await expect(red).toHaveAttribute("data-liveness", "red");
		await expect(red).toHaveAttribute("data-deployable", "false");
	});

	test("the environments are switchable and show the live HTTPS URL", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("cockpit-tab").click();
		await expect(page.getByTestId("deploy-cockpit")).toBeVisible();
		// the closed four-rung ladder is rendered (preview/staging/prod/future_cloud).
		await expect(page.getByTestId("cockpit-env")).toHaveCount(4);

		// the preview rung is selected first; prod serves the head phase with a live HTTPS URL.
		await page.getByTestId("cockpit-env").filter({ hasText: "prod" }).click();
		// anchor on the selection state CHANGING (data-current=true) before reading the URL.
		await expect(
			page.getByTestId("cockpit-env").filter({ hasText: "prod" }),
		).toHaveAttribute("data-current", "true");
		const liveUrl = page.getByTestId("cockpit-live-url");
		await expect(liveUrl).toBeVisible();
		expect((await liveUrl.innerText()).trim()).toMatch(/^https:\/\//);
	});

	test("deploying a GREEN phase from the cockpit yields a per-phase deploy URL", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("cockpit-tab").click();
		await expect(page.getByTestId("deploy-cockpit")).toBeVisible();
		// deploy the stable head phase (the first phase row, green + deployable).
		const headRow = page
			.getByTestId("cockpit-phase")
			.filter({ hasText: "phase N (tête)" });
		await headRow.getByTestId("cockpit-deploy-phase").click();
		// the per-phase deploy URL appears (the re-projection from the phase).
		const url = headRow.getByTestId("cockpit-phase-url");
		await expect(url).toBeVisible();
		expect((await url.innerText()).trim()).toMatch(/^https:\/\/d-[a-z0-9]+\./);
	});

	test("an action on a NON-STABLE phase is refused PHASE_NOT_STABLE", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("cockpit-tab").click();
		await expect(page.getByTestId("deploy-cockpit")).toBeVisible();
		// deploy the RED phase → the inherited Stop-gate refuses PHASE_NOT_STABLE.
		const redRow = page
			.getByTestId("cockpit-phase")
			.filter({ hasText: "phase rouge" });
		await redRow.getByTestId("cockpit-deploy-phase").click();
		const block = redRow.getByTestId("cockpit-blockreason");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute("data-code", "PHASE_NOT_STABLE");
		// no deploy URL is produced for a non-stable phase.
		await expect(redRow.getByTestId("cockpit-phase-url")).toHaveCount(0);
	});

	test("a rollback from the cockpit re-projects the app of an earlier phase (N-1)", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("cockpit-tab").click();
		await expect(page.getByTestId("deploy-cockpit")).toBeVisible();
		await page.getByTestId("cockpit-rollback").click();
		const result = page.getByTestId("cockpit-rollback-result");
		await expect(result).toBeVisible();
		// the rolled-back app carries the EARLIER phase N-1 (phase-dev-prev) — the re-emission.
		await expect(page.getByTestId("cockpit-rollback-hash")).toHaveAttribute(
			"data-phase",
			"phase-dev-prev",
		);
		const hash = await page.getByTestId("cockpit-rollback-hash").innerText();
		expect(hash.length).toBeGreaterThan(0);
	});

	test("the cockpit shows the incident/rollback audit timeline", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("cockpit-tab").click();
		await expect(page.getByTestId("deploy-cockpit")).toBeVisible();
		const timeline = page.getByTestId("cockpit-audit-timeline");
		await expect(timeline).toBeVisible();
		// the recorded history contains an incident and a rollback (provenance §9) — filter on
		// data-kind (the summaries mention "rollback" in prose, so a text filter would over-match).
		const incidentEntry = page.locator(
			'[data-testid="cockpit-audit-entry"][data-kind="incident"]',
		);
		const rollbackEntry = page.locator(
			'[data-testid="cockpit-audit-entry"][data-kind="rollback"]',
		);
		await expect(incidentEntry).toBeVisible();
		await expect(rollbackEntry).toBeVisible();
		// the entries are append-only (the rollback comes AFTER the incident).
		const entries = page.getByTestId("cockpit-audit-entry");
		expect(await entries.count()).toBeGreaterThanOrEqual(2);
		const incidentSeq = Number(await incidentEntry.getAttribute("data-seq"));
		const rollbackSeq = Number(await rollbackEntry.getAttribute("data-seq"));
		expect(rollbackSeq).toBeGreaterThan(incidentSeq);
	});

	test("the cockpit surfaces the custom domain (+ TLS) and the closed profiles", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("cockpit-tab").click();
		await expect(page.getByTestId("deploy-cockpit")).toBeVisible();
		// the custom domain cabled into prod is shown with TLS over HTTPS.
		const domain = page.getByTestId("cockpit-domain").first();
		await expect(domain).toBeVisible();
		await expect(domain).toHaveAttribute("data-tls", "true");
		const domainUrl = page.getByTestId("cockpit-domain-url").first();
		expect((await domainUrl.innerText()).trim()).toMatch(/^https:\/\//);
		// the closed DP11 profile set is offered (nine rungs).
		await expect(page.getByTestId("cockpit-profile")).toHaveCount(9);
	});
});

/**
 * « Déployer ce projet (Pulumi) » Playwright e2e — the REAL per-project×env Pulumi deployment tab
 * (intention utilisatrice 2026-06-13 : « du Pulumi qui fait les docker par projet »). mirror
 * record: reflects=pulumi-per-project-fullstack-deploy, test_kind=e2e, cert_language=playwright,
 * liveness=live.
 *
 * Proves the /deploy route's Pulumi tab is action-capable (ui-completeness, CLAUDE.md §7): the
 * « Déployer ce projet (Pulumi) » control is reachable from the screen, and the « Voir le
 * programme émis » control reads the PURE emitter (Go honoemit.EmitPulumiStack via `aidospulumi
 * emit`) — the byte-stable program + the live URL + the containers (<project>-<env>-app/db). The
 * done-criteria, reached from the screen:
 *   - the tab exposes the « Déployer ce projet (Pulumi) » button (the gated executor — `pulumi up`)
 *     and the « Voir le programme émis » button (the read-only PURE emitter);
 *   - emitting shows the live HTTPS URL (pulumi-url), the EMITTED Pulumi program (pulumi-program-
 *     preview), and the EXACT containers the deploy will create (<project>-<env>-db / -app);
 *   - the emitted program lists the project's expected containers + the gold-form anchors
 *     (priority, tls.certresolver, the external traefik network attach).
 *
 * THE WALL (CLAUDE.md §2/§6/§8): the EMITTER is a PURE, byte-stable projection (it writes no
 * truth); the EXECUTOR (`pulumi up`/`destroy`) is the GATED side-effect — we do NOT run a real
 * `pulumi up` in e2e (no docker, no network). We exercise the read-only emission + the display +
 * the presence of the deploy/teardown controls. The DP28 human gate stays upstream of staging.
 * Anti-flake: anchored on the result section appearing (the state change), never on a timer.
 */
test.describe("Pulumi — the real per-project×env deployment tab", () => {
	test("the tab exposes the « Déployer ce projet (Pulumi) » and « emit » controls", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("pulumi-tab").click();
		await expect(page.getByTestId("pulumi-section")).toBeVisible();
		await expect(page.getByTestId("pulumi-project-input")).toBeVisible();
		await expect(page.getByTestId("pulumi-env-input")).toBeVisible();
		// the real-deploy button (the gated executor — drives `pulumi up`).
		await expect(page.getByTestId("pulumi-deploy")).toBeVisible();
		// the read-only emit button (the PURE emitter preview).
		await expect(page.getByTestId("pulumi-emit")).toBeVisible();
	});

	test("emitting shows the live URL, the emitted program and the project's expected containers", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("pulumi-tab").click();
		// pin a known project×env so the expected container names are deterministic.
		await page.getByTestId("pulumi-project-input").fill("demoshop");
		await page.getByTestId("pulumi-env-input").fill("dev");
		// read the PURE emitter (no real pulumi) — the read-only preview.
		await page.getByTestId("pulumi-emit").click();

		// anchor on the result section appearing (the state change) — never a timer.
		await expect(page.getByTestId("pulumi-result")).toBeVisible();

		// the stack identity is <project>-<env>.
		await expect(page.getByTestId("pulumi-stack")).toHaveText("demoshop-dev");

		// the live HTTPS URL the emitted program pins (https://<stack>.sagedesk.fr).
		const url = (await page.getByTestId("pulumi-url").innerText()).trim();
		expect(url).toBe("https://demoshop-dev.sagedesk.fr");

		// the EMITTED Pulumi program is shown for review (the PURE emitter output, index.ts).
		const program = page.getByTestId("pulumi-program-preview");
		await expect(program).toBeVisible();
		const programText = await program.innerText();
		// the gold-form anchors the emitter must carry.
		expect(programText).toContain("priority");
		expect(programText).toContain("tls.certresolver");
		// the external traefik network is ATTACHED (networksAdvanced), never created.
		expect(programText).toContain("traefik_default");

		// the EXACT containers the deploy will create (<project>-<env>-db / -app).
		const containers = page.getByTestId("pulumi-container");
		await expect(containers).toHaveCount(2);
		await expect(
			page.locator(
				'[data-testid="pulumi-container"][data-name="demoshop-dev-db"]',
			),
		).toBeVisible();
		await expect(
			page.locator(
				'[data-testid="pulumi-container"][data-name="demoshop-dev-app"]',
			),
		).toBeVisible();
	});

	test("the emitted program lists the per-project containers the deploy creates", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("pulumi-tab").click();
		// a DIFFERENT project×env → the program + containers are namespaced to it (per-project×env).
		await page.getByTestId("pulumi-project-input").fill("alphashop");
		await page.getByTestId("pulumi-env-input").fill("staging");
		await page.getByTestId("pulumi-emit").click();

		await expect(page.getByTestId("pulumi-result")).toBeVisible();
		await expect(page.getByTestId("pulumi-stack")).toHaveText(
			"alphashop-staging",
		);
		// the emitted program names THIS project's containers + DATABASE_URL pointing the datastore.
		const programText = await page
			.getByTestId("pulumi-program-preview")
			.innerText();
		expect(programText).toContain("alphashop-staging-db");
		expect(programText).toContain("alphashop-staging-app");
		// the containers chips carry the per-project×env names.
		await expect(
			page.locator(
				'[data-testid="pulumi-container"][data-name="alphashop-staging-db"]',
			),
		).toBeVisible();
		await expect(
			page.locator(
				'[data-testid="pulumi-container"][data-name="alphashop-staging-app"]',
			),
		).toBeVisible();
	});
});

/**
 * DP33 — PORTABILITÉ FUTURE-CLOUD (clôture EPIC G + la piste DP). The « Cible de déploiement »
 * selector projects the SAME StackManifest to self-hosted (@pulumi/docker) OR future_cloud (managed
 * cloud) WITHOUT rewriting the declaration: « une source → N projections ».
 *
 * Proves (from the screen): toggling self-hosted → future_cloud recalculates the projection from
 * the SAME source; the SOURCE (sourceHash) is INVARIANT across targets (source-invariant data-ok);
 * a managed service shows its managed_url. Anti-flake: the assertions anchor on the STATE CHANGE
 * (the program's data-target flips, the source hash stays identical).
 */
test.describe("DP33 — future-cloud portability (one source → N projections)", () => {
	test("the Pulumi tab exposes the « Cible de déploiement » selector (self-hosted default)", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("pulumi-tab").click();
		const target = page.getByTestId("deploy-target");
		await expect(target).toBeVisible();
		// the toggle carries both closed targets.
		await expect(
			page.locator('[data-testid="target-toggle"][data-target="self-hosted"]'),
		).toBeVisible();
		await expect(
			page.locator('[data-testid="target-toggle"][data-target="future_cloud"]'),
		).toBeVisible();
		// self-hosted is the default projection — @pulumi/docker.
		await expect(
			page.locator('[data-testid="target-program"][data-target="self_hosted"]'),
		).toBeVisible();
		const selfProgram = await page.getByTestId("target-program").innerText();
		expect(selfProgram).toContain("@pulumi/docker");
		// the source is invariant from the first projection.
		await expect(page.getByTestId("source-invariant")).toHaveAttribute(
			"data-ok",
			"true",
		);
	});

	test("toggling self-hosted → future_cloud recalculates the projection from the SAME source", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("pulumi-tab").click();

		// the self-hosted projection + its INVARIANT source hash.
		await expect(
			page.locator('[data-testid="target-program"][data-target="self_hosted"]'),
		).toBeVisible();
		const selfHash = await page
			.getByTestId("source-invariant")
			.getAttribute("data-source-hash");
		const selfProgram = await page.getByTestId("target-program").innerText();
		expect(selfProgram).toContain("@pulumi/docker");

		// BASCULER vers future_cloud — the projection RECALCULATES from the SAME source.
		await page
			.locator('[data-testid="target-toggle"][data-target="future_cloud"]')
			.click();
		// anti-flake: anchor on the state change (the program's data-target flips to future_cloud).
		await expect(
			page.locator(
				'[data-testid="target-program"][data-target="future_cloud"]',
			),
		).toBeVisible();

		const cloudProgram = await page.getByTestId("target-program").innerText();
		// the cloud projection is a DIFFERENT program: @pulumi/cloud, no docker.Container.
		expect(cloudProgram).toContain("@pulumi/cloud");
		expect(cloudProgram).not.toContain("@pulumi/docker");
		expect(cloudProgram).not.toContain("docker.Container");

		// the SOURCE is INVARIANT across targets — the same source content address, source-invariant ok.
		await expect(page.getByTestId("source-invariant")).toHaveAttribute(
			"data-ok",
			"true",
		);
		const cloudHash = await page
			.getByTestId("source-invariant")
			.getAttribute("data-source-hash");
		expect(cloudHash).toBe(selfHash);
	});

	test("a managed service in future_cloud shows its managed_url (DP07)", async ({
		page,
	}) => {
		await page.goto("/deploy");
		await page.getByTestId("pulumi-tab").click();
		await expect(page.getByTestId("deploy-target")).toBeVisible();

		// switch to future_cloud — the managed services resolve to managed_url.
		await page
			.locator('[data-testid="target-toggle"][data-target="future_cloud"]')
			.click();
		await expect(
			page.locator(
				'[data-testid="target-program"][data-target="future_cloud"]',
			),
		).toBeVisible();

		// the datastore (Postgres) is MANAGED → ${POSTGRES_MANAGED_URL}.
		const managedPostgres = page.locator(
			'[data-testid="managed-service"][data-service="postgres"]',
		);
		await expect(managedPostgres).toBeVisible();
		await expect(managedPostgres).toHaveAttribute("data-mode", "managed_url");
		await expect(managedPostgres).toHaveAttribute(
			"data-url",
			"${POSTGRES_MANAGED_URL}",
		);
		// the bus is MANAGED too → ${EVENTS_MANAGED_URL}.
		await expect(
			page.locator(
				'[data-testid="managed-service"][data-service="events"][data-url="${EVENTS_MANAGED_URL}"]',
			),
		).toBeVisible();
	});
});
