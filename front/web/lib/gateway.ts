/**
 * gateway.ts — the deterministic TS twin of back/runtime/gateway (S58).
 *
 * S58 is the MCP-over-HTTP PASSERELLE: one project-scoped HTTP front door over EVERY
 * existing AIDOS MCP tool (store · mirror-runner · changeset · dag · idea-intake ·
 * memory · context · evolve · backtester · telemetry-reader · pact-verifier ·
 * mutation-runner · project). THE WALL IS APPLIED SERVER-SIDE (CLAUDE.md §2): a
 * below-the-line call routes; a cross-project / forged-identity call is refused with
 * AGENT_CROSS_PROJECT_WRITE (the same predicate the RLS enforces, S55); a truth-zone
 * write is refused with GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET (truth moves only via a
 * ChangeSet).
 *
 * This module mirrors the Go router BYTE-FOR-BYTE: the dispositions, the closed
 * registry, the outcome order (scope FIRST, then truth-write), and the block codes.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): "pur routage, zéro LLM". route() is pure, same
 * input → same decision (pinned by the Vitest+fast-check twin lib/gateway.test.ts). The
 * Go package is authoritative; this twin must match it.
 */

import {
	type CODE_AGENT_CROSS_PROJECT_WRITE,
	classify,
	type Scope,
	type Target,
} from "./projectWall";

export type Disposition = "below_line" | "truth_write";

export type Outcome =
	| "route"
	| "refused_scope"
	| "refused_truth_write"
	| "unknown_tool";

export const CODE_TRUTH_WRITE_NEEDS_CHANGESET =
	"GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET" as const;
export const CODE_UNKNOWN_TOOL = "GATEWAY_UNKNOWN_TOOL" as const;

export type GatewayBlockCode =
	| typeof CODE_AGENT_CROSS_PROJECT_WRITE
	| typeof CODE_TRUTH_WRITE_NEEDS_CHANGESET
	| typeof CODE_UNKNOWN_TOOL;

export interface GatewayBlockReason {
	code: GatewayBlockCode;
	severity: "error";
	explanation: string;
	howToFix: string[];
}

export interface Tool {
	name: string;
	server: string;
	disposition: Disposition;
}

export interface RouteDecision {
	outcome: Outcome;
	tool?: Tool;
	blockReason?: GatewayBlockReason;
}

