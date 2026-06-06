import { expect, test } from "@playwright/test";

/**
 * HR02 Playwright e2e — the ContextCompressor Workbench panel (/context-compression).
 * mirror record: reflects=runtime.context.ContextCompressor (the deterministic, byte-lossless,
 *               REPLACEABLE context-compression port ; ADR 0035 ; compresses the LLM input under
 *               the budget cap, never relieves the cap ; the wall as a boundary),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: the human compresses an LLM-input prompt and proves retrieve∘compress is lossless
 *   Given the Workbench is running
 *   When I navigate to /context-compression and click COMPRESSER
 *   Then the Compacted panel shows a compacted text, a reduction ratio and the reversible handle
 *   When I click RÉCUPÉRER
 *   Then the Retrieved panel shows the lossless badge (Retrieve gives back the original)
 */

test.describe("HR02 — the ContextCompressor port (compress / retrieve)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/context-compression");
		await expect(page.getByTestId("context-compressor-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("compressing the default ContextPack reduces it and exposes the handle", async ({
		page,
	}) => {
		await page.getByTestId("run-compress").click();
		await expect(page.getByTestId("compacted-panel")).toBeVisible();
		await expect(page.getByTestId("compacted-text")).toBeVisible();
		// The reduction ratio is rendered (a non-empty %).
		await expect(page.getByTestId("reduction")).toContainText("%");
		// The reversible handle dictionary has at least one entry (repeated spans were collapsed).
		await expect(page.getByTestId("handle-entry").first()).toBeVisible();
	});

	test("retrieving the handle proves losslessness on screen", async ({
		page,
	}) => {
		await page.getByTestId("run-compress").click();
		await page.getByTestId("run-retrieve").click();
		await expect(page.getByTestId("retrieved-panel")).toBeVisible();
		const badge = page.getByTestId("lossless-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveAttribute("data-lossless", "true");
		await expect(page.getByTestId("retrieved-text")).toBeVisible();
	});
});

/**
 * HR03 Playwright e2e — the GATE-INVARIANCE theorem proven FROM THE SCREEN (/context-compression).
 * mirror record: reflects=runtime.headroom.GateInvariance (the headroom sidecar adapter behind the
 *               HR02 port ; the GateAction verdict is invariant to compression ; ADR 0035),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: the human proves the gate verdict is invariant to compression
 *   Given the /context-compression panel is running
 *   When I click « Prouver l'invariance du gate »
 *   Then the gate panel shows both verdicts and the invariant badge reads data-invariant="true"
 */
test.describe("HR03 — the gate is invariant to compression", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/context-compression");
		await expect(page.getByTestId("context-compressor-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("proving the gate verdict survives retrieve∘compress (same verdict)", async ({
		page,
	}) => {
		await page.getByTestId("run-gate-check").click();
		await expect(page.getByTestId("gate-panel")).toBeVisible();
		// The invariance badge proves the theorem: the verdict is unchanged by compression.
		const badge = page.getByTestId("gate-invariant-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveAttribute("data-invariant", "true");
		// Both verdicts (original + after retrieve∘compress) are rendered and EQUAL.
		const original = await page
			.getByTestId("gate-original-allowed")
			.textContent();
		const compressed = await page
			.getByTestId("gate-compressed-allowed")
			.textContent();
		expect(original).toEqual(compressed);
	});
});

/**
 * HR04 Playwright e2e — the loop economy proven FROM THE SCREEN (/context-compression).
 * mirror record: reflects=runtime.agentloop.Compression (the ContextCompressor wired in front of
 *               GenerateAction inside Drive ; same verdict of actions, tokens ↓, CheckBudget
 *               coherent, the cap is NEVER raised ; ADR 0035 / BA11 / BA27),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: the human replays a run with and without compression
 *   Given the /context-compression panel is running
 *   When I click « Rejouer le run (avec / sans compression) »
 *   Then the replay panel shows the SAME-verdicts badge, the tokens before/after (compressed
 *        strictly lower), and the cap badge reading data-cap-raised="false" (the cap is never raised)
 */
test.describe("HR04 — the compressor wired into the loop (replay economy)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/context-compression");
		await expect(page.getByTestId("context-compressor-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("replaying with/without compression: same verdicts, tokens ↓, cap never raised", async ({
		page,
	}) => {
		await page.getByTestId("run-replay-economy").click();
		await expect(page.getByTestId("replay-panel")).toBeVisible();

		// Same action verdicts with and without compression (the gate is invariant).
		const verdicts = page.getByTestId("replay-verdicts-badge");
		await expect(verdicts).toBeVisible();
		await expect(verdicts).toHaveAttribute("data-same", "true");

		// The cap is NEVER raised.
		const cap = page.getByTestId("replay-cap-badge");
		await expect(cap).toBeVisible();
		await expect(cap).toHaveAttribute("data-cap-raised", "false");

		// Tokens measured drop: compressed strictly lower than plain.
		const plain = Number(
			(await page.getByTestId("replay-tokens-plain").textContent())?.trim(),
		);
		const compressed = Number(
			(
				await page.getByTestId("replay-tokens-compressed").textContent()
			)?.trim(),
		);
		expect(compressed).toBeLessThan(plain);
	});
});
