import { expect, test } from "@playwright/test";

/**
 * S110 Playwright e2e — the « Approbation vérité multi-humains + concurrence » Workbench panel
 * (EPIC 3 auth).
 * mirror record: reflects=S110-truth-approval, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /truth-approval cockpit is action-capable (ui-completeness law, CLAUDE.md §7): controls
 * reachable AND executable from the screen, bound to Server Actions running the REAL pure twin
 * (lib/truth-approval composing authority.Decide S63 + ChangeSet S20 + content-addressed
 * optimistic-lock). The §S110 done-criteria, reached from the screen:
 *
 *   « un veto bloque une approbation, un override enregistré avec provenance ; deux membres proposent
 *     concurremment, aucune écriture n'en écrase une autre (anti-overwrite §9), un conflit résolu en
 *     re-rejouant les miroirs. »
 *
 * THE WALL (CLAUDE.md §2): the screen only RENDERS values — the cockpit writes no truth; it returns
 * the envelope the CLI would apply.
 */

test.describe("S110 — truth approval & concurrency cockpit", () => {
	test("the route renders the three controls", async ({ page }) => {
		await page.goto("/truth-approval");
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
		await expect(page.getByTestId("gate-submit")).toBeVisible();
		await expect(page.getByTestId("concurrent-submit")).toBeVisible();
		await expect(page.getByTestId("reland-submit")).toBeVisible();
	});

	test("done-criterion: a veto blocks an approval, an override lands it with provenance", async ({
		page,
	}) => {
		await page.goto("/truth-approval");

		// Veto mode: the approval is blocked.
		await page.getByTestId("mode-veto").click();
		await page.getByTestId("gate-submit").click();
		await expect(page.getByTestId("gate-result")).toBeVisible();
		await expect(page.getByTestId("outcome-alice")).toContainText(
			/BLOQUÉ|BLOCKED/,
		);

		// Same veto + a recorded override (with ADR) → the write lands with provenance.
		await page.getByTestId("override-toggle").check();
		await page.getByTestId("gate-submit").click();
		await expect(page.getByTestId("outcome-alice")).toContainText(
			/APPLIQUÉ|APPLIED/,
		);
		await expect(page.getByTestId("gate-result")).toContainText(/ADR-0016/);
	});

	test("done-criterion: two concurrent proposals — exactly one lands, no overwrite (§9)", async ({
		page,
	}) => {
		await page.goto("/truth-approval");
		await page.getByTestId("concurrent-submit").click();
		await expect(page.getByTestId("concurrent-result")).toBeVisible();

		// Exactly ONE write landed (anti-overwrite §9).
		await expect(page.getByTestId("applied-count")).toHaveText("1");
		// alice landed, bob is stale.
		await expect(page.getByTestId("outcome-alice")).toContainText(
			/APPLIQUÉ|APPLIED/,
		);
		await expect(page.getByTestId("outcome-bob")).toContainText(/périmé|stale/);
		await expect(page.getByTestId("stale-members")).toContainText("bob");
	});

	test("done-criterion: the conflict resolved by re-running the mirrors against the new head", async ({
		page,
	}) => {
		await page.goto("/truth-approval");
		// First run the concurrent batch so a new head exists.
		await page.getByTestId("concurrent-submit").click();
		await expect(page.getByTestId("applied-count")).toHaveText("1");

		// The stale member re-runs his mirrors against the new head and re-applies — now it lands.
		await page.getByTestId("reland-submit").click();
		const reland = page.getByTestId("reland-result");
		await expect(reland).toBeVisible();
		await expect(reland.getByTestId("outcome-bob")).toContainText(
			/APPLIQUÉ|APPLIED/,
		);
	});
});
