import { expect, test } from "@playwright/test";

/**
 * S77 Playwright e2e — the « Éditeurs typés (pas de code libre) sur les DSL » Workbench panel.
 * mirror record: reflects=S77-dsl-editor, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /dsl-editor route is action-capable (ui-completeness law, CLAUDE.md §7): the PROPOSE
 * control is reachable AND executable from the screen, bound to a Server Action running the REAL pure
 * engine (lib/dsl-editor, the TS twin of back/kernel/dsleditor). The done-criteria of S77:
 *   - a typed editor (no free code) over Operation / Policy / Control / Action;
 *   - the verticale — an authorized control triggers its operation; enabled_when false blocks it;
 *   - parsing DSL = pure function (same doc → same DRAFT changeset);
 *   - the edit is a PROPOSED DRAFT changeset, never an applied truth (the wall).
 *
 * THE WALL (CLAUDE.md §2): the screen only PARSES the typed edit and PROPOSES a DRAFT changeset — it
 * writes no truth (WroteKernel = false). The parsing is a pure function (never an LLM).
 */

test.describe("S77 — typed DSL editors (no free code)", () => {
	test("the route renders the panel with the propose control", async ({
		page,
	}) => {
		await page.goto("/dsl-editor");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Éditeurs typés des DSL|Typed DSL editors/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("kind-select")).toBeVisible();
		await expect(page.getByTestId("name-input")).toBeVisible();
		await expect(page.getByTestId("body-textarea")).toBeVisible();
		await expect(page.getByTestId("propose-button")).toBeVisible();
	});

	test("proposing a typed policy opens a DRAFT changeset (never applied, wrote_kernel false)", async ({
		page,
	}) => {
		await page.goto("/dsl-editor");
		await page.getByTestId("kind-select").selectOption("policy");
		await page.getByTestId("propose-button").click();

		const result = page.getByTestId("proposal-result");
		await expect(result).toBeVisible();
		// THE WALL: the changeset is DRAFT, never applied; WroteKernel false.
		await expect(page.getByTestId("changeset-status")).toContainText("DRAFT");
		await expect(page.getByTestId("wrote-kernel")).toContainText("false");
		await expect(page.getByTestId("changeset-target")).toContainText(
			"dsl-edit@policy:canPlaceOrder",
		);
		await expect(page.getByTestId("changeset-body-hash")).not.toBeEmpty();
	});

	test("the verticale — a typed control + action propose; the operation is bound", async ({
		page,
	}) => {
		await page.goto("/dsl-editor");
		// Author the control (visible ∧ enabled → authorized).
		await page.getByTestId("kind-select").selectOption("control");
		await page.getByTestId("propose-button").click();
		await expect(page.getByTestId("changeset-target")).toContainText(
			"dsl-edit@control:checkout-button",
		);
		// Author the action binding the control → createOrder operation.
		await page.getByTestId("kind-select").selectOption("action");
		await page.getByTestId("propose-button").click();
		await expect(page.getByTestId("changeset-target")).toContainText(
			"dsl-edit@action:checkout-submit",
		);
	});

	test("enabled_when false still proposes (the disabled control blocks the action at runtime)", async ({
		page,
	}) => {
		await page.goto("/dsl-editor");
		await page.getByTestId("kind-select").selectOption("control");
		// Flip enabled_when to false in the typed body — a structured edit, not free code.
		const body = page.getByTestId("body-textarea");
		const current = (await body.inputValue()).replace(
			/"enabled_when":\s*\{\s*"kind":\s*"lit",\s*"value":\s*true\s*\}/,
			'"enabled_when": { "kind": "lit", "value": false }',
		);
		await body.fill(current);
		await page.getByTestId("propose-button").click();
		// It still PARSES + proposes a DRAFT (the disabled state is a runtime guard, not a parse error).
		await expect(page.getByTestId("proposal-result")).toBeVisible();
		await expect(page.getByTestId("changeset-status")).toContainText("DRAFT");
	});

	test("a free-code body is refused (no free code, KRD §24)", async ({
		page,
	}) => {
		await page.goto("/dsl-editor");
		await page.getByTestId("kind-select").selectOption("operation");
		await page
			.getByTestId("body-textarea")
			.fill('{ "code": "os.Exit(1)", "steps": [] }');
		await page.getByTestId("propose-button").click();
		await expect(page.getByTestId("proposal-error")).toBeVisible();
		await expect(page.getByTestId("proposal-error")).toContainText(
			/free code|code libre/,
		);
	});

	test("parsing is a pure function — re-proposing the same edit yields the same body hash", async ({
		page,
	}) => {
		await page.goto("/dsl-editor");
		await page.getByTestId("kind-select").selectOption("policy");
		await page.getByTestId("propose-button").click();
		await expect(page.getByTestId("changeset-body-hash")).toBeVisible();
		const first = await page.getByTestId("changeset-body-hash").textContent();
		await page.getByTestId("propose-button").click();
		await expect(page.getByTestId("changeset-body-hash")).toBeVisible();
		const second = await page.getByTestId("changeset-body-hash").textContent();
		expect(first).toBe(second);
	});
});
