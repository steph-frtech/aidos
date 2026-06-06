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

	// ── BA01 — the governed behaviour knobs ────────────────────────────────────────
	test("the bdd-writer card shows its governed knobs (above the line)", async ({
		page,
	}) => {
		const knobs = page.getByTestId("knobs-bdd-writer");
		await expect(knobs).toBeVisible();
		await expect(page.getByTestId("knob-temperature-bdd-writer")).toContainText(
			"0.2",
		);
		await expect(page.getByTestId("knob-seed-bdd-writer")).toContainText(
			"dérivée",
		);
	});

	test("empty defaults = max confinement: « aucun egress » + « aucun subprocess »", async ({
		page,
	}) => {
		await expect(page.getByTestId("knob-network-bdd-writer")).toContainText(
			"aucun egress",
		);
		await expect(page.getByTestId("knob-exec-bdd-writer")).toContainText(
			"aucun subprocess",
		);
		await expect(page.getByTestId("knob-network-executor")).toContainText(
			"api.anthropic.com",
		);
	});

	test("the confinement check executes and denies egress + exec (fail-closed)", async ({
		page,
	}) => {
		await page.getByTestId("check-egress-button").click();
		const egress = page.getByTestId("egress-verdict");
		await expect(egress).toBeVisible();
		await expect(egress).toHaveAttribute("data-allowed", "false");

		await page.getByTestId("check-exec-button").click();
		const exec = page.getByTestId("exec-verdict");
		await expect(exec).toBeVisible();
		await expect(exec).toHaveAttribute("data-allowed", "false");
	});

	// ── BA02 — the AgentImplementation projection (below the line, no truth) ────────
	test("the implementation projection is shown and tagged « not a layer »", async ({
		page,
	}) => {
		const impl = page.getByTestId("implementation");
		await expect(impl).toBeVisible();
		await expect(page.getByTestId("impl-not-a-layer-tag")).toBeVisible();
		await expect(page.getByTestId("impl-layer-ref")).toBeVisible();
		// the wall is always carried in the projection's forbidden paths
		await expect(page.getByTestId("impl-forbidden")).toContainText("kernel");
		await expect(page.getByTestId("impl-forbidden")).toContainText("mirrors");
	});

	test("the projection validation executes and reports a valid, wall-held projection", async ({
		page,
	}) => {
		await page.getByTestId("impl-validate-button").click();
		const verdict = page.getByTestId("impl-verdict");
		await expect(verdict).toBeVisible();
		await expect(verdict).toHaveAttribute("data-valid", "true");
	});

	// ── BA03 — the deterministic emitter project() ──────────────────────────────────
	test("the emitter section is present and tagged pure (no LLM, no clock)", async ({
		page,
	}) => {
		const emitter = page.getByTestId("emitter");
		await expect(emitter).toBeVisible();
		await expect(emitter).toContainText("Project");
	});

	test("the Project control executes: byte-stable + cfg carries no behaviour knob", async ({
		page,
	}) => {
		await page.getByTestId("emitter-project-button").click();
		await expect(page.getByTestId("emitter-result")).toBeVisible();
		await expect(page.getByTestId("emitter-hash")).toBeVisible();
		// byte-stable: same (layer, cfg, pack) ⇒ same hash
		await expect(page.getByTestId("emitter-stable")).toHaveAttribute(
			"data-stable",
			"true",
		);
		// the cfg carries no behaviour knob: a perturbed endpoint/key does not change it
		await expect(page.getByTestId("emitter-cfg-ignored")).toHaveAttribute(
			"data-ignored",
			"true",
		);
	});

	// ── BA04 — the deterministic SystemPrompt assembly ───────────────────────────────
	test("the SystemPrompt section is present and tagged pure (never hand-authored)", async ({
		page,
	}) => {
		const prompt = page.getByTestId("prompt");
		await expect(prompt).toBeVisible();
		await expect(prompt).toContainText("AssembleSystemPrompt");
	});

	test("the Assemble control executes: byte-stable, no leak, wall always present", async ({
		page,
	}) => {
		await page.getByTestId("prompt-assemble-button").click();
		await expect(page.getByTestId("prompt-result")).toBeVisible();
		// byte-stable: same projection ⇒ same prompt
		await expect(page.getByTestId("prompt-stable")).toHaveAttribute(
			"data-stable",
			"true",
		);
		// no out-of-layer leak: a perturbed non-declared knob does not change the prompt
		await expect(page.getByTestId("prompt-no-leak")).toHaveAttribute(
			"data-noleak",
			"true",
		);
		// the wall is always carried: kernel/mirror zones appear verbatim
		await expect(page.getByTestId("prompt-wall")).toHaveAttribute(
			"data-wall",
			"true",
		);
		const preview = page.getByTestId("prompt-preview");
		await expect(preview).toContainText("kernel");
		await expect(preview).toContainText("mirrors");
	});

	test("the binding-resolution section is present and tagged pure (BA05)", async ({
		page,
	}) => {
		const bindings = page.getByTestId("bindings");
		await expect(bindings).toBeVisible();
		await expect(bindings).toContainText("ResolveTools");
	});

	test("the Resolve control executes: surface NARROWS (Tools/Skills ⊆ enabled, mandatory hook survives)", async ({
		page,
	}) => {
		await page.getByTestId("bindings-resolve-button").click();
		await expect(page.getByTestId("bindings-result")).toBeVisible();
		// Tools ⊆ enabled declared bindings (no widening)
		await expect(page.getByTestId("bindings-tools-subset")).toHaveAttribute(
			"data-subset",
			"true",
		);
		// Skills ⊆ enabled declared skills (no widening)
		await expect(page.getByTestId("bindings-skills-subset")).toHaveAttribute(
			"data-subset",
			"true",
		);
		// a Mandatory hook always survives projection
		await expect(page.getByTestId("bindings-mandatory")).toHaveAttribute(
			"data-mandatory",
			"true",
		);
		// the surface narrowed: a disabled binding/skill was excluded
		await expect(page.getByTestId("bindings-narrowed")).toHaveAttribute(
			"data-narrowed",
			"true",
		);
		// the disabled MCP binding (changeset) and disabled skill (evolve) are NOT surfaced
		await expect(page.getByTestId("bindings-tools")).not.toContainText(
			"changeset",
		);
		await expect(page.getByTestId("bindings-skills")).not.toContainText(
			"evolve",
		);
		// the enabled tool + the mandatory wall hook ARE present
		await expect(page.getByTestId("bindings-tools")).toContainText(
			"idea-intake",
		);
		await expect(page.getByTestId("bindings-hooks")).toContainText("★");
	});

	// ── BA06 — the selectable, read-only AgentImplementation viewer (agentimpl.project) ──

	test("the implementation viewer is present, read-only, and tagged « not a layer » (BA06)", async ({
		page,
	}) => {
		const viewer = page.getByTestId("impl-viewer");
		await expect(viewer).toBeVisible();
		await expect(page.getByTestId("viewer-readonly-tag")).toBeVisible();
		await expect(page.getByTestId("viewer-not-a-layer-tag")).toBeVisible();
		// No RUN control — the projection never executes the agent and never writes truth
		// (the wall). The only buttons in the viewer are the axis enforcer probes: the BA07
		// capacity-axis (cap-probe-run), the BA08 skill-axis (skill-probe-run), the BA09
		// confinement-axis (path-probe-run), the BA10 mandatory-hook turn-acceptance gate
		// (hook-gate-run) and the BA11 per-run budget gate (budget-gate-run). Each is a
		// below-the-line PURE verdict (set/prefix-membership, a hook-verdict predicate, or
		// the min()-cap budget gate), neither an agent run nor a truth-write. BA14 adds the
		// arch-fitness rule "one single LLM function" (llm-iso-run) — a below-the-line PURE
		// import-graph check, neither an agent run nor a truth-write. So exactly seven
		// buttons, and they are the enforcer probes + the arch-fitness rule.
		await expect(viewer.getByRole("button")).toHaveCount(7);
		await expect(page.getByTestId("cap-probe-run")).toBeVisible();
		await expect(page.getByTestId("skill-probe-run")).toBeVisible();
		await expect(page.getByTestId("path-probe-run")).toBeVisible();
		await expect(page.getByTestId("hook-gate-run")).toBeVisible();
		await expect(page.getByTestId("budget-gate-run")).toBeVisible();
		await expect(page.getByTestId("arbiter-gate-run")).toBeVisible();
		await expect(page.getByTestId("llm-iso-run")).toBeVisible();
	});

	test("selecting an agent displays its projection: forbidden paths show kernel/mirror zones, no egress by default", async ({
		page,
	}) => {
		// the default selection (bdd-writer) projects and displays.
		const impl = page.getByTestId("viewer-impl");
		await expect(impl).toBeVisible();
		await expect(page.getByTestId("viewer-layer-ref")).toContainText(
			"bdd-writer",
		);
		// the wall: forbidden paths carry the kernel + mirror truth zones.
		const forbidden = page.getByTestId("viewer-forbidden-paths");
		await expect(forbidden).toContainText("kernel");
		await expect(forbidden).toContainText("mirrors");
		await expect(forbidden).toContainText("fitness");
		// network shows « aucun egress » by default (the bdd-writer is max-confined).
		await expect(page.getByTestId("viewer-network")).toContainText(/egress/i);
		// the disabled changeset binding is NOT in the resolved tools (governance narrows).
		await expect(page.getByTestId("viewer-tools")).not.toContainText(
			"changeset",
		);
		await expect(page.getByTestId("viewer-tools")).toContainText("idea-intake");
		// the assembled system prompt is displayed.
		await expect(page.getByTestId("viewer-prompt")).toBeVisible();
	});

	test("the determinism badge is green: re-project ⇒ same hash", async ({
		page,
	}) => {
		await expect(page.getByTestId("viewer-determinism")).toHaveAttribute(
			"data-deterministic",
			"true",
		);
		await expect(page.getByTestId("viewer-hash")).toBeVisible();
	});

	test("selecting the executor re-projects it: its declared egress host + exec are shown", async ({
		page,
	}) => {
		await page
			.getByTestId("viewer-agent-select")
			.selectOption({ value: "executor" });
		await expect(page.getByTestId("viewer-layer-ref")).toContainText(
			"executor",
		);
		// the executor declares one egress host + go/git exec (vs the bdd-writer's none).
		await expect(page.getByTestId("viewer-network")).toContainText(
			"api.anthropic.com",
		);
		await expect(page.getByTestId("viewer-exec")).toContainText("go");
		// re-projecting after the selection change is still deterministic.
		await expect(page.getByTestId("viewer-determinism")).toHaveAttribute(
			"data-deterministic",
			"true",
		);
	});

	// ── BA07 — the CAPACITY-axis enforcer toolAllowed, action-capable from the screen ──
	test("the capability-axis probe is present and action-capable (BA07)", async ({
		page,
	}) => {
		const probe = page.getByTestId("cap-probe");
		await expect(probe).toBeVisible();
		await expect(page.getByTestId("cap-probe-run")).toBeVisible();
	});

	test("the probe ALLOWS a bound (server, tool) — idea-intake/submit_idea (bdd-writer)", async ({
		page,
	}) => {
		await page.getByTestId("cap-probe-server").fill("idea-intake");
		await page.getByTestId("cap-probe-tool").fill("submit_idea");
		await page.getByTestId("cap-probe-run").click();
		const verdict = page.getByTestId("cap-probe-verdict");
		await expect(verdict).toHaveAttribute("data-allowed", "true");
	});

	test("the probe DENIES an unbound tool with AGENT_TOOL_NOT_BOUND + how_to_fix (fail-closed)", async ({
		page,
	}) => {
		// changeset/apply_changeset is a DISABLED binding → never in the resolved Tools.
		await page.getByTestId("cap-probe-server").fill("changeset");
		await page.getByTestId("cap-probe-tool").fill("apply_changeset");
		await page.getByTestId("cap-probe-run").click();
		const verdict = page.getByTestId("cap-probe-verdict");
		await expect(verdict).toHaveAttribute("data-allowed", "false");
		await expect(page.getByTestId("cap-probe-code")).toContainText(
			"AGENT_TOOL_NOT_BOUND",
		);
		// the actionable form names the idée → miroir → /goal door.
		await expect(verdict).toContainText("idée → miroir → /goal");
	});

	test("the probe DEFAULT-DENIES an entirely unknown (server, tool)", async ({
		page,
	}) => {
		await page.getByTestId("cap-probe-server").fill("evil");
		await page.getByTestId("cap-probe-tool").fill("exfiltrate");
		await page.getByTestId("cap-probe-run").click();
		await expect(page.getByTestId("cap-probe-verdict")).toHaveAttribute(
			"data-allowed",
			"false",
		);
		await expect(page.getByTestId("cap-probe-code")).toContainText(
			"AGENT_TOOL_NOT_BOUND",
		);
	});

	// ── BA08 — the SKILL-axis enforcer skillAllowed, action-capable from the screen ──
	test("the skill-axis probe is present and action-capable (BA08)", async ({
		page,
	}) => {
		const probe = page.getByTestId("skill-probe");
		await expect(probe).toBeVisible();
		await expect(page.getByTestId("skill-probe-run")).toBeVisible();
	});

	test("the skill probe ALLOWS a bound skill — write-bdd-scenario (bdd-writer)", async ({
		page,
	}) => {
		// the bdd-writer carries enabled skills write-bdd-scenario + derive-mirror.
		await page.getByTestId("skill-probe-name").fill("write-bdd-scenario");
		await page.getByTestId("skill-probe-run").click();
		const verdict = page.getByTestId("skill-probe-verdict");
		await expect(verdict).toHaveAttribute("data-allowed", "true");
	});

	test("the skill probe DENIES an unbound skill with AGENT_SKILL_NOT_BOUND + how_to_fix (fail-closed)", async ({
		page,
	}) => {
		// evolve is a DISABLED skill binding → never in the resolved Skills.
		await page.getByTestId("skill-probe-name").fill("evolve");
		await page.getByTestId("skill-probe-run").click();
		const verdict = page.getByTestId("skill-probe-verdict");
		await expect(verdict).toHaveAttribute("data-allowed", "false");
		await expect(page.getByTestId("skill-probe-code")).toContainText(
			"AGENT_SKILL_NOT_BOUND",
		);
		// the actionable form names the idée → miroir → /goal door.
		await expect(verdict).toContainText("idée → miroir → /goal");
	});

	test("the skill probe DEFAULT-DENIES an entirely unknown skill", async ({
		page,
	}) => {
		await page.getByTestId("skill-probe-name").fill("exfiltrate-everything");
		await page.getByTestId("skill-probe-run").click();
		await expect(page.getByTestId("skill-probe-verdict")).toHaveAttribute(
			"data-allowed",
			"false",
		);
		await expect(page.getByTestId("skill-probe-code")).toContainText(
			"AGENT_SKILL_NOT_BOUND",
		);
	});

	// ── BA09 — the CONFINEMENT-axis enforcer pathAllowed, action-capable from the screen ──
	test("the confinement-axis path probe is present and action-capable (BA09)", async ({
		page,
	}) => {
		const probe = page.getByTestId("path-probe");
		await expect(probe).toBeVisible();
		await expect(page.getByTestId("path-probe-run")).toBeVisible();
	});

	test("the path probe ALLOWS a path under AllowedPaths and outside ForbiddenPaths (bdd-writer → ideas)", async ({
		page,
	}) => {
		// the bdd-writer is max-confined: its only writable zone is ideas/.
		await page.getByTestId("path-probe-target").fill("ideas/candidate.md");
		await page.getByTestId("path-probe-run").click();
		const verdict = page.getByTestId("path-probe-verdict");
		await expect(verdict).toHaveAttribute("data-allowed", "true");
	});

	test("the path probe DENIES a path outside AllowedPaths with AGENT_PATH_NOT_ALLOWED + how_to_fix (fail-closed)", async ({
		page,
	}) => {
		// back/runtime is NOT under the bdd-writer's allowed paths → confinement denies it.
		await page.getByTestId("path-probe-target").fill("back/runtime/secret.go");
		await page.getByTestId("path-probe-run").click();
		const verdict = page.getByTestId("path-probe-verdict");
		await expect(verdict).toHaveAttribute("data-allowed", "false");
		await expect(page.getByTestId("path-probe-code")).toContainText(
			"AGENT_PATH_NOT_ALLOWED",
		);
		// the actionable form names the idée → miroir → /goal door.
		await expect(verdict).toContainText("idée → miroir → /goal");
	});

	test("the path probe DENIES a path under a ForbiddenPaths/wall prefix — distinct from the allow-list (kernel zone)", async ({
		page,
	}) => {
		// back/kernel/ is a wall ForbiddenPaths prefix AND outside AllowedPaths → denied.
		await page.getByTestId("path-probe-target").fill("back/kernel/foo.go");
		await page.getByTestId("path-probe-run").click();
		await expect(page.getByTestId("path-probe-verdict")).toHaveAttribute(
			"data-allowed",
			"false",
		);
		await expect(page.getByTestId("path-probe-code")).toContainText(
			"AGENT_PATH_NOT_ALLOWED",
		);
	});

	// ── BA10 — the MANDATORY-HOOK turn-acceptance gate (action-capable + fault-injection) ──
	test("the mandatory-hook turn-acceptance gate is present and action-capable (BA10)", async ({
		page,
	}) => {
		const gate = page.getByTestId("hook-gate");
		await expect(gate).toBeVisible();
		await expect(page.getByTestId("hook-gate-fault")).toBeVisible();
		await expect(page.getByTestId("hook-gate-run")).toBeVisible();
	});

	test("with no fault, the turn is ACCEPTED — every mandatory hook ran GREEN", async ({
		page,
	}) => {
		// bdd-writer declares one mandatory hook (PreToolUse/pretooluse (wall)); a green
		// verdict for it ⇒ the turn is accepted.
		await page.getByTestId("hook-gate-fault").selectOption("none");
		await page.getByTestId("hook-gate-run").click();
		await expect(page.getByTestId("hook-gate-verdict")).toHaveAttribute(
			"data-accepted",
			"true",
		);
	});

	test("FAULT-INJECTION: removing a mandatory hook's verdict REFUSES with AGENT_MANDATORY_HOOK_SKIPPED (hook-honesty §5)", async ({
		page,
	}) => {
		// Remove the mandatory hook's verdict → it never ran → SKIPPED. The gate must flip
		// from accepted to refused — a guard that could not be reddened by injection is dead.
		await page.getByTestId("hook-gate-fault").selectOption("skipped");
		await page.getByTestId("hook-gate-run").click();
		const verdict = page.getByTestId("hook-gate-verdict");
		await expect(verdict).toHaveAttribute("data-accepted", "false");
		await expect(page.getByTestId("hook-gate-code")).toContainText(
			"AGENT_MANDATORY_HOOK_SKIPPED",
		);
		// the actionable form names the only legal door.
		await expect(verdict).toContainText("idée → miroir → /goal");
	});

	test("FAULT-INJECTION: reddening a mandatory hook REFUSES with AGENT_MANDATORY_HOOK_RED — presence ≠ green", async ({
		page,
	}) => {
		// The mandatory hook RAN but is RED (present, not green) → the turn is refused.
		await page.getByTestId("hook-gate-fault").selectOption("red");
		await page.getByTestId("hook-gate-run").click();
		const verdict = page.getByTestId("hook-gate-verdict");
		await expect(verdict).toHaveAttribute("data-accepted", "false");
		await expect(page.getByTestId("hook-gate-code")).toContainText(
			"AGENT_MANDATORY_HOOK_RED",
		);
	});

	// ── BA11 — the per-run BUDGET gate (action-capable + boundary fault-injection) ──
	test("the per-run budget gate is present and action-capable (BA11)", async ({
		page,
	}) => {
		const gate = page.getByTestId("budget-gate");
		await expect(gate).toBeVisible();
		await expect(page.getByTestId("budget-gate-fault")).toBeVisible();
		await expect(page.getByTestId("budget-gate-run")).toBeVisible();
		// the effective cap shown is min(S29=1000, S51=800) = 800 (the tightest wins).
		await expect(page.getByTestId("budget-gate-effcap")).toHaveText("800");
	});

	test("at the effective cap the run is WITHIN budget (boundary, inclusive ceiling)", async ({
		page,
	}) => {
		// A token tally exactly at min(S29, S51) = 800 is within budget — the cap is the
		// inclusive ceiling (the boundary property, mirrored verdict-for-verdict in Go/TS).
		await page.getByTestId("budget-gate-fault").selectOption("within");
		await page.getByTestId("budget-gate-run").click();
		await expect(page.getByTestId("budget-gate-verdict")).toHaveAttribute(
			"data-within",
			"true",
		);
	});

	test("BOUNDARY FAULT: one token past the effective cap BREACHES with AGENT_BUDGET_EXCEEDED on the tokens axis", async ({
		page,
	}) => {
		// One past min(S29, S51) = 801 breaches — the verdict flips at exactly the min() cap
		// (the tightest wins, fail-closed). A gate that could not flip at the boundary is dead.
		await page.getByTestId("budget-gate-fault").selectOption("exceeded");
		await page.getByTestId("budget-gate-run").click();
		const verdict = page.getByTestId("budget-gate-verdict");
		await expect(verdict).toHaveAttribute("data-within", "false");
		await expect(page.getByTestId("budget-gate-axis")).toHaveText("tokens");
		await expect(page.getByTestId("budget-gate-code")).toContainText(
			"AGENT_BUDGET_EXCEEDED",
		);
		// the actionable form names the only legal door to raise a declared cap.
		await expect(verdict).toContainText("/goal");
	});

	// ── BA12 — the determinism-first ARBITER gate (action-capable; intent by structure) ──
	test("the determinism-first arbiter gate is present and action-capable (BA12)", async ({
		page,
	}) => {
		await expect(page.getByTestId("arbiter-gate")).toBeVisible();
		await expect(page.getByTestId("arbiter-gate-action")).toBeVisible();
		await expect(page.getByTestId("arbiter-gate-label")).toBeVisible();
		await expect(page.getByTestId("arbiter-gate-run")).toBeVisible();
	});

	test("a git diff routes to the deterministic diff tool (structure, not label)", async ({
		page,
	}) => {
		// Action 0 is `bash git diff` — a deterministic structure.
		await page.getByTestId("arbiter-gate-action").selectOption({ value: "0" });
		await page.getByTestId("arbiter-gate-run").click();
		const verdict = page.getByTestId("arbiter-gate-verdict");
		await expect(verdict).toHaveAttribute("data-kind", "DeterministicTool");
		await expect(page.getByTestId("arbiter-gate-tool")).toHaveText("diff");
	});

	test("RE-LABELLING the displayed intent CANNOT change the verdict (gap D1)", async ({
		page,
	}) => {
		// Same `git diff` structure, but the operator claims an LLM/generation intent.
		await page.getByTestId("arbiter-gate-action").selectOption({ value: "0" });
		await page
			.getByTestId("arbiter-gate-label")
			.fill("let the LLM generate the diff freely");
		await page.getByTestId("arbiter-gate-run").click();
		// The label is INERT: the structure still routes to the deterministic diff tool.
		await expect(page.getByTestId("arbiter-gate-verdict")).toHaveAttribute(
			"data-kind",
			"DeterministicTool",
		);
		await expect(page.getByTestId("arbiter-gate-tool")).toHaveText("diff");
	});

	test("DETERMINISM GAP: requesting the LLM where a deterministic tool exists BLOCKS with AGENT_DETERMINISM_GAP", async ({
		page,
	}) => {
		// `git diff` is deterministic; ticking "LLM requested" is a determinism gap that blocks.
		await page.getByTestId("arbiter-gate-action").selectOption({ value: "0" });
		await page.getByTestId("arbiter-gate-llm").check();
		await page.getByTestId("arbiter-gate-run").click();
		const block = page.getByTestId("arbiter-gate-block");
		await expect(block).toBeVisible();
		await expect(page.getByTestId("arbiter-gate-code")).toContainText(
			"AGENT_DETERMINISM_GAP",
		);
		// the actionable form names the deterministic tool as the way out.
		await expect(block).toContainText("use_deterministic_tool");
	});

	test("genuine generation is the residual LLMGated case (no determinism gap)", async ({
		page,
	}) => {
		// Action 5 is `llm write docs` — no deterministic tool exists; requesting the LLM is
		// the gated exception, NOT a gap.
		await page.getByTestId("arbiter-gate-action").selectOption({ value: "5" });
		await page.getByTestId("arbiter-gate-llm").check();
		await page.getByTestId("arbiter-gate-run").click();
		await expect(page.getByTestId("arbiter-gate-verdict")).toHaveAttribute(
			"data-kind",
			"LLMGated",
		);
		await expect(page.getByTestId("arbiter-gate-block")).toHaveCount(0);
	});

	// ── BA13 — the COMPOSED perimeter gate (single verdict over all declared axes) ──────
	test("the composed gate renders an ALLOWED perimeter for a deterministic, in-bounds action (BA13)", async ({
		page,
	}) => {
		// `git diff` (deterministic) with no LLM requested, into front/web — every axis passes.
		await page.getByTestId("arbiter-gate-action").selectOption({ value: "0" });
		await page.getByTestId("arbiter-gate-run").click();
		const decision = page.getByTestId("gate-decision");
		await expect(decision).toBeVisible();
		await expect(decision).toHaveAttribute("data-allowed", "true");
	});

	test("the composed gate REFUSES at the determinism axis (Arbitrate is FIRST in precedence) (BA13)", async ({
		page,
	}) => {
		// `git diff` + "LLM requested" is a determinism gap; the SAME single gate refuses it,
		// naming the determinism axis FIRST (the live "what would be refused" preview).
		await page.getByTestId("arbiter-gate-action").selectOption({ value: "0" });
		await page.getByTestId("arbiter-gate-llm").check();
		await page.getByTestId("arbiter-gate-run").click();
		const decision = page.getByTestId("gate-decision");
		await expect(decision).toBeVisible();
		await expect(decision).toHaveAttribute("data-allowed", "false");
		await expect(decision).toHaveAttribute("data-axis", "determinism");
		await expect(page.getByTestId("gate-decision-code")).toContainText(
			"AGENT_DETERMINISM_GAP",
		);
	});

	test("the arch-fitness rule 'one single LLM function' is present and action-capable (BA14)", async ({
		page,
	}) => {
		await expect(page.getByTestId("llm-iso-section")).toBeVisible();
		await expect(page.getByTestId("llm-iso-run")).toBeVisible();
		await expect(page.getByTestId("llm-iso-fault")).toBeVisible();
	});

	test("the clean import graph PASSES — only the provider imports the LLM SDK (BA14)", async ({
		page,
	}) => {
		// fault toggle OFF: the live graph has exactly one LLM-SDK importer (provider).
		await page.getByTestId("llm-iso-run").click();
		const verdict = page.getByTestId("llm-iso-verdict");
		await expect(verdict).toBeVisible();
		await expect(verdict).toHaveAttribute("data-passed", "true");
	});

	test("FAULT INJECTION: an LLM-SDK import outside the provider flips the rule RED with LLM_SDK_IMPORT_OUTSIDE_PROVIDER (BA14)", async ({
		page,
	}) => {
		// the fault toggle sprinkles a SECOND LLM SDK into a non-provider package; the
		// deterministic rule refuses it — proving the invariant is a RULE, not prose.
		await page.getByTestId("llm-iso-fault").check();
		await page.getByTestId("llm-iso-run").click();
		const verdict = page.getByTestId("llm-iso-verdict");
		await expect(verdict).toBeVisible();
		await expect(verdict).toHaveAttribute("data-passed", "false");
		await expect(page.getByTestId("llm-iso-code")).toContainText(
			"LLM_SDK_IMPORT_OUTSIDE_PROVIDER",
		);
		await expect(page.getByTestId("llm-iso-offender")).toContainText(
			"openai-go",
		);
	});

	// ── BA15 — the loop shell (Drive) control: action-capable, wall-safe ────────────────
	test("the loop shell control is present and action-capable (BA15)", async ({
		page,
	}) => {
		await expect(page.getByTestId("drive-shell")).toBeVisible();
		await expect(page.getByTestId("drive-run")).toBeVisible();
		await expect(page.getByTestId("drive-fault")).toBeVisible();
	});

	test("running the loop shell drives the scripted session to a COMPUTED green run (BA15)", async ({
		page,
	}) => {
		// fault toggle OFF: two legal writes flip both red-set mirrors → the goal closes.
		await page.getByTestId("drive-run").click();
		const result = page.getByTestId("drive-result");
		await expect(result).toBeVisible();
		// The Result is COMPUTED by goal.IsClosed (both mirrors green), never self-reported.
		await expect(result).toHaveAttribute("data-result", "green");
		// Every recorded action is allowed (no above-the-line write in this script).
		const actions = page.getByTestId("drive-action");
		await expect(actions).toHaveCount(2);
		for (let i = 0; i < 2; i++) {
			await expect(actions.nth(i)).toHaveAttribute("data-autorisee", "true");
		}
	});

	test("FAULT INJECTION: an above-the-line write is refused BEFORE execution — the wall holds, the Result stays computed (BA15)", async ({
		page,
	}) => {
		// the fault toggle prepends an above-the-line write (back/kernel) that CLAIMS to
		// flip a mirror; the gate refuses it BEFORE execution so its effect never lands.
		await page.getByTestId("drive-fault").check();
		await page.getByTestId("drive-run").click();
		const actions = page.getByTestId("drive-action");
		await expect(actions).toHaveCount(3);
		// Action 1 — the above-the-line write — is refused (autorisee:false) with the wall code.
		await expect(actions.nth(0)).toHaveAttribute("data-autorisee", "false");
		await expect(actions.nth(0).getByTestId("drive-action-code")).toContainText(
			"AGENT_WRITE_ABOVE_WATERLINE",
		);
		// Actions 2 & 3 — the legal writes — are allowed and flip both mirrors green.
		await expect(actions.nth(1)).toHaveAttribute("data-autorisee", "true");
		await expect(actions.nth(2)).toHaveAttribute("data-autorisee", "true");
		// The Result is COMPUTED green (the LEGAL writes closed the goal — the refused
		// effect never landed), never self-reported by the mock.
		await expect(page.getByTestId("drive-result")).toHaveAttribute(
			"data-result",
			"green",
		);
	});

	test("the deterministic post-check control is present and action-capable (BA16)", async ({
		page,
	}) => {
		await expect(page.getByTestId("postcheck-shell")).toBeVisible();
		await expect(page.getByTestId("postcheck-run")).toBeVisible();
		await expect(page.getByTestId("postcheck-fault")).toBeVisible();
	});

	test("with no fault the post-check ACCEPTS both confirmed code actions → COMPUTED green (BA16)", async ({
		page,
	}) => {
		// fault OFF: the sensor CONFIRMS both claimed flips → the post-check accepts both,
		// the goal closes green (computed by isClosed, never self-reported).
		await page.getByTestId("postcheck-run").click();
		const result = page.getByTestId("postcheck-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-result", "green");
		const actions = page.getByTestId("postcheck-action");
		await expect(actions).toHaveCount(2);
		for (let i = 0; i < 2; i++) {
			await expect(actions.nth(i)).toHaveAttribute("data-autorisee", "true");
		}
	});

	test("FAULT INJECTION: a claimed flip the sensor disagrees with is REJECTED by the post-check — the goal stays red, invariant to claimed confidence (BA16)", async ({
		page,
	}) => {
		// the fault toggle makes the agent CLAIM a green flip the sensor still reads red:
		// the deterministic post-check (the mirror is the judge, §8) REJECTS each action.
		await page.getByTestId("postcheck-fault").check();
		await page.getByTestId("postcheck-run").click();
		const actions = page.getByTestId("postcheck-action");
		await expect(actions).toHaveCount(2);
		for (let i = 0; i < 2; i++) {
			await expect(actions.nth(i)).toHaveAttribute("data-autorisee", "false");
			await expect(
				actions.nth(i).getByTestId("postcheck-action-code"),
			).toContainText("AGENT_POSTCHECK_FAILED");
		}
		// The Result is COMPUTED still_red: no claimed-only flip closes the goal — the
		// result is invariant to the agent's claimed confidence.
		await expect(page.getByTestId("postcheck-result")).toHaveAttribute(
			"data-result",
			"still_red",
		);
	});

	test("the sandbox binding control is present and action-capable (BA17)", async ({
		page,
	}) => {
		await expect(page.getByTestId("sandbox-shell")).toBeVisible();
		await expect(page.getByTestId("sandbox-run")).toBeVisible();
		// the level-3 backstop names the aidos_agent Postgres role.
		await expect(page.getByTestId("sandbox-role")).toContainText("aidos_agent");
	});

	test("with no fault a generated in-bounds write + declared egress are ALLOWED (BA17)", async ({
		page,
	}) => {
		await page.getByTestId("sandbox-run").click();
		await expect(page.getByTestId("sandbox-write")).toHaveAttribute(
			"data-allowed",
			"true",
		);
		await expect(page.getByTestId("sandbox-egress")).toHaveAttribute(
			"data-allowed",
			"true",
		);
	});

	test("FAULT INJECTION: a generated write to a truth zone is refused at THREE levels AND an undeclared egress is refused — defense in depth (BA17)", async ({
		page,
	}) => {
		// the fault toggle aims the generated write/egress OUT of the sandbox: a truth zone
		// and an undeclared host. The wall holds three times over (FS + hook + GRANT).
		await page.getByTestId("sandbox-fault").check();
		await page.getByTestId("sandbox-run").click();
		await expect(page.getByTestId("sandbox-write")).toHaveAttribute(
			"data-allowed",
			"false",
		);
		// the write is refused at all three levels (fs · hook · grant).
		const levels = page.getByTestId("sandbox-write-levels");
		await expect(levels).toContainText("fs_boundary");
		await expect(levels).toContainText("hook_gate");
		await expect(levels).toContainText("postgres_grant");
		// the egress is refused at the boundary AND the gate.
		await expect(page.getByTestId("sandbox-egress")).toHaveAttribute(
			"data-allowed",
			"false",
		);
		await expect(page.getByTestId("sandbox-egress-levels")).toContainText(
			"egress_boundary",
		);
	});

	// ── BA18 — AGENT IDENTITY/AUTH toward the MCP servers (gap K3) ─────────────────
	test("the identity/auth control is present and action-capable (BA18)", async ({
		page,
	}) => {
		await expect(page.getByTestId("identity")).toBeVisible();
		await expect(page.getByTestId("identity-fault")).toBeVisible();
		await expect(page.getByTestId("identity-verify-button")).toBeVisible();
	});

	test("with its OWN token the call is ACCEPTED — the token binds the process to that CoucheAgent@version (BA18)", async ({
		page,
	}) => {
		await page.getByTestId("identity-fault").selectOption("own");
		await page.getByTestId("identity-verify-button").click();
		await expect(page.getByTestId("identity-verdict")).toHaveAttribute(
			"data-verified",
			"true",
		);
		// the presented token is a non-empty content-hash (not the ∅ placeholder).
		await expect(page.getByTestId("identity-presented")).not.toContainText("∅");
	});

	test("FAULT INJECTION: a token for ANOTHER identity is REFUSED with AGENT_IDENTITY_UNVERIFIED — owner_agent is not forgeable (BA18)", async ({
		page,
	}) => {
		await page.getByTestId("identity-fault").selectOption("other");
		await page.getByTestId("identity-verify-button").click();
		await expect(page.getByTestId("identity-verdict")).toHaveAttribute(
			"data-verified",
			"false",
		);
		await expect(page.getByTestId("identity-block-reason")).toContainText(
			"AGENT_IDENTITY_UNVERIFIED",
		);
	});

	test("FAULT INJECTION: an EMPTY token is REFUSED fail-closed with AGENT_IDENTITY_UNVERIFIED (BA18)", async ({
		page,
	}) => {
		await page.getByTestId("identity-fault").selectOption("empty");
		await page.getByTestId("identity-verify-button").click();
		await expect(page.getByTestId("identity-verdict")).toHaveAttribute(
			"data-verified",
			"false",
		);
		await expect(page.getByTestId("identity-block-reason")).toContainText(
			"AGENT_IDENTITY_UNVERIFIED",
		);
		await expect(page.getByTestId("identity-presented")).toContainText("∅");
	});
});

