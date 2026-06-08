import { expect, test } from "@playwright/test";

/**
 * S75 Playwright e2e — the « modeleur entité/relation (canvas) + concurrence draft-level » panel.
 * mirror record: reflects=S75-entity-modeler, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /entity-modeler route is action-capable (ui-completeness law, CLAUDE.md §7): two
 * controls reachable AND executable from the screen, each bound to a Server Action running the REAL
 * pure engine (lib/entity-modeler, the TS twin of back/kernel/entities/modeler). The done-criteria of
 * S75:
 *   - model Customer↔Order, propose → a `proposed` (DRAFT) ChangeSet is produced, visible in the
 *     entity-map (the live schema);
 *   - a reject leaves the Kernel intact (Propose never applies — the changeset stays DRAFT);
 *   - two concurrent canvas editors do not overwrite each other (the CRDT merge keeps both adds);
 *   - an undeclared relation target is refused (never guessed).
 *
 * THE WALL (CLAUDE.md §2): the screen only VALIDATES, HASHES and PROPOSES — it writes no truth; the
 * proposed ChangeSet is DRAFT (only `aidos`, after approval, applies it).
 */

test.describe("S75 — Entity/relation modeler (canvas + draft-level concurrency)", () => {
	test("the route renders the canvas with the propose and merge controls", async ({
		page,
	}) => {
		await page.goto("/entity-modeler");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Modeleur entité\/relation|Entity\/relation modeler/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("canvas")).toBeVisible();
		// the modeled Customer↔Order schema is on the canvas.
		await expect(page.locator('[data-entity="Customer"]')).toBeVisible();
		await expect(page.locator('[data-entity="Order"]')).toBeVisible();
		await expect(page.getByTestId("propose-submit")).toBeVisible();
		await expect(page.getByTestId("merge-submit")).toBeVisible();
	});

	test("model Customer↔Order, propose → a `proposed` (DRAFT) ChangeSet appears in the entity-map", async ({
		page,
	}) => {
		await page.goto("/entity-modeler");
		await page.getByTestId("propose-submit").click();

		const result = page.getByTestId("propose-result");
		await expect(result).toHaveAttribute("data-verdict", "proposed");
		// the changeset is `proposed` (DRAFT), never applied (the wall).
		await expect(page.getByTestId("changeset-status")).toHaveText("DRAFT");
		// content-addressed schema hash (the input-order-invariant address).
		await expect(page.getByTestId("schema-hash")).toHaveText(/^[0-9a-f]{64}$/);
		// project-scoped source.
		await expect(page.getByTestId("spec-target")).toHaveText(
			"entity-schema@shop",
		);
		// the entity-map (the live proposed schema) shows Customer and Order.
		const map = page.getByTestId("entity-map");
		await expect(map.locator('[data-map-entity="Customer"]')).toBeVisible();
		await expect(map.locator('[data-map-entity="Order"]')).toBeVisible();
	});

	test("reject leaves the Kernel intact — an undeclared relation target is refused, no truth written", async ({
		page,
	}) => {
		await page.goto("/entity-modeler");
		// retarget Order.customer at a Ghost entity not in the canvas (a reject path).
		await page.getByTestId("rel-target").fill("Ghost");
		await page.getByTestId("propose-submit").click();

		const result = page.getByTestId("propose-result");
		await expect(result).toHaveAttribute("data-verdict", "refused");
		await expect(page.getByTestId("block-code")).toHaveText(
			"MODELER_INVALID_DRAFT",
		);
		// the refusal is not a prison: a non-empty fix path is shown.
		await expect(
			page.getByTestId("how-to-fix").locator("li").first(),
		).toBeVisible();
		// honesty: no changeset was produced for the invalid draft (the kernel is intact).
		await expect(page.getByTestId("changeset-status")).toHaveCount(0);
		await expect(page.getByTestId("entity-map")).toHaveCount(0);
	});

	test("two concurrent canvas editors do not overwrite each other (CRDT merge keeps both)", async ({
		page,
	}) => {
		await page.goto("/entity-modeler");
		await page.getByTestId("merge-submit").click();

		const result = page.getByTestId("merge-result");
		await expect(result).toBeVisible();
		// both editors' additions survive: Customer (base) + Order (Alice) + Invoice (Bob).
		const merged = page.getByTestId("merged-nodes");
		await expect(
			merged.locator('[data-merged-entity="Customer"]'),
		).toBeVisible();
		await expect(merged.locator('[data-merged-entity="Order"]')).toBeVisible();
		await expect(
			merged.locator('[data-merged-entity="Invoice"]'),
		).toBeVisible();
		// the provenance of each add is recorded — neither was silently overwritten.
		await expect(page.getByTestId("added-by-a")).toHaveText(/Order/);
		await expect(page.getByTestId("added-by-b")).toHaveText(/Invoice/);
	});

	test("the proposed schema hash is stable across re-proposing the same draft (deterministic)", async ({
		page,
	}) => {
		await page.goto("/entity-modeler");
		await page.getByTestId("propose-submit").click();
		await expect(page.getByTestId("propose-result")).toHaveAttribute(
			"data-verdict",
			"proposed",
		);
		const first = await page.getByTestId("schema-hash").textContent();

		await page.getByTestId("propose-submit").click();
		await expect(page.getByTestId("propose-result")).toHaveAttribute(
			"data-verdict",
			"proposed",
		);
		const second = await page.getByTestId("schema-hash").textContent();
		expect(first).toBe(second);
		expect(first).toMatch(/^[0-9a-f]{64}$/);
	});
});
