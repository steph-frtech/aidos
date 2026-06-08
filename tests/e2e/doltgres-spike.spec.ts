import { expect, test } from "@playwright/test";

/**
 * S88 Playwright e2e — the « spike go/no-go Doltgres » Workbench panel.
 * mirror record: reflects=S88-doltgres-spike, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /doltgres-spike route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * verdict control is reachable AND executable from the screen, bound to a Server Action running the
 * REAL pure engine (lib/doltgres-spike, the TS twin of back/runtime/doltgresspike). The S88
 * done-criteria, reached from the screen:
 *   - a stable measurement (N conns, 0 failures, perf within ceiling) → verdict GO, doltgres opt-in,
 *     default ALWAYS plain-postgres (the escape hatch by construction);
 *   - a REPRODUCIBLE failure → verdict NO-GO, doltgres withdrawn, default still plain-postgres;
 *   - a non-reproducible blip → still GO (the done-criteria require a reproducible failure to flip).
 *
 * THE WALL (CLAUDE.md §2): the screen judges a supplied measurement and renders a record — it writes
 * no truth. Verdict = measure, never an LLM.
 */

test.describe("S88 — Doltgres go/no-go spike", () => {
	test("the route renders the panel with the decide control", async ({
		page,
	}) => {
		await page.goto("/doltgres-spike");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Spike go\/no-go Doltgres|Doltgres go\/no-go spike/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("decide-submit")).toBeVisible();
		await expect(page.getByTestId("field-conns")).toBeVisible();
		await expect(page.getByTestId("thresholds")).toBeVisible();
	});

	test("a stable measurement yields GO with doltgres opt-in and plain-postgres default", async ({
		page,
	}) => {
		await page.goto("/doltgres-spike");
		// The form is pre-filled with the measured spike (64 conns, 0 failed, within ceiling).
		await page.getByTestId("decide-submit").click();

		const decision = page.getByTestId("decision");
		await expect(decision).toHaveAttribute("data-verdict", "go");
		await expect(page.getByTestId("verdict")).toHaveText(/go/i);
		await expect(page.getByTestId("default-target")).toHaveText(
			"plain-postgres",
		);
		await expect(page.locator('[data-optin="doltgres"]')).toBeVisible();
		// a content address proves determinism (verdict = measure).
		await expect(page.getByTestId("decision-id")).toBeVisible();
	});

	test("a reproducible failure flips to NO-GO and withdraws doltgres", async ({
		page,
	}) => {
		await page.goto("/doltgres-spike");
		await page.getByTestId("field-failed").fill("3");
		// reproducible stays checked (default) → reproducible failure.
		await page.getByTestId("decide-submit").click();

		const decision = page.getByTestId("decision");
		await expect(decision).toHaveAttribute("data-verdict", "no-go");
		await expect(page.getByTestId("default-target")).toHaveText(
			"plain-postgres",
		);
		await expect(page.locator('[data-optin="doltgres"]')).toHaveCount(0);
	});

	test("a non-reproducible blip does NOT flip the default (stays GO)", async ({
		page,
	}) => {
		await page.goto("/doltgres-spike");
		await page.getByTestId("field-failed").fill("3");
		// uncheck reproducible → a blip, which must NOT flip per the done-criteria.
		await page.getByTestId("field-reproducible").uncheck();
		await page.getByTestId("decide-submit").click();

		await expect(page.getByTestId("decision")).toHaveAttribute(
			"data-verdict",
			"go",
		);
	});
});
