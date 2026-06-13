import { expect, test } from "@playwright/test";

/**
 * DP20 Playwright e2e — the /connectors Workbench panel (Connector / Skill / MCP-server
 * graved as content-addressed Kernel SOURCES, above the line).
 * mirror record: reflects=DP20-connector-source, test_kind=e2e, cert_language=gherkin,
 *               liveness=alive, authority=above
 *
 * Scenario: The Workbench lists the declared connector sources with their governance facets
 *   Given the Workbench is running
 *   When I navigate to /connectors
 *   Then I see at least three seeded connectors
 *   And each connector shows its classification (badge internal/external/ai/cloud) and scope (RO/RW)
 *   And the seeded read_only Postgres-RO connector is shown internal/RO
 *   And the seeded read_write Slack connector is shown external/RW with a declared authority
 *   And the seeded ai connector carries NO datastore egress (the invariant made visible)
 *   And the invariant card shows AI_DIRECT_DB_ACCESS_FORBIDDEN refusing an ai+datastore counter-fixture
 *
 * THE WALL (§2): the list is a below-the-line SEED (a pure twin), the screen writes no truth.
 */

test.describe("DP20 — the /connectors panel (declared connector sources)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/connectors");
		await expect(page.getByTestId("connectors-list")).toBeVisible({
			timeout: 10000,
		});
	});

	test("at least three connectors are seeded and listed", async ({ page }) => {
		const rows = page.getByTestId("connector-row");
		await expect(rows).toHaveCount(3);
	});

	test("each connector shows its classification and scope", async ({
		page,
	}) => {
		const rows = page.getByTestId("connector-row");
		const count = await rows.count();
		expect(count).toBeGreaterThanOrEqual(3);
		for (let i = 0; i < count; i++) {
			const row = rows.nth(i);
			// the closed-set facets are pinned on the row attributes (a single source).
			await expect(row).toHaveAttribute(
				"data-classification",
				/^(internal|external|ai|cloud)$/,
			);
			await expect(row).toHaveAttribute(
				"data-scope",
				/^(read_only|read_write)$/,
			);
			// and they are visibly rendered as badges.
			await expect(
				row.getByTestId("connector-classification-badge"),
			).toBeVisible();
			await expect(row.getByTestId("connector-scope-badge")).toBeVisible();
		}
	});

	test("the read_only Postgres-RO connector is shown internal/RO", async ({
		page,
	}) => {
		const row = page
			.getByTestId("connector-row")
			.filter({ has: page.getByText("postgres-ro-truth") });
		await expect(row).toHaveAttribute("data-classification", "internal");
		await expect(row).toHaveAttribute("data-scope", "read_only");
		await expect(row).toHaveAttribute("data-target", "postgres_ro");
		await expect(row.getByTestId("connector-verdict")).toHaveAttribute(
			"data-ok",
			"true",
		);
	});

	test("the read_write Slack connector is shown external/RW with an authority", async ({
		page,
	}) => {
		const row = page
			.getByTestId("connector-row")
			.filter({ has: page.getByText("slack-notify") });
		await expect(row).toHaveAttribute("data-classification", "external");
		await expect(row).toHaveAttribute("data-scope", "read_write");
		// a read_write source must declare a well-formed authority — it validates.
		await expect(row.getByTestId("connector-verdict")).toHaveAttribute(
			"data-ok",
			"true",
		);
		await expect(row).toContainText("security");
	});

	test("the ai connector carries NO datastore egress (the invariant at the source)", async ({
		page,
	}) => {
		const row = page
			.getByTestId("connector-row")
			.filter({ has: page.getByText("ai-agent-plane", { exact: true }) });
		await expect(row).toHaveAttribute("data-classification", "ai");
		// the egress block declares it carries no datastore host.
		await expect(row.getByTestId("connector-egress")).toHaveAttribute(
			"data-has-datastore",
			"false",
		);
		// and the source validates (a valid ai source never egresses to a datastore).
		await expect(row.getByTestId("connector-verdict")).toHaveAttribute(
			"data-ok",
			"true",
		);
	});

	test("the AI-never-direct-to-DB invariant refuses the ai+datastore counter-fixture", async ({
		page,
	}) => {
		const card = page.getByTestId("ai-no-datastore-invariant");
		await expect(card).toBeVisible();
		await expect(card.getByTestId("ai-invariant-code")).toContainText(
			"AI_DIRECT_DB_ACCESS_FORBIDDEN",
		);
		const counter = page.getByTestId("ai-counter-fixture");
		// the counter-fixture (ai plane + direct datastore egress) is REFUSED.
		await expect(counter).toHaveAttribute("data-refused", "true");
		await expect(counter).toHaveAttribute(
			"data-code",
			"AI_DIRECT_DB_ACCESS_FORBIDDEN",
		);
	});
});
