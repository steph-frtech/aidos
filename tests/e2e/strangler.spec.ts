import { expect, test } from "@playwright/test";

/**
 * S104 Playwright e2e — the « absorption de legacy par strangler-fig » Workbench panel (§50).
 * mirror record: reflects=S104-strangler-fig, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /strangler route is action-capable (ui-completeness law, CLAUDE.md §7): TWO controls
 * are reachable AND executable from the screen, bound to Server Actions running the REAL pure
 * strangler engine (lib/strangler, the TS twin of back/archive/strangler). The S104 done-criteria,
 * reached from the screen:
 *   - START a strangler cell: carve a cell around the legacy + FREEZE its current behaviour into
 *     characterization mirrors ("UI pour démarrer une cellule strangler");
 *   - a behaviour-preserving, contract-honoring refactor stays GREEN and is ACCEPTED ("les miroirs de
 *     caractérisation restent verts à travers un refactor interne ; le contrat publié est honoré");
 *   - a refactor that changes an observable output is REFUSED (a characterization drift);
 *   - a refactor that breaks the published contract is REFUSED.
 *
 * THE WALL (CLAUDE.md §2): the screen only carves/freezes/checks + RENDERS values — it writes no
 * truth. The engine is a pure function (never an LLM).
 */

test.describe("S104 — strangler-fig legacy absorption", () => {
	test("the route renders the panel with both controls", async ({ page }) => {
		await page.goto("/strangler");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Strangler-fig/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("start-strangler")).toBeVisible();
		await expect(page.getByTestId("run-refactor")).toBeVisible();
	});

	test("starting a strangler cell carves the cell and freezes characterization mirrors", async ({
		page,
	}) => {
		await page.goto("/strangler");
		await page.getByTestId("start-strangler").click();
		const result = page.getByTestId("carve-result");
		await expect(result).toBeVisible();
		await expect(page.getByTestId("cell-ref")).toHaveText("billing");
		// three observed traces → three frozen characterization mirrors.
		await expect(page.getByTestId("frozen-count")).toHaveText("3");
		await expect(page.getByTestId("mirror-charge-in-currency")).toBeVisible();
		await expect(
			page.getByTestId("mirror-charge-cross-currency"),
		).toBeVisible();
		await expect(page.getByTestId("mirror-charge-zero")).toBeVisible();
	});

	test("a behaviour-preserving refactor stays green and is accepted", async ({
		page,
	}) => {
		await page.goto("/strangler");
		await page.getByTestId("run-refactor").click();
		await expect(page.getByTestId("refactor-result")).toBeVisible();
		await expect(page.getByTestId("refactor-verdict")).toHaveText(
			/accepté|accepted/,
		);
		// every characterization mirror stayed green.
		await expect(
			page.getByTestId("verdict-status-charge-in-currency"),
		).toHaveText(/vert|green/);
		await expect(
			page.getByTestId("verdict-status-charge-cross-currency"),
		).toHaveText(/vert|green/);
		await expect(page.getByTestId("verdict-status-charge-zero")).toHaveText(
			/vert|green/,
		);
		await expect(page.getByTestId("refactor-block")).toHaveCount(0);
	});

	test("a refactor that changes observable behaviour is refused (characterization drift)", async ({
		page,
	}) => {
		await page.goto("/strangler");
		await page.getByTestId("break-behaviour").check();
		await page.getByTestId("run-refactor").click();
		await expect(page.getByTestId("refactor-verdict")).toHaveText(
			/refusé|refused/,
		);
		await expect(page.getByTestId("block-code")).toHaveText(
			"STRANGLER_CHARACTERIZATION_DRIFT",
		);
		// exactly the cross-currency mirror drifted; the other two stay green.
		await expect(
			page.getByTestId("verdict-status-charge-cross-currency"),
		).toHaveText(/drift/);
		await expect(
			page.getByTestId("verdict-status-charge-in-currency"),
		).toHaveText(/vert|green/);
	});

	test("a refactor that breaks the published contract is refused", async ({
		page,
	}) => {
		await page.goto("/strangler");
		await page.getByTestId("break-contract").check();
		await page.getByTestId("run-refactor").click();
		await expect(page.getByTestId("refactor-verdict")).toHaveText(
			/refusé|refused/,
		);
		await expect(page.getByTestId("block-code")).toHaveText(
			"STRANGLER_PUBLISHED_CONTRACT_BROKEN",
		);
		// behaviour was preserved — the mirrors are all green; only the contract broke.
		await expect(
			page.getByTestId("verdict-status-charge-in-currency"),
		).toHaveText(/vert|green/);
	});
});
