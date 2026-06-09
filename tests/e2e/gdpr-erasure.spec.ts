import { expect, test } from "@playwright/test";

/**
 * S116 Playwright e2e — GDPR export & erasure Workbench panel.
 * mirror record: reflects=S116-gdpr-export-erasure, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /gdpr-erasure route is action-capable (ui-completeness, CLAUDE.md §7): every op the
 * step develops has a control reachable AND executable from the screen, each bound to the pure
 * twin (lib/erasure.ts):
 *   - EXPORT renders all of a person's data (Art. 20);
 *   - ERASE crypto-shreds + tombstones the PII, records a content-addressed decision, and keeps
 *     the phase hash INVARIANT (append-only preserved, Art. 17);
 *   - after erasure NO query returns the subject's PII (cross-project, cross-plan);
 *   - the emitted-app plan erases one end-user without touching the account (cross-plan).
 */

test.describe("S116 — GDPR export & erasure", () => {
	test("the route renders the erasure panel", async ({ page }) => {
		await page.goto("/gdpr-erasure");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /GDPR — export & suppression|GDPR — export & erasure/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("plan-select")).toBeVisible();
	});

	test("EXPORT renders all of a person's data", async ({ page }) => {
		await page.goto("/gdpr-erasure");
		await page.getByTestId("export-btn").click();
		const result = page.getByTestId("export-result");
		await expect(result).toBeVisible();
		// the account holder's three PII fields (email, name, phone) across two projects
		await expect(result).toContainText("alice@ex.com");
		await expect(result).toContainText("Alice");
		await expect(result).toContainText("555-0100");
	});

	test("ERASE shreds the PII, keeps the phase hash invariant, records a decision", async ({
		page,
	}) => {
		await page.goto("/gdpr-erasure");
		await page.getByTestId("erase-btn").click();
		const result = page.getByTestId("erase-result");
		await expect(result).toBeVisible();
		// a recorded, content-addressed decision (§9)
		await expect(page.getByTestId("decision-id")).toBeVisible();
		// the phase hash is INVARIANT — append-only / DAG integrity preserved
		await expect(page.getByTestId("hash-verdict")).toContainText(
			/INVARIANT|append-only préservé|append-only preserved/,
		);
		// the erased subject's cells now show shredded in the store list
		await expect(page.getByTestId("store-list")).toContainText(
			/shredé|shredded/,
		);
	});

	test("after ERASE, no query returns the subject's PII", async ({ page }) => {
		await page.goto("/gdpr-erasure");
		await page.getByTestId("erase-btn").click();
		await page.getByTestId("scan-btn").click();
		await expect(page.getByTestId("visible-verdict")).toContainText(
			/IRRÉCUPÉRABLE|IRRECOVERABLE/,
		);
	});

	test("the emitted-app plan erases one user without touching the account (cross-plan)", async ({
		page,
	}) => {
		await page.goto("/gdpr-erasure");
		await page.getByTestId("plan-select").selectOption("app");
		await expect(page.getByTestId("subject-input")).toHaveValue("u-7");
		await page.getByTestId("erase-btn").click();
		await expect(page.getByTestId("hash-verdict")).toContainText(
			/INVARIANT|préservé|preserved/,
		);
		// scan for the app user — irrecoverable
		await page.getByTestId("scan-btn").click();
		await expect(page.getByTestId("visible-verdict")).toContainText(
			/IRRÉCUPÉRABLE|IRRECOVERABLE/,
		);
		// the account holder's PII is in a different plan — still visible in the store
		await expect(page.getByTestId("store-list")).toContainText("alice@ex.com");
	});
});
