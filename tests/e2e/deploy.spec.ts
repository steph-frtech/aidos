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