/**
 * BA19 Playwright e2e — the /agents « Lancer un run » controls (the agentloop MCP Run
 * surface). The control « Lancer un run » is bound to driveAgentloop (the front twin of the
 * agentloop_drive MCP tool): it GATES at the transport boundary (the run may only call a tool
 * its impl BINDS — the capacity axis), then drives the scenario and renders the LIVE action
 * timeline with per-action wall verdicts.
 *
 * mirror record: reflects=BA19-agentloop-run, test_kind=e2e, cert_language=gherkin,
 *               liveness=alive, authority=above
 *
 * Scenario: launching a governed run against a red item drives a wall-safe action timeline
 *   Given the Workbench is running and I navigate to /agents
 *   When I click « Lancer un run » on the happy scenario against a red item
 *   Then the timeline renders the run's actions and the run records NO truth (wall-safe)
 *   When I run the kernel-write scenario
 *   Then the kernel-write action is REFUSED in place with AGENT_WRITE_ABOVE_WATERLINE
 *       and the run STILL records no truth above the waterline
 *   When I run against a tool the impl does NOT bind
 *   Then the run is REFUSED at the transport boundary with AGENT_TOOL_NOT_BOUND and no run executes
 */
test.describe("BA19 — the /agents « Lancer un run » controls (agentloop MCP)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("agentloop-run")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the Run controls are present (action-capable, ui-completeness)", async ({
		page,
	}) => {
		await expect(page.getByTestId("agentloop-scenario")).toBeVisible();
		await expect(page.getByTestId("agentloop-unbound")).toBeVisible();
		await expect(page.getByTestId("agentloop-run-button")).toBeVisible();
	});

	test("launching a happy run against a red item renders the action timeline and writes NO truth", async ({
		page,
	}) => {
		await page.getByTestId("agentloop-scenario").selectOption("happy");
		await page.getByTestId("agentloop-run-button").click();
		// the timeline renders the run's actions
		const actions = page.getByTestId("agentloop-action");
		await expect(actions.first()).toBeVisible();
		// the wall held: the run wrote no truth above the waterline
		await expect(page.getByTestId("agentloop-no-truth")).toHaveAttribute(
			"data-wrote-truth",
			"false",
		);
		// the run reached a computed terminal (a result is shown)
		await expect(page.getByTestId("agentloop-result")).toBeVisible();
	});

	test("a kernel-write action is REFUSED in place (AGENT_WRITE_ABOVE_WATERLINE) and the run writes no truth", async ({
		page,
	}) => {
		await page.getByTestId("agentloop-scenario").selectOption("kernel-write");
		await page.getByTestId("agentloop-run-button").click();
		// the kernel-write turn is refused in place — a forbidden-zone action shows its code
		const refused = page
			.getByTestId("agentloop-action")
			.filter({ has: page.getByTestId("agentloop-action-code") })
			.first();
		await expect(refused.getByTestId("agentloop-action-code")).toContainText(
			"AGENT_WRITE_ABOVE_WATERLINE",
		);
		// at least one action is marked not-authorised (the wall refused it in place)
		await expect(refused).toHaveAttribute("data-autorisee", "false");
		// the wall held: even with a kernel-write attempt, no truth was written
		await expect(page.getByTestId("agentloop-no-truth")).toHaveAttribute(
			"data-wrote-truth",
			"false",
		);
	});

	test("FAULT INJECTION: a run targeting an UNBOUND tool is REFUSED at the transport boundary (AGENT_TOOL_NOT_BOUND), no run executes", async ({
		page,
	}) => {
		await page.getByTestId("agentloop-unbound").check();
		await page.getByTestId("agentloop-run-button").click();
		await expect(page.getByTestId("agentloop-refused")).toBeVisible();
		await expect(page.getByTestId("agentloop-refused-code")).toContainText(
			"AGENT_TOOL_NOT_BOUND",
		);
		// no run executed → no timeline, no result
		await expect(page.getByTestId("agentloop-timeline")).toHaveCount(0);
		await expect(page.getByTestId("agentloop-result")).toHaveCount(0);
	});
});

