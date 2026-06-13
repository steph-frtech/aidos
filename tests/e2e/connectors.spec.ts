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

/**
 * DP21 Playwright e2e — the RUNTIME connector-scope enforcer made interactive on /connectors:
 * the RW approval inbox (A2 human-in-the-loop) + the live enforcement readout.
 * mirror record: reflects=DP21-connector-enforce, test_kind=e2e, cert_language=gherkin,
 *               liveness=alive, authority=below (runtime effect, not a truth-write)
 *
 * Scenario: a read_write connector's write is gated by a runtime approval (A2)
 *   Given the Workbench is running and I am on /connectors
 *   When I look at the RW approval inbox for the slack-notify connector
 *   Then without an approval the write is REFUSED with CONNECTOR_RW_NEEDS_APPROVAL
 *   When I approve the RW request
 *   Then the write becomes permitted (rw-permitted)
 *   When I refuse it again
 *   Then the write is REFUSED again with CONNECTOR_RW_NEEDS_APPROVAL
 *   And a read_only connector attempting a write is REFUSED with CONNECTOR_READ_ONLY
 *
 * THE WALL (§2): the inbox is a below-the-line RUNTIME authorisation (qui/quand/quel-effet),
 * never authority.Decide ; the declaration of the source is graved above the line via /goal.
 * The verdict is COMPUTED by the pure twin (lib/connector-enforce), never a UI opinion.
 */
test.describe("DP21 — the /connectors RW approval inbox (runtime enforcement)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/connectors");
		await expect(page.getByTestId("rw-approval-inbox")).toBeVisible({
			timeout: 10000,
		});
	});

	test("the RW approval inbox lists the read_write connector", async ({
		page,
	}) => {
		const inbox = page.getByTestId("rw-approval-inbox");
		await expect(inbox).toBeVisible();
		const request = inbox
			.getByTestId("rw-approval")
			.filter({ has: page.locator('[data-connector="slack-notify"]') });
		await expect(request).toHaveCount(1);
		await expect(request).toHaveAttribute("data-connector", "slack-notify");
	});

	test("without an approval, the RW write is refused CONNECTOR_RW_NEEDS_APPROVAL", async ({
		page,
	}) => {
		const blockreason = page.locator(
			'[data-testid="rw-blockreason"][data-connector="slack-notify"]',
		);
		await expect(blockreason).toBeVisible();
		await expect(blockreason).toHaveAttribute(
			"data-code",
			"CONNECTOR_RW_NEEDS_APPROVAL",
		);
		// the permitted readout is NOT shown until approval.
		await expect(
			page.locator(
				'[data-testid="rw-permitted"][data-connector="slack-notify"]',
			),
		).toHaveCount(0);
	});

	test("approving the RW request makes the write permitted", async ({
		page,
	}) => {
		await page
			.locator('[data-testid="rw-approve"][data-connector="slack-notify"]')
			.click();
		const permitted = page.locator(
			'[data-testid="rw-permitted"][data-connector="slack-notify"]',
		);
		await expect(permitted).toBeVisible();
		// and the block reason disappears once the runtime approval is granted.
		await expect(
			page.locator(
				'[data-testid="rw-blockreason"][data-connector="slack-notify"]',
			),
		).toHaveCount(0);
	});

	test("refusing again re-blocks the write with CONNECTOR_RW_NEEDS_APPROVAL", async ({
		page,
	}) => {
		// approve first…
		await page
			.locator('[data-testid="rw-approve"][data-connector="slack-notify"]')
			.click();
		await expect(
			page.locator(
				'[data-testid="rw-permitted"][data-connector="slack-notify"]',
			),
		).toBeVisible();
		// …then refuse — the runtime authorisation is revoked, the write is fail-closed again.
		await page
			.locator('[data-testid="rw-refuse"][data-connector="slack-notify"]')
			.click();
		const blockreason = page.locator(
			'[data-testid="rw-blockreason"][data-connector="slack-notify"]',
		);
		await expect(blockreason).toBeVisible();
		await expect(blockreason).toHaveAttribute(
			"data-code",
			"CONNECTOR_RW_NEEDS_APPROVAL",
		);
	});

	test("a read_only connector attempting a write is refused CONNECTOR_READ_ONLY", async ({
		page,
	}) => {
		const demo = page.getByTestId("ro-write-demo");
		await expect(demo).toBeVisible();
		await expect(demo).toHaveAttribute("data-code", "CONNECTOR_READ_ONLY");
		await expect(demo.getByTestId("ro-write-blockreason")).toHaveAttribute(
			"data-code",
			"CONNECTOR_READ_ONLY",
		);
	});
});

