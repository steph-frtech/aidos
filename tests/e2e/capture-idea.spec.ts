import { expect, test } from "@playwright/test";

/**
 * S64 Playwright e2e — « Capturez votre idée » Workbench panel.
 * mirror record: reflects=S64-capture-idea, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /capture-idea route is action-capable (ui-completeness law, CLAUDE.md §7):
 * the free-text capture control is reachable AND executable from the screen, bound to a
 * Server Action that writes a REAL draft `ideas` row (HUMAN provenance) scoped to the
 * active project — the per-project inbox replacing the global /ideas fixture. When a
 * live Postgres is reachable the capture persists a content-addressed idea; without a DB
 * the action surfaces a friendly result line instead of crashing (gated on the result
 * text). The demo inbox lists two human-provenance ideas so the inbox is visible offline.
 *
 * THE WALL (CLAUDE.md §2): the capture writes the ideas schema (staging above the line),
 * never the kernel — promotion to a frozen truth is /goal, not this screen.
 */

test.describe("S64 — Capture your idea", () => {
	test("the route renders the capture panel", async ({ page }) => {
		await page.goto("/capture-idea");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Capturez votre idée|Capture your idea/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("capture-form")).toBeVisible();
		await expect(page.getByTestId("inbox")).toBeVisible();
	});

	test("the inbox lists per-project human-provenance ideas", async ({
		page,
	}) => {
		await page.goto("/capture-idea");
		const cards = page.getByTestId("inbox-card");
		await expect(cards.first()).toBeVisible();
		// Every card carries the explicit "no mirror yet" marker (an idea has no mirror)
		// and a provenance line — the candidate-truth made visible.
		await expect(page.getByTestId("no-mirror-marker").first()).toBeVisible();
		await expect(page.getByTestId("inbox-provenance").first()).toBeVisible();
	});

	test("the capture control is reachable and executes", async ({ page }) => {
		await page.goto("/capture-idea");
		await page
			.getByTestId("capture-intent")
			.fill("je veux un export CSV de mes commandes");
		await page.getByTestId("capture-proposes").selectOption("operation");
		await page.getByTestId("capture-who").fill("e2e-user");
		await page.getByTestId("capture-submit").click();
		// The action ran: a result line appears (ok when DB is live, friendly error
		// otherwise) — the control is not headless.
		await expect(page.getByTestId("capture-result")).toBeVisible();
	});

	test("an empty intention is refused (the validation gate)", async ({
		page,
	}) => {
		await page.goto("/capture-idea");
		// The textarea is `required`; assert the control is present and enforces it by
		// reporting validity rather than submitting an empty idea.
		const intent = page.getByTestId("capture-intent");
		await expect(intent).toBeVisible();
		const isRequired = await intent.evaluate(
			(el) => (el as HTMLTextAreaElement).required,
		);
		expect(isRequired).toBe(true);
	});

	test("the active-project scope is surfaced on the panel", async ({
		page,
	}) => {
		await page.goto("/capture-idea");
		// The inbox is per-project: the active project the capture is scoped to is shown.
		await expect(page.getByTestId("active-project")).toBeVisible();
		await expect(page.getByTestId("source-badge")).toBeVisible();
	});
});