/**
 * BA20 — the /agents scheduler-role + fencing controls.
 * mirror record: reflects=BA20-scheduler-role, test_kind=e2e, cert_language=gherkin,
 * liveness=live.
 *
 *   Scenario: the scheduler role claims an open item (open→claimed, epoch++)
 *   Scenario: the agent role is refused the transition in place (the wall)
 */
test.describe("BA20 — the /agents scheduler-role + fencing controls", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("scheduler-fencing")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the scheduler controls are present (action-capable, ui-completeness)", async ({
		page,
	}) => {
		await expect(page.getByTestId("scheduler-claim-button")).toBeVisible();
		await expect(
			page.getByTestId("scheduler-agent-claim-button"),
		).toBeVisible();
		// the item starts open @ epoch 0 (never leased)
		await expect(page.getByTestId("scheduler-status")).toContainText("open");
		await expect(page.getByTestId("scheduler-epoch")).toContainText("0");
	});

	test("the scheduler role claims an open item: open→claimed, lease_epoch bumps to 1", async ({
		page,
	}) => {
		await page.getByTestId("scheduler-claim-button").click();
		// the item transitioned open→claimed
		await expect(page.getByTestId("scheduler-status")).toContainText("claimed");
		// the monotone fencing token bumped 0→1
		await expect(page.getByTestId("scheduler-epoch")).toContainText("1");
		await expect(page.getByTestId("scheduler-owner")).toContainText(
			"bdd-writer@v1",
		);
		// the AgentAssignment is shown, pinned at the bumped epoch
		await expect(page.getByTestId("scheduler-claimed")).toBeVisible();
	});

	test("the agent role is REFUSED the transition in place (the wall: INSERT+SELECT only)", async ({
		page,
	}) => {
		await page.getByTestId("scheduler-agent-claim-button").click();
		await expect(page.getByTestId("scheduler-agent-refused")).toBeVisible();
		await expect(page.getByTestId("scheduler-agent-refused")).toContainText(
			"agentCanTransition() = false",
		);
	});
});