/** The 34 MCP servers the gateway fronts — byte-identical to Go GatewayServers(). */
export const GATEWAY_SERVERS: readonly string[] = [
	"store",
	"mirror-runner",
	"changeset",
	"dag",
	"idea-intake",
	"memory",
	"context",
	"evolve",
	"backtester",
	"telemetry-reader",
	"pact-verifier",
	"mutation-runner",
	"project",
	// 14th — `provision` — ACTIVATED at DP13: the DP13 stack/bootstrap/profile tools
	// (re-emit/project/resolve over the StackManifest AST + the observed host state).
	"provision",
	// 16th — `why-tree` — the FK13 /why read server (ADR 0092 kill-twins batch): the
	// dispatched, dep-free graph-walk `build` (+ serialize/kinds) is the LIVE path for the
	// /why-tree panel; the TS twin (lib/why-tree.build) becomes the demo fallback only.
	"why-tree",
	// 17th — `goal-piloting` — the S66 UI-piloted /goal read server (ADR 0092 kill-twins
	// batch): the dispatched, dep-free `goal_pilot_open` (+ goal_pilot_close /
	// goal_live_red_set) is the LIVE path for the /goal-piloting panel; the TS twin
	// (lib/goal-piloting.pilotOpenGoal / liveRedSet) becomes the demo fallback only.
	"goal-piloting",
	// 18th — `federation` — the S103/§51 cross-cell composition read server (ADR 0092 kill-twins
	// batch): the dispatched, dep-free `fan_out` (+ saga_over_cells / temporal_over_cells) is the
	// LIVE path for the /federation-cockpit panel's red-wave overlay; the TS twin (the wave hard-
	// coded in lib/federation-cockpit) becomes the demo fallback only (lib/federation-cockpit-data).
	"federation",
	// 19th — `learn` — the S107/E12 /learn loop-closure read server (ADR 0092 kill-twins
	// batch): the dispatched, dep-free bump_hash/targeted_wave/close_loop (READ-ONLY on the
	// kernel, WroteKernel always false) is the LIVE path for the /learn panel; the TS twin
	// (lib/learn closeLoop) becomes the demo fallback only (lib/learn-data).
	"learn",
	// 20th — `conscience` — the FK09 /conscience read server (ADR 0092 kill-twins batch): the
	// dispatched, dep-free reconcile/decision_cards (aggregate over sourced verdicts, READ-ONLY)
	// is the LIVE path for the /conscience panel; the TS twin (lib/conscience.reconcile) becomes
	// the demo fallback only (lib/conscience-data).
	"conscience",
	// 21st — `arch-fitness` — the S102 ratchet read server (ADR 0092 kill-twins batch): the
	// dispatched, dep-free measure/ratchet/gate (graph analysis, READ-ONLY) is the LIVE path for
	// the /arch-fitness panel; the TS twin (lib/arch-fitness.measure) becomes the demo fallback
	// only (lib/arch-fitness-data). Without this entry route(measure)→unknown_tool→demo (the flip
	// would be hollow — the cliquet's readVia-frontier blind spot).
	"arch-fitness",
	// 22nd — `build-loop` — the S83 build-loop + circuit-breaker read server (ADR 0092 kill-twins
	// batch-2): the dispatched, dep-free buildloop_terminate (+ buildloop_no_progress /
	// buildloop_verdicts), a PURE function of the run's Stop input + iteration history + declared
	// HarnessCostBudget, is the LIVE path for the /build-loop console's termination Decision; the
	// TS twin (lib/build-loop.terminate) becomes the demo fallback only (lib/build-loop-data).
	// Without this entry route(buildloop_terminate)→unknown_tool→demo (the flip would be hollow —
	// the cliquet's readVia-frontier blind spot).
	"build-loop",
	// 23rd — `cost-meter` — the S111 per-cell harness COST METER read server (ADR 0092 kill-twins
	// batch-2): the dispatched, dep-free cost_meter_cell (+ cost_disjoncteur_signal /
	// cost_validate_budget), a PURE function of the cell's REAL recorded AgentRuns (S52) + its
	// DECLARED HarnessCostBudget, is the LIVE path for the /cost-meter cockpit's §66.3 verdict +
	// the S83 disjoncteur signal; the TS twin (lib/cost-meter.meterCell / disjoncteurSignal)
	// becomes the demo fallback only (lib/cost-meter-data). Without this entry
	// route(cost_meter_cell)→unknown_tool→demo (the flip would be hollow — the cliquet's
	// readVia-frontier blind spot).
	"cost-meter",
	// 24th — `behaviors` — the S79 project-scoped behavior LIBRARY read server (ADR 0092 kill-twins
	// batch-2): the dispatched, dep-free behaviors_browse/search/tag/publish/soft_delete/comment/
	// attach (PURE over the materialised library state, WroteKernel always false) is the LIVE path
	// for the /behaviors panel's SEARCH read; the TS twin (lib/behaviors.search) becomes the demo
	// fallback only (lib/behaviors-data). Without this entry route(behaviors_search)→unknown_tool→
	// demo (the flip would be hollow — the cliquet's readVia-frontier blind spot).
	"behaviors",
	// 25th — `kernel-garden` — the S112/§82.4 per-project KernelDebt + /trim read server (ADR 0092
	// kill-twins batch-2): the dispatched, dep-free garden_tend_project (the FIVE-rot ranked debt)
	// + garden_suggest_trim (the open_idea_* trim plan) + garden_accept_proposal (the OpenIdea
	// projection) are the LIVE path for the /kernel-debt garden section; the TS twin
	// (lib/kernel-garden tend/suggestGardenTrim) becomes the demo fallback only
	// (lib/kernel-garden-data). Without this entry route(garden_tend_project)→unknown_tool→demo
	// (the flip would be hollow — the cliquet's readVia-frontier blind spot).
	"kernel-garden",
	// 26th — `autonomy` — the FK10 A0..A8 autonomy ladder read server (ADR 0092 kill-twins
	// batch-2): the dispatched, dep-free enforce/promote — fail-closed enforcement of a declared
	// level against an attempted action (required>declared REFUSED, a critical action never admits
	// A8) + the PURE promotion-from-history (the level is COMPUTED from the record, never declared,
	// §8; READ-ONLY, WroteKernel always false) — is the LIVE path for the /autonomy panel's verdict
	// + proposed level; the TS twin (lib/autonomy enforce / promotionFromHistory) becomes the demo
	// fallback only (lib/autonomy-data). Without this entry route(enforce)→unknown_tool→demo (the
	// flip would be hollow — the cliquet's readVia-frontier blind spot).
	"autonomy",
	// 27th — `build-console` — the S86 live build-console + per-project stable-phase read server
	// (ADR 0092 kill-twins batch-2): the dispatched, dep-free buildconsole_project (the FAITHFUL
	// projection of a recorded AgentRun + loop + cost + approval inbox) + buildconsole_record_stable_phase
	// (the §43 coherent-cut verdict returning the per-project DAG node) — both PURE values, READ-ONLY —
	// are the LIVE path for the /build-console panel; the TS twin (lib/build-console.project /
	// recordStablePhase) becomes the demo fallback only (lib/build-console-data). Without this entry
	// route(buildconsole_project)→unknown_tool→demo (the flip would be hollow — the cliquet's
	// readVia-frontier blind spot).
	"build-console",
	// ── ADR 0092 batch-3 servers (the Go engine is the SINGLE live source). ──
	// 28th — `billing` — the S114 customer-facing economic plane read server: the dispatched,
	// dep-free billing_plans/meter/meter_project/check_quota (the closed plan ladder + the COUNTED
	// usage fold over the REAL AgentRun ledger + the quota verdict, a COUNT never an estimate never
	// an LLM) + ingest_webhook (the idempotent S73 inbound async op) + pact_verify (the read-only
	// Pact check) — ALL BELOW THE LINE (runtime/commercial rows, WroteKernel always false) — is the
	// LIVE path for the /billing panel; the TS twin (lib/billing.ts) becomes the demo fallback only.
	// Without this entry route(billing_meter) resolves to unknown_tool then demo (a hollow flip).
	"billing",
	// 29th — `dsl-editor` — the S77 typed-DSL editors read server: the dispatched, dep-free
	// dsl_kinds/dsl_parse/dsl_propose (PURE — dsl_propose returns a DRAFT ChangeSet VALUE, never
	// applies; there is no apply tool, freezing the edited source stays /goal; WroteKernel always
	// false) is the LIVE path for the /dsl-editor panel; the TS twin (lib/dsl-editor.ts) becomes the
	// demo fallback only. The Go server wraps Body/Canonical as OBJECT schemas (the S59 RawMessage
	// scar guard). Without this entry route(dsl_parse) resolves to unknown_tool then demo (hollow).
	"dsl-editor",
	// 30th — `templates` — the S81 curated starter catalogue read server: the dispatched, dep-free
	// templates_list/get (read the content-addressed bundles) + templates_instantiate/fork (DRY-RUN
	// duplicate-from-template / fork-at-phase, WroteKernel always false — landing the bundle's truths
	// rides templates.Propose through the changeset door, never these read tools) is the LIVE path for
	// the /templates panel; the TS twin (lib/templates.ts) becomes the demo fallback only. Without
	// this entry route(templates_instantiate) resolves to unknown_tool then demo (a hollow flip).
	"templates",
	// ── ADR 0092 batch-4A servers (the Go engine is the SINGLE live source). ──
	// 31st — `besoin-intake` (EL15) — the SINGLE capability door over the BesoinGraph (the NEED store
	// ABOVE the wall, §2 — DISTINCT from the truth-store). The ONLY DSN-backed batch-4A server: its
	// `besoin` Store is RLS-scoped to `project` (the SET LOCAL `aidos.project` GUC, S55 — project A's rows
	// are invisible to a B-scoped session), the IdeaStore reuses the `ideas` schema (EL05). The read/
	// validate tools are pure projections; the capture/emit tools append a DRAFT idea (WroteKernel always
	// false). The dispatched besoin_graph_state/level_schema/list/capture_*/validate_level/classify/
	// emit_ideas/red_backlog/capitalise are the LIVE path for the /besoin-intake panel; the TS twin
	// (lib/besoin-intake.ts) becomes the demo fallback only (lib/besoin-intake-data). Without this entry
	// route(besoin_graph_state)→unknown_tool→demo (the flip would be hollow — the cliquet's blind spot).
	"besoin-intake",
	// 32nd — `self-cert` (S84) — the build-loop self-certification battery read server: the dispatched,
	// dep-free selfcert_certify/gate/kinds (PURE folds of a per-sensor verdict set — the judge is the
	// deterministic mirror, never the LLM; a missing sensor is RED, anti-passthrough; WroteKernel always
	// false) is the LIVE path for the /self-cert panel; the TS twin (lib/self-cert.ts) becomes the demo
	// fallback only (lib/self-cert-data). Without this entry route(selfcert_certify)→unknown_tool→demo.
	"self-cert",
	// 33rd — `app-auth` (S80) — the emitted app's auth & roles behavior-macro read server: the dispatched,
	// dep-free app_auth_expand/check_access/attach (check_access is a PURE role→operation lookup NEVER an
	// LLM; attach PREVIEWS or LANDS via an APPROVED ChangeSet — WroteKernel always false, the wall: propose
	// → approve) is the LIVE path for the /app-auth panel; the TS twin (lib/app-auth.ts) becomes the demo
	// fallback only (lib/app-auth-data). Without this entry route(app_auth_check_access)→unknown_tool→demo.
	"app-auth",
	// 34th — `workspace` (S82) — the isolated per-project sandbox read server: the dispatched, dep-free
	// workspace_provision/can_access/check_resources/build_hello (PURE — provisioning is a DRY-RUN
	// descriptor WroteKernel always false; can_access refuses a path under another project or the
	// truth-store with SANDBOX_ESCAPE) is the LIVE path for the /workspace panel; the TS twin
	// (lib/workspace.ts) becomes the demo fallback only (lib/workspace-data). Without this entry
	// route(workspace_can_access)→unknown_tool→demo (the flip would be hollow — the cliquet's blind spot).
	"workspace",
];

