/**
 * Fixture data for the /agents Workbench panel (S52) — the materialized projection of
 * the governance fixture (tests/kernel/agent-layer-governance.fixture.md). Read-only
 * render data; the panel runs the pure lib/agentlayer functions over it. The agent
 * reads the SELECT-grant role (kernel.agent_layer); it never writes the kernel.
 */

import type { CoucheAgent } from "./agentlayer";
import type { AgentAction, AgentRun } from "./agentrun";

/** The canonical "bdd-writer" CoucheAgent of the fixture. */
export const BDD_WRITER: CoucheAgent = {
	kind: "agent",
	spec: {
		id: "bdd-writer",
		nom: "bdd-writer",
		role: "bdd-writer",
		objectif: "propose red scenarios",
		modele: "claude-fable-5",
		provider: "anthropic",
		peutProposerVerite: true,
		peutModifierNoyau: false,
		peutModifierMiroir: true,
		peutModifierFitness: false,
		zonesLecture: ["kernel", "mirrors", "ideas", "brain"],
		zonesEcriture: ["ideas"],
		stopConditions: ["red set still red"],
		// BA01 — governed knobs. The bdd-writer is MAX-confined: no egress, no exec.
		temperature: 0.2,
		maxTurns: 40,
		seed: "",
		allowedNetworkHosts: [],
		allowedExec: [],
		resourceLimits: {
			maxMemoryMb: 2048,
			maxCpuMillis: 4000,
			maxWallSeconds: 600,
		},
		maxConcurrency: 1,
	},
	skills: [
		{ skillName: "write-bdd-scenario", enabled: true },
		{ skillName: "derive-mirror", enabled: true },
		// A DISABLED skill: governance declared it then turned it off. BA05 must DROP it
		// — the resolved surface is a strict subset (governance narrows, never widens).
		{ skillName: "evolve", enabled: false },
	],
	mcp: [
		{ server: "idea-intake", tool: "submit_idea", enabled: true },
		// A DISABLED MCP binding: it can NEVER appear in the resolved Tools[] (BA05).
		{ server: "changeset", tool: "apply_changeset", enabled: false },
	],
	hooks: [{ phase: "PreToolUse", hook: "pretooluse (wall)", mandatory: true }],
	approvers: ["product_owner"],
	domain: "checkout",
	scopeRegion: "EU",
};

/** A second card: an executor agent (no propose right) — shows the triad coverage. */
export const EXECUTOR: CoucheAgent = {
	kind: "agent",
	spec: {
		id: "executor",
		nom: "executor",
		role: "executor",
		objectif: "drive a red set to green",
		modele: "claude-fable-5",
		provider: "anthropic",
		peutProposerVerite: false,
		peutModifierNoyau: false,
		peutModifierMiroir: false,
		peutModifierFitness: false,
		zonesLecture: ["kernel", "mirrors"],
		zonesEcriture: ["back/gen", "runtime"],
		stopConditions: ["red set still red", "prior green broken"],
		// BA01 — governed knobs. The executor declares one egress host + go/git exec.
		temperature: 0,
		maxTurns: 80,
		seed: "",
		allowedNetworkHosts: ["api.anthropic.com"],
		allowedExec: ["go", "git"],
		resourceLimits: {
			maxMemoryMb: 4096,
			maxCpuMillis: 8000,
			maxWallSeconds: 1800,
		},
		maxConcurrency: 2,
	},
	skills: [{ skillName: "tdd", enabled: true }],
	mcp: [{ server: "mirror-runner", tool: "run_mirror", enabled: true }],
	hooks: [{ phase: "PreToolUse", hook: "pretooluse (wall)", mandatory: true }],
	approvers: ["architecture_board"],
	domain: "checkout",
	scopeRegion: "EU",
};

export const AGENTS: CoucheAgent[] = [BDD_WRITER, EXECUTOR];

/** A recent AgentRun — the actions include an ABOVE-waterline write (refused, red). */
export const RECENT_ACTIONS: AgentAction[] = [
	{ type: "read", cible: "kernel.truth", autorisee: true },
	{ type: "run_mirror", cible: "mirrors.mirror#checkout", autorisee: true },
	// THE done case (1): a write above the waterline — refused, red.
	{
		type: "write",
		cible: "kernel.truth",
		autorisee: false,
		raisonBlocage: {
			code: "AGENT_WRITE_ABOVE_WATERLINE",
			severity: "blocking",
			explanation:
				"Refus du mur : l'agent ne peut pas écrire au-dessus de la ligne de flottaison (kernel / mirrors / fitness).",
			howToFix: [
				"write_mirror : créez une idea puis son miroir (le rouge est le /goal).",
				"assign_authority : ouvrez un /goal (idea → mirror → /goal → approbation).",
				"rerun aidos check : le ChangeSet approuvé est appliqué par le rôle `aidos`.",
			],
		},
	},
	// a below-the-line write (runtime telemetry) — allowed.
	{ type: "write", cible: "ideas.candidate", autorisee: true },
];

export const RECENT_RUN: AgentRun = {
	id: "run-bdd-writer-1",
	agent: "bdd-writer",
	goal: "g-checkout-tax",
	redWorkItem: "rwi-1",
	contextPack: "cp-checkout-tax",
	actions: RECENT_ACTIONS,
	result: "still_red",
	startedAt: "2026-06-02T18:00:00Z",
	endedAt: "2026-06-02T18:05:00Z",
};
