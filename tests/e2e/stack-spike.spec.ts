import { expect, test } from "@playwright/test";

/**
 * DP01 Playwright e2e — the « SPIKE-gate StackManifest-as-source » Workbench panel.
 * mirror record: reflects=DP01-stack-spike, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /stack-spike route renders the MEASURED verdict (the DP01 done-criterion:
 * the page renders the spike's go/no-go + the compared bytes), and that the one control
 * (« ré-émettre », ui-completeness CLAUDE.md §7) executes from the screen: re-running the
 * pure emitter yields the SAME output hash (byte-identity, the reproducibility measure).
 *
 * THE WALL (CLAUDE.md §2): the screen renders a measurement and re-measures — it writes
 * no truth (ratchet OFF, /spike zone only). Verdict = hash measure, never an LLM.
 */

test.describe("DP01 — StackManifest spike gate", () => {
	test("the route renders the measured GO verdict with the compared bytes", async ({
		page,
	}) => {
		await page.goto("/stack-spike");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Spike go\/no-go StackManifest|StackManifest go\/no-go spike/,
			}),
		).toBeVisible();

		// the verdict is measured, never declared — the fixture probe measures GO.
		const card = page.getByTestId("verdict-card");
		await expect(card).toHaveAttribute("data-verdict", "go");
		await expect(page.getByTestId("verdict")).toHaveText(/^go$/i);
		await expect(page.getByTestId("chosen-form")).toHaveText("record-kind");

		// the four measures: byte-identity ×N, round-trip, drift asymmetry.
		await expect(page.getByTestId("m-byte-identical")).toContainText("✓");
		await expect(page.getByTestId("m-round-trip")).toHaveText("✓");
		await expect(page.getByTestId("m-drift-source")).toHaveText("✓");
		await expect(page.getByTestId("m-drift-template")).toContainText("✗");

		// the compared bytes: hashes + the emitted compose honouring /data/dockers.
		await expect(page.getByTestId("source-hash")).toHaveText(/^[0-9a-f]{64}$/);
		await expect(page.getByTestId("output-hash")).toHaveText(/^[0-9a-f]{64}$/);
		await expect(page.getByTestId("emitted-compose")).toContainText(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal docker-compose ${VAR} placeholder asserted verbatim
			"container_name: ${APP_NAME}-app",
		);
		await expect(page.getByTestId("emitted-compose")).toContainText(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal docker-compose ${VAR} placeholder asserted verbatim
			"traefik.http.routers.${APP_NAME}.entrypoints=websecure",
		);
	});

	test("the re-emit control executes and proves byte-identity from the screen", async ({
		page,
	}) => {
		await page.goto("/stack-spike");
		await page.getByTestId("reemit").click();

		const result = page.getByTestId("reemit-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-equal", "true");
	});

	test("the harvest record is rendered as a content-addressed DRAFT (proposes, never freezes)", async ({
		page,
	}) => {
		await page.goto("/stack-spike");
		const harvest = page.getByTestId("harvest");
		await expect(harvest).toBeVisible();
		await expect(page.getByTestId("record-hash")).toHaveText(/^[0-9a-f]{64}$/);
		await expect(harvest).toContainText("has_mirror=false");
		await expect(harvest).toContainText("has_version=false");
	});

	test("the three candidate forms are scored as a deterministic count", async ({
		page,
	}) => {
		await page.goto("/stack-spike");
		const rows = page.getByTestId("forms").locator("tr");
		await expect(rows).toHaveCount(3);
		await expect(page.locator('[data-form="record-kind"]')).toContainText(
			"4/4",
		);
	});
});