/** defaultTools mirrors Go DefaultTools() — the closed exposed surface. */
export function defaultTools(): Tool[] {
	const below = (server: string, names: string[]): Tool[] =>
		names.map((name) => ({ name, server, disposition: "below_line" as const }));
	return [
		...below("store", [
			"store_put",
			"store_get",
			"store_set_head",
			"store_get_head",
			"store_history",
		]),
		...below("mirror-runner", ["mirror_replay", "ratchet_check"]),
		...below("changeset", [
			"changeset_open",
			"changeset_apply",
			"changeset_revert",
			"changeset_discard",
			"changeset_status",
			"changeset_list",
		]),
		...below("dag", [
			"dag_branch",
			"dag_checkout_ancestor",
			"dag_rebranch",
			"dag_heads",
			"dag_ancestors",
			"dag_get",
		]),
		...below("idea-intake", [
			"idea_capture",
			"idea_grill",
			"idea_spike",
			"idea_harvest",
			"idea_reject",
			"idea_status",
			"idea_list",
			"convert_to_markdown",
		]),
		...below("memory", ["memory_write", "memory_recall", "memory_get"]),
		...below("context", [
			"context_compile",
			"context_pack_get",
			"context_graph_query",
		]),
		...below("evolve", [
			"evolve_run",
			"evolve_confine",
			"evolve_propose_promotion",
			"evolve_run_get",
			"evolve_run_list",
		]),
		...below("backtester", ["backtest_out_of_sample", "backtest_get"]),
		...below("telemetry-reader", [
			"telemetry_query",
			"incident_observe",
			"incident_list",
			"incident_learn",
		]),
		...below("pact-verifier", ["pact_verify"]),
		...below("mutation-runner", ["run_mutation", "read_threshold"]),
		...below("project", [
			"project_create",
			"project_list",
			"project_get",
			"project_archive",
			"project_restore",
			"project_delete",
			"project_duplicate",
			"project_branch",
			"project_rebranch",
			"project_checkout_ancestor",
			"project_merge_guard",
			"project_genesis",
		]),
		// 14. provision — the DP13 STACK / BOOTSTRAP / PROFILE tools + the S89 datastore
		// planner. All BELOW THE LINE: they re-emit/project/resolve over the StackManifest
		// AST + the observed host state, writing no truth (the engrave door is fenced below).
		...below("provision", [
			"plan",
			"images",
			"stack.emit",
			"stack.select_profile",
			"stack.bootstrap",
			"stack.resolve_ports",
			"stack.print_urls",
		]),
		// 16. why-tree — FK13 /why (the 5-whys redressed): build a content-addressed WhyTree
		// from a red symptom, serialize it to its kernel.link body, read the link-kind
		// discriminator. ALL BELOW THE LINE: three PURE graph-walks whose output is a VALUE
		// (a tree / a record / a discriminator); freezing the terminal mirror is /goal, never
		// these tools (WroteKernel always false — the wall). Byte-faithful to the Go registry
		// (back/runtime/gateway/registry.go:97).
		...below("why-tree", ["build", "serialize", "kinds"]),
		// 17. goal-piloting — S66 the UI-piloted /goal: open a goal (a DRAFT ChangeSet PROPOSAL
		// by id/status + the LIVE red set), the NON-GAMEABLE close gate (closeable? — red→green
		// ∧ prior intact ∧ mutation ≥ floor ∧ no monster), the LIVE red-set worklist in stable
		// sorted order. ALL BELOW THE LINE: each tool returns a VALUE (a proposal / a verdict /
		// a sorted list) — opening a goal PROPOSES a DRAFT ChangeSet (it never APPLIES it) and
		// closing never stamps CLOSED (the wall; WroteKernel always false). Byte-faithful to the
		// Go registry (back/runtime/gateway/registry.go:103).
		...below("goal-piloting", [
			"goal_pilot_open",
			"goal_pilot_close",
			"goal_live_red_set",
		]),
		// 18. federation — S103/§51 cross-cell composition: run the canonical saga over two real
		// contracted cells (saga_over_cells), fan a global policy out to a RedWorkQueue per cell
		// (fan_out), evaluate a temporal deadline across cells (temporal_over_cells). ALL BELOW THE
		// LINE: three PURE compositions returning the per-cell waves as VALUES — the actual INSERT
		// into runtime.red_work_queue is the S22 hook's job below the waterline, never these tools
		// (writes nothing — the wall; WroteKernel always false). Byte-faithful to the Go registry
		// (back/runtime/gateway/registry.go:109).
		...below("federation", [
			"saga_over_cells",
			"fan_out",
			"temporal_over_cells",
		]),
		// 19. learn — S107/E12 /learn loop-closure: the hash bump an approved mirror causes on
		// its operation/policy target (bump_hash), the targeted red wave it seeds (targeted_wave),
		// the full incident→wave loop (close_loop). ALL BELOW THE LINE: READ-ONLY on the kernel —
		// every tool's WroteKernel is false; the loop never authors the approved mirror (the human's
		// /goal does) and the direct Reality→Kernel edge is always refused (the wall). The
		// dispatch-safe Target carries spec_body as an object (the S59 RawMessage-scar guard lives
		// in learnsrv). Byte-faithful to the Go registry (back/runtime/gateway/registry.go:116).
		...below("learn", ["bump_hash", "targeted_wave", "close_loop"]),
		// `conscience` (FK09) — reconcile/decision_cards aggregate sourced verdicts (READ-ONLY,
		// no kernel write). The LIVE path for the /conscience panel; mirrors the Go registry.
		...below("conscience", ["reconcile", "decision_cards"]),
		// `arch-fitness` (S102) — measure/ratchet/gate are READ-ONLY graph analysis (no write).
		// The LIVE path for the /arch-fitness panel; without it route(measure)→unknown_tool→demo.
		...below("arch-fitness", ["measure", "ratchet", "gate"]),
		// `build-loop` (S83) — buildloop_terminate/buildloop_no_progress/buildloop_verdicts are
		// PURE functions of the run history + Stop input + declared budget (READ-ONLY, no write).
		// The LIVE path for the /build-loop console; without it
		// route(buildloop_terminate)→unknown_tool→demo (the flip would be hollow).
		...below("build-loop", [
			"buildloop_terminate",
			"buildloop_no_progress",
			"buildloop_verdicts",
		]),
		// `cost-meter` (S111) — cost_meter_cell/cost_disjoncteur_signal/cost_validate_budget are
		// PURE functions of the cell's REAL recorded AgentRuns (S52) + its DECLARED HarnessCostBudget
		// (READ-ONLY, no write — the budget is above-the-line, SELECT-only). The LIVE path for the
		// /cost-meter cockpit; without it route(cost_meter_cell)→unknown_tool→demo (the flip would be
		// hollow — the cliquet's readVia-frontier blind spot).
		...below("cost-meter", [
			"cost_meter_cell",
			"cost_disjoncteur_signal",
			"cost_validate_budget",
		]),
		// `behaviors` (S79) — browse/search/tag/publish/soft_delete/comment/attach are PURE functions
		// of the materialised project library state (READ-ONLY on truth: WroteKernel always false;
		// attach only COMPUTES the APPLIED ChangeSet envelope VALUE — the legal door propose → approve,
		// never a direct kernel write). The LIVE path for the /behaviors panel's SEARCH read; without
		// it route(behaviors_search)→unknown_tool→demo (the flip would be hollow — the cliquet's
		// readVia-frontier blind spot). Byte-faithful to the Go registry (registry.go:170).
		...below("behaviors", [
			"behaviors_browse",
			"behaviors_search",
			"behaviors_tag",
			"behaviors_publish",
			"behaviors_soft_delete",
			"behaviors_comment",
			"behaviors_attach",
		]),
		// `kernel-garden` (S112/§82.4) — garden_tend_project/garden_suggest_trim/garden_accept_proposal
		// are PURE functions of a project's read-only kernel ⋈ mirrors ⋈ mutation ⋈ declared budgets
		// (READ-ONLY, no write — /trim SUGGESTS, deletes_anything is ALWAYS false; the only door is
		// idea → mirror → /goal → human approval). The LIVE path for the /kernel-debt garden section;
		// without it route(garden_tend_project)→unknown_tool→demo (the flip would be hollow — the
		// cliquet's readVia-frontier blind spot). Byte-faithful to the Go registry (registry.go:156).
		...below("kernel-garden", [
			"garden_tend_project",
			"garden_suggest_trim",
			"garden_accept_proposal",
		]),
		// `autonomy` (FK10) — enforce/promote: the closed A0..A8 ladder, FAIL-CLOSED enforcement of a
		// declared level against an attempted action, and the PURE promotion-from-history. Both READ-
		// ONLY (no kernel write — freezing a promotion stays idea → mirror → /goal). The LIVE path for
		// the /autonomy panel; without it route(enforce)→unknown_tool→demo. Byte-faithful to the Go
		// registry (registry.go:162).
		...below("autonomy", ["enforce", "promote"]),
		// `build-console` (S86) — buildconsole_project/buildconsole_record_stable_phase: the FAITHFUL
		// projection of a recorded AgentRun + loop + cost + approval inbox, and the §43 coherent-cut
		// verdict returning the per-project DAG node. Both PURE values, READ-ONLY (no write — the
		// console projects records that already exist; recording a DAG node rides the privileged aidos
		// writer; an inconsistent cut is refused with no node born from a red mirror). The LIVE path
		// for the /build-console panel; without it route(buildconsole_project)→unknown_tool→demo (the
		// flip would be hollow — the cliquet's readVia-frontier blind spot). Byte-faithful to the Go
		// registry (registry.go:145).
		...below("build-console", [
			"buildconsole_project",
			"buildconsole_record_stable_phase",
		]),
		// `billing` (S114) — plans/meter/meter_project/check_quota are PURE READS (the closed plan
		// ladder + the COUNTED usage fold over the REAL AgentRun ledger + the quota verdict, a COUNT
		// never an estimate never an LLM); ingest_webhook is the idempotent S73 inbound async op;
		// pact_verify the read-only Pact check. ALL BELOW THE LINE (runtime/commercial rows, no
		// kernel/mirrors/fitness write — a plan/limit is DECLARED data, §8; WroteKernel always false).
		// The LIVE path for the /billing panel; without it route(billing_meter)→unknown_tool→demo (the
		// flip would be hollow). Byte-faithful to the Go registry (registry.go:billing).
		...below("billing", [
			"billing_plans",
			"billing_meter",
			"billing_meter_project",
			"billing_check_quota",
			"billing_ingest_webhook",
			"billing_pact_verify",
		]),
		// `dsl-editor` (S77) — dsl_kinds/dsl_parse/dsl_propose: the typed editors over the four
		// behaviour DSLs. PURE; dsl_propose returns a DRAFT ChangeSet VALUE (never applies — there is
		// no apply tool, freezing the edited source stays /goal; WroteKernel always false). The Go
		// server wraps Body/Canonical as OBJECT schemas (the S59 RawMessage scar guard). The LIVE path
		// for the /dsl-editor panel; without it route(dsl_parse)→unknown_tool→demo (the flip would be
		// hollow). Byte-faithful to the Go registry (registry.go:dsl-editor).
		...below("dsl-editor", ["dsl_kinds", "dsl_parse", "dsl_propose"]),
		// `templates` (S81) — templates_list/get (read the content-addressed bundles) +
		// templates_instantiate/fork (DRY-RUN duplicate-from-template / fork-at-phase). ALL BELOW THE
		// LINE: every tool PURE, instantiate/fork are dry-run VALUES (WroteKernel always false; landing
		// the bundle's truths rides templates.Propose through the changeset door, never these read
		// tools). The LIVE path for the /templates panel; without it
		// route(templates_instantiate)→unknown_tool→demo (the flip would be hollow). Byte-faithful to
		// the Go registry (registry.go:templates).
		...below("templates", [
			"templates_list",
			"templates_get",
			"templates_instantiate",
			"templates_fork",
		]),
		// ── ADR 0092 batch-4A servers (the Go engine is the SINGLE live source). ──
		// `besoin-intake` (EL15) — the SINGLE capability door over the BesoinGraph (the NEED store ABOVE the
		// wall, §2). The read/validate tools are pure projections; the capture/emit tools append a DRAFT idea
		// via the legal idea_capture door (EL05/EL16) — WroteKernel always false (a kernel write is refused by
		// GRANT; the besoin Store is RLS-scoped to `project`, S55). The body fields are an OBJECT (map), NOT a
		// json.RawMessage byte-array, so the real HTTP args:{object} payload survives the round-trip (the S59
		// scar avoided). Byte-faithful to the Go registry (registry.go:besoin-intake). The LIVE path for the
		// /besoin-intake panel; without it route(besoin_graph_state)→unknown_tool→demo (a hollow flip).
		...below("besoin-intake", [
			"besoin_graph_state",
			"besoin_level_schema",
			"besoin_list",
			"besoin_capture_product",
			"besoin_capture_journey",
			"besoin_capture_view",
			"besoin_capture_control",
			"besoin_capture_action",
			"besoin_capture_operation",
			"besoin_capture_entity",
			"besoin_capture_invariant",
			"besoin_validate_level",
			"besoin_classify",
			"besoin_emit_ideas",
			"besoin_red_backlog",
			"besoin_capitalise",
		]),
		// `self-cert` (S84) — selfcert_certify/gate/kinds: the deterministic SENSOR BATTERY that gates every
		// diff the build-loop takes. PURE folds (the judge is the mirror, never the LLM; a missing sensor is
		// RED — anti-passthrough; WroteKernel always false). The LIVE path for the /self-cert panel; without
		// it route(selfcert_certify)→unknown_tool→demo. Byte-faithful to the Go registry (registry.go:self-cert).
		...below("self-cert", [
			"selfcert_certify",
			"selfcert_gate",
			"selfcert_kinds",
		]),
		// `app-auth` (S80) — app_auth_expand/check_access/attach: the emitted app's auth & roles subsystem.
		// check_access is a PURE role→operation lookup (NEVER an LLM); attach PREVIEWS or LANDS via an APPROVED
		// ChangeSet (the wall: propose → approve — WroteKernel always false). The LIVE path for the /app-auth
		// panel; without it route(app_auth_check_access)→unknown_tool→demo. Byte-faithful (registry.go:app-auth).
		...below("app-auth", [
			"app_auth_expand",
			"app_auth_check_access",
			"app_auth_attach",
		]),
		// `workspace` (S82) — workspace_provision/can_access/check_resources/build_hello: the isolated
		// per-project sandbox. PURE — provisioning is a DRY-RUN descriptor (WroteKernel always false);
		// can_access refuses a path under another project or the truth-store with SANDBOX_ESCAPE (the
		// truth-store is OUTSIDE every workspace root, the wall). The LIVE path for the /workspace panel;
		// without it route(workspace_can_access)→unknown_tool→demo. Byte-faithful (registry.go:workspace).
		...below("workspace", [
			"workspace_provision",
			"workspace_can_access",
			"workspace_check_resources",
			"workspace_build_hello",
		]),
		// The fenced truth-zone write namespace (§2) — refused with a ChangeSet hint.
		{ name: "kernel_write", server: "kernel", disposition: "truth_write" },
		{ name: "mirror_write", server: "mirrors", disposition: "truth_write" },
		{ name: "fitness_write", server: "fitness", disposition: "truth_write" },
		// `stack.engrave_manifest` (DP13): a StackManifest is above-the-line truth — a
		// direct write is refused at the edge (truth moves only via a ChangeSet).
		{
			name: "stack.engrave_manifest",
			server: "provision",
			disposition: "truth_write",
		},
	];
}

