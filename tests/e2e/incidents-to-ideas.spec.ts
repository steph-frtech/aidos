import { expect, test } from "@playwright/test";

/**
 * S43 Playwright e2e — the RealityMirror Workbench panel (/incidents-to-ideas).
 * mirror record: reflects=runtime.reality (the always-blocked Incident → Kernel edge; the
 *               external loop Incident → Learn → Idea → Mirror → Goal → Kernel),
 *               test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: reality injects ideas, never truths; the direct Incident → Kernel edge is refused
 *   Given the Workbench is running
 *   When I navigate to /incidents-to-ideas
 *   Then each incident card shows its signal / cause_sketch / provenance / incident_derived taint
 *       and the "reality, not a truth" marker
 *   And clicking /learn shows the incident:#NNNN → draft idea arrow (provenance carried, idea
 *       marked draft with no mirror yet)
 *   And the direct Incident → Kernel action renders a red REALITY_CANNOT_DECLARE_TRUTH row with a
 *       "no kernel write" + "kernel unchanged" marker (the done criterion)
 *   And where proposes is unpinned an OpenQuestion marker (not a guessed kind) is shown
 */

test.describe("S43 — the RealityMirror panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/incidents-to-ideas");
		await expect(page.getByTestId("incidents-to-ideas-panel")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the external loop pipeline shows all six stages and the red blocked shortcut", async ({
		page,
	}) => {
		const stages = page.getByTestId("flow-stage");
		await expect(stages).toHaveCount(6);
		for (const stage of [
			"Incident",
			"Learn",
			"Idea",
			"Mirror",
			"Goal",
			"Kernel",
		]) {
			await expect(page.locator(`[data-stage="${stage}"]`)).toBeVisible();
		}
		const shortcut = page.getByTestId("kernel-shortcut");
		await expect(shortcut).toBeVisible();
		await expect(shortcut).toContainText("Incident → Kernel");
	});

	test("the #1043 incident card shows signal, cause_sketch, provenance, taint and the 'not truth' marker", async ({
		page,
	}) => {
		const card = page.locator('[data-incident="#1043"]');
		await expect(card).toBeVisible();
		await expect(card.getByTestId("incident-ref")).toContainText(
			"incident:#1043",
		);
		await expect(card.getByTestId("incident-operation")).toContainText(
			"createOrder",
		);
		await expect(card.getByTestId("incident-error")).toContainText("30% fail");
		await expect(card.getByTestId("incident-cause-sketch")).toContainText(
			"out-of-stock between add-to-cart and pay",
		);
		await expect(
			card
				.getByTestId("incident-taint")
				.locator('[data-taint="incident_derived"]'),
		).toBeVisible();
		await expect(card.getByTestId("not-truth-marker")).toBeVisible();
	});

	test("/learn turns the #1043 incident into a draft idea carrying the provenance (the done case a)", async ({
		page,
	}) => {
		const card = page.locator('[data-incident="#1043"]');
		await card.getByTestId("learn").click();

		const learned = card.getByTestId("learned-idea");
		await expect(learned).toBeVisible();
		// the incident:#1043 → draft idea arrow.
		await expect(card.getByTestId("learn-arrow")).toContainText(
			"incident:#1043",
		);
		// provenance carried verbatim.
		await expect(card.getByTestId("idea-provenance")).toContainText(
			"incident:#1043",
		);
		// intent reflects the missing-mirror behaviour.
		await expect(card.getByTestId("idea-intent")).toContainText(
			"out-of-stock between add-to-cart and pay",
		);
		// the createOrder operation pins proposes=operation.
		await expect(card.getByTestId("idea-proposes")).toContainText("operation");
		// the idea is a draft with no mirror yet.
		await expect(card.getByTestId("still-no-mirror")).toBeVisible();
		await expect(card.getByTestId("ideas-link")).toHaveAttribute(
			"href",
			"/ideas",
		);
	});

	test("the direct Incident → Kernel attempt is blocked, kernel unchanged (the done case b)", async ({
		page,
	}) => {
		const card = page.locator('[data-incident="#1043"]');
		await card.getByTestId("to-kernel").click();

		const block = card.getByTestId("block-reason");
		await expect(block).toBeVisible();
		await expect(block).toHaveAttribute(
			"data-code",
			"REALITY_CANNOT_DECLARE_TRUTH",
		);
		await expect(card.getByTestId("block-code")).toContainText(
			"REALITY_CANNOT_DECLARE_TRUTH",
		);
		await expect(card.getByTestId("no-kernel-write")).toBeVisible();
		await expect(card.getByTestId("kernel-unchanged")).toBeVisible();
		await expect(card.getByTestId("how-to-fix")).toContainText(
			"incident_then_learn_then_mirror_then_goal_then_approval",
		);
	});

	test("an unpinned proposes shows an OpenQuestion marker, never a guessed kind (#2099)", async ({
		page,
	}) => {
		const card = page.locator('[data-incident="#2099"]');
		await expect(card).toBeVisible();
		await card.getByTestId("learn").click();

		// No guessed kind: the OpenQuestion marker is shown, the proposes code is absent.
		await expect(card.getByTestId("open-question")).toBeVisible();
		await expect(card.getByTestId("idea-proposes")).toHaveCount(0);
	});
});