/**
 * BA21 — the /agents role-matching + anti-starvation controls.
 * mirror record: reflects=BA21-matchrole, test_kind=e2e, cert_language=gherkin,
 * liveness=live.
 *
 *   Scenario: MatchRole maps the mirror-first head to a free agent of the declared role
 *   Scenario: when the matching role is busy, the head starves → still_red signal
 */
test.describe("BA21 — the /agents role-matching + anti-starvation controls", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("scheduler-matchrole")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the role-matching controls are present and the head is mirror-first (ui-completeness)", async ({
		page,
	}) => {
		await expect(page.getByTestId("scheduler-match-button")).toBeVisible();
		await expect(
			page.getByTestId("scheduler-toggle-busy-button"),
		).toBeVisible();
		await expect(page.getByTestId("scheduler-starve-button")).toBeVisible();
		// the mirror-first HEAD is the mirror item (rank 0), not the projection.
		await expect(page.getByTestId("scheduler-head")).toContainText(
			"redset:checkout#mirror",
		);
		await expect(page.getByTestId("scheduler-head")).toContainText("mirror");
	});

	test("MatchRole maps the mirror head to a free bdd-writer (algorithm, declared role)", async ({
		page,
	}) => {
		await page.getByTestId("scheduler-match-button").click();
		await expect(page.getByTestId("scheduler-match-result")).toBeVisible();
		await expect(page.getByTestId("scheduler-match-result")).toContainText(
			"bdd-writer@v1",
		);
	});

	test("when the bdd-writer is busy, the head starves: still_red signal (gap E3)", async ({
		page,
	}) => {
		// occupy the only bdd-writer → the mirror head has no free matching agent.
		await page.getByTestId("scheduler-toggle-busy-button").click();
		await expect(page.getByTestId("scheduler-roster")).toContainText("busy");

		// matching now refuses (no wrong-role fallback — the wall holds).
		await page.getByTestId("scheduler-match-button").click();
		await expect(page.getByTestId("scheduler-match-result")).toBeVisible();

		// the starvation detector surfaces the still_red signal.
		await page.getByTestId("scheduler-starve-button").click();
		await expect(page.getByTestId("scheduler-starve-result")).toBeVisible();
		await expect(page.getByTestId("scheduler-starve-result")).toContainText(
			"still_red",
		);
		await expect(page.getByTestId("scheduler-starve-result")).toContainText(
			"bdd-writer",
		);
	});
});

