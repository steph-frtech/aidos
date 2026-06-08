import { expect, test } from "@playwright/test";

/**
 * S101 Playwright e2e — the « Context-Map & contrats inter-cellules » Workbench panel.
 * mirror record: reflects=S101-context-map, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /context-map route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * verify-pair + verify-all + check-call + propose controls are reachable AND executable from the
 * screen, bound to Server Actions running the REAL pure twin (lib/context-map, the twin of
 * back/kernel/contextmap). The S101 done-criteria, reached from the screen:
 *   - a consumer/provider pair HONORS its contract — checkout → billing (provider publishes a
 *     superset) is HONORED (done-criterion 1);
 *   - a cross-cell call that VIOLATES the contract is REFUSED — checkout → catalog (price field
 *     unpublished, pair unhonored) is refused CROSS_CELL_NO_CONTRACT (done-criterion 2);
 *   - the Context-Map persists ONLY via a DRAFT ChangeSet (propose → ChangeSet → approval).
 *
 * THE WALL (CLAUDE.md §2/§9): the screen designs + verifies + proposes; propose returns a DRAFT
 * envelope, it never writes truth directly. Every verdict is a pure function, never an LLM.
 */

test.describe("S101 — Context-Map & inter-cell contracts", () => {
	test("the route renders all four controls", async ({ page }) => {
		await page.goto("/context-map");
		await expect(
			page.getByRole("heading", { level: 1, name: /Context-Map/ }),
		).toBeVisible();
		await expect(page.getByTestId("verify-pair-submit")).toBeVisible();
		await expect(page.getByTestId("verify-all-submit")).toBeVisible();
		await expect(page.getByTestId("check-call-submit")).toBeVisible();
		await expect(page.getByTestId("propose-submit")).toBeVisible();
	});

	test("a consumer/provider pair honors its contract (done-criterion 1)", async ({
		page,
	}) => {
		await page.goto("/context-map");
		await page.getByTestId("pair-provider").selectOption("billing");
		await page.getByTestId("verify-pair-submit").click();
		const verdict = page.getByTestId("pair-verdict");
		await expect(verdict).toBeVisible();
		await expect(verdict).toHaveAttribute("data-honored", "true");
	});

	test("a pair that violates the contract is unhonored", async ({ page }) => {
		await page.goto("/context-map");
		await page.getByTestId("pair-provider").selectOption("catalog");
		await page.getByTestId("verify-pair-submit").click();
		const verdict = page.getByTestId("pair-verdict");
		await expect(verdict).toBeVisible();
		await expect(verdict).toHaveAttribute("data-honored", "false");
	});

	test("verify-all reports both pairs (one honored, one unhonored)", async ({
		page,
	}) => {
		await page.goto("/context-map");
		await page.getByTestId("verify-all-submit").click();
		await expect(page.getByTestId("all-verdicts")).toBeVisible();
		await expect(page.getByTestId("verdict-checkout-billing")).toHaveAttribute(
			"data-honored",
			"true",
		);
		await expect(page.getByTestId("verdict-checkout-catalog")).toHaveAttribute(
			"data-honored",
			"false",
		);
	});

	test("a cross-cell call that violates the contract is refused (done-criterion 2)", async ({
		page,
	}) => {
		await page.goto("/context-map");
		await page.getByTestId("call-from").selectOption("checkout");
		await page.getByTestId("call-to").selectOption("catalog");
		await page.getByTestId("check-call-submit").click();
		const refused = page.getByTestId("call-refused");
		await expect(refused).toBeVisible();
		await expect(refused).toHaveAttribute(
			"data-code",
			"CROSS_CELL_NO_CONTRACT",
		);
	});

	test("a honored pair authorizes the cross-cell call", async ({ page }) => {
		await page.goto("/context-map");
		await page.getByTestId("call-from").selectOption("checkout");
		await page.getByTestId("call-to").selectOption("billing");
		await page.getByTestId("check-call-submit").click();
		await expect(page.getByTestId("call-allowed")).toBeVisible();
	});

	test("propose persists the Context-Map as a DRAFT ChangeSet (the wall)", async ({
		page,
	}) => {
		await page.goto("/context-map");
		await page.getByTestId("propose-submit").click();
		const cs = page.getByTestId("proposed-changeset");
		await expect(cs).toBeVisible();
		await expect(cs).toHaveAttribute("data-status", "DRAFT");
		await expect(page.getByTestId("proposed-target")).toContainText(
			"context-map:",
		);
	});
});
