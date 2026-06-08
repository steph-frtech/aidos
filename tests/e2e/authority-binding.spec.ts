import { expect, test } from "@playwright/test";

/**
 * S63 Playwright e2e — Authority binding & provenance Workbench panel.
 * mirror record: reflects=S63-authority-binding, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /authority-binding route is action-capable (ui-completeness law,
 * CLAUDE.md §7): the propose + override controls are reachable AND executable from
 * the screen. The decision is DETERMINISTIC (the TS twin of
 * back/runtime/authoritybinding); no truth is written from the screen (the wall, §2).
 *
 * Done-criteria proven on screen:
 *   - a proposal by a user HOLDING the scope authority is ADMITTED;
 *   - a proposal by a user WITHOUT the scope authority is INSUFFICIENT_AUTHORITY;
 *   - a placeholder actor is refused PLACEHOLDER_ACTOR (provenance ≠ placeholder);
 *   - an override is RECORDED only with ChangeSet + ADR + reason (else OVERRIDE_NOT_RECORDED).
 */

test.describe("S63 — Authority binding & provenance", () => {
	test("the route renders the binding panel", async ({ page }) => {
		await page.goto("/authority-binding");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Liaison autorité|Authority binding/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("ab-propose-submit")).toBeVisible();
		await expect(page.getByTestId("ab-override-submit")).toBeVisible();
	});

	test("an OWNER holding the scope authority ⇒ ADMITTED", async ({ page }) => {
		await page.goto("/authority-binding");
		await page.getByTestId("ab-actor-identity").fill("user-alice");
		await page.getByTestId("ab-actor-display").fill("Alice");
		await page.getByTestId("ab-member-role").selectOption("owner");
		await page.getByTestId("ab-propose-submit").click();

		const verdict = page.getByTestId("ab-verdict");
		await expect(verdict).toHaveAttribute("data-decision", "admitted");
		await expect(page.getByTestId("ab-granted")).toContainText("product_owner");
		// provenance names the real human (never a placeholder)
		await expect(page.getByTestId("ab-provenance")).toContainText("user-alice");
	});

	test("a VIEWER without the scope authority ⇒ INSUFFICIENT_AUTHORITY", async ({
		page,
	}) => {
		await page.goto("/authority-binding");
		await page.getByTestId("ab-actor-identity").fill("user-bob");
		await page.getByTestId("ab-actor-display").fill("Bob");
		await page.getByTestId("ab-member-role").selectOption("viewer");
		await page.getByTestId("ab-propose-submit").click();

		const verdict = page.getByTestId("ab-verdict");
		await expect(verdict).toHaveAttribute("data-decision", "blocked");
		await expect(verdict).toHaveAttribute(
			"data-code",
			"INSUFFICIENT_AUTHORITY",
		);
		await expect(page.getByTestId("ab-block-code")).toHaveText(
			"INSUFFICIENT_AUTHORITY",
		);
	});

	test("a placeholder actor ⇒ PLACEHOLDER_ACTOR", async ({ page }) => {
		await page.goto("/authority-binding");
		await page.getByTestId("ab-actor-identity").fill("agent");
		await page.getByTestId("ab-actor-display").fill("X");
		await page.getByTestId("ab-member-role").selectOption("owner");
		await page.getByTestId("ab-propose-submit").click();

		await expect(page.getByTestId("ab-verdict")).toHaveAttribute(
			"data-code",
			"PLACEHOLDER_ACTOR",
		);
	});

	test("an override is RECORDED only with ChangeSet + ADR + reason", async ({
		page,
	}) => {
		await page.goto("/authority-binding");

		// complete override → recorded (content-addressed)
		await page.getByTestId("ab-changeset-ref").fill("cs-123");
		await page.getByTestId("ab-adr-ref").fill("ADR 0042");
		await page.getByTestId("ab-reason").fill("exception réglementaire validée");
		await page.getByTestId("ab-override-submit").click();
		await expect(page.getByTestId("ab-override-result")).toHaveAttribute(
			"data-ok",
			"true",
		);

		// missing the ADR → OVERRIDE_NOT_RECORDED
		await page.getByTestId("ab-adr-ref").fill("");
		await page.getByTestId("ab-override-submit").click();
		const result = page.getByTestId("ab-override-result");
		await expect(result).toHaveAttribute("data-ok", "false");
		await expect(result).toHaveAttribute("data-code", "OVERRIDE_NOT_RECORDED");
	});
});
