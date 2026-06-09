import { expect, test } from "@playwright/test";

/**
 * FK09 Playwright e2e — the « la conscience » Workbench panel.
 * mirror record: reflects=FK09-conscience, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /conscience route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * RÉCONCILIER control is reachable AND executable from the screen, bound to a Server Action
 * running the REAL pure twin (lib/conscience, the TS twin of back/runtime/conscience). The FK09
 * done-criteria, reached from the screen:
 *   - all aligned → ALIGNED overall, no decision card;
 *   - a divergence (the runner s2↔s9 drift) PRODUCES its actionable decision card (the headline
 *     e2e done-criterion: « une divergence produit sa decision card actionnable »);
 *   - breaking a HARD facet (S) drifts the kernel + yields a security decision card;
 *   - breaking the SOFT X facet stays ALIGNED with an advisory card (§13.6 — X never blocks);
 *   - the report is deterministic (run twice → same report).
 *
 * THE WALL (CLAUDE.md §2): the screen only RECONCILES + DISPLAYS — it writes no truth (the report
 * and the cards are projections). The conscience is an AGGREGATOR (§8), never a new judge.
 */

test.describe("FK09 — Reconcile(kernel) → ConsciousnessReport + decision cards", () => {
	test("the route renders the reconcile control", async ({ page }) => {
		await page.goto("/conscience");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /la conscience|consciousness/i,
			}),
		).toBeVisible();
		await expect(page.getByTestId("scenario-select")).toBeVisible();
		await expect(page.getByTestId("reconcile-submit")).toBeVisible();
	});

	test("all aligned → ALIGNED, no decision card + deterministic", async ({
		page,
	}) => {
		await page.goto("/conscience");
		await page.getByTestId("scenario-select").selectOption("aligned");
		await page.getByTestId("reconcile-submit").click();

		await expect(page.getByTestId("report")).toBeVisible();
		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"aligned",
		);
		await expect(page.getByTestId("no-cards")).toBeVisible();
		await expect(page.getByTestId("determinism-badge")).toHaveAttribute(
			"data-deterministic",
			"true",
		);
	});

	test("a divergence produces its actionable decision card", async ({
		page,
	}) => {
		await page.goto("/conscience");
		await page.getByTestId("scenario-select").selectOption("runner-drift");
		await page.getByTestId("reconcile-submit").click();

		// the kernel drifts.
		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"drift",
		);
		// the divergent runner pair is reconciled and red.
		await expect(
			page.locator(
				'[data-testid="pair"][data-source="runner"][data-verdict="red"]',
			),
		).toBeVisible();
		// ONE actionable decision card appears for the divergence, with its options.
		const card = page.locator(
			'[data-testid="decision-card"][data-source="runner"]',
		);
		await expect(card).toBeVisible();
		await expect(
			card.locator('[data-testid="card-option"]').first(),
		).toBeVisible();
		await expect(card.locator('[data-testid="card-blast"]')).toBeVisible();
	});

	test("breaking a hard facet (S) drifts + yields a security card", async ({
		page,
	}) => {
		await page.goto("/conscience");
		await page.getByTestId("scenario-select").selectOption("break-security");
		await page.getByTestId("reconcile-submit").click();

		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"drift",
		);
		await expect(
			page.locator(
				'[data-testid="decision-card"][data-facet="S"][data-advisory="false"]',
			),
		).toBeVisible();
	});

	test("breaking the soft X facet stays aligned with an advisory card (X never blocks)", async ({
		page,
	}) => {
		await page.goto("/conscience");
		await page.getByTestId("scenario-select").selectOption("break-experience");
		await page.getByTestId("reconcile-submit").click();

		// X never clicks the ratchet hard — overall verdict stays aligned.
		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"aligned",
		);
		// the X divergence surfaces an ADVISORY decision card.
		await expect(
			page.locator(
				'[data-testid="decision-card"][data-facet="X"][data-advisory="true"]',
			),
		).toBeVisible();
	});
});
