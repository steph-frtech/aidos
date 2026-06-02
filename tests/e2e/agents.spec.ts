import { expect, test } from "@playwright/test";

/**
 * S52 Playwright e2e — the /agents Workbench panel (the agent as a GOVERNED LAYER).
 * mirror record: reflects=S52-agent-layer, test_kind=e2e, cert_language=gherkin,
 *               liveness=alive, authority=above
 *
 * Scenario: The Workbench governs the agents that build the app (KRD §21/§13.8)
 *   Given the Workbench is running
 *   When I navigate to /agents
 *   Then an agent layer card names kind: agent, role: bdd-writer
 *   And the rights panel shows peut_modifier_noyau and peut_modifier_fitness as false (locked)
 *   And the recent AgentRun shows the above-waterline write action RED with AGENT_WRITE_ABOVE_WATERLINE
 *       and a how_to_fix naming idea → mirror → /goal → approbation
 *   When I click « Proposer un scénario »
 *   Then the result is a `proposed` (not admitted) proposal requiring a human authority (product_owner)
 *       with NO kernel/mirror write (it routes idea → mirror → /goal → approbation)
 *   When I attempt a self-approve
 *   Then it is refused (an agent is never an authority) and the proposal stays proposed
 *   And « Enregistrer un run » records an AgentRun below the line
 */

test.describe("S52 — the /agents panel (CoucheAgent governed layer)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("agent-layers")).toBeVisible({
			timeout: 5000,
		});
	});

	test("an agent layer card names kind: agent and role: bdd-writer", async ({
		page,
	}) => {
		await expect(page.getByTestId("agent-kind-bdd-writer")).toContainText(
			"agent",
		);
		await expect(page.getByTestId("agent-role-bdd-writer")).toContainText(
			"bdd-writer",
		);
	});

	test("peut_modifier_noyau and peut_modifier_fitness are shown false (locked)", async ({
		page,
	}) => {
		await expect(page.getByTestId("right-noyau-bdd-writer")).toContainText(
			"false",
		);
		await expect(page.getByTestId("right-noyau-bdd-writer")).toContainText(
			"🔒",
		);
		await expect(page.getByTestId("right-fitness-bdd-writer")).toContainText(
			"false",
		);
		await expect(page.getByTestId("right-fitness-bdd-writer")).toContainText(
			"🔒",
		);
	});

	test("the recent AgentRun shows the above-waterline write refused (AGENT_WRITE_ABOVE_WATERLINE)", async ({
		page,
	}) => {
		// the third action (index 2) is the write to kernel.truth — refused, red.
		const refused = page.getByTestId("run-action-2");
		await expect(refused).toHaveAttribute("data-autorisee", "false");
		await expect(page.getByTestId("run-action-2-code")).toContainText(
			"AGENT_WRITE_ABOVE_WATERLINE",
		);
		await expect(refused).toContainText("mirror");
		await expect(refused).toContainText("goal");
		await expect(refused).toContainText("approbation");
		// the run is NOT a layer (a runtime event).
		await expect(page.getByTestId("not-a-layer-tag")).toBeVisible();
	});

	test("« Proposer un scénario » yields a proposed (not admitted) proposal requiring a human authority", async ({
		page,
	}) => {
		await page.getByTestId("propose-button").click();
		const proposed = page.getByTestId("proposed");
		await expect(proposed).toBeVisible();
		await expect(proposed).toHaveAttribute("data-status", "proposed");
		await expect(page.getByTestId("proposed-status")).toContainText("proposed");
		await expect(page.getByTestId("proposed-authority")).toContainText(
			"product_owner",
		);
	});

	test("a self-approve attempt is refused (an agent is never an authority)", async ({
		page,
	}) => {
		await page.getByTestId("self-approve-button").click();
		const result = page.getByTestId("self-approve-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-status", "proposed");
		await expect(page.getByTestId("self-approve-code")).toContainText(
			"AGENT_WRITE_ABOVE_WATERLINE",
		);
	});

	test("« Enregistrer un run » records an AgentRun below the line", async ({
		page,
	}) => {
		await page.getByTestId("record-button").click();
		await expect(page.getByTestId("record-done")).toBeVisible();
	});
});
