import { expect, test } from "@playwright/test";

/**
 * S71 Playwright e2e — the « nœud de relation de l'Entity AST » Workbench panel.
 * mirror record: reflects=S71-entity-relation, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /entity-relation route is action-capable (ui-completeness law, CLAUDE.md §7): the control
 * is reachable AND executable from the screen, bound to a Server Action running the REAL pure engine
 * (lib/entity-relation, the TS twin of back/kernel/entities/ref). The done-criteria of S71:
 *   - property — a relation round-trips as a content-addressed AST (a declared target yields its id);
 *   - a relation to a nonexistent entity is refused UNKNOWN_RELATION_TARGET (never a guessed mapping);
 *   - an out-of-set cardinality/semantic is refused UNKNOWN_RELATION_KIND;
 *   - the closed scalar set stays untouched (a relation is its own node).
 *
 * THE WALL (CLAUDE.md §2): the screen only VALIDATES, RESOLVES and HASHES a relation node — it writes
 * no truth. Resolution is a pure function (never an LLM).
 */

test.describe("S71 — Entity AST relation node", () => {
	test("the route renders the panel with the resolve control", async ({
		page,
	}) => {
		await page.goto("/entity-relation");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Nœud de relation de l'Entity AST|Entity AST relation node/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("relation-submit")).toBeVisible();
		await expect(page.getByTestId("relation-target")).toBeVisible();
		await expect(page.getByTestId("relation-cardinality")).toBeVisible();
		await expect(page.getByTestId("relation-semantic")).toBeVisible();
	});

	test("a relation to a declared target round-trips as a content-addressed AST", async ({
		page,
	}) => {
		await page.goto("/entity-relation");
		// the form defaults to customer ──1-N fk──▶ Customer (a declared entity).
		await page.getByTestId("relation-submit").click();

		const result = page.getByTestId("relation-result");
		await expect(result).toHaveAttribute("data-verdict", "resolved");
		// the content address (round-trip) is shown and non-empty.
		const id = page.getByTestId("relation-id");
		await expect(id).toBeVisible();
		await expect(id).toHaveText(/^[0-9a-f]{64}$/);
		// the canonical body is shown (the round-trip serialization).
		await expect(page.getByTestId("relation-body")).toContainText(
			'"target":"Customer"',
		);
	});

	test("fault-injection — a relation to a nonexistent entity is refused UNKNOWN_RELATION_TARGET", async ({
		page,
	}) => {
		await page.goto("/entity-relation");
		// retarget at a Ghost entity not in the declared set.
		await page.getByTestId("relation-target").fill("Ghost");
		await page.getByTestId("relation-submit").click();

		const result = page.getByTestId("relation-result");
		await expect(result).toHaveAttribute("data-verdict", "refused");
		await expect(page.getByTestId("block-code")).toHaveAttribute(
			"data-code",
			"UNKNOWN_RELATION_TARGET",
		);
		// the refusal is not a prison: a non-empty fix path is shown.
		await expect(
			page.getByTestId("how-to-fix").locator("li").first(),
		).toBeVisible();
		// honesty: no content address was guessed for the undeclared target.
		await expect(page.getByTestId("relation-id")).toHaveCount(0);
	});

	test("the three cardinalities and three semantics each resolve and content-address", async ({
		page,
	}) => {
		await page.goto("/entity-relation");
		const seen = new Set<string>();
		for (const card of ["1-1", "1-N", "N-N"]) {
			for (const sem of ["fk", "association", "composition"]) {
				await page.getByTestId("relation-cardinality").selectOption(card);
				await page.getByTestId("relation-semantic").selectOption(sem);
				await page.getByTestId("relation-submit").click();
				await expect(page.getByTestId("relation-result")).toHaveAttribute(
					"data-verdict",
					"resolved",
				);
				// wait for the rendered body to reflect THIS selection (no read race).
				await expect(page.getByTestId("relation-body")).toContainText(
					`"cardinality":"${card}"`,
				);
				await expect(page.getByTestId("relation-body")).toContainText(
					`"semantic":"${sem}"`,
				);
				const id = await page.getByTestId("relation-id").textContent();
				expect(id).toMatch(/^[0-9a-f]{64}$/);
				if (id) seen.add(id);
			}
		}
		// every (cardinality × semantic) is a first-class, distinctly-addressed node.
		expect(seen.size).toBe(9);
	});
});
