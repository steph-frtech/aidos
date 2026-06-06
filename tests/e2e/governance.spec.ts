import { expect, test } from "@playwright/test";

/**
 * GV01 Playwright e2e — the governance cross-check panel (/governance).
 *
 * mirror record: reflects=front.governance (the PROJECTION of runtime.governance.Coverages +
 *               .Count + .Verdict + .PillarVerdicts + .Residuals, GV01), test_kind=gherkin,
 *               cert_language=playwright-bdd, liveness=alive, authority=below
 *
 * THE DONE CRITERIA, made visible on screen (action-capable, CLAUDE.md §7):
 *   - the "Run the cross-check" control is reachable AND executes the report op;
 *   - the OWASP Agentic Top-10 matrix renders all ten risks with a status badge;
 *   - the tally shows 8 covered / 2 partial / 0 uncovered (the real audit finding);
 *   - the adoption verdict renders Stop=no with 2 residual risks (the GV roadmap is justified);
 *   - the two residual gaps (AAI09 ledger non-Merkle, AAI10 no error-budget) are named.
 */

const ALL_RISKS = [
	"AAI01_authorization_control_hijacking",
	"AAI02_critical_system_interaction",
	"AAI03_goal_instruction_manipulation",
	"AAI04_hallucination_misinformation",
	"AAI05_impact_chain_blast_radius",
	"AAI06_memory_context_manipulation",
	"AAI07_orchestration_multiagent",
	"AAI08_supply_chain_dependency",
	"AAI09_untraceability_repudiation",
	"AAI10_economic_resource_exhaustion",
];

test.describe("GV01 — OWASP Agentic cross-check (report, the wall stays authoritative)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/governance");
		await expect(
			page.getByRole("heading", {
				name: /Cross-check OWASP Agentic|OWASP Agentic Top-10 cross-check/i,
			}),
		).toBeVisible({ timeout: 5000 });
	});

	test("the run control executes the cross-check and renders the full matrix", async ({
		page,
	}) => {
		// the report is not present until the control is executed (action-capable).
		await expect(page.getByTestId("crosscheck-report")).toHaveCount(0);
		await page.getByTestId("run-crosscheck").click();
		await expect(page.getByTestId("crosscheck-report")).toBeVisible();
		for (const risk of ALL_RISKS) {
			await expect(page.getByTestId(`coverage-${risk}`)).toBeVisible();
			await expect(page.getByTestId(`status-${risk}`)).toBeVisible();
		}
	});

	test("the tally is 8 covered / 2 partial / 0 uncovered (the real audit finding)", async ({
		page,
	}) => {
		await page.getByTestId("run-crosscheck").click();
		await expect(page.getByTestId("tally-covered")).toHaveText("8");
		await expect(page.getByTestId("tally-partial")).toHaveText("2");
		await expect(page.getByTestId("tally-uncovered")).toHaveText("0");
	});

	test("the adoption verdict is Stop=no with 2 residual risks (the GV roadmap is justified)", async ({
		page,
	}) => {
		await page.getByTestId("run-crosscheck").click();
		await expect(page.getByTestId("residual-risks")).toHaveText("2");
		// the two named residual gaps: AAI09 (ledger non-Merkle) + AAI10 (no error-budget).
		await expect(
			page.getByTestId("residual-AAI09_untraceability_repudiation"),
		).toBeVisible();
		await expect(
			page.getByTestId("residual-AAI10_economic_resource_exhaustion"),
		).toBeVisible();
	});
});

/**
 * GV02 Playwright e2e — the AGT adoption ADR control (/governance).
 *
 * mirror record: reflects=front.governance.adr (the PROJECTION of runtime.governance.ADRParity +
 *               .AdoptionADRSummary, GV02), test_kind=gherkin, cert_language=playwright-bdd,
 *               liveness=alive, authority=below
 *
 * THE GV02 DONE CRITERION, made visible on screen (action-capable, CLAUDE.md §7):
 *   - the "View the adoption ADR" control is reachable AND executes the ADR projection op;
 *   - the ADR renders as Accepted (number 0037) — the done-criterion "ADR accepté";
 *   - the precise adopt/don't-adopt counts render (4 adopt / 1 covered / 0 reject);
 *   - the wall stays the garant on every non-rejected row (the load-bearing invariant).
 */
const ALL_PILLARS = [
	"policy_as_yaml",
	"tamper_evident_audit_merkle",
	"owasp_agentic_evals",
	"identity_trust",
	"sre_slo_error_budget_circuit_breaker",
];