/*
 * BA22 — the /agents lease/expire ENGINE (tick driver) + write-path FENCING controls.
 * mirror record: reflects=BA22-lease-engine, test_kind=e2e, cert_language=gherkin,
 * liveness=live.
 *   Scenario: one tick reclaims an expired (dead-agent) lease and leaves a dep-blocked
 *             item blocked; resolving the upstream + re-ticking unblocks it.
 *   Scenario: a write bearing a stale epoch is refused (AGENT_LEASE_FENCED) — no lost-update.
 */
test.describe("BA22 — the /agents lease/expire engine + write-path fencing", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("scheduler-lease-engine")).toBeVisible({
			timeout: 15_000,
		});
	});

	test("the engine + fencing controls are present (action-capable, ui-completeness)", async ({
		page,
	}) => {
		await expect(page.getByTestId("scheduler-tick-button")).toBeVisible();
		await expect(
			page.getByTestId("scheduler-resolve-mirror-button"),
		).toBeVisible();
		await expect(page.getByTestId("scheduler-fence-button")).toBeVisible();
		await expect(page.getByTestId("scheduler-fence-epoch")).toBeVisible();
	});

	test("one tick reclaims the dead-agent lease and blocks the dep-gated projection (gap E1)", async ({
		page,
	}) => {
		await page.getByTestId("scheduler-tick-button").click();
		await expect(page.getByTestId("scheduler-tick-result")).toBeVisible();
		// the dead-agent lease (lease_until 11:00 < now 12:00) was RECLAIMED at the tick —
		// no human action — and, a free executor existing, immediately re-leased fresh: its
		// monotone epoch bumped 2→3 (the fencing token advances, so the woken-late old agent
		// is now fenced). The stale 11:00 lease is gone — the anti-dead-agent reclaim fired.
		await expect(
			page.getByTestId("tick-row-redset:checkout#dead"),
		).toContainText("epoch 3");
		// the mirror head leased; the projection stays blocked on its unresolved dep.
		await expect(
			page.getByTestId("tick-row-redset:checkout#mirror"),
		).toContainText("claimed");
		await expect(
			page.getByTestId("tick-row-redset:checkout#proj"),
		).toContainText("blocked");
	});

	test("resolving the upstream mirror then re-ticking unblocks + leases the projection", async ({
		page,
	}) => {
		await page.getByTestId("scheduler-resolve-mirror-button").click();
		await page.getByTestId("scheduler-tick-button").click();
		await expect(
			page.getByTestId("tick-row-redset:checkout#proj"),
		).toContainText("claimed");
	});

	test("a stale-epoch write is refused: AGENT_LEASE_FENCED (no lost-update, gap E2)", async ({
		page,
	}) => {
		// current epoch of the dead item is 2; write epoch 1 is stale → fenced.
		await page.getByTestId("scheduler-fence-epoch").fill("1");
		await page.getByTestId("scheduler-fence-button").click();
		await expect(page.getByTestId("scheduler-fence-result")).toBeVisible();
		await expect(page.getByTestId("scheduler-fence-result")).toContainText(
			"AGENT_LEASE_FENCED",
		);
	});

	test("a live-epoch write may land (equal epoch is OK)", async ({ page }) => {
		await page.getByTestId("scheduler-fence-epoch").fill("2");
		await page.getByTestId("scheduler-fence-button").click();
		await expect(page.getByTestId("scheduler-fence-result")).toBeVisible();
		await expect(page.getByTestId("scheduler-fence-result")).not.toContainText(
			"AGENT_LEASE_FENCED",
		);
	});
});

/*
 * BA23 — the /agents Queue & Dispatch panel (the scheduler MCP server surface).
 * mirror record: reflects=runtime.scheduler-dispatch, test_kind=e2e,
 * cert_language=gherkin, liveness=live, authority=below.
 *   Scenario: "Dispatch next" runs scheduler.tick — a dep-blocked item stays blocked, an
 *             expired (dead-agent) lease is reclaimed at the tick (no human), the mirror
 *             head leases role-matched; resolving the upstream + re-dispatching unblocks it.
 */
test.describe("BA23 — the /agents Queue & Dispatch panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("scheduler-dispatch")).toBeVisible({
			timeout: 15_000,
		});
	});

	test("the dispatch controls + queue are present (action-capable, ui-completeness)", async ({
		page,
	}) => {
		await expect(page.getByTestId("dispatch-next-button")).toBeVisible();
		await expect(page.getByTestId("dispatch-reclaim-button")).toBeVisible();
		await expect(page.getByTestId("dispatch-queue")).toBeVisible();
		await expect(page.getByTestId("dispatch-free-agents")).toBeVisible();
		// before any tick: the queue shows the fixture, no assignment line yet.
		await expect(page.getByTestId("dispatch-no-tick")).toBeVisible();
		await expect(
			page.getByTestId("dispatch-row-redset:checkout#dead"),
		).toContainText("claimed");
	});

	test("Dispatch next: deps gate the dependent, the dead lease reclaims, the head leases", async ({
		page,
	}) => {
		await page.getByTestId("dispatch-next-button").click();
		// the dependency gate holds: the projection stays blocked on its unresolved mirror.
		await expect(
			page.getByTestId("dispatch-row-redset:checkout#proj"),
		).toContainText("blocked");
		// the dead-agent lease (lease_until 11:00 < now 12:00) was RECLAIMED at the tick — no
		// human — then immediately re-leased: its monotone epoch bumped 2→3 (the fencing token
		// advances, fencing out the woken-late old agent).
		await expect(
			page.getByTestId("dispatch-row-redset:checkout#dead"),
		).toContainText("3");
		// the mirror-first head leased to a role-matched agent.
		await expect(
			page.getByTestId("dispatch-row-redset:checkout#mirror"),
		).toContainText("claimed");
		await expect(page.getByTestId("dispatch-assignments")).toBeVisible();
	});

	test("resolving the upstream then re-dispatching unblocks + leases the projection", async ({
		page,
	}) => {
		await page.getByTestId("dispatch-resolve-mirror-button").click();
		await page.getByTestId("dispatch-next-button").click();
		await expect(
			page.getByTestId("dispatch-row-redset:checkout#proj"),
		).toContainText("claimed");
	});

	test("Reclaim expired reclaims the dead-agent lease at the tick (no human action)", async ({
		page,
	}) => {
		await page.getByTestId("dispatch-reclaim-button").click();
		// the stale 11:00 lease is gone: the item was reclaimed (and re-leased), epoch 3.
		await expect(
			page.getByTestId("dispatch-row-redset:checkout#dead"),
		).toContainText("3");
	});
});

