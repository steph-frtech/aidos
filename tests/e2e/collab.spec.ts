import { expect, test } from "@playwright/test";

/**
 * S113 Playwright e2e — Collaboration substrate + adoption ladder Workbench panel.
 * mirror record: reflects=S113-collab-and-adoption, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /collab route is action-capable (ui-completeness, CLAUDE.md §7): every op
 * the step develops has a control reachable AND executable from the screen, each bound
 * to the pure twin (lib/collab.ts):
 *   - a member WITHOUT administer authority cannot approve (a viewer is refused
 *     ROLE_FORBIDDEN; an owner is allowed) — the Godog done-criterion;
 *   - a comment is recorded with the REAL acting user (provenance never a placeholder);
 *   - two users present on the same canvas without overwrite; the lock is not stolen;
 *   - the per-project adoption ladder advances ONLY when the stage gate is reached.
 */

test.describe("S113 — Collaboration & adoption", () => {
	test("the route renders the collaboration panel", async ({ page }) => {
		await page.goto("/collab");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Collaboration & adoption/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("collab-actor")).toBeVisible();
	});

	test("a member without authority cannot approve; an owner can", async ({ page }) => {
		await page.goto("/collab");
		// default actor is a viewer → approve is refused ROLE_FORBIDDEN.
		await page.getByTestId("collab-approve-btn").click();
		await expect(page.getByTestId("collab-approve-msg")).toContainText("ROLE_FORBIDDEN");
		// switch to owner → approve is allowed.
		await page.getByTestId("collab-role").selectOption("owner");
		await page.getByTestId("collab-approve-btn").click();
		await expect(page.getByTestId("collab-approve-msg")).not.toContainText("ROLE_FORBIDDEN");
	});

	test("a comment is recorded with the real acting user (provenance)", async ({ page }) => {
		await page.goto("/collab");
		await page.getByTestId("collab-identity").fill("vic");
		await page.getByTestId("collab-comment-btn").click();
		await expect(page.getByTestId("collab-comment-author")).toContainText("author=vic");
		// the feed records the act with the real actor.
		await expect(page.getByTestId("collab-feed-entry").first()).toContainText("vic");
	});

	test("an unidentified actor cannot comment (provenance never placeholder)", async ({ page }) => {
		await page.goto("/collab");
		await page.getByTestId("collab-identity").fill("");
		await page.getByTestId("collab-comment-btn").click();
		await expect(page.getByTestId("collab-comment-msg")).toContainText("UNIDENTIFIED_ACTOR");
	});

	test("two users present on the same canvas without overwrite", async ({ page }) => {
		await page.goto("/collab");
		await page.getByTestId("collab-identity").fill("alice");
		await page.getByTestId("collab-join-btn").click();
		await page.getByTestId("collab-identity").fill("bob");
		await page.getByTestId("collab-join-btn").click();
		const present = page.getByTestId("collab-present");
		await expect(present).toContainText("alice");
		await expect(present).toContainText("bob");
	});

	test("the edit lock is not silently stolen from a holder", async ({ page }) => {
		await page.goto("/collab");
		await page.getByTestId("collab-identity").fill("alice");
		await page.getByTestId("collab-join-btn").click();
		await page.getByTestId("collab-identity").fill("bob");
		await page.getByTestId("collab-join-btn").click();
		// alice claims the lock.
		await page.getByTestId("collab-identity").fill("alice");
		await page.getByTestId("collab-claim-btn").click();
		await expect(page.getByTestId("collab-lock")).toContainText("alice");
		// bob tries to claim — refused, alice keeps it.
		await page.getByTestId("collab-identity").fill("bob");
		await page.getByTestId("collab-claim-btn").click();
		await expect(page.getByTestId("collab-lock")).toContainText("alice");
		await expect(page.getByTestId("collab-presence-msg")).toContainText("ROLE_FORBIDDEN");
	});

	test("the ladder advances ONLY when the stage gate is reached", async ({ page }) => {
		await page.goto("/collab");
		// a bare-ish project (tests+mutation) cannot advance past its next dent's gate.
		await page.getByTestId("collab-advance-btn").click();
		await expect(page.getByTestId("collab-advance-msg")).toContainText(
			/done is computed|gate is not reached|porte n'est pas atteinte/,
		);
		// satisfy the WHOLE ladder → no further advance (top reached), but every named
		// capability checkbox is reachable + togglable (action-capable).
		for (const cap of [
			"one-cell",
			"kernel",
			"mirror",
			"reality-mirror-live",
			"context-graph",
			"memory",
			"evolve",
			"quality-diversity",
			"evolution-sandbox",
		]) {
			await page.getByTestId(`collab-cap-${cap}`).check();
		}
		await expect(page.getByTestId("collab-current")).toContainText("T4");
	});
});
