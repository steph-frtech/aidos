import { expect, test } from "@playwright/test";

/**
 * S105 Playwright e2e — the « cockpit de fédération » Workbench panel (§50).
 * mirror record: reflects=S105-federation-cockpit, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /federation-cockpit route is action-capable (ui-completeness law, CLAUDE.md §7): a
 * control is reachable AND executable from the screen, bound to a Server Action running the REAL
 * pure cockpit assembler (lib/federation-cockpit, the TS twin of back/runtime/cockpit). The S105
 * done-criterion (ROADMAP line 188), reached from the screen:
 *
 *   « deux cellules, un contrat, un red wave transverse ; une cellule montre une coupe locale
 *     verte et SHIP pendant qu'une voisine est encore ROUGE. »
 *
 * THE WALL (CLAUDE.md §2): the screen only COMPOSES + RENDERS values — it writes no truth. The
 * composition is a pure function (never an LLM).
 */

test.describe("S105 — federation cockpit", () => {
	test("the route renders the cockpit control", async ({ page }) => {
		await page.goto("/federation-cockpit");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Cockpit de fédération|Federation cockpit/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("assemble-cockpit")).toBeVisible();
		await expect(page.getByTestId("fire-wave")).toBeVisible();
		await expect(page.getByTestId("break-structure")).toBeVisible();
	});

	test("assembling the steady cockpit: two cells, one contract, globally stable", async ({
		page,
	}) => {
		await page.goto("/federation-cockpit");
		await page.getByTestId("assemble-cockpit").click();

		await expect(page.getByTestId("cockpit-result")).toBeVisible();
		// Two cells on the graph.
		await expect(page.getByTestId("cell-row-order")).toBeVisible();
		await expect(page.getByTestId("cell-row-payment")).toBeVisible();
		// One honored contract (the graph edge).
		await expect(page.getByTestId("contract-order-payment")).toContainText(
			/honoré|honored/,
		);
		// Both ratchets healthy: structural HELD, federation globally stable.
		await expect(page.getByTestId("structural-state")).toHaveText("HELD");
		await expect(page.getByTestId("globally-stable")).toHaveText(
			/stable|stable/,
		);
		// Both cells ship.
		await expect(page.getByTestId("shippable-cells")).toContainText("order");
		await expect(page.getByTestId("shippable-cells")).toContainText("payment");
	});

	test("the §50 done-criterion: a transverse red wave reddens payment; order ships its green local cut", async ({
		page,
	}) => {
		await page.goto("/federation-cockpit");
		await page.getByTestId("fire-wave").check();
		await page.getByTestId("assemble-cockpit").click();

		await expect(page.getByTestId("cockpit-result")).toBeVisible();

		// payment is reddened by the transverse wave and does NOT ship.
		await expect(page.getByTestId("cell-status-payment")).toHaveText(
			/rouge|red/,
		);
		await expect(page.getByTestId("cell-ships-payment")).toHaveText(/non|no/);

		// order shows a green local cut and SHIPS while payment is still red (§43 fractal).
		await expect(page.getByTestId("cell-status-order")).toHaveText(/verte|green/);
		await expect(page.getByTestId("cell-ships-order")).toHaveText(/oui|yes/);

		// the cockpit projections: order ships, the federation is NOT globally stable.
		await expect(page.getByTestId("shippable-cells")).toContainText("order");
		await expect(page.getByTestId("shippable-cells")).not.toContainText(
			"payment",
		);
		await expect(page.getByTestId("globally-stable")).toHaveText(
			/en flux|in flux/,
		);
		// the structural ratchet still HELD — the federation is locally in flux, not structurally rotten.
		await expect(page.getByTestId("structural-state")).toHaveText("HELD");
	});

	test("breaking the structure reddens the SECOND ratchet — globally not stable even with green cells", async ({
		page,
	}) => {
		await page.goto("/federation-cockpit");
		await page.getByTestId("break-structure").check();
		await page.getByTestId("assemble-cockpit").click();

		await expect(page.getByTestId("cockpit-result")).toBeVisible();
		// the structural (second) ratchet is BROKEN.
		await expect(page.getByTestId("structural-state")).toHaveText("BROKEN");
		// both behavioural cells still ship…
		await expect(page.getByTestId("shippable-cells")).toContainText("order");
		await expect(page.getByTestId("shippable-cells")).toContainText("payment");
		// …yet the federation is NOT globally stable (the §47 second ratchet blocks the cut).
		await expect(page.getByTestId("globally-stable")).toHaveText(
			/en flux|in flux/,
		);
	});
});