/*
 * BA24 — the /agents Orchestration & conflict panel (kernel.agent_layer surface).
 * mirror record: reflects=kernel.agent_layer (OrchestrationPolicy/ResolveConflict),
 * test_kind=e2e, cert_language=gherkin, liveness=live, authority=below.
 *   Scenario: the declared policy validates (bounded by the spec knob, no phantom cap);
 *             a run pins the @version (immutability per-run — a mid-run edit is flagged
 *             forbidden); a same-target conflict is resolved mirror-first, the loser WAITS
 *             (zero lost update) and the next action is serialise_then_merge.
 */
test.describe("BA24 — the /agents Orchestration & conflict panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("scheduler-orchestration")).toBeVisible({
			timeout: 15_000,
		});
	});

	test("the orchestration controls + policy are present (action-capable, ui-completeness)", async ({
		page,
	}) => {
		await expect(page.getByTestId("orch-policy")).toBeVisible();
		await expect(
			page.getByTestId("orch-resolve-conflict-button"),
		).toBeVisible();
		await expect(page.getByTestId("orch-bump-version-button")).toBeVisible();
		await expect(page.getByTestId("orch-reset-button")).toBeVisible();
		// the declared policy is valid — bounded by the spec MaxConcurrency knob (no phantom).
		await expect(page.getByTestId("orch-policy-verdict")).toBeVisible();
		await expect(page.getByTestId("orch-policy")).toContainText(
			"serialise_then_merge",
		);
		// before resolving: no conflict surfaced.
		await expect(page.getByTestId("orch-no-conflict")).toBeVisible();
	});

	test("a mid-run policy edit is flagged FORBIDDEN (immutability per-run, gap F3)", async ({
		page,
	}) => {
		// the pin starts frozen on the run's version.
		await expect(page.getByTestId("orch-pin-status")).toBeVisible();
		await page.getByTestId("orch-bump-version-button").click();
		// bumping the live version diverges from the pin → forbidden mid-run edit.
		await expect(page.getByTestId("orch-pin-status")).toContainText(
			/FORBIDDEN|INTERDITE/i,
		);
	});

	test("a same-target conflict resolves mirror-first; the loser WAITS (zero lost update)", async ({
		page,
	}) => {
		await page.getByTestId("orch-resolve-conflict-button").click();
		const result = page.getByTestId("orch-conflict-result");
		await expect(result).toBeVisible();
		// the mirror-layer contender (reviewer@v1) passes first; the operation_action one waits.
		await expect(result).toContainText("reviewer@v1");
		await expect(page.getByTestId("orch-conflict-loser")).toContainText(
			"executor@v1",
		);
		// the next action is serialise_then_merge — never a race, never a coin-flip.
		await expect(result).toContainText("serialise_then_merge");
	});

	test("Reset clears the conflict and re-freezes the pin", async ({ page }) => {
		await page.getByTestId("orch-resolve-conflict-button").click();
		await expect(page.getByTestId("orch-conflict-result")).toBeVisible();
		await page.getByTestId("orch-reset-button").click();
		await expect(page.getByTestId("orch-no-conflict")).toBeVisible();
	});
});

/*
 * BA25 — the /agents Multi-agent coordination panel (runtime.scheduler-team surface).
 * mirror record: reflects=runtime.scheduler (ScheduleTeam), test_kind=e2e,
 * cert_language=gherkin, liveness=live, authority=below.
 *   Scenario: a team of N agents under an OrchestrationPolicy is coordinated by a tick;
 *             a same-target conflict serialises (winner leases, loser WAITS, zero
 *             lost-update); MaxConcurrency is never exceeded; the dependency hand-off
 *             across roles completes (A leases, B blocked, then B leases after A resolves).
 */
test.describe("BA25 — the /agents Multi-agent coordination panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("scheduler-team")).toBeVisible({
			timeout: 15_000,
		});
	});

	test("the team controls + queue are present (action-capable, ui-completeness)", async ({
		page,
	}) => {
		await expect(page.getByTestId("team-roster")).toBeVisible();
		await expect(page.getByTestId("team-tick-button")).toBeVisible();
		await expect(page.getByTestId("team-resolve-a-button")).toBeVisible();
		await expect(page.getByTestId("team-reset-button")).toBeVisible();
		await expect(page.getByTestId("team-queue")).toBeVisible();
		await expect(page.getByTestId("team-concurrency")).toBeVisible();
		// before a tick: every seed item is open, no conflict surfaced.
		await expect(page.getByTestId("team-no-conflict")).toBeVisible();
		await expect(page.getByTestId("team-status-A")).toContainText("open");
	});

	test("one tick coordinates the team: hand-off blocks B, conflict serialises, cap holds (gap F1/F2)", async ({
		page,
	}) => {
		await page.getByTestId("team-tick-button").click();
		// A (mirror, no deps) leases; B (projection) is BLOCKED until A resolves (hand-off).
		await expect(page.getByTestId("team-status-A")).toContainText("claimed");
		await expect(page.getByTestId("team-status-B")).toContainText("blocked");
		// the same-target conflict serialises: x1 (projection, lower rank) passes first,
		// x2 (operation_action) WAITS — exactly one of the two leases (zero lost-update).
		await expect(page.getByTestId("team-status-x1")).toContainText("claimed");
		await expect(page.getByTestId("team-status-x2")).toContainText("open");
		// the conflict + its declared next action (serialise_then_merge) are surfaced.
		await expect(page.getByTestId("team-conflicts")).toBeVisible();
		await expect(page.getByTestId("team-conflict-row")).toContainText(
			"serialise_then_merge",
		);
		// MaxConcurrency=2 never exceeded (A + x1 = 2 live leases).
		await expect(page.getByTestId("team-concurrency")).toContainText("2");
	});

	test("the dependency hand-off completes across roles: B leases after A resolves", async ({
		page,
	}) => {
		await page.getByTestId("team-tick-button").click();
		await expect(page.getByTestId("team-status-B")).toContainText("blocked");
		// resolve A (the role-A agent finished), then re-tick → B leases (role-B agent).
		await page.getByTestId("team-resolve-a-button").click();
		await page.getByTestId("team-tick-button").click();
		await expect(page.getByTestId("team-status-A")).toContainText("resolved");
		await expect(page.getByTestId("team-status-B")).toContainText("claimed");
	});

	test("Reset re-seeds the queue (every item back to open, no conflict)", async ({
		page,
	}) => {
		await page.getByTestId("team-tick-button").click();
		await expect(page.getByTestId("team-status-A")).toContainText("claimed");
		await page.getByTestId("team-reset-button").click();
		await expect(page.getByTestId("team-status-A")).toContainText("open");
		await expect(page.getByTestId("team-no-conflict")).toBeVisible();
	});
});

/**
 * BA26 Playwright e2e — the /agents « Replay envelope » controls (the AgentRun replay
 * schema extension). mirror record: reflects=BA26-agentrun-replay, test_kind=e2e,
 * cert_language=gherkin, liveness=alive, authority=below.
 *
 * Scenario: A run gains impl + seed + provider_transcript as a new @version (replay)
 *   Given the Workbench is running and I navigate to /agents
 *   Then the replay-envelope controls (mode radios + Build) are present and action-capable
 *   When I build a NEW (replayable) run
 *   Then it carries a derived seed, an impl hash and a transcript ref, and the envelope is coherent
 *   When I build a LEGACY (seedless) run
 *   Then it carries NO seed/impl/transcript yet stays readable + coherent (legacy back-compat)
 */
test.describe("BA26 — the /agents « Replay envelope » controls (agentrun replay)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("replay-envelope")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the replay controls are present (action-capable, ui-completeness)", async ({
		page,
	}) => {
		await expect(page.getByTestId("replay-mode-legacy")).toBeVisible();
		await expect(page.getByTestId("replay-mode-replay")).toBeVisible();
		await expect(page.getByTestId("replay-build")).toBeVisible();
	});

	test("a new run carries a derived seed + impl + transcript and is coherent (gap A2)", async ({
		page,
	}) => {
		await page.getByTestId("replay-mode-replay").check();
		await page.getByTestId("replay-build").click();
		const result = page.getByTestId("replay-result");
		await expect(result).toHaveAttribute("data-mode", "replay");
		// impl + seed + transcript are all populated (NOT the «—» none tag).
		await expect(page.getByTestId("replay-impl")).toContainText("impl-");
		await expect(page.getByTestId("replay-seed")).toHaveAttribute(
			"data-seeded",
			"true",
		);
		await expect(page.getByTestId("replay-transcript")).toContainText(
			"transcript:",
		);
		await expect(page.getByTestId("replay-coherent")).toHaveAttribute(
			"data-coherent",
			"true",
		);
	});

	test("a legacy seedless run stays readable + coherent (back-compat, anti-overwrite §9)", async ({
		page,
	}) => {
		await page.getByTestId("replay-mode-legacy").check();
		await page.getByTestId("replay-build").click();
		const result = page.getByTestId("replay-result");
		await expect(result).toHaveAttribute("data-mode", "legacy");
		// no replay fields: each shows the «—» none tag.
		await expect(page.getByTestId("replay-impl")).toContainText("—");
		await expect(page.getByTestId("replay-seed")).toContainText("—");
		await expect(page.getByTestId("replay-transcript")).toContainText("—");
		// yet the legacy run is still readable + coherent.
		await expect(page.getByTestId("replay-legacy-readable")).toBeVisible();
		await expect(page.getByTestId("replay-coherent")).toHaveAttribute(
			"data-coherent",
			"true",
		);
	});
});