const REGISTRY: Map<string, Tool> = new Map(
	defaultTools().map((t) => [t.name, t]),
);

/** lookup mirrors Go Registry.Lookup. */
export function lookup(name: string): Tool | undefined {
	return REGISTRY.get(name.trim());
}

/** tools mirrors Go Registry.Tools — sorted by server then name. */
export function tools(): Tool[] {
	return [...REGISTRY.values()].sort((a, b) =>
		a.server !== b.server
			? a.server.localeCompare(b.server)
			: a.name.localeCompare(b.name),
	);
}

function unknownToolReason(name: string): GatewayBlockReason {
	return {
		code: CODE_UNKNOWN_TOOL,
		severity: "error",
		explanation:
			`Refus de la passerelle : l'outil « ${name.trim()} » n'est pas exposé. ` +
			"La passerelle n'expose qu'un registre FERMÉ d'outils MCP — jamais un passthrough arbitraire.",
		howToFix: [
			"Vérifiez le nom de l'outil — la liste exposée est consultable via gateway_tools.",
			"Un nouvel outil s'ajoute au registre côté serveur (DefaultTools), jamais par appel.",
		],
	};
}

function truthWriteReason(t: Tool): GatewayBlockReason {
	return {
		code: CODE_TRUTH_WRITE_NEEDS_CHANGESET,
		severity: "error",
		explanation:
			`Refus de la passerelle : l'outil « ${t.name} » (serveur ${t.server}) écrirait de la VÉRITÉ ` +
			"au-dessus de la ligne. La vérité ne bouge QUE par un ChangeSet (idée → miroir → /goal → approbation, " +
			"CLAUDE.md §2) — jamais par une écriture directe à la passerelle.",
		howToFix: [
			"Ouvrez une idée (idea_capture), dérivez son miroir, ouvrez un /goal.",
			"Empaquetez le delta de vérité dans un ChangeSet (changeset_open) ; appliquez-le par la porte changeset_apply.",
			"La passerelle laisse passer les opérations below-the-line ; elle n'est jamais la porte de la vérité.",
		],
	};
}

/**
 * route mirrors Go Registry.Route exactly. Pure and total. Order IS the wall:
 *  1. unknown tool      → unknown_tool;
 *  2. cross-project /   → refused_scope (AGENT_CROSS_PROJECT_WRITE);
 *  3. truth-write       → refused_truth_write (GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET);
 *  4. below-the-line    → route.
 */
export function route(
	scope: Scope,
	toolName: string,
	target: Target,
): RouteDecision {
	const tool = lookup(toolName);
	if (!tool) {
		return {
			outcome: "unknown_tool",
			blockReason: unknownToolReason(toolName),
		};
	}
	const scopeDecision = classify(scope, target);
	if (scopeDecision.verdict === "deny" && scopeDecision.blockReason) {
		return {
			outcome: "refused_scope",
			blockReason: {
				code: scopeDecision.blockReason.code,
				severity: "error",
				explanation: scopeDecision.blockReason.explanation,
				howToFix: scopeDecision.blockReason.howToFix,
			},
		};
	}
	if (tool.disposition === "truth_write") {
		return {
			outcome: "refused_truth_write",
			blockReason: truthWriteReason(tool),
		};
	}
	return { outcome: "route", tool };
}
