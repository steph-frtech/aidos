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

/** The 14 MCP servers the gateway fronts — byte-identical to Go GatewayServers(). */
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
