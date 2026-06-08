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
