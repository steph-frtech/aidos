/**
 * Agent layer — the PURE projection of back/kernel/agentlayer + back/runtime/agentrun
 * (AIDOS step S52).
 *
 * Determinism-first (CLAUDE.md §6/§8): `mayWrite`, `propose` and `approve` are the
 * authoritative pure functions, mirroring the Go verdict-for-verdict. `mayWrite`
 * REUSES the S04 waterline predicate (a path/schema classifier, never an "LLM
 * permission agent"); `propose` always yields a `proposed` (never `admitted`)
 * proposal; `approve` never admits the proposing agent itself. No I/O, no Date.now().
 * Same input → same verdict. Covered by lib/agentlayer.test.ts (the reproducibility
 * mirror). The panel runs these per control, so each verdict shown is COMPUTED.
 *
 * THE WALL (CLAUDE.md §2): an agent is never an authority — it proposes, it never
 * declares. peut_modifier_noyau / peut_modifier_fitness are ALWAYS false.
 */

/** The closed agent layer-kind triad (the S35 metamodel add). */
export const LAYER_KINDS = ["agent", "equipe_agents", "orchestration"] as const;
export type LayerKind = (typeof LAYER_KINDS)[number];

/** The closed provider set. */
export const PROVIDERS = ["anthropic", "openai", "google"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** The S13 BlockReason code the wall emits for an above-waterline agent write. */
export const CODE_AGENT_WRITE_ABOVE_WATERLINE = "AGENT_WRITE_ABOVE_WATERLINE";

/** The canonical door a proposal must walk (KRD §2). */
export const PROPOSAL_ROUTE = [
	"idea",
	"mirror",
	"goal",
	"approbation",
] as const;

/** The actionable refusal shape (S13). */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** The S13 AGENT_WRITE_ABOVE_WATERLINE BlockReason, verbatim from the Go registry. */
export const AGENT_WRITE_ABOVE_WATERLINE_REASON: BlockReason = {
	code: CODE_AGENT_WRITE_ABOVE_WATERLINE,
	severity: "blocking",
	explanation:
		"Refus du mur : l'agent ne peut pas écrire au-dessus de la ligne de flottaison (kernel / mirrors / fitness). Seul un ChangeSet approuvé, appliqué par le rôle `aidos`, écrit la vérité.",
	howToFix: [
		"write_mirror : ne jamais écrire la vérité au passage — créez une idea puis son miroir (le rouge est le /goal).",
		"assign_authority : ouvrez un /goal et obtenez l'approbation humaine (idea → mirror → /goal → approbation).",
		"rerun aidos check : le ChangeSet approuvé est appliqué par le rôle `aidos`, la seule porte vers le noyau.",
	],
};

/** The governed-rights core of a CoucheAgent (mirrors AgentSpec). */
export interface AgentSpec {
	id: string;
	nom: string;
	role: string;
	objectif: string;
	modele: string;
	provider: Provider;
	peutProposerVerite: boolean;
	peutModifierNoyau: false; // ALWAYS false — the type pins it (the wall)
	peutModifierMiroir: boolean;
	peutModifierFitness: false; // ALWAYS false — the type pins it (the wall)
	zonesLecture: string[];
	zonesEcriture: string[];
	stopConditions: string[];
}

export interface SkillBinding {
	skillName: string;
	enabled: boolean;
}
export interface McpBinding {
	server: string;
	tool: string;
	enabled: boolean;
}
export interface HookPolicy {
	phase: string;
	hook: string;
	mandatory: boolean;
}

/** A modelled agent — a governed SOURCE layer (mirrors CoucheAgent). */
export interface CoucheAgent {
	kind: LayerKind;
	spec: AgentSpec;
	skills: SkillBinding[];
	mcp: McpBinding[];
	hooks: HookPolicy[];
	approvers: string[]; // the S16 AuthorityGraph approvers (human)
	domain: string; // the S16 domain
	scopeRegion: string; // the S15 TruthScope region
}

/** The schemas above the waterline — the SAME closed set as the S04 wall. */
const ABOVE_WATERLINE_SCHEMAS = ["kernel", "mirrors", "fitness"];
const ABOVE_WATERLINE_PATH_PREFIXES = ["back/kernel/", "back/migrations/"];

/** aboveWaterline — the S04 waterline predicate (pure, total, deterministic). */
export function aboveWaterline(target: string): boolean {
	const t = target.trim().toLowerCase().replace(/^\//, "");
	const head = t.split(/[./ \t]/)[0];
	if (ABOVE_WATERLINE_SCHEMAS.includes(head)) return true;
	return ABOVE_WATERLINE_PATH_PREFIXES.some((p) => t.startsWith(p));
}

export interface WriteDecision {
	allowed: boolean;
	blockReason?: BlockReason;
}

/**
 * mayWrite — the wall verdict for an agent write to a target. DENIES any target above
 * the waterline with AGENT_WRITE_ABOVE_WATERLINE, regardless of the agent's role. Pure.
 */
export function mayWrite(_spec: AgentSpec, target: string): WriteDecision {
	if (aboveWaterline(target)) {
		return { allowed: false, blockReason: AGENT_WRITE_ABOVE_WATERLINE_REASON };
	}
	return { allowed: true };
}

export type ProposalStatus = "proposed" | "admitted";

export interface Proposal {
	scenario: string;
	proposedBy: string;
	status: ProposalStatus;
	requiresAuthority: string[];
	route: readonly string[];
}

/**
 * propose — a BDD-writer agent proposes a scenario. ALWAYS yields `proposed` (never
 * `admitted`) + the human approvers it must pass. Writes nothing. Pure.
 */
export function propose(c: CoucheAgent, scenario: string): Proposal {
	return {
		scenario,
		proposedBy: c.spec.role,
		status: "proposed",
		requiresAuthority: [...c.approvers],
		route: PROPOSAL_ROUTE,
	};
}

export interface ApproveDecision {
	status: ProposalStatus;
	blockReason?: BlockReason;
}

/**
 * approve — the admission gate. A self-approve attempt (the proposing agent's role/nom)
 * or any approver not in the S16 graph is BLOCKED (an agent is never an authority); the
 * proposal stays `proposed`. Only a HUMAN approver named in the graph admits. Pure.
 */
export function approve(
	c: CoucheAgent,
	p: Proposal,
	approver: string,
): ApproveDecision {
	if (
		approver === p.proposedBy ||
		approver === c.spec.role ||
		approver === c.spec.nom
	) {
		return {
			status: "proposed",
			blockReason: AGENT_WRITE_ABOVE_WATERLINE_REASON,
		};
	}
	if (c.approvers.includes(approver)) {
		return { status: "admitted" };
	}
	return {
		status: "proposed",
		blockReason: AGENT_WRITE_ABOVE_WATERLINE_REASON,
	};
}
