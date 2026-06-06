import { expect, test } from "@playwright/test";

/**
 * CE01 Playwright e2e — the compound capitalisation spike Workbench panel (/compound).
 * mirror record: reflects=spike/compound.Decide (the deterministic, LLM-free effort-delta
 *               measurement: capture goal-1 → cheaper goal-2 ; declared floor + dissimilar
 *               ceiling + reproducibility), test_kind=e2e, cert_language=gherkin, liveness=alive,
 *               authority=above
 *
 * Scenario: measuring the delta yields a GO verdict with the similar-pair reduction and the
 *           dissimilar control visible (the done criterion made visible).
 *   Given the Workbench is running
 *   When I navigate to /compound and click MEASURE THE DELTA
 *   Then a GO badge appears (the spike pays off)
 *   And the similar pair shows goal-2 dropping from 7800 to 1940 tokens (75.1% reduction)
 *   And the dissimilar control reduction stays under its ceiling (no fabricated reuse)
 *   And the computed rationale is rendered
 */

test.describe("CE01 — the compound capitalisation spike", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound");
		await expect(page.getByTestId("compound-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("MEASURE THE DELTA computes a GO verdict from the screen", async ({
		page,
	}) => {
		// Before running, the verdict is pending (action-capable: nothing computed yet).
		await expect(page.getByTestId("verdict-pending")).toBeVisible();

		await page.getByTestId("run-measure").click();

		// GO badge.
		const badge = page.getByTestId("verdict-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveAttribute("data-verdict", "go");

		// The similar pair: goal-2 7800 → 1940, 75.1% reduction.
		await expect(page.getByTestId("similar-without")).toHaveText("7800");
		await expect(page.getByTestId("similar-with")).toHaveText("1940");
		await expect(page.getByTestId("similar-reduction")).toHaveText("75.1%");

		// The dissimilar control reduction is rendered (the false-positive guard).
		await expect(page.getByTestId("dissimilar-reduction")).toHaveText("16.6%");

		// The computed rationale is shown.
		await expect(page.getByTestId("verdict-rationale")).toContainText("GO");
	});
});

/**
 * CE02 Playwright e2e — the capitalisation-loop boundary panel (/compound, BoundaryPanel).
 * mirror record: reflects=back/runtime/compound.Compute (the deterministic, LLM-free declared
 *               capitalisation boundary: 2 capitalise via the wall + no fitness touch, 3 forbidden
 *               frontiers ; pinned to ADR 0038 by a parity mirror), test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: showing the boundary renders the CE02 decision (the done criterion made visible).
 *   Given the Workbench is running
 *   When I navigate to /compound and click SHOW THE BOUNDARY
 *   Then the counts show 2 capitalise / 3 forbidden
 *   And the two load-bearing invariants are visible (every capitalise via the wall ; none touches
 *       the fitness — capitalisation ≠ learning criteria)
 *   And the gesture/spec patterns are capitalised while the fitness/substance/kernel-write are forbidden
 */
test.describe("CE02 — the capitalisation-loop boundary", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound");
		await expect(page.getByTestId("boundary-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("SHOW THE BOUNDARY renders the CE02 decision from the screen", async ({
		page,
	}) => {
		await expect(page.getByTestId("boundary-pending")).toBeVisible();

		await page.getByTestId("run-boundary").click();

		// The declared shape: 2 capitalise, 3 forbidden.
		await expect(page.getByTestId("capitalise-count")).toContainText("2");
		await expect(page.getByTestId("forbidden-count")).toContainText("3");

		// The two load-bearing invariants are surfaced.
		await expect(page.getByTestId("via-wall-ok")).toBeVisible();
		await expect(page.getByTestId("fitness-safe-ok")).toBeVisible();

		// The frontier rows: gesture/spec capitalised, fitness/kernel-write forbidden.
		await expect(page.getByTestId("row-gesture_pattern")).toHaveAttribute(
			"data-disposition",
			"capitalise",
		);
		await expect(page.getByTestId("row-spec_pattern")).toHaveAttribute(
			"data-disposition",
			"capitalise",
		);
		await expect(
			page.getByTestId("row-fitness_weights_criteria"),
		).toHaveAttribute("data-disposition", "forbidden");
		await expect(page.getByTestId("row-direct_kernel_write")).toHaveAttribute(
			"data-disposition",
			"forbidden",
		);
	});
});

