import { expect, test } from "@playwright/test";

/**
 * DP10 Playwright e2e — the « SPIKE-gate bootstrap one-shot déterministe » panel.
 * mirror record: reflects=DP10-bootstrap-spike, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /bootstrap-spike route renders the MEASURED verdict (the DP10
 * done-criterion: verdict + the REAL startup log — traefik→datastore→serveur in
 * order, healthchecks green, URLs printed, deterministic port resolution), and
 * that the one control (« re-mesurer », ui-completeness CLAUDE.md §7) executes
 * from the screen: re-deciding purely yields the SAME verdict address.
 *
 * THE WALL (CLAUDE.md §2): the screen renders a measurement and re-measures —
 * it writes no truth (ratchet OFF, /spike zone only). Verdict = a boolean
 * conjunction over two real reproducible docker runs, never an LLM.
 */

test.describe("DP10 — one-shot bootstrap spike gate", () => {
	test("the route renders the measured GO verdict with the seven conjuncts", async ({
		page,
	}) => {
		await page.goto("/bootstrap-spike");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Spike go\/no-go bootstrap déterministe|Deterministic bootstrap go\/no-go spike/,
			}),
		).toBeVisible();

		// the verdict is measured, never declared — the probe measured GO.
		const card = page.getByTestId("verdict-card");
		await expect(card).toHaveAttribute("data-verdict", "go");
		await expect(page.getByTestId("verdict")).toHaveText(/^go$/i);
		await expect(page.getByTestId("winner")).toHaveText("native-go");
		await expect(page.getByTestId("verdict-hash")).toHaveText(
			"a2f23a64ab7769597ed983eb6413239db526995233924b27c4b3122288662dd0",
		);

		// all seven conjuncts measured green.
		const reasons = page.getByTestId("reasons").locator("li");
		await expect(reasons).toHaveCount(7);
		for (let i = 0; i < 7; i++) {
			await expect(reasons.nth(i)).toContainText("✓");
		}
	});

	test("the startup log shows the ordered real run: traefik→datastore→serveur, healthy, URLs", async ({
		page,
	}) => {
		await page.goto("/bootstrap-spike");
		const rows = page.getByTestId("events").locator("tr");
		await expect(rows).toHaveCount(9);
		const kinds = await rows.evaluateAll((trs) =>
			trs.map((tr) => tr.getAttribute("data-kind")),
		);
		expect(kinds).toEqual([
			"network-created",
			"traefik-up",
			"healthy:traefik",
			"datastore-up",
			"healthy:postgres",
			"server-up",
			"healthy:server",
			"url-probed",
			"urls-printed",
		]);
		await expect(page.getByTestId("urls")).toContainText(
			"http://127.0.0.1:18080/ (Host: dp10spike.localhost)",
		);
	});

	test("the three candidates are scored as a deterministic count over measured facts", async ({
		page,
	}) => {
		await page.goto("/bootstrap-spike");
		const rows = page.getByTestId("candidates").locator("tr");
		await expect(rows).toHaveCount(3);
		await expect(page.locator('[data-candidate="native-go"]')).toContainText(
			"5/5",
		);
		await expect(page.locator('[data-candidate="wrapper"]')).toContainText(
			"1/5",
		);
		await expect(page.locator('[data-candidate="deploy-sh"]')).toContainText(
			"0/5",
		);
		// the measured deploy.sh facts: 7 prompts, 3 hardcoded refs.
		await expect(page.getByTestId("candidates-card")).toContainText("7");
		await expect(page.getByTestId("candidates-card")).toContainText("3");
	});

	test("the re-measure control executes and proves verdict reproducibility; harvest stays a DRAFT", async ({
		page,
	}) => {
		await page.goto("/bootstrap-spike");
		await page.getByTestId("remeasure").click();

		const result = page.getByTestId("remeasure-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-equal", "true");

		const harvest = page.getByTestId("harvest");
		await expect(harvest).toBeVisible();
		await expect(page.getByTestId("record-hash")).toHaveText(/^[0-9a-f]{64}$/);
		await expect(harvest).toContainText("has_mirror=false");
		await expect(harvest).toContainText("has_version=false");
	});
});