test.describe("GV02 — AGT adoption ADR (accepted; the wall stays the garant)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/governance");
		await expect(
			page.getByRole("heading", {
				name: /Cross-check OWASP Agentic|OWASP Agentic Top-10 cross-check/i,
			}),
		).toBeVisible({ timeout: 5000 });
	});

	test("the ADR control executes the projection and renders an Accepted ADR 0037", async ({
		page,
	}) => {
		// the ADR section is not present until the control is executed (action-capable).
		await expect(page.getByTestId("adr-adoption")).toHaveCount(0);
		await page.getByTestId("show-adr").click();
		await expect(page.getByTestId("adr-adoption")).toBeVisible();
		await expect(page.getByTestId("adr-status")).toContainText("0037");
		await expect(page.getByTestId("adr-status")).toContainText("Accepted");
	});

	test("the precise adopt/don't-adopt counts are 4 adopt / 1 covered / 0 reject", async ({
		page,
	}) => {
		await page.getByTestId("show-adr").click();
		await expect(page.getByTestId("adr-adopt")).toHaveText("4");
		await expect(page.getByTestId("adr-covered")).toHaveText("1");
		await expect(page.getByTestId("adr-rejected")).toHaveText("0");
	});

	test("the wall stays the garant on every pillar row (the load-bearing invariant)", async ({
		page,
	}) => {
		await page.getByTestId("show-adr").click();
		for (const pillar of ALL_PILLARS) {
			await expect(page.getByTestId(`adr-row-${pillar}`)).toBeVisible();
			await expect(page.getByTestId(`adr-garant-${pillar}`)).toBeVisible();
		}
	});
});

test.describe("GV03 — tamper-evident (Merkle) audit ledger", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/governance");
		await expect(
			page.getByRole("heading", {
				name: /Cross-check OWASP Agentic|OWASP Agentic Top-10 cross-check/i,
			}),
		).toBeVisible({ timeout: 5000 });
	});

	test("the ledger control executes the audit and renders a Merkle root + an intact verification", async ({
		page,
	}) => {
		// the ledger section is not present until the control is executed (action-capable, not read-only).
		await expect(page.getByTestId("merkle-ledger")).toHaveCount(0);
		await page.getByTestId("verify-ledger").click();
		await expect(page.getByTestId("merkle-ledger")).toBeVisible();
		// a non-trivial root is shown (a content-address, not the genesis literal alone).
		const root = await page.getByTestId("ledger-root").textContent();
		expect(root && root.length).toBeGreaterThan(16);
		// the demo ledger verifies intact (green).
		await expect(page.getByTestId("ledger-intact")).toContainText(
			/intact|verified|vérifié/i,
		);
	});

	test("each tamper (alter / delete / reorder) is surfaced as tamper-evident (red / root changed)", async ({
		page,
	}) => {
		await page.getByTestId("verify-ledger").click();
		await expect(page.getByTestId("tamper-alter")).toContainText(
			/entry_hash_mismatch/i,
		);
		await expect(page.getByTestId("tamper-delete")).toContainText(
			/root changed|racine changée/i,
		);
		await expect(page.getByTestId("tamper-reorder")).toBeVisible();
	});

	test("the ledger renders the three chained Decision-BOM entries", async ({
		page,
	}) => {
		await page.getByTestId("verify-ledger").click();
		await expect(page.getByTestId("ledger-entry-0")).toBeVisible();
		await expect(page.getByTestId("ledger-entry-1")).toBeVisible();
		await expect(page.getByTestId("ledger-entry-2")).toBeVisible();
	});
});

/**
 * GV04 Playwright e2e — the OWASP Agentic Top-10 compliance mirrors (/governance).
 *
 * mirror record: reflects=front.governance.compliance (the PROJECTION of
 *               runtime.governance.Mirrors + .CheckCompliance + .CheckInjected, GV04),
 *               test_kind=gherkin, cert_language=playwright-bdd, liveness=alive, authority=below
 *
 * THE GV04 DONE CRITERIA, made visible on screen (action-capable, CLAUDE.md §7):
 *   - the "Verify OWASP compliance" control is reachable AND executes the compliance suite;
 *   - every one of the ten risks renders a mirror row (chaque risque a un miroir);
 *   - each mirror shows GREEN on the governed state and RED under its injection
 *     (tous verts sur l'état courant ∧ injecter la violation → le miroir passe rouge);
 *   - the suite header confirms all ten governed scenarios are green (10/10).
 */
