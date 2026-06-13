import { expect, test } from "@playwright/test";

/**
 * DP19 Playwright e2e — the « SPIKE-gate gouvernance des connecteurs » panel.
 * mirror record: reflects=DP19-connectors-spike, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /connectors-spike route renders the MEASURED governance matrice (the
 * DP19 done-criterion: scope / approval / ledger across six measured cases over the
 * two disposable probed connectors + the AI-direct-DB attempt), the global go/no-go
 * VERDICT computed at the spike, and the note of the three proven invariants — RW
 * needs a runtime approval, the AI never reaches the DB directly
 * (AI_DIRECT_DB_ACCESS_FORBIDDEN visible), and every action is ledgered.
 *
 * THE WALL (CLAUDE.md §2): the screen renders a measurement — it writes no truth
 * (ratchet OFF, /spike zone only). The matrice is sourced from the spike-graven
 * file (lib/connector-governance MEASURED_MATRIX), never an opinion hardcoded in
 * the UI. Verdict = a deterministic conjunction over the fail-closed enforcers +
 * the Merkle ledger, never an LLM opinion.
 */

test.describe("DP19 — connector governance spike gate", () => {
	test("the route renders the measured scope/approval/ledger matrice", async ({
		page,
	}) => {
		await page.goto("/connectors-spike");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Spike go\/no-go gouvernance des connecteurs|Connector governance go\/no-go spike/,
			}),
		).toBeVisible();

		// the matrice is present and carries the closed set of 6 measured cases.
		const matrix = page.getByTestId("connectors-gov-matrix");
		await expect(matrix).toBeVisible();
		const rows = page.getByTestId("gov-row");
		await expect(rows).toHaveCount(6);

		// every row carries its case + verdict attributes — admitted or refused.
		const verdicts = await rows.evaluateAll((trs) =>
			trs.map((tr) => tr.getAttribute("data-verdict")),
		);
		expect(verdicts).toHaveLength(6);
		for (const v of verdicts) {
			expect(v === "admitted" || v === "refused").toBe(true);
		}
		const cases = await rows.evaluateAll((trs) =>
			trs.map((tr) => tr.getAttribute("data-case")),
		);
		for (const c of cases) {
			expect((c ?? "").length).toBeGreaterThan(0);
		}
	});

	test("the global verdict is GO — computed at the spike, never declared", async ({
		page,
	}) => {
		await page.goto("/connectors-spike");

		const card = page.getByTestId("gov-verdict-card");
		await expect(card).toHaveAttribute("data-verdict", "go");
		await expect(page.getByTestId("gov-verdict")).toHaveText(/^go$/i);

		// the ledger is verified (Verify().OK), 6 entries, with its graven root.
		const ledgerOk = page.getByTestId("gov-ledger-ok");
		await expect(ledgerOk).toHaveAttribute("data-ok", "true");
		await expect(page.getByTestId("gov-ledger")).toContainText("6");
		await expect(page.getByTestId("gov-ledger-root")).toHaveText(
			"a5f508e2804d9e592b241aae5231b58b957dca58fc7e9ab0d7a0ccef992738ab",
		);
	});

	test("the three invariants are stated, and AI_DIRECT_DB_ACCESS_FORBIDDEN is visible", async ({
		page,
	}) => {
		await page.goto("/connectors-spike");

		const invariants = page.getByTestId("gov-invariant");
		await expect(invariants).toHaveCount(3);

		// the load-bearing AI→DB invariant is named and its refusal code is visible.
		const aiDb = page.locator(
			'[data-testid="gov-invariant"][data-invariant="ai-never-direct-db"]',
		);
		await expect(aiDb).toBeVisible();
		await expect(page.getByTestId("gov-invariant-ai-db-code")).toHaveText(
			"AI_DIRECT_DB_ACCESS_FORBIDDEN",
		);

		// the RW-approval and every-action-ledgered invariants are present too.
		await expect(
			page.locator(
				'[data-testid="gov-invariant"][data-invariant="rw-approval"]',
			),
		).toBeVisible();
		await expect(
			page.locator(
				'[data-testid="gov-invariant"][data-invariant="every-action-ledgered"]',
			),
		).toBeVisible();
	});

	test("the matrice carries the three load-bearing refused cases with their codes", async ({
		page,
	}) => {
		await page.goto("/connectors-spike");

		// (a) RW Slack write without approval → refused CONNECTOR_WRITE_NOT_APPROVED.
		const slackNoApproval = page.locator(
			'[data-testid="gov-row"][data-connector="slack"][data-op="write"][data-code="CONNECTOR_WRITE_NOT_APPROVED"]',
		);
		await expect(slackNoApproval).toHaveCount(1);
		await expect(slackNoApproval).toHaveAttribute("data-verdict", "refused");

		// (b) AI→DB direct → refused AI_DIRECT_DB_ACCESS_FORBIDDEN.
		const aiDirect = page.locator(
			'[data-testid="gov-row"][data-code="AI_DIRECT_DB_ACCESS_FORBIDDEN"]',
		);
		await expect(aiDirect).toHaveCount(1);
		await expect(aiDirect).toHaveAttribute("data-verdict", "refused");

		// (c') RO Postgres-RO write → refused CONNECTOR_SCOPE_READ_ONLY.
		const roWrite = page.locator(
			'[data-testid="gov-row"][data-connector="postgres-ro"][data-op="write"][data-code="CONNECTOR_SCOPE_READ_ONLY"]',
		);
		await expect(roWrite).toHaveCount(1);
		await expect(roWrite).toHaveAttribute("data-verdict", "refused");

		// every measured row passed its expectation at the spike (data-pass=true).
		const rows = page.getByTestId("gov-row");
		const passes = await rows.evaluateAll((trs) =>
			trs.map((tr) => tr.getAttribute("data-pass")),
		);
		for (const p of passes) {
			expect(p).toBe("true");
		}
	});
});
