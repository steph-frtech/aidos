import { expect, test } from "@playwright/test";

/**
 * S93 Playwright e2e — the « front-end de l'app émise » Workbench panel.
 * mirror record: reflects=S93-front-emission, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /front-emitter route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * emission control is reachable AND executable from the screen, bound to a Server Action running
 * the REAL pure twin (lib/front-emitter, the twin of back/runtime/frontemit). The S93
 * done-criteria, reached from the screen:
 *   - the emitter PROJECTS the front: a byte-identical bundle (a content digest is shown);
 *   - the emitted order form renders the blob as <input type=file> and the relation as <select>;
 *   - the control+action verticale is rendered to REAL buttons, EACH carrying its control-spec
 *     fixture as a data-aidos-fixture sensor (the button is the sensor of its own spec);
 *   - a GENERATED create-order form SUBMITS a real operation against the datastore, INCLUDING a
 *     blob upload — the form is executable, not read-only.
 *
 * THE WALL (CLAUDE.md §2): the screen EMITS a supplied spec and renders a projection — it writes
 * no truth. Emission = a pure function, never an LLM. The submit hits a below-the-line datastore
 * stand-in (the emitted app's live datastore is a forward dependency, OQ-S93-datastore).
 */

test.describe("S93 — the emitted app's front-end", () => {
	test("the route renders the panel with the emit control", async ({
		page,
	}) => {
		await page.goto("/front-emitter");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Front-end de l'app émise|The emitted app's front-end/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("emit-button")).toBeVisible();
		await expect(page.getByTestId("withblob-toggle")).toBeVisible();
		await expect(page.getByTestId("withrelation-toggle")).toBeVisible();
	});

	test("emitting yields a byte-identical bundle with a content digest", async ({
		page,
	}) => {
		await page.goto("/front-emitter");
		await page.getByTestId("emit-button").click();
		await expect(page.getByTestId("front-result")).toBeVisible();
		const hash1 = await page.getByTestId("bundle-hash").innerText();
		expect(hash1.trim().length).toBeGreaterThan(0);
		// Re-emit the same spec → the SAME digest (reproducibility done-criterion).
		await page.getByTestId("emit-button").click();
		await expect(page.getByTestId("front-result")).toBeVisible();
		const hash2 = await page.getByTestId("bundle-hash").innerText();
		expect(hash2.trim()).toBe(hash1.trim());
	});

	test("the emitted form renders the blob as a file input and the relation as a select", async ({
		page,
	}) => {
		await page.goto("/front-emitter");
		await page.getByTestId("emit-button").click();
		const source = await page.getByTestId("form-source").innerText();
		expect(source).toContain('type="file"');
		expect(source).toContain("accept=");
		expect(source).toContain("<select");
		expect(source).toContain('action="/order"');
	});

	test("each control button carries its control-spec fixture as a sensor", async ({
		page,
	}) => {
		await page.goto("/front-emitter");
		await page.getByTestId("emit-button").click();
		const control = page.getByTestId("emitted-control").first();
		await expect(control).toBeVisible();
		await expect(control).toHaveAttribute("data-aidos-invoke", "CreateOrder");
		const fixture = await control.getAttribute("data-aidos-fixture");
		expect(fixture).not.toBeNull();
		const parsed = JSON.parse(fixture ?? "{}");
		expect(parsed.op).toBe("CreateOrder");
		// The fixture carries the {given,visible,enabled} rows — the button is its own sensor.
		expect(parsed.rows.length).toBeGreaterThan(0);
		const enabledWhenEmpty = parsed.rows.find(
			(r: { given: string }) => r.given === "cart-empty",
		);
		expect(enabledWhenEmpty.enabled).toBe(false);
	});

	test("a generated form submits a real operation against the datastore, blob upload included", async ({
		page,
	}) => {
		await page.goto("/front-emitter");
		await page.getByTestId("emit-button").click();
		await expect(page.getByTestId("live-order-form")).toBeVisible();

		// Fill the scalar + relation fields.
		await page.getByTestId("field-total").fill("99.00");
		await page.getByTestId("field-customer").fill("7");

		// Upload a real blob (a tiny PNG) — the receipt blob attribute.
		await page.getByTestId("field-receipt").setInputFiles({
			name: "receipt.png",
			mimeType: "image/png",
			buffer: Buffer.from([
				0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
			]),
		});

		// Submit the operation against the datastore stand-in.
		await page.getByTestId("submit-order").click();

		// The submission landed: a server-assigned id + the validated blob facts.
		const result = page.getByTestId("submit-result");
		await expect(result).toBeVisible();
		const text = await result.innerText();
		expect(text).toMatch(/^#\d+/);
		expect(text).toContain("receipt.png");
	});
});
