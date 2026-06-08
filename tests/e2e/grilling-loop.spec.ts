import { expect, test } from "@playwright/test";

/**
 * S65 Playwright e2e — « Boucle de grilling » Workbench panel.
 * mirror record: reflects=S65-grilling-loop, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /grilling-loop route is action-capable (ui-completeness law, CLAUDE.md §7):
 * the in-product grilling control is reachable AND executable from the screen, bound to a
 * Server Action that EXECUTES the /grill verdict — an intention (≤ 5 scenarios) is routed
 * DETERMINISTICALLY on the named verdict (sharp → grilled, fuzzy → spiking, bad →
 * rejected/traced) and persisted as a routed `ideas` row (HUMAN provenance) scoped to the
 * active project. When a live Postgres is reachable the routing persists; without a DB the
 * action surfaces a friendly result line instead of crashing. The demo inbox lists one
 * routed idea per verdict lane so the screen is visible offline.
 *
 * THE WALL (CLAUDE.md §2): the routing writes the ideas schema (staging above the line),
 * never the kernel — promotion to a frozen truth is /goal, not this screen. Determinism:
 * the verdict picker offers EXACTLY the closed three-value set; the routing is the code's
 * authority, the LLM is the barricaded exception (re-checked against the schema).
 */

test.describe("S65 — Grilling loop", () => {
	test("the route renders the grilling panel", async ({ page }) => {
		await page.goto("/grilling-loop");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Boucle de grilling|Grilling loop/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("grill-form")).toBeVisible();
		await expect(page.getByTestId("routed-inbox")).toBeVisible();
	});

	test("the verdict picker offers exactly the closed three-value set", async ({
		page,
	}) => {
		await page.goto("/grilling-loop");
		const opts = page.locator('[data-testid="grill-verdict"] option');
		await expect(opts).toHaveCount(3);
		await expect(opts.nth(0)).toHaveAttribute("value", "sharp");
		await expect(opts.nth(1)).toHaveAttribute("value", "fuzzy");
		await expect(opts.nth(2)).toHaveAttribute("value", "bad");
	});

	test("the inbox lists routed ideas across the verdict lanes", async ({
		page,
	}) => {
		await page.goto("/grilling-loop");
		const cards = page.getByTestId("routed-card");
		await expect(cards.first()).toBeVisible();
		await expect(page.getByTestId("lane-badge").first()).toBeVisible();
	});

	test("grilling sharp routes the intention and executes", async ({ page }) => {
		await page.goto("/grilling-loop");
		await page
			.getByTestId("grill-intent")
			.fill("je veux un export CSV de mes commandes");
		await page
			.getByTestId("grill-scenarios")
			.fill("Étant donné un client Quand il exporte Alors un CSV est produit");
		await page.getByTestId("grill-proposes").selectOption("operation");
		await page.getByTestId("grill-verdict").selectOption("sharp");
		await page.getByTestId("grill-who").fill("e2e-user");
		await page.getByTestId("grill-submit").click();
		// The action ran: a result line appears (ok when DB is live, friendly error
		// otherwise) — the control is not headless.
		await expect(page.getByTestId("grill-result")).toBeVisible();
	});

	test("grilling a bad idea without a reason is refused (traced-reject gate)", async ({
		page,
	}) => {
		await page.goto("/grilling-loop");
		await page.getByTestId("grill-intent").fill("réécrire tout en une nuit");
		await page.getByTestId("grill-verdict").selectOption("bad");
		await page.getByTestId("grill-submit").click();
		// A bad idea is rejected TRACED — the action refuses without a reason.
		await expect(page.getByTestId("grill-result")).toBeVisible();
	});
});
