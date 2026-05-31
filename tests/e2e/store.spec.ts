import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

/**
 * S01 Playwright e2e — Archive content store Workbench panel.
 * mirror record: reflects=S01-content-store, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Mirrors the Gherkin journey: the panel is seeded with v1 then v2 under head
 * "doc". Both hashes are listed; the head points at v2; the prior hash still
 * resolves to v1; the history lists both moves oldest-first.
 *
 * The panel is also action-capable (ui-completeness law): the put + set-head
 * forms write the Archive content store directly (below the wall). The action
 * tests below drive those controls; when a live Postgres is reachable they
 * assert the side effects (the new object row, the moved head, the grown
 * history); without a DB the actions surface a friendly error instead of
 * crashing, which the tests tolerate by gating on the result's data-ok flag.
 */

// SHA-256 hex of "v1" and "v2" — must match contentstore.Hash / lib/store-data.
const HASH_V1 =
	"3bfc269594ef649228e9a74bab00f042efc91d5acc6fbee31a382e80d42388fe";
const HASH_V2 =
	"fb04dcb6970e4c3d1873de51fd5a50d7bb46b3383113602665c350ec40b5f990";
const SHORT_V1 = HASH_V1.slice(0, 12);
const SHORT_V2 = HASH_V2.slice(0, 12);

/** sha256Hex mirrors contentstore.Hash / lib/store-data.hash for the new bytes. */
function sha256Hex(s: string): string {
	return createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
}

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

test.describe("S01 — Archive content store is self-teaching", () => {
	test("the tutorial renders with its concept steps", async ({ page }) => {
		await page.goto("/store");
		const tutorial = page.getByTestId("tutorial");
		await expect(tutorial).toBeVisible();
		// The 5 concept steps (content-addressing → append-only) are all present.
		for (let i = 0; i < 5; i++) {
			await expect(page.getByTestId(`tutorial-step-${i}`)).toBeVisible();
		}
		// It teaches the vocabulary in the ubiquitous language.
		await expect(tutorial).toContainText(/SHA-256/i);
	});

	test("the worked example renders as a « essayez ceci » walkthrough", async ({
		page,
	}) => {
		await page.goto("/store");
		const example = page.getByTestId("example");
		await expect(example).toBeVisible();
		// The 3-step end-to-end walkthrough (store → point head → edit) is present.
		for (let i = 0; i < 3; i++) {
			await expect(page.getByTestId(`example-step-${i}`)).toBeVisible();
		}
		// It leans on the Put control's sample content.
		await expect(example).toContainText("hello");
	});
});

test.describe("S01 — Archive content store actions (below the wall)", () => {
	test("the put + set-head controls are present and reachable", async ({
		page,
	}) => {
		await page.goto("/store");
		await expect(page.getByTestId("store-actions")).toBeVisible();
		await expect(page.getByTestId("put-form")).toBeVisible();
		await expect(page.getByTestId("put-content")).toBeVisible();
		await expect(page.getByTestId("put-submit")).toBeVisible();
		await expect(page.getByTestId("set-head-form")).toBeVisible();
		await expect(page.getByTestId("set-head-key")).toBeVisible();
		await expect(page.getByTestId("set-head-hash")).toBeVisible();
		await expect(page.getByTestId("set-head-submit")).toBeVisible();
	});

	test("put bytes → the result reports the content hash and (live) the object appears", async ({
		page,
	}) => {
		await page.goto("/store");

		// A content unique to this run so a live store grows by exactly this object.
		const content = `e2e-put-${Date.now()}`;
		const expectedHash = sha256Hex(content);
		const expectedShort = expectedHash.slice(0, 12);

		await page.getByTestId("put-content").fill(content);
		await page.getByTestId("put-submit").click();

		const result = page.getByTestId("put-result");
		await expect(result).toBeVisible();
		// The result always names the SHA-256 hash of the bytes (success or the
		// DB-unreachable error both carry it).
		await expect(result).toContainText(expectedHash);

		const ok = (await result.getAttribute("data-ok")) === "true";
		if (ok) {
			// Live DB: revalidatePath re-rendered the panel, so the new object row
			// appears in the left list (the store grew by this hash).
			await expect(page.getByTestId(`object-${expectedHash}`)).toBeVisible();
			await expect(
				page.getByTestId(`object-hash-${expectedShort}`),
			).toBeVisible();
		}
	});

	test("set head → the result reports the move and (live) the head + history grow", async ({
		page,
	}) => {
		await page.goto("/store");

		const headKey = `e2e-${Date.now()}`;
		const content = `e2e-head-${Date.now()}`;
		const expectedHash = sha256Hex(content);

		// First store the bytes so the head has an existing hash to point at.
		await page.getByTestId("put-content").fill(content);
		await page.getByTestId("put-submit").click();
		const putResult = page.getByTestId("put-result");
		await expect(putResult).toBeVisible();
		const putOk = (await putResult.getAttribute("data-ok")) === "true";

		// "Use last put" copies the just-stored hash into the set-head form.
		await page.getByTestId("set-head-key").fill(headKey);
		if (putOk) {
			await page.getByTestId("use-last-put").click();
			await expect(page.getByTestId("set-head-hash")).toHaveValue(expectedHash);
		} else {
			// No live DB: type the hash directly so the control is still exercised.
			await page.getByTestId("set-head-hash").fill(expectedHash);
		}

		await page.getByTestId("set-head-submit").click();
		const headResult = page.getByTestId("set-head-result");
		await expect(headResult).toBeVisible();
		await expect(headResult).toContainText(headKey);

		const ok = (await headResult.getAttribute("data-ok")) === "true";
		if (ok) {
			// Live DB: the new head button appears and selecting it shows the body
			// + a one-entry history (the head moved, the history grew by a row).
			const headBtn = page.getByTestId(`head-${headKey}`);
			await expect(headBtn).toBeVisible();
			await headBtn.click();
			const moves = page.getByTestId("history-list").locator("li");
			await expect(moves).toHaveCount(1);
			await expect(page.getByTestId("current-hash")).toHaveText(
				expectedHash.slice(0, 12),
			);
		}
	});
});