/**
 * CE03 Playwright e2e — the /compound gesture panel (/compound, GesturePanel).
 * mirror record: reflects=back/runtime/compound.Compound (the deterministic, LLM-free /compound
 *               gesture: a green goal close → 1 KindProcedural memory entry + 1 draft
 *               behavior-candidate idea via firewall.ViaIdea, NO kernel write), test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: running /compound from the screen produces the two capitalisation events (the done
 *           criterion made visible — procedural entry + draft idea, no kernel write).
 *   Given the Workbench is running
 *   When I navigate to /compound and click RUN /compound
 *   Then a KindProcedural memory entry is rendered (the captured gesture motif)
 *   And a draft behavior-candidate idea is rendered (status=draft, the "proposed" candidate)
 *   And the NO-kernel-write badge proves the wall held (wroteKernel=false)
 */
test.describe("CE03 — the /compound gesture", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound");
		await expect(page.getByTestId("gesture-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("RUN /compound captures a procedural entry + proposes a draft idea, no kernel write", async ({
		page,
	}) => {
		// Action-capable: nothing captured until the gesture runs.
		await expect(page.getByTestId("gesture-pending")).toBeVisible();

		await page.getByTestId("run-compound").click();

		// EVENT 1 — the KindProcedural memory entry.
		await expect(page.getByTestId("procedural-row")).toBeVisible();
		await expect(page.getByTestId("procedural-kind")).toHaveText("procedural");

		// EVENT 2 — the draft behavior-candidate idea (status=draft = "proposed").
		await expect(page.getByTestId("behavior-row")).toBeVisible();
		await expect(page.getByTestId("behavior-status")).toHaveText("draft");

		// THE WALL — the no-kernel-write badge proves wroteKernel=false.
		const badge = page.getByTestId("no-kernel-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveAttribute("data-wrote-kernel", "false");
	});
});

/**
 * CE04 Playwright e2e — the behavior-macro expansion panel (/compound, ExpansionPanel).
 * mirror record: reflects=back/kernel/behavior.Expand (the deterministic, LLM-free §24.6
 *               dry-run expansion: a behavior attached to an entity expands into attributes /
 *               relations / operations / policies / fixtures ; pure ∧ idempotent ∧ writes no
 *               truth), test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: expanding ownable on Order from the screen produces the owner-scoping boilerplate
 *           pieces, and a re-expansion adds nothing (idempotence) — no kernel write (the wall).
 *   Given the Workbench is running
 *   When I navigate to /compound and click EXPAND (ownable, Order)
 *   Then the attributes/relations/operations/policies/fixtures the behavior implies are rendered
 *   And the NO-kernel-write badge proves the dry-run wrote no truth (wroteKernel=false)
 *   When I click EXPAND AGAIN (idempotent)
 *   Then the piece count drops to 0 (no duplicate piece — idempotence)
 */
test.describe("CE04 — the behavior-macro expansion (§24.6)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound");
		await expect(page.getByTestId("expansion-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("EXPAND renders the owner-scoping pieces, idempotent on re-run, no kernel write", async ({
		page,
	}) => {
		// Action-capable: nothing expanded until the control runs.
		await expect(page.getByTestId("expansion-pending")).toBeVisible();

		await page.getByTestId("run-expand").click();

		// The §24.6 pieces are rendered (ownable on Order → owner-scoping boilerplate).
		await expect(page.getByTestId("exp-attributes")).toContainText("owner_id");
		await expect(page.getByTestId("exp-relations")).toContainText("User");
		await expect(page.getByTestId("exp-policies")).toContainText(
			"owner-scoping",
		);
		await expect(page.getByTestId("exp-fixtures")).toBeVisible();

		// THE WALL — the dry-run wrote no truth.
		const badge = page.getByTestId("no-kernel-badge");
		await expect(badge).toBeVisible();
		await expect(badge).toHaveAttribute("data-wrote-kernel", "false");

		// A first expansion emits a positive piece count.
		await expect(page.getByTestId("piece-count")).toHaveAttribute(
			"data-count",
			"6",
		);

		// IDEMPOTENCE — re-attaching to the already-expanded shape emits nothing new.
		await page.getByTestId("rerun-expand").click();
		await expect(page.getByTestId("idempotent-badge")).toBeVisible();
		await expect(page.getByTestId("piece-count")).toHaveAttribute(
			"data-count",
			"0",
		);
	});
});