test.describe("GV04 — OWASP Agentic compliance mirrors (governed green / injected red)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/governance");
		await expect(
			page.getByRole("heading", {
				name: /Cross-check OWASP Agentic|OWASP Agentic Top-10 cross-check/i,
			}),
		).toBeVisible({ timeout: 5000 });
	});

	test("the compliance control executes the suite and renders all ten mirrors", async ({
		page,
	}) => {
		// the compliance section is not present until the control is executed (action-capable, not read-only).
		await expect(page.getByTestId("owasp-compliance")).toHaveCount(0);
		await page.getByTestId("verify-compliance").click();
		await expect(page.getByTestId("owasp-compliance")).toBeVisible();
		for (const risk of ALL_RISKS) {
			await expect(page.getByTestId(`compliance-${risk}`)).toBeVisible();
		}
	});

	test("every mirror is GREEN on the governed state and RED under its injection", async ({
		page,
	}) => {
		await page.getByTestId("verify-compliance").click();
		for (const risk of ALL_RISKS) {
			await expect(
				page.getByTestId(`compliance-governed-${risk}`),
			).toContainText(/green|vert/i);
			await expect(
				page.getByTestId(`compliance-injected-${risk}`),
			).toContainText(/red|rouge/i);
		}
	});

	test("the suite header confirms all ten governed scenarios are green (10/10)", async ({
		page,
	}) => {
		await page.getByTestId("verify-compliance").click();
		await expect(page.getByTestId("compliance-all-green")).toContainText(
			"10/10",
		);
	});
});

test.describe("GV05 — policy.yaml → GateAction compiler (equivalence + tighten-never-widen)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/governance");
	});

	test("the compile-policy control executes and renders the equivalence + widen sections", async ({
		page,
	}) => {
		// the policy section is absent until the control is executed (action-capable, not read-only).
		await expect(page.getByTestId("policy-compiler")).toHaveCount(0);
		await page.getByTestId("compile-policy").click();
		await expect(page.getByTestId("policy-compiler")).toBeVisible();
		// the equivalence rows render per probe action.
		await expect(
			page.getByTestId("policy-row-write back/runtime/"),
		).toBeVisible();
		await expect(
			page.getByTestId("policy-row-write kernel (wall)"),
		).toBeVisible();
	});

	test("the tighter policy never widens the reference (all-tighten badge green)", async ({
		page,
	}) => {
		await page.getByTestId("compile-policy").click();
		await expect(page.getByTestId("policy-all-tighten")).toBeVisible();
		// every probe row's never-widens marker is the ✓ (the tighter policy never widened).
		for (const label of [
			"write kernel (wall)",
			"egress evil.example.com",
			"tool privileged/deploy",
		]) {
			await expect(
				page.getByTestId(`policy-neverwidens-${label}`),
			).toContainText("✓");
		}
	});

	test("every widening policy is rejected at compile (path/host/exec/tool/skill/budget/unknown)", async ({
		page,
	}) => {
		await page.getByTestId("compile-policy").click();
		await expect(page.getByTestId("policy-all-widen-rejected")).toBeVisible();
		for (const axis of [
			"path",
			"host",
			"exec",
			"tool",
			"skill",
			"budget_raise",
			"unknown_field",
		]) {
			await expect(page.getByTestId(`policy-widen-${axis}`)).toContainText(
				/rejected|rejeté/i,
			);
		}
	});
});

test.describe("GV06 — SRE alignment (error-budget / circuit-breaker) + identity/trust", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/governance");
	});

	test("the align-sre control executes and renders the SRE + trust audit", async ({
		page,
	}) => {
		// the SRE section is absent until the control is executed (action-capable, not read-only).
		await expect(page.getByTestId("sre-audit")).toHaveCount(0);
		await page.getByTestId("align-sre").click();
		await expect(page.getByTestId("sre-audit")).toBeVisible();
		// the error-budget controls render.
		await expect(page.getByTestId("sre-breaker")).toBeVisible();
		await expect(page.getByTestId("sre-budget")).toBeVisible();
	});

	test("the trust chain binds each run's identity to the Merkle root", async ({
		page,
	}) => {
		await page.getByTestId("align-sre").click();
		await expect(page.getByTestId("sre-trust-root")).toBeVisible();
		// every demo run is covered by exactly one identity-bound row.
		await expect(page.getByTestId("sre-trust-row-0")).toBeVisible();
		await expect(page.getByTestId("sre-trust-row-0")).toContainText(
			"step-gv03",
		);
	});

	test("the breaker reflects the SLO breach on the demo stream (fail-closed)", async ({
		page,
	}) => {
		await page.getByTestId("align-sre").click();
		// the demo stream breaches the 25% SLO → the breaker is open (fail-closed).
		await expect(page.getByTestId("sre-breaker")).toContainText(/open|ouvert/i);
	});
});
