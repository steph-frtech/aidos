import { expect, test } from "@playwright/test";

/**
 * FK06 Playwright e2e — the « dérivation déterministe de s9 » Workbench panel.
 * mirror record: reflects=FK06-derivedoc, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /derive-doc route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * DÉRIVER S9 control is reachable AND executable from the screen, bound to a Server Action
 * running the REAL pure twin (lib/derivedoc, the TS twin of back/runtime/generators/derivedoc).
 * The FK06 done-criteria, reached from the screen:
 *   - deriving a kernel DISPLAYS its structured s9 (concepts du lexique, behaviors, erreurs);
 *   - the byte-identity proof is shown (run twice → byte-identical — « même kernel → s9 byte-identique »);
 *   - the binding behaviour control→action→operation is enumerated;
 *   - the error surface (ErrAuthorizationDenied, ErrOrphanTrigger) is covered.
 *
 * THE WALL (CLAUDE.md §2): the screen only DERIVES + DISPLAYS — it writes no truth (s9 is a
 * projection). The derivation is a pure function (never an LLM).
 */

test.describe("FK06 — DeriveDoc(kernel) → s9", () => {
	test("the route renders the derive control", async ({ page }) => {
		await page.goto("/derive-doc");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /dérivation déterministe de s9|deterministic derivation of s9/i,
			}),
		).toBeVisible();
		await expect(page.getByTestId("fixture-select")).toBeVisible();
		await expect(page.getByTestId("derive-submit")).toBeVisible();
	});

	test("deriving the checkout kernel displays the structured s9", async ({
		page,
	}) => {
		await page.goto("/derive-doc");
		await page.getByTestId("fixture-select").selectOption("checkout-slice");
		await page.getByTestId("derive-submit").click();

		await expect(page.getByTestId("s9")).toBeVisible();
		// the byte-identity proof (run twice → identical).
		await expect(page.getByTestId("identical-badge")).toHaveAttribute(
			"data-identical",
			"true",
		);

		// concepts (lexicon): operation, control, entity, event, policy.
		const concepts = page.getByTestId("concepts");
		await expect(concepts).toContainText("operation:createOrder");
		await expect(concepts).toContainText("control:checkout-button");
		await expect(concepts).toContainText("entity:Order");
		await expect(concepts).toContainText("event:OrderCreated");
		await expect(concepts).toContainText("policy:canCheckout");

		// behaviors: the control→action→operation binding is enumerated.
		await expect(
			page.locator(
				'[data-behavior-id="binding:checkout-button->checkout-submit->createOrder"]',
			),
		).toBeVisible();

		// errors covered: the authorization-denied + orphan-trigger surface.
		const errors = page.getByTestId("errors");
		await expect(errors).toContainText(
			"operation:createOrder:ErrAuthorizationDenied",
		);
		await expect(errors).toContainText(
			"control:checkout-button:ErrOrphanTrigger",
		);

		// the canonical bytes are shown (the comparison surface FK07 will diff).
		await expect(page.getByTestId("bytes")).toContainText('"kernel_id"');
	});

	test("switching kernel re-derives a different s9 deterministically", async ({
		page,
	}) => {
		await page.goto("/derive-doc");
		await page.getByTestId("fixture-select").selectOption("refund-cell");
		await page.getByTestId("derive-submit").click();

		await expect(page.getByTestId("kernel-id")).toHaveText("refund-cell");
		await expect(page.getByTestId("identical-badge")).toHaveAttribute(
			"data-identical",
			"true",
		);
		await expect(page.getByTestId("concepts")).toContainText("event:Refunded");
	});
});
