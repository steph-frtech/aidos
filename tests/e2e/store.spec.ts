import { expect, test } from "@playwright/test";

/**
 * S01 Playwright e2e — Archive content store Workbench panel.
 * mirror record: reflects=S01-content-store, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Mirrors the Gherkin journey: the panel is seeded with v1 then v2 under head
 * "doc". Both hashes are listed; the head points at v2; the prior hash still
 * resolves to v1; the history lists both moves oldest-first.
 */

// SHA-256 hex of "v1" and "v2" — must match contentstore.Hash / lib/store-data.
const HASH_V1 =
	"3bfc269594ef649228e9a74bab00f042efc91d5acc6fbee31a382e80d42388fe";
const HASH_V2 =
	"fb04dcb6970e4c3d1873de51fd5a50d7bb46b3383113602665c350ec40b5f990";
const SHORT_V1 = HASH_V1.slice(0, 12);
const SHORT_V2 = HASH_V2.slice(0, 12);

test.describe("S01 — Archive content store", () => {
	test("both object hashes (v1 and v2) are listed", async ({ page }) => {
		await page.goto("/store");
		await expect(page.getByTestId(`object-${HASH_V1}`)).toBeVisible();
		await expect(page.getByTestId(`object-${HASH_V2}`)).toBeVisible();
		await expect(page.getByTestId(`object-hash-${SHORT_V1}`)).toBeVisible();
		await expect(page.getByTestId(`object-hash-${SHORT_V2}`)).toBeVisible();
	});

	test("clicking the head shows v2 as the current body", async ({ page }) => {
		await page.goto("/store");
		await page.getByTestId("head-doc").click();
		await expect(page.getByTestId("current-body")).toHaveText("v2");
		await expect(page.getByTestId("current-hash")).toHaveText(SHORT_V2);
	});

	test("the prior hash still resolves to v1 (append-only)", async ({
		page,
	}) => {
		await page.goto("/store");
		// The v1 object row is still present even though the head moved to v2.
		await expect(page.getByTestId(`object-${HASH_V1}`)).toBeVisible();
		// Its first-move history entry is the v1 hash.
		await expect(page.getByTestId("history-hash-0")).toHaveText(`${SHORT_V1}…`);
	});

	test("history lists both moves oldest-first", async ({ page }) => {
		await page.goto("/store");
		await page.getByTestId("head-doc").click();
		const moves = page.getByTestId("history-list").locator("li");
		await expect(moves).toHaveCount(2);
		// Move 0 = v1 (no parent), Move 1 = v2 (parent v1).
		await expect(page.getByTestId("history-hash-0")).toHaveText(`${SHORT_V1}…`);
		await expect(page.getByTestId("history-hash-1")).toHaveText(`${SHORT_V2}…`);
	});
});
