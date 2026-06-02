import { expect, test } from "@playwright/test";

/**
 * S39 Playwright e2e — the meta-meta self-test panel (/meta), driven by the
 * playwright-bdd feature tests/e2e/meta.feature.
 *
 * mirror record: reflects=front.meta (the self-test verdict PROJECTION of
 *               hooks.sessionstart.Run, S39), test_kind=gherkin,
 *               cert_language=playwright-bdd, liveness=alive, authority=below
 *
 * THE DONE CRITERION: /meta renders the three inviolable NIVEAU 3 guarantees — every
 * sensor fired (N/N + per-sensor fault-injection), the wall refused on kernel · mirrors ·
 * fitness, the fitness unchanged (baseline == current) — for a healthy run; the fitness
 * baseline panel has NO editable control (read-only — the inviolable); and a mutated
 * scenario reddens with the right BlockReason while prior runs stay listed (append-only).
 */

test.describe("S39 — Méta-méta (the harness self-test, fitness inviolable)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/meta");
		await expect(
			page.getByRole("heading", { name: /Méta-méta|Meta-meta/i }),
		).toBeVisible({ timeout: 5000 });
	});

	test("a healthy harness shows the three guarantees green", async ({
		page,
	}) => {
		await page.getByTestId("scenario-select").selectOption("healthy");

		await expect(page.getByTestId("verdict")).toHaveAttribute(
			"data-verdict",
			"green",
		);
		await expect(page.getByTestId("sensors-fired")).toContainText("5/5");

		// the wall is refused on kernel, mirrors AND fitness
		for (const schema of ["kernel", "mirrors", "fitness"]) {
			await expect(page.getByTestId(`wall-attempt-${schema}`)).toContainText(
				/refusé|refused/i,
			);
		}

		// fitness unchanged: baseline hash equals current hash
		const baseline = await page
			.getByTestId("baseline-hash")
			.first()
			.textContent();
		const current = await page.getByTestId("current-hash").textContent();
		expect(baseline?.trim()).toBe(current?.trim());
		await expect(page.getByTestId("fitness-unchanged")).toContainText(
			/inchangée|unchanged/i,
		);
	});

	test("the per-sensor fault-injection rows are listed", async ({ page }) => {
		for (const id of ["gofmt", "vet", "lint", "archtest", "affected"]) {
			await expect(page.getByTestId(`sensor-probe-${id}`)).toBeVisible();
		}
	});

	test("the fitness baseline is read-only (the inviolable)", async ({
		page,
	}) => {
		const baseline = page.getByTestId("fitness-baseline");
		await expect(baseline).toBeVisible();
		await expect(page.getByTestId("read-only-badge")).toBeVisible();
		// no editable control inside the baseline panel
		await expect(
			baseline.locator("input, textarea, [contenteditable='true']"),
		).toHaveCount(0);
	});

	test("a mutated fitness reddens and surfaces FITNESS_MUTATED, prior runs stay listed", async ({
		page,
	}) => {
		await page.getByTestId("scenario-select").selectOption("mutated-fitness");

		await expect(page.getByTestId("verdict")).toHaveAttribute(
			"data-verdict",
			"red",
		);
		await expect(page.getByTestId("block-reason-code")).toContainText(
			"FITNESS_MUTATED",
		);
		await expect(page.getByTestId("fitness-unchanged")).toContainText(
			/modifiée|mutated/i,
		);

		// the append-only history is still listed (prior runs kept)
		const rows = page.getByTestId("history-row");
		expect(await rows.count()).toBeGreaterThan(0);
	});

	test("a muted sensor reddens with MUTED_SENSOR", async ({ page }) => {
		await page.getByTestId("scenario-select").selectOption("muted-sensor");
		await expect(page.getByTestId("verdict")).toHaveAttribute(
			"data-verdict",
			"red",
		);
		await expect(page.getByTestId("block-reason-code")).toContainText(
			"MUTED_SENSOR",
		);
	});
});