/**
 * BA27 Playwright e2e — the /agents « Live meter & halt-on-budget » controls (the live
 * meter wired into the loop + the economics feed). mirror record:
 * reflects=BA27-economics-loop, test_kind=e2e, cert_language=gherkin, liveness=alive,
 * authority=below.
 *
 * Scenario: a breaching turn never starts (pre-call halt) and the run feeds economics
 *   Given the Workbench is running and I navigate to /agents
 *   Then the economics-loop controls (cap radios + Drive) are present and action-capable
 *   When I drive under a TIGHT cap (the 2nd turn would breach)
 *   Then the run is abandoned, the meter is HELD at the cap (never crosses), and the §66.3
 *        verdict flags the spend
 *   When I drive under a LOOSE cap
 *   Then the run completes (green) and the cell's tighter §66.3 budget flags the spend
 */
test.describe("BA27 — the /agents « Live meter & halt-on-budget » controls (economics loop)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("economics-loop")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the economics-loop controls are present (action-capable, ui-completeness)", async ({
		page,
	}) => {
		await expect(page.getByTestId("economics-cap-tight")).toBeVisible();
		await expect(page.getByTestId("economics-cap-loose")).toBeVisible();
		await expect(page.getByTestId("economics-drive")).toBeVisible();
	});

	test("a tight cap halts PRE-CALL: abandoned, meter held at the cap, spend flagged (gap G3)", async ({
		page,
	}) => {
		await page.getByTestId("economics-cap-tight").check();
		await page.getByTestId("economics-drive").click();
		const result = page.getByTestId("economics-result");
		await expect(result).toHaveAttribute("data-result", "abandoned");
		await expect(result).toHaveAttribute("data-cap", "tight");
		// The meter NEVER crosses the cap: it sits at 10, not 20.
		await expect(page.getByTestId("economics-meter")).toHaveAttribute(
			"data-tokens",
			"10",
		);
		// The pre-call halt held — the cap was not crossed.
		await expect(page.getByTestId("economics-meter")).toContainText(
			/cap held|cap tenu/,
		);
		// The terminated run's measured cost reached economics.evaluate and is flagged.
		await expect(page.getByTestId("economics-verdict")).toHaveAttribute(
			"data-verdict",
			"over_budget_flagged",
		);
	});

	test("a loose cap runs to completion (green) and the run's spend feeds economics (over budget)", async ({
		page,
	}) => {
		await page.getByTestId("economics-cap-loose").check();
		await page.getByTestId("economics-drive").click();
		const result = page.getByTestId("economics-result");
		await expect(result).toHaveAttribute("data-result", "green");
		// The full run executed: the meter totals the two turns (20 tokens).
		await expect(page.getByTestId("economics-meter")).toHaveAttribute(
			"data-tokens",
			"20",
		);
		// The 20-token run blows past the cell's tighter §66.3 budget → flagged.
		await expect(page.getByTestId("economics-verdict")).toHaveAttribute(
			"data-verdict",
			"over_budget_flagged",
		);
	});
});

/*
 * BA28 Playwright e2e — the /agents « Replay & redact » controls (replay + reproducibility +
 * redacted transcript). mirror record: reflects=BA28-replay-redact, test_kind=e2e,
 * cert_language=gherkin, liveness=alive, authority=below.
 *
 * Scenario: A run replays identically and its transcript leaks no secret (gap H1)
 *   Given the Workbench is running and I navigate to /agents
 *   Then the replay-redact controls are present and action-capable (ui-completeness)
 *   When I run « Redact & replay »
 *   Then the raw transcript carried a secret, the redacted transcript shows [REDACTED],
 *        no secret survives verbatim (data-leaked=false), and the replay re-derives id-stably
 *        (data-matches=true). The run stays below the line — no truth write.
 */
test.describe("BA28 — the /agents « Replay & redact » controls (replay + redaction)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("replay-redact")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the replay-redact control is present (action-capable, ui-completeness)", async ({
		page,
	}) => {
		await expect(page.getByTestId("ba28-run")).toBeVisible();
	});

	test("redaction scrubs the secret + the replay re-derives id-stably (gap H1)", async ({
		page,
	}) => {
		await page.getByTestId("ba28-run").click();
		const result = page.getByTestId("ba28-result");
		await expect(result).toBeVisible();

		// The raw transcript (system prompt) carried a secret — a DB URL with a password.
		await expect(page.getByTestId("ba28-raw")).toContainText("postgres://");

		// The redacted transcript shows [REDACTED] and NO secret verbatim.
		await expect(page.getByTestId("ba28-redacted")).toContainText("[REDACTED]");
		await expect(page.getByTestId("ba28-redacted")).not.toContainText(
			"hunter2",
		);

		// No secret leaked, and the replay re-derives id-stably.
		await expect(result).toHaveAttribute("data-leaked", "false");
		await expect(result).toHaveAttribute("data-matches", "true");
		await expect(page.getByTestId("ba28-leak-tag")).toContainText(
			/no secret|aucun secret/i,
		);
		await expect(page.getByTestId("ba28-match-tag")).toContainText(
			/identical|identique/i,
		);
	});
});

/*
 * BA29 Playwright e2e — the /agents « Ledger » controls (fidelity-to-reality: boundary
 * effect-log + reconciliation + replay + refusal counts). mirror record:
 * reflects=BA29-ledger, test_kind=e2e, liveness=live.
 *
 *   Given the Workbench is running and I navigate to /agents
 *   When  I query the ledger
 *   Then  a run with mixed verdicts renders its timeline + the refusal count: a faithful run
 *         is AUDITABLE (replay ∧ reconciled), a BETRAYED run (an unrecorded boundary effect)
 *         renders its drift and is NOT auditable, and an AGENT_WRITE_ABOVE_WATERLINE refusal
 *         renders by its code. replay-equality + effect-reconciliation together = auditable.
 *         The surface is read-only (no truth write), themed + bilingual, action-capable.
 */
test.describe("BA29 — the /agents « Ledger » controls (effect-log + reconciliation)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("ledger")).toBeVisible({ timeout: 5000 });
	});

	test("the ledger control is present (action-capable, ui-completeness)", async ({
		page,
	}) => {
		await expect(page.getByTestId("ledger-run")).toBeVisible();
	});

	test("a mixed-verdict run renders its timeline + reconciliation + refusal count (gap H2)", async ({
		page,
	}) => {
		await page.getByTestId("ledger-run").click();
		await expect(page.getByTestId("ledger-result")).toBeVisible();

		// the FAITHFUL run: replay ∧ reconciled ⇒ auditable.
		const faithful = page.getByTestId("ledger-row-run:faithful");
		await expect(faithful).toHaveAttribute("data-auditable", "true");
		await expect(faithful).toHaveAttribute("data-reconciled", "true");

		// the BETRAYED run: re-derives BUT does NOT reconcile (an unrecorded boundary effect) ⇒
		// NOT auditable; its drift renders the exfil path.
		const betrayed = page.getByTestId("ledger-row-run:betrayed");
		await expect(betrayed).toHaveAttribute("data-auditable", "false");
		await expect(betrayed).toHaveAttribute("data-reconciled", "false");
		await expect(page.getByTestId("ledger-drift-run:betrayed")).toContainText(
			"/tmp/exfil.sh",
		);
		await expect(page.getByTestId("ledger-verdict-run:betrayed")).toContainText(
			/not auditable|non auditable/i,
		);

		// the refusal count renders the AGENT_WRITE_ABOVE_WATERLINE code with its how-to-fix.
		const refusal = page.getByTestId(
			"ledger-refusal-AGENT_WRITE_ABOVE_WATERLINE",
		);
		await expect(refusal).toBeVisible();
		await expect(refusal).toContainText(/idea|idée|goal/i);
	});
});

/**
 * BA30 — the /agents « Signals » controls (run → signal gateway, identity-by-pattern).
 * reflects=BA30-runtosignal, test_kind=e2e, liveness=live.
 *
 *   Given the /agents Signals subsection
 *   When  I classify the declared runs into signals
 *   Then  failed/abnormal runs render their signal + hypothesis + kernel-refusal, an
 *         ordinary green run renders « no signal », and two distinct runs of the same
 *         failure pattern collapse into ONE recurring pattern (Recurrence climbs, gap I2).
 */
test.describe("BA30 — the /agents « Signals » controls (run → signal, identity-by-pattern)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("signals")).toBeVisible({ timeout: 5000 });
	});

	test("the signals control is present (action-capable, ui-completeness)", async ({
		page,
	}) => {
		await expect(page.getByTestId("signals-run")).toBeVisible();
	});

	test("failed/green-hollow runs signal with hypothesis + kernel-refusal; ordinary green = no signal; recurrence collapses by pattern (gap I1/I2)", async ({
		page,
	}) => {
		await page.getByTestId("signals-run").click();
		await expect(page.getByTestId("signals-result")).toBeVisible();

		// a still_red run signals (high severity) and carries an explicit HYPOTHESIS + the
		// proof the kernel still refuses (no truth declared — the wall holds).
		const thrash = page.getByTestId("signal-row-run:thrash-a");
		await expect(thrash).toHaveAttribute("data-signalled", "true");
		await expect(thrash).toHaveAttribute("data-severity", "high");
		await expect(
			page.getByTestId("signal-hypothesis-run:thrash-a"),
		).toContainText(/HYPOTH/i);
		await expect(
			page.getByTestId("signal-kernel-refused-run:thrash-a"),
		).toBeVisible();

		// an ordinary green run produces NO signal.
		const clean = page.getByTestId("signal-row-run:clean");
		await expect(clean).toHaveAttribute("data-signalled", "false");

		// IDENTITY-BY-PATTERN: the two distinct still_red runs (thrash-a, thrash-b) collapse
		// into ONE recurring pattern with count 2 — Recurrence climbs (gap I2).
		const recurrence = page.getByTestId(
			"signal-recurrence-still_red|AGENT_WRITE_ABOVE_WATERLINE|wall_thrash",
		);
		await expect(recurrence).toBeVisible();
		await expect(recurrence).toHaveAttribute("data-count", "2");
	});
});