/**
 * DP22 Playwright e2e — the per-connector tamper-evident AUDIT TIMELINE on /connectors: each
 * enforced connector action (RO read, RW approved/refused, egress refused, ai→datastore refused)
 * produces ONE verifiable entry of a GV03 Merkle ledger; the integrity readout shows Verify().OK;
 * a tamper demonstration turns it red with a TamperKind.
 * mirror record: reflects=DP22-connector-audit, test_kind=e2e, cert_language=gherkin,
 *               liveness=alive, authority=below (below-the-line audit telemetry, never a truth-write)
 *
 * Scenario: a connector's enforced actions produce a verifiable, tamper-evident audit ledger
 *   Given the Workbench is running and I am on /connectors
 *   When I look at the slack-notify connector's audit timeline
 *   Then I see at least one audit entry (qui/quoi/scope/cible/résultat, chained by hash)
 *   And the ledger integrity is OK (ledger-verify data-ok="true")
 *   And the timeline includes both a permitted action and a refused action
 *   When I run the « démo : altérer une entrée passée »
 *   Then the ledger integrity goes red (ledger-verify data-ok="false") with a TamperKind
 *   When I reset the ledger
 *   Then the ledger integrity is OK again
 *
 * THE WALL (§2): the ledger is a below-the-line AUDIT artefact, the screen writes no truth; the
 * tamper demo mutates a local copy only. The verdict is COMPUTED by the pure twin
 * (lib/connector-audit), verdict-for-verdict with the Go connectoraudit, never a UI opinion.
 */
test.describe("DP22 — the /connectors audit timeline (tamper-evident Merkle ledger)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/connectors");
		await expect(page.getByTestId("connectors-list")).toBeVisible({
			timeout: 10000,
		});
	});

	test("the slack-notify connector shows an audit timeline with verifiable entries", async ({
		page,
	}) => {
		const timeline = page.locator(
			'[data-testid="audit-timeline"][data-connector="slack-notify"]',
		);
		await expect(timeline).toBeVisible();
		const entries = timeline.getByTestId("audit-entry");
		// the RW connector has at least three audited actions (read, approved write, refused write).
		expect(await entries.count()).toBeGreaterThanOrEqual(3);
		// each entry carries its connector / scope / result facets on its attributes.
		const first = entries.first();
		await expect(first).toHaveAttribute("data-connector", "slack-notify");
		await expect(first).toHaveAttribute(
			"data-scope",
			/^(read_only|read_write)$/,
		);
		await expect(first).toHaveAttribute("data-result", /^(permitted|refused)$/);
	});

	test("the slack-notify timeline includes both a permitted and a refused entry", async ({
		page,
	}) => {
		const timeline = page.locator(
			'[data-testid="audit-timeline"][data-connector="slack-notify"]',
		);
		await expect(
			timeline.locator('[data-testid="audit-entry"][data-result="permitted"]'),
		).not.toHaveCount(0);
		await expect(
			timeline.locator('[data-testid="audit-entry"][data-result="refused"]'),
		).not.toHaveCount(0);
	});

	test("the slack-notify ledger integrity verifies OK (Verify().OK)", async ({
		page,
	}) => {
		const verify = page.locator(
			'[data-testid="ledger-verify"][data-connector="slack-notify"]',
		);
		await expect(verify).toBeVisible();
		await expect(verify).toHaveAttribute("data-ok", "true");
		// no tamper-kind is shown while the chain is intact.
		await expect(verify.getByTestId("tamper-kind")).toHaveCount(0);
	});

	test("running an action (approving a RW write) adds a permitted audit entry", async ({
		page,
	}) => {
		// approve the RW write in the DP21 inbox — the audited approved-write entry is present.
		await page
			.locator('[data-testid="rw-approve"][data-connector="slack-notify"]')
			.click();
		await expect(
			page.locator(
				'[data-testid="rw-permitted"][data-connector="slack-notify"]',
			),
		).toBeVisible();
		// the connector's audit timeline records the approved write as a permitted entry.
		const timeline = page.locator(
			'[data-testid="audit-timeline"][data-connector="slack-notify"]',
		);
		await expect(
			timeline.locator(
				'[data-testid="audit-entry"][data-result="permitted"][data-op="write"]',
			),
		).not.toHaveCount(0);
		// and the ledger still verifies OK.
		await expect(
			page.locator(
				'[data-testid="ledger-verify"][data-connector="slack-notify"]',
			),
		).toHaveAttribute("data-ok", "true");
	});

	test("altering a past entry turns the ledger integrity red with a TamperKind", async ({
		page,
	}) => {
		const verify = page.locator(
			'[data-testid="ledger-verify"][data-connector="slack-notify"]',
		);
		await expect(verify).toHaveAttribute("data-ok", "true");
		// run the tamper demonstration on the slack-notify ledger.
		await page
			.locator(
				'[data-testid="audit-tamper-button"][data-connector="slack-notify"]',
			)
			.click();
		// the integrity goes red and a TamperKind is surfaced.
		await expect(verify).toHaveAttribute("data-ok", "false");
		const tamperKind = verify.getByTestId("tamper-kind");
		await expect(tamperKind).toBeVisible();
		await expect(tamperKind).toHaveAttribute("data-tamper", "entry_hash");
	});

	test("resetting the ledger restores integrity OK", async ({ page }) => {
		const verify = page.locator(
			'[data-testid="ledger-verify"][data-connector="slack-notify"]',
		);
		// tamper first…
		await page
			.locator(
				'[data-testid="audit-tamper-button"][data-connector="slack-notify"]',
			)
			.click();
		await expect(verify).toHaveAttribute("data-ok", "false");
		// …then verify/reset — the intact chain is restored.
		await page
			.locator(
				'[data-testid="audit-verify-button"][data-connector="slack-notify"]',
			)
			.click();
		await expect(verify).toHaveAttribute("data-ok", "true");
	});
});
