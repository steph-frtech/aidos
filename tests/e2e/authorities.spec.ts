import { expect, test } from "@playwright/test";

/**
 * S16 Playwright e2e — the AuthorityGraph Workbench panel (/authorities).
 * mirror record: reflects=S16-authority-graph, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench renders the checkout-regulatory graph + the live admission decisions (KRD §13.8)
 *   Given the Workbench is running
 *   When I navigate to /authorities
 *   Then the graph card names domain checkout, truth_kind regulatory, legal under approvers and security under veto
 *   And the no-approval regulatory row is BLOCKED with MISSING_AUTHORITY_APPROVAL (and obtain_legal_approval)
 *   And the full-approval row is ADMITTED
 *   And the veto row is BLOCKED with VETOED
 *   And the partial-approval row is ESCALATED to architecture_board
 *   And the screen carries a tutorial and a worked example
 */

test.describe("S16 — the AuthorityGraph panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/authorities");
		await expect(page.getByTestId("authority-graph-card")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the graph card names the domain, truth_kind, and the role lists", async ({
		page,
	}) => {
		await expect(page.getByTestId("graph-domain")).toContainText("checkout");
		await expect(page.getByTestId("graph-truth-kind")).toContainText(
			"regulatory",
		);
		await expect(
			page
				.getByTestId("approvers")
				.getByTestId("role-chip")
				.filter({ hasText: "legal" }),
		).toBeVisible();
		await expect(
			page
				.getByTestId("approvers")
				.getByTestId("role-chip")
				.filter({ hasText: "product_owner" }),
		).toBeVisible();
		await expect(
			page
				.getByTestId("veto")
				.getByTestId("role-chip")
				.filter({ hasText: "security" }),
		).toBeVisible();
		await expect(
			page
				.getByTestId("escalation")
				.getByTestId("role-chip")
				.filter({ hasText: "architecture_board" }),
		).toBeVisible();
	});

	test("a regulatory truth with NO approval is BLOCKED with MISSING_AUTHORITY_APPROVAL", async ({
		page,
	}) => {
		const row = page
			.getByTestId("admission-row")
			.filter({ hasText: "sans aucune approbation" });
		await expect(row).toHaveAttribute("data-decision", "blocked");
		await expect(row).toHaveAttribute(
			"data-code",
			"MISSING_AUTHORITY_APPROVAL",
		);
		await expect(row.getByTestId("decision-badge")).toContainText("BLOCKED");
		await expect(row.getByTestId("decision-reason")).toContainText(
			"MISSING_AUTHORITY_APPROVAL",
		);
		await expect(row.getByTestId("how-to-fix")).toContainText(
			"obtain_legal_approval",
		);
	});

	test("a fully-approved truth is ADMITTED", async ({ page }) => {
		const row = page
			.getByTestId("admission-row")
			.filter({ hasText: "approuvée par legal et product_owner" });
		await expect(row).toHaveAttribute("data-decision", "admitted");
		await expect(row.getByTestId("decision-badge")).toContainText("ADMITTED");
	});

	test("a vetoed truth is BLOCKED / VETOED regardless of approvers", async ({
		page,
	}) => {
		const row = page
			.getByTestId("admission-row")
			.filter({ hasText: "veto sécurité" });
		await expect(row).toHaveAttribute("data-decision", "blocked");
		await expect(row).toHaveAttribute("data-code", "VETOED");
		await expect(row.getByTestId("decision-badge")).toContainText("BLOCKED");
		await expect(row.getByTestId("decision-reason")).toContainText("VETOED");
	});

	test("a partially-approved truth is ESCALATED to architecture_board", async ({
		page,
	}) => {
		const row = page
			.getByTestId("admission-row")
			.filter({ hasText: "seulement par product_owner" });
		await expect(row).toHaveAttribute("data-decision", "escalated");
		await expect(row.getByTestId("decision-badge")).toContainText("ESCALATED");
		await expect(row.getByTestId("escalated-to")).toContainText(
			"architecture_board",
		);
	});

	test("the screen carries a tutorial and a worked example", async ({
		page,
	}) => {
		await expect(page.getByTestId("tutorial")).toBeVisible();
		await expect(page.getByTestId("example")).toBeVisible();
	});
});