/*
 * BA31 — the /agents « Learnings » controls (run → DRAFT idea on-ramp + provenance-verified apply).
 * reflects=BA31-incident-to-idea, test_kind=e2e, liveness=live.
 *
 *   Given the /agents Learnings subsection
 *   When  I derive ideas from the declared runs / forge an "admitted" proposal
 *   Then  a failed run surfaces as a recurring incident → a DRAFT idea (proposed, never applied)
 *         with its hypothesis + the kernel-refusal (the wall holds), an ordinary green run yields
 *         NO idea, two distinct runs of one mode collapse to ONE recurring incident (gap I2), and a
 *         FORGED Status:"admitted" with no admitting authority record is refused (gap J1).
 */
test.describe("BA31 — the /agents « Learnings » controls (run → DRAFT idea, provenance-verified apply)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("learnings")).toBeVisible({ timeout: 5000 });
	});

	test("the learnings + apply-gate controls are present (action-capable, ui-completeness)", async ({
		page,
	}) => {
		await expect(page.getByTestId("learnings-derive")).toBeVisible();
		await expect(page.getByTestId("apply-gate-forge")).toBeVisible();
		await expect(page.getByTestId("apply-gate-admit")).toBeVisible();
	});

	test("a failed run becomes a DRAFT idea (proposed, never applied) with hypothesis + kernel-refusal; ordinary green = no idea; recurrence collapses (gap I1/I2)", async ({
		page,
	}) => {
		await page.getByTestId("learnings-derive").click();
		await expect(page.getByTestId("learnings-result")).toBeVisible();

		// a still_red run becomes a DRAFT idea carrying an explicit HYPOTHESIS + the proof the
		// kernel STILL refuses the direct edge (no truth declared — the wall holds).
		const failRow = page.getByTestId("learning-row-run:learn-a");
		await expect(failRow).toHaveAttribute("data-signalled", "true");
		await expect(failRow).toHaveAttribute("data-idea-status", "draft");
		await expect(page.getByTestId("learning-draft-run:learn-a")).toBeVisible();
		await expect(
			page.getByTestId("learning-hypothesis-run:learn-a"),
		).toContainText(/HYPOTH/i);
		await expect(
			page.getByTestId("learning-kernel-refused-run:learn-a"),
		).toBeVisible();

		// an ordinary green run produces NO draft idea.
		const cleanRow = page.getByTestId("learning-row-run:learn-clean");
		await expect(cleanRow).toHaveAttribute("data-signalled", "false");

		// IDENTITY-BY-PATTERN: the two distinct still_red runs collapse into ONE recurring
		// incident with count 2 (the recurring "harden-the-harness" idea, gap I2).
		const recurrence = page.getByTestId(
			"learning-recurrence-still_red|AGENT_WRITE_ABOVE_WATERLINE|wall_thrash",
		);
		await expect(recurrence).toBeVisible();
		await expect(recurrence).toHaveAttribute("data-count", "2");
	});

	test("a FORGED Status:'admitted' with no admitting authority record is refused PROPOSAL_NOT_ADMITTED; a genuine admission applies (gap J1)", async ({
		page,
	}) => {
		// FORGE an "admitted" with no granted approver — the apply re-derives the verdict and refuses.
		await page.getByTestId("apply-gate-forge").click();
		const verdict = page.getByTestId("apply-gate-verdict");
		await expect(verdict).toBeVisible();
		await expect(verdict).toHaveAttribute("data-admitted", "false");
		await expect(page.getByTestId("apply-gate-refused")).toContainText(
			/PROPOSAL_NOT_ADMITTED/,
		);

		// a GENUINE admission (the required approver granted) applies — the verdict is re-derived.
		await page.getByTestId("apply-gate-admit").click();
		await expect(verdict).toHaveAttribute("data-admitted", "true");
	});
});

/**
 * HR05 Playwright e2e — the « Compression / économie » section of /agents.
 * mirror record: reflects=HR05-compression-economy, test_kind=e2e, cert_language=gherkin,
 *               liveness=alive, authority=above
 *
 * Scenario: the panel renders the per-run economy (tokens before/after) — action-capable
 *   Given the Workbench is running and I am on /agents
 *   Then the « Compression / économie » section is present
 *   When I click « Mesurer l'économie par run »
 *   Then one row per recorded run shows tokens BEFORE > AFTER (compression saves)
 *   And every row carries data-cap-raised="false" (the cap is never raised)
 *   And the aggregate total shows before > after with the savings
 *   And the report is verdict-invariant (the gate is unchanged by compression)
 */
test.describe("HR05 — /agents « Compression / économie » section", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("compression-economy")).toBeVisible({
			timeout: 5000,
		});
	});

	test("the section is present and action-capable (a measure control, not read-only)", async ({
		page,
	}) => {
		await expect(page.getByTestId("economy-measure")).toBeVisible();
		// read-only until the control executes (no headless capability).
		await expect(page.getByTestId("economy-report")).toHaveCount(0);
	});

	test("measuring renders tokens before/after PER run with savings + cap never raised", async ({
		page,
	}) => {
		await page.getByTestId("economy-measure").click();

		const report = page.getByTestId("economy-report");
		await expect(report).toBeVisible();
		// verdict-invariant across all runs (the gate is unchanged by compression).
		await expect(report).toHaveAttribute("data-all-invariant", "true");

		// each recorded run is a row: before > after, and the cap is never raised.
		for (const id of ["run:checkout", "run:promo"]) {
			const row = page.getByTestId(`economy-row-${id}`);
			await expect(row).toBeVisible();
			await expect(row).toHaveAttribute("data-cap-raised", "false");
			const before = Number(await row.getAttribute("data-before"));
			const after = Number(await row.getAttribute("data-after"));
			expect(before).toBeGreaterThan(after);
		}

		// the aggregate: total before > total after.
		const total = page.getByTestId("economy-total");
		await expect(total).toBeVisible();
		const tBefore = Number(await total.getAttribute("data-total-before"));
		const tAfter = Number(await total.getAttribute("data-total-after"));
		expect(tBefore).toBeGreaterThan(tAfter);
		await expect(page.getByTestId("economy-cap-never-raised")).toBeVisible();
	});
});

/**
 * CE05 Playwright e2e — the « Compounding » section on /agents (the capitalisation loop CLOSES).
 * mirror record: reflects=CE05-reuse-router, test_kind=e2e, cert_language=gherkin,
 *               liveness=alive, authority=above
 *
 * Scenario: A subsequent similar goal reuses what an earlier goal capitalised
 *   Given the Workbench is running and I am on /agents
 *   When I click « Router le goal suivant (similaire) »
 *   Then the capitalisation history renders 9 routed units (5 procedural recall + 3 behavior expand + 1 fresh)
 *   And the effort drops (effort-after < effort-before, tokens saved > 0)
 *   And a behavior-reuse unit is marked « via le mur » and the wall note carries data-wrote-kernel=false
 *   When I click the dissimilar control
 *   Then nothing is reused (no-drop badge, effort unchanged)
 */
test.describe("CE05 — the « Compounding » section (reuse router)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/agents");
		await expect(page.getByTestId("compounding-section")).toBeVisible({
			timeout: 5000,
		});
	});

	test("a SIMILAR next goal reuses captured units and effort drops", async ({
		page,
	}) => {
		await page.getByTestId("compounding-run-similar").click();
		const verdict = page.getByTestId("compounding-verdict");
		await expect(verdict).toBeVisible();
		await expect(verdict).toHaveAttribute("data-mode", "similar");
		await expect(verdict).toHaveAttribute("data-reused", "8");

		// Effort dropped: after < before, tokens saved.
		const before = Number(await verdict.getAttribute("data-effort-before"));
		const after = Number(await verdict.getAttribute("data-effort-after"));
		expect(after).toBeLessThan(before);
		const saved = Number(await verdict.getAttribute("data-saved"));
		expect(saved).toBeGreaterThan(0);

		// The capitalisation history renders 9 routed units.
		const routes = page.getByTestId("compounding-routes").locator("li");
		await expect(routes).toHaveCount(9);

		// The drop badge is visible; the intrinsic unit derives fresh.
		await expect(page.getByTestId("compounding-drop-badge")).toBeVisible();
		await expect(
			page.getByTestId("compounding-route-invoice_specific_rule"),
		).toHaveAttribute("data-origin", "derived_fresh");
		await expect(
			page.getByTestId("compounding-route-load_context_pack"),
		).toHaveAttribute("data-origin", "reused_procedural");
	});

	test("a behavior reuse is « via le mur » and the router writes no kernel truth", async ({
		page,
	}) => {
		await page.getByTestId("compounding-run-similar").click();
		// A captured behavior unit carries the via-le-mur badge.
		await expect(
			page.getByTestId("compounding-viawall-derive_mirror"),
		).toBeVisible();
		// The wall note proves no kernel write.
		await expect(page.getByTestId("compounding-wall-note")).toHaveAttribute(
			"data-wrote-kernel",
			"false",
		);
	});

	test("a DISSIMILAR next goal reuses nothing (anti-false-positive)", async ({
		page,
	}) => {
		await page.getByTestId("compounding-run-dissimilar").click();
		const verdict = page.getByTestId("compounding-verdict");
		await expect(verdict).toHaveAttribute("data-mode", "dissimilar");
		await expect(verdict).toHaveAttribute("data-reused", "0");
		await expect(verdict).toHaveAttribute("data-saved", "0");
		await expect(page.getByTestId("compounding-nodrop-badge")).toBeVisible();
	});
});
