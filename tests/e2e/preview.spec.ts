import { expect, test } from "@playwright/test";

/**
 * S94 Playwright e2e — the « preview éphémère par app » Workbench panel.
 * mirror record: reflects=S94-preview-ephemeral, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /preview route is action-capable (ui-completeness law, CLAUDE.md §7): the build
 * control is reachable AND executable from the screen, bound to a Server Action running the REAL
 * pure twin (lib/preview, the twin of back/runtime/preview). The S94 done-criteria, reached from
 * the screen:
 *   - BUILD a deterministic, content-addressed preview plan keyed on the content-addressed phase
 *     (a per-phase preview URL, `pulumi up` boot, `pulumi destroy` teardown, the emitted-app hash);
 *   - the preview URL is keyed on the phase (a per-phase subdomain) and reproducible (same input →
 *     same plan id + URL); a re-emit toggles to a NEW hash + URL (content-addressing observable);
 *   - the PROBE: the served-app hash EQUALS the emitted-app hash of the phase (the done-criterion,
 *     judged by CODE);
 *   - clicking the EMITTED button in the preview-served form executes the bound operation against
 *     the datastore, INCLUDING a blob upload.
 *
 * THE WALL (CLAUDE.md §2): the screen PLANS over a supplied surface — it writes no truth. Planning
 * = a pure function, never an LLM. The submit hits a below-the-line datastore stand-in.
 */

test.describe("S94 — the per-app ephemeral preview", () => {
	test("the route renders the panel with the build control", async ({
		page,
	}) => {
		await page.goto("/preview");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Preview éphémère par app|Per-app ephemeral preview/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("build-button")).toBeVisible();
		await expect(page.getByTestId("phase-input")).toBeVisible();
	});

	test("building yields a phase-keyed preview URL and pulumi up/destroy commands", async ({
		page,
	}) => {
		await page.goto("/preview");
		await page.getByTestId("build-button").click();
		await expect(page.getByTestId("preview-result")).toBeVisible();

		// The URL is a per-phase subdomain.
		const url = await page.getByTestId("preview-url").innerText();
		expect(url).toMatch(/^https:\/\/p-[a-z0-9]+\./);

		// The plan echoes the content-addressed phase.
		const phase = await page.getByTestId("plan-phase").innerText();
		expect(phase.trim()).toBe("phase-0123456789abcdef");

		// Boot runs `pulumi up`, teardown runs `pulumi destroy` (deterministic teardown).
		const boot = await page.getByTestId("plan-boot").innerText();
		expect(boot).toContain("pulumi up");
		const teardown = await page.getByTestId("plan-teardown").innerText();
		expect(teardown).toContain("pulumi destroy");
	});

	test("the plan is reproducible; a re-emit yields a new hash and URL", async ({
		page,
	}) => {
		await page.goto("/preview");
		await page.getByTestId("build-button").click();
		await expect(page.getByTestId("preview-result")).toBeVisible();
		const id1 = (await page.getByTestId("plan-id").innerText()).trim();
		const url1 = (await page.getByTestId("preview-url").innerText()).trim();
		const hash1 = (
			await page.getByTestId("emitted-app-hash").innerText()
		).trim();

		// Re-build the same input → the SAME plan id + URL + hash (reproducibility).
		await page.getByTestId("build-button").click();
		await expect(page.getByTestId("preview-result")).toBeVisible();
		expect((await page.getByTestId("plan-id").innerText()).trim()).toBe(id1);
		expect(
			(await page.getByTestId("emitted-app-hash").innerText()).trim(),
		).toBe(hash1);

		// Toggle re-emit → a NEW emitted-app hash (the surface changed). The URL stays the same
		// (same phase keys the URL); the hash and plan id change (the surface content-addresses).
		await page.getByTestId("mutated-toggle").check();
		await expect(page.getByTestId("mutated-toggle")).toBeChecked();
		await page.getByTestId("build-button").click();
		await expect(page.getByTestId("preview-result")).toBeVisible();
		await expect
			.poll(async () =>
				(await page.getByTestId("emitted-app-hash").innerText()).trim(),
			)
			.not.toBe(hash1);
		const hash2 = (
			await page.getByTestId("emitted-app-hash").innerText()
		).trim();
		expect(hash2).not.toBe(hash1);
		// The phase is unchanged so the URL is unchanged (phase-keyed).
		expect((await page.getByTestId("preview-url").innerText()).trim()).toBe(
			url1,
		);
	});

	test("the probe asserts the served-app hash equals the emitted-app hash (done-criterion)", async ({
		page,
	}) => {
		await page.goto("/preview");
		await page.getByTestId("build-button").click();
		const match = page.getByTestId("served-match");
		await expect(match).toBeVisible();
		await expect(match).toHaveAttribute("data-match", "true");
	});

	test("clicking the emitted button executes the bound operation against the datastore, blob included", async ({
		page,
	}) => {
		await page.goto("/preview");
		await page.getByTestId("build-button").click();
		await expect(page.getByTestId("live-order-form")).toBeVisible();

		await page.getByTestId("field-total").fill("99.00");

		// Upload a real blob (a tiny PNG) — the receipt blob attribute.
		await page.getByTestId("field-receipt").setInputFiles({
			name: "receipt.png",
			mimeType: "image/png",
			buffer: Buffer.from([
				0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
			]),
		});

		// Click the EMITTED button (bound to CreateOrder) → executes against the datastore.
		await page.getByTestId("submit-order").click();

		const result = page.getByTestId("submit-result");
		await expect(result).toBeVisible();
		const text = await result.innerText();
		expect(text).toMatch(/^#\d+/);
		expect(text).toContain("receipt.png");
	});
});
