import { expect, test } from "@playwright/test";

/**
 * FK07 Playwright e2e — the « doc-miroir : comparaison structurelle s2↔s9 » Workbench panel.
 * mirror record: reflects=FK07-docmirror, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /doc-mirror route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * COMPARER control is reachable AND executable from the screen, bound to a Server Action
 * running the REAL pure twin (lib/docmirror, the TS twin of back/kernel/mirror/docmirror).
 * The FK07 done-criteria, reached from the screen:
 *   - an ALIGNED pair is GREEN with no structural divergence;
 *   - removing a behaviour from the CODE turns the doc-mirror RED (code_missing) — fault-injection;
 *   - editing only the PROSE stays GREEN and yields an advisory (the LLM signals, never arbitrates);
 *   - the verdict is deterministic (run twice → same verdict).
 *
 * THE WALL (CLAUDE.md §2): the screen only COMPARES + DISPLAYS — it writes no truth (the report
 * is a projection). The comparison is a pure function (the judge is a calculation, §8).
 */

test.describe("FK07 — Compare(s2, s9)", () => {
	test("the route renders the compare control", async ({ page }) => {
		await page.goto("/doc-mirror");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /comparaison structurelle s2.s9|structural comparison s2.s9/i,
			}),
		).toBeVisible();
		await expect(page.getByTestId("scenario-select")).toBeVisible();
		await expect(page.getByTestId("compare-submit")).toBeVisible();
	});

	test("an aligned pair is green with no structural divergence", async ({
		page,
	}) => {
		await page.goto("/doc-mirror");
		await page.getByTestId("scenario-select").selectOption("aligned");
		await page.getByTestId("compare-submit").click();

		await expect(page.getByTestId("report")).toBeVisible();
		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"green",
		);
		await expect(page.getByTestId("structural-empty")).toBeVisible();
		// the verdict is deterministic (run twice → same).
		await expect(page.getByTestId("determinism-badge")).toHaveAttribute(
			"data-deterministic",
			"true",
		);
	});

	test("removing a behaviour from the code turns it red (fault-injection)", async ({
		page,
	}) => {
		await page.goto("/doc-mirror");
		await page.getByTestId("scenario-select").selectOption("code-missing");
		await page.getByTestId("compare-submit").click();

		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"red",
		);
		// the removed emit behaviour is reported as a structural divergence (code_missing).
		await expect(
			page.locator(
				'[data-testid="divergence"][data-section="behaviors"][data-key="emit:createOrder:OrderCreated"][data-side="code_missing"]',
			),
		).toBeVisible();
	});

	test("editing only the prose stays green with an advisory", async ({
		page,
	}) => {
		await page.goto("/doc-mirror");
		await page.getByTestId("scenario-select").selectOption("prose-edited");
		await page.getByTestId("compare-submit").click();

		// structural verdict stays GREEN — prose never blocks.
		await expect(page.getByTestId("verdict-badge")).toHaveAttribute(
			"data-verdict",
			"green",
		);
		await expect(page.getByTestId("structural-empty")).toBeVisible();
		// …but a prose advisory is surfaced (advisory, not blocking).
		await expect(
			page.locator('[data-testid="divergence"][data-plane="prose"]').first(),
		).toBeVisible();
	});
});
