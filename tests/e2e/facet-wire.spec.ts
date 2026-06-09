import { expect, test } from "@playwright/test";

/**
 * FK08 Playwright e2e — the « câbler les facettes S/R/V/M/X » Workbench panel.
 * mirror record: reflects=FK08-facetwire, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /facet-wire route is action-capable (ui-completeness law, CLAUDE.md §7): the CÂBLER
 * control is reachable AND executable from the screen, bound to a Server Action running the REAL
 * pure twin (lib/facetwire, the TS twin of back/kernel/mirror/facetwire). The FK08 done-criteria,
 * reached from the screen:
 *   - all facet columns aligned → GREEN overall;
 *   - breaking a pair of a HARD column (S/R/V/M) reddens THAT column + the overall verdict
 *     (fault-injection — « casser une paire rougit la bonne colonne »), the others stay green
 *     (orthogonality);
 *   - breaking a pair of the SOFT X column stays GREEN with an advisory (« X reste advisory »);
 *   - the verdict is deterministic (run twice → same verdict).
 *
 * THE WALL (CLAUDE.md §2): the screen only WIRES + DISPLAYS — it writes no truth (the report is a
 * projection). The judge is a structural calculation (§8), never an LLM.
 */

test.describe("FK08 — WireSkeleton(S/R/V/M/X)", () => {
	test("the route renders the wire control", async ({ page }) => {
		await page.goto("/facet-wire");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /câbler les facettes|wire the .*facets/i,
			}),
		).toBeVisible();
		await expect(page.getByTestId("scenario-select")).toBeVisible();
		await expect(page.getByTestId("wire-submit")).toBeVisible();
	});

	test("all columns aligned → green overall + deterministic", async ({
		page,
	}) => {
		await page.goto("/facet-wire");
		await page.getByTestId("scenario-select").selectOption("aligned");
		await page.getByTestId("wire-submit").click();

		await expect(page.getByTestId("report")).toBeVisible();
		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"green",
		);
		await expect(page.getByTestId("determinism-badge")).toHaveAttribute(
			"data-deterministic",
			"true",
		);
		// the five non-functional columns are present.
		await expect(page.locator('[data-testid="column"]')).toHaveCount(5);
	});

	test("breaking a hard column (S) reddens THAT column, others stay green (fault-injection)", async ({
		page,
	}) => {
		await page.goto("/facet-wire");
		await page.getByTestId("scenario-select").selectOption("break-security");
		await page.getByTestId("wire-submit").click();

		// overall verdict is red.
		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"red",
		);
		// the S column is red, with the broken evidence pair surfaced.
		await expect(
			page.locator('[data-testid="column"][data-facet="S"]'),
		).toHaveAttribute("data-verdict", "red");
		await expect(
			page.locator(
				'[data-testid="column"][data-facet="S"] [data-testid="divergence"][data-rung="6-evidence"][data-kind="pair_broken"]',
			),
		).toBeVisible();
		// orthogonality: the R column stays green.
		await expect(
			page.locator('[data-testid="column"][data-facet="R"]'),
		).toHaveAttribute("data-verdict", "green");
	});

	test("breaking the soft X column stays green with an advisory (X reste advisory)", async ({
		page,
	}) => {
		await page.goto("/facet-wire");
		await page.getByTestId("scenario-select").selectOption("break-experience");
		await page.getByTestId("wire-submit").click();

		// the soft X column NEVER clicks the ratchet hard — overall verdict stays green.
		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"green",
		);
		// the X column itself is green and surfaces an advisory divergence.
		await expect(
			page.locator('[data-testid="column"][data-facet="X"]'),
		).toHaveAttribute("data-verdict", "green");
		await expect(
			page.locator(
				'[data-testid="column"][data-facet="X"] [data-testid="divergence"][data-advisory="true"]',
			),
		).toBeVisible();
	});
});
