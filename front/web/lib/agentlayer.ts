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

/** The S13 BlockReason code the CAPACITY-axis enforcer emits for an unbound MCP tool (BA07). */
export const CODE_AGENT_TOOL_NOT_BOUND = "AGENT_TOOL_NOT_BOUND";

/** The S13 AGENT_TOOL_NOT_BOUND BlockReason, verbatim from the Go registry (BA07). */
export const AGENT_TOOL_NOT_BOUND_REASON: BlockReason = {
	code: CODE_AGENT_TOOL_NOT_BOUND,
	severity: "blocking",
	explanation:
		"Refus du mur — axe CAPACITÉ : l'agent gouverné tente d'exercer un outil MCP (server, tool) qui n'est PAS un binding `Enabled` de son implémentation résolue (back/runtime/agentimpl, BA07). Le mur S04/S52 applique l'axe ZONE (refus des zones de vérité) ; ceci applique l'axe capacité : un agent ne peut utiliser qu'un outil que sa couche gouvernée a explicitement accordé (default-deny — ce qui n'est pas lié est refusé). Une capacité ne s'élargit jamais sous la ligne : la gouvernance ne peut que rétrécir.",
	howToFix: [
		"add_binding_via_governed_layer : pour accorder cet outil, ajoutez un OutilMCPAutorisé `Enabled` à la CoucheAgent (la SOURCE, au-dessus de la ligne) — la seule porte est idée → miroir → /goal → approbation humaine.",
		"governance_only_narrows : l'implémentation projetée est un sous-ensemble prouvable de la couche gouvernée ; aucune écriture sous la ligne ni depuis l'écran n'élargit la surface de capacité.",
		"rerun aidos check : le blocage se lève dès que (server, tool) est un binding activé de l'implémentation résolue.",
	],
};

/** The S13 BlockReason code the SKILL-axis enforcer emits for an unbound skill (BA08). */
export const CODE_AGENT_SKILL_NOT_BOUND = "AGENT_SKILL_NOT_BOUND";

/** The S13 AGENT_SKILL_NOT_BOUND BlockReason, verbatim from the Go registry (BA08). */
export const AGENT_SKILL_NOT_BOUND_REASON: BlockReason = {
	code: CODE_AGENT_SKILL_NOT_BOUND,
	severity: "blocking",
	explanation:
		"Refus du mur — axe SKILL : l'agent gouverné tente d'utiliser un skill qui n'est PAS un binding `Enabled` de son implémentation résolue (back/runtime/agentimpl, BA08). C'est le 3ᵉ des quatre axes déclarés : le mur S04/S52 applique l'axe ZONE (refus des zones de vérité), BA07 l'axe CAPACITÉ (refus d'un outil MCP non lié) ; ceci applique l'axe skill : un agent ne peut utiliser qu'un skill que sa couche gouvernée a explicitement accordé (default-deny — ce qui n'est pas lié est refusé). Sans cet enforcer, `SkillBinding.Enabled` n'est que de la documentation : un skill ungouverné est la même classe de fuite qu'un outil ungouverné. Une capacité ne s'élargit jamais sous la ligne : la gouvernance ne peut que rétrécir.",
	howToFix: [
		"add_binding_via_governed_layer : pour accorder ce skill, ajoutez un SkillAutorisé `Enabled` à la CoucheAgent (la SOURCE, au-dessus de la ligne) — la seule porte est idée → miroir → /goal → approbation humaine.",
		"governance_only_narrows : l'implémentation projetée est un sous-ensemble prouvable de la couche gouvernée ; aucune écriture sous la ligne ni depuis l'écran n'élargit la surface de skills.",
		"rerun aidos check : le blocage se lève dès que le skill est un binding activé de l'implémentation résolue.",
	],
};

/** The S13 BlockReason code the CONFINEMENT path enforcer emits (BA09). */
export const CODE_AGENT_PATH_NOT_ALLOWED = "AGENT_PATH_NOT_ALLOWED";

/** The S13 AGENT_PATH_NOT_ALLOWED BlockReason, verbatim from the Go registry (BA09). */
export const AGENT_PATH_NOT_ALLOWED_REASON: BlockReason = {
	code: CODE_AGENT_PATH_NOT_ALLOWED,
	severity: "blocking",
	explanation:
		"Refus du mur — axe CONFINEMENT : l'agent gouverné vise un chemin qui n'est PAS couvert par sa liste d'autorisation `AllowedPaths` (ou il tombe sous un préfixe `ForbiddenPaths`) — back/runtime/agentimpl, BA09. C'est une ALLOW-LIST, DISTINCTE de la deny-list de ZONE : le mur S04/S52 (AGENT_WRITE_ABOVE_WATERLINE) refuse les zones de vérité au-dessus de la ligne ; ce code refuse tout ce qui n'est PAS explicitement dans la racine inscriptible déclarée de l'agent (default-deny — une `AllowedPaths` vide refuse tout chemin, confinement maximal). Une zone ne s'élargit jamais sous la ligne.",
	howToFix: [
		"add_allowed_path_via_governed_layer : pour accorder ce chemin, ajoutez-le aux zones d'écriture de la CoucheAgent (la SOURCE, au-dessus de la ligne) — la seule porte est idée → miroir → /goal → approbation humaine.",
		"keep_out_of_forbidden : assurez-vous que le chemin ne tombe pas sous un préfixe `ForbiddenPaths` (le mur est toujours porté par la projection) ; la racine inscriptible est l'arbre de l'app, pas /kernel ni /mirrors.",
		"rerun aidos check : le blocage se lève dès que le chemin est couvert par un préfixe `AllowedPaths` et hors `ForbiddenPaths`.",
	],
};

/** The S13 BlockReason code the CONFINEMENT network enforcer emits (BA09). */
export const CODE_AGENT_EGRESS_NOT_ALLOWED = "AGENT_EGRESS_NOT_ALLOWED";

/** The S13 AGENT_EGRESS_NOT_ALLOWED BlockReason, verbatim from the Go registry (BA09). */
export const AGENT_EGRESS_NOT_ALLOWED_REASON: BlockReason = {
	code: CODE_AGENT_EGRESS_NOT_ALLOWED,
	severity: "blocking",
	explanation:
		"Refus du mur — axe CONFINEMENT RÉSEAU : l'agent gouverné tente de joindre un host réseau qui n'est PAS dans sa liste `AllowedNetworkHosts` (back/runtime/agentimpl, BA09). Une `AllowedNetworkHosts` vide refuse TOUT host (aucun egress par défaut — fail-closed). Un host ne s'élargit jamais sous la ligne.",
	howToFix: [
		"add_allowed_host_via_governed_layer : pour accorder ce host, ajoutez-le aux hosts réseau autorisés de la CoucheAgent (la SOURCE) — la seule porte est idée → miroir → /goal → approbation humaine.",
		"egress_is_fail_closed : par défaut aucun egress n'est permis ; déclarez explicitement chaque host requis (registry, API du provider…).",
		"rerun aidos check : le blocage se lève dès que le host est un membre déclaré de `AllowedNetworkHosts`.",
	],
};

/** The S13 BlockReason code the CONFINEMENT exec enforcer emits (BA09). */
export const CODE_AGENT_EXEC_NOT_ALLOWED = "AGENT_EXEC_NOT_ALLOWED";

/** The S13 AGENT_EXEC_NOT_ALLOWED BlockReason, verbatim from the Go registry (BA09). */
export const AGENT_EXEC_NOT_ALLOWED_REASON: BlockReason = {
	code: CODE_AGENT_EXEC_NOT_ALLOWED,
	severity: "blocking",
	explanation:
		"Refus du mur — axe CONFINEMENT EXEC : l'agent gouverné tente d'exécuter une commande qui n'est PAS dans sa liste `AllowedExec` (back/runtime/agentimpl, BA09). Une `AllowedExec` vide refuse TOUTE commande (aucun sous-processus par défaut — fail-closed). Le `Bash` de l'agent est lui-même gaté : toute commande passe par `ExecAllowed`, jamais un shell libre.",
	howToFix: [
		"add_allowed_exec_via_governed_layer : pour accorder cette commande, ajoutez-la aux exécutables autorisés de la CoucheAgent (la SOURCE) — la seule porte est idée → miroir → /goal → approbation humaine.",
		"exec_is_fail_closed : par défaut aucun sous-processus n'est permis ; déclarez explicitement chaque exécutable requis (go, npm…) — jamais un shell libre.",
		"rerun aidos check : le blocage se lève dès que la commande est un membre déclaré de `AllowedExec`.",
	],
};

/** The S13 BlockReason code the MANDATORY-HOOK enforcer emits for a skipped hook (BA10). */
export const CODE_AGENT_MANDATORY_HOOK_SKIPPED = "AGENT_MANDATORY_HOOK_SKIPPED";

/** The S13 AGENT_MANDATORY_HOOK_SKIPPED BlockReason, verbatim from the Go registry (BA10). */
export const AGENT_MANDATORY_HOOK_SKIPPED_REASON: BlockReason = {
	code: CODE_AGENT_MANDATORY_HOOK_SKIPPED,
	severity: "blocking",
	explanation:
		"Refus de l'ACCEPTATION DU TOUR — axe HOOK : un hook OBLIGATOIRE (HooksObligatoires{Mandatory:true}) déclaré dans l'implémentation résolue de l'agent gouverné n'a JAMAIS tourné (aucun verdict de son binaire) — back/runtime/agentimpl, BA10. Les quatre axes du mur (zone/capacité/skill/confinement) gatent ce qu'une action peut TOUCHER ; ceci gate si un TOUR peut être ACCEPTÉ : un tour n'est admissible que si chaque hook obligatoire a réellement tourné. Présence du verdict = exit déterministe du BINAIRE hook, jamais le transcript auto-rapporté de l'agent (CLAUDE.md §8 — le juge est déterministe).",
	howToFix: [
		"run_the_mandatory_hook : exécutez le hook obligatoire manquant (sa phase PreToolUse/PostToolUse/Stop/SessionStart) — l'acceptation est gatée sur des hooks VERTS, jamais sur leur seule déclaration.",
		"verdict_from_the_binary : fournissez le verdict produit par le BINAIRE du hook (exit/BlockReason), jamais un set de noms rapporté par l'agent — un hook qui ne tourne pas est mort.",
		"change_mandatory_via_governed_layer : pour qu'un hook cesse d'être obligatoire, modifiez la CoucheAgent (la SOURCE, au-dessus de la ligne) — la seule porte est idée → miroir → /goal → approbation humaine ; jamais une dispense sous la ligne.",
		"rerun aidos check : le blocage se lève dès que tout hook obligatoire a tourné ET est vert.",
	],
};

/** The S13 BlockReason code the MANDATORY-HOOK enforcer emits for a ran-but-red hook (BA10). */
export const CODE_AGENT_MANDATORY_HOOK_RED = "AGENT_MANDATORY_HOOK_RED";

/** The S13 AGENT_MANDATORY_HOOK_RED BlockReason, verbatim from the Go registry (BA10). */
export const AGENT_MANDATORY_HOOK_RED_REASON: BlockReason = {
	code: CODE_AGENT_MANDATORY_HOOK_RED,
	severity: "blocking",
	explanation:
		"Refus de l'ACCEPTATION DU TOUR — axe HOOK : un hook OBLIGATOIRE (HooksObligatoires{Mandatory:true}) a TOURNÉ mais n'est PAS VERT (son binaire a renvoyé un verdict en échec) — back/runtime/agentimpl, BA10. PRÉSENCE ≠ VERT : un hook obligatoire qui a tourné et échoué bloque l'acceptation autant qu'un hook sauté. Le verdict provient de l'exit/BlockReason déterministe du BINAIRE du hook, jamais d'un set auto-rapporté par l'agent (CLAUDE.md §8 — le juge est déterministe, jamais le transcript).",
	howToFix: [
		"fix_what_the_hook_flags : lisez le BlockReason renvoyé par le binaire du hook et corrigez la cause (le mur franchi, la complétude violée, le sensor rouge) — passez le hook au VERT.",
		"presence_is_not_green : un hook présent mais rouge ne suffit pas ; l'acceptation exige des hooks obligatoires VERTS, pas seulement exécutés.",
		"rerun aidos check : le blocage se lève dès que le hook obligatoire rouge redevient vert.",
	],
};

/** The S13 BlockReason code the per-run budget gate emits on a breach (BA11). */
export const CODE_AGENT_BUDGET_EXCEEDED = "AGENT_BUDGET_EXCEEDED";

/** The S13 AGENT_BUDGET_EXCEEDED BlockReason, verbatim from the Go registry (BA11). */
export const AGENT_BUDGET_EXCEEDED_REASON: BlockReason = {
	code: CODE_AGENT_BUDGET_EXCEEDED,
	severity: "blocking",
	explanation:
		"Refus du BUDGET DE RUN : le run de l'agent gouverné a DÉPASSÉ son budget déclaré sur au moins un axe (tokens / turns / ci-minutes / wall-clock) — back/runtime/agentimpl (budget.go), BA11. Le cap effectif par axe partagé est le MINIMUM des deux déclarations : goal.Budgets (S29, le garde-fou anti-runaway secondaire) ET economics.HarnessCostBudget (S51, le cap d'économie du harnais) — le cap le plus serré gagne (fail-closed). Le coût est COST-AWARE (tokens × le taux modèle déclaré) et inclut une DEADLINE wall-clock (un agent hung brûle du temps sans brûler de tokens). Le gate est le min() déterministe autoritaire, jamais un jugement de l'agent (§8).",
	howToFix: [
		"reduce_run_cost : ramenez le coût du run sous le cap dépassé — moins de tours, moins de tokens, un run plus court ; le compteur est monotone, il ne fait que croître.",
		"tightest_cap_wins : le cap effectif est min(goal.Budgets, economics.HarnessCostBudget) sur l'axe partagé ; relever UN seul des deux ne lève pas le blocage si l'autre reste serré.",
		"raise_budget_via_goal : si un cap déclaré est trop bas, RELEVEZ-le via un /goal (la zone fitness pour HarnessCostBudget, le corps du goal pour Budgets) — jamais une édition directe ; l'agent est SELECT-only sur fitness.",
		"rerun aidos check : le blocage se lève dès que le coût mesuré repasse ≤ min() des caps sur chaque axe.",
	],
};

/** The S13 AGENT_DETERMINISM_GAP code (BA12), verbatim from the Go registry. */
export const CODE_AGENT_DETERMINISM_GAP = "AGENT_DETERMINISM_GAP";

/** The S13 AGENT_DETERMINISM_GAP BlockReason (BA12), verbatim from the Go registry. */
export const AGENT_DETERMINISM_GAP_REASON: BlockReason = {
	code: CODE_AGENT_DETERMINISM_GAP,
	severity: "blocking",
	explanation:
		"Refus de l'ARBITRE determinism-first : l'action voulait confier au LLM ce qu'un OUTIL DÉTERMINISTE sait déjà faire — un diff (jj/Myers), une recherche (rg), un format (biome/gofmt), une génération de code (émetteurs S34) ou une validation (validateurs kernel) — back/runtime/agentimpl (arbiter.go), BA12. L'intent est classifié depuis la STRUCTURE de l'action (nom d'outil + args), jamais depuis un label fourni par le modèle : ré-étiqueter l'intent affiché ne change pas le verdict, seule la structure le peut. Un agent qui fait ce qu'une fonction pure pourrait faire est un determinism gap qui bloque l'action (CLAUDE.md §6/§8 — le LLM est l'exception gatée, réservée à la génération irréductible).",
	howToFix: [
		"use_deterministic_tool : routez l'action vers l'outil déterministe que la table de la SKILL declare (diff→jj/Myers, search→rg, format→biome/gofmt, codegen→émetteurs S34, validate→validateurs kernel) — le code gagne, l'agent défère.",
		"classify_by_structure : ne re-labelisez pas l'intent pour contourner le gate ; le verdict vient de la structure (nom d'outil + args), pas du label revendiqué.",
		"llm_is_the_gated_exception : ne réservez le LLM qu'à la génération/jugement irréductible, isolé à la plus petite surface et re-checké déterministiquement ; jamais pour ce qu'une fonction pure couvre.",
		"rerun aidos check : le blocage se lève dès que l'action emprunte l'outil déterministe au lieu du LLM.",
	],
};

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
	// BA01 — GOVERNED BEHAVIOUR KNOBS. Live HERE (the governed layer), never in a
	// providerCfg. Empty allow-lists = max confinement, fail-closed.
	temperature: number; // [0, 2]
	maxTurns: number; // >= 0
	seed: string; // pinned replay seed; "" ⇒ derive deterministically
	allowedNetworkHosts: string[]; // EMPTY ⇒ no egress
	allowedExec: string[]; // EMPTY ⇒ no subprocess
	resourceLimits: ResourceLimits;
	maxConcurrency: number; // >= 0
}

/** Declared cgroup/ulimit caps (mirrors ResourceLimits). */
export interface ResourceLimits {
	maxMemoryMb: number;
	maxCpuMillis: number;
	maxWallSeconds: number;
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

// ── BA01 — GOVERNED BEHAVIOUR KNOBS (the front twin) ────────────────────────────
// These mirror back/kernel/agentlayer/knobs.go verdict-for-verdict. PURE, TOTAL,
// DETERMINISTIC (no I/O, no Date.now(), no Math.random()) — covered by the
// reproducibility mirror in lib/agentlayer.test.ts. The empty allow-list defaults
// are MAX confinement, fail-closed (no egress, no subprocess by default).

/**
 * egressAllowed — pure allow-list check over spec.allowedNetworkHosts. An EMPTY
 * allow-list denies EVERY host (no egress by default — fail-closed). Exact,
 * case-insensitive match. Mirrors agentlayer.EgressAllowed.
 */
export function egressAllowed(spec: AgentSpec, host: string): boolean {
	const want = host.trim().toLowerCase();
	if (want === "") return false;
	return spec.allowedNetworkHosts.some((h) => h.trim().toLowerCase() === want);
}

/**
 * execAllowed — pure allow-list check over spec.allowedExec. An EMPTY allow-list
 * denies EVERY command (no subprocess by default — fail-closed). Exact match.
 * Mirrors agentlayer.ExecAllowed.
 */
export function execAllowed(spec: AgentSpec, cmd: string): boolean {
	const want = cmd.trim();
	if (want === "") return false;
	return spec.allowedExec.some((c) => c.trim() === want);
}

/** ToolDecision — toolAllowed's verdict (the front twin of agentimpl.ToolDecision, BA07). */
export interface ToolDecision {
	allowed: boolean;
	blockReason?: BlockReason;
}

/**
 * toolAllowed — the CAPACITY-axis enforcer (BA07), the front twin of
 * agentimpl.ToolAllowed. PURE, TOTAL, fail-closed set-membership over impl.tools (the
 * Enabled MCP bindings BA05 resolved): allowed IFF (server, tool) ∈ impl.tools, denied
 * otherwise with the S13 AGENT_TOOL_NOT_BOUND BlockReason. An empty tools denies every
 * tool (default-deny — the max-confinement default). Set-membership, NEVER a judgment;
 * no I/O, no Date.now(), no Math.random() — same input ⇒ same verdict (covered by the
 * reproducibility mirror in lib/agentlayer.test.ts). Determinism-first (CLAUDE.md §6/§8).
 */
export function toolAllowed(
	impl: AgentImplementation,
	server: string,
	tool: string,
): ToolDecision {
	if (impl.tools.some((t) => t.server === server && t.tool === tool)) {
		return { allowed: true };
	}
	return { allowed: false, blockReason: AGENT_TOOL_NOT_BOUND_REASON };
}

/** SkillDecision — skillAllowed's verdict (the front twin of agentimpl.SkillDecision, BA08). */
export interface SkillDecision {
	allowed: boolean;
	blockReason?: BlockReason;
}

/**
 * skillAllowed — the SKILL-axis enforcer (BA08), the front twin of
 * agentimpl.SkillAllowed and the 3rd of the four declared axes. PURE, TOTAL,
 * fail-closed set-membership over impl.skills (the Enabled skill bindings BA05
 * resolved): allowed IFF skillName ∈ impl.skills, denied otherwise with the S13
 * AGENT_SKILL_NOT_BOUND BlockReason. An empty skills denies every skill (default-deny —
 * the max-confinement default). Without it SkillBinding.enabled is mere documentation:
 * an ungoverned skill is the same leak class as an ungoverned tool. Set-membership,
 * NEVER a judgment; no I/O, no Date.now(), no Math.random() — same input ⇒ same verdict
 * (covered by the reproducibility mirror in lib/agentlayer.test.ts). Determinism-first.
 */
export function skillAllowed(
	impl: AgentImplementation,
	skillName: string,
): SkillDecision {
	if (impl.skills.includes(skillName)) {
		return { allowed: true };
	}
	return { allowed: false, blockReason: AGENT_SKILL_NOT_BOUND_REASON };
}

/** PathDecision — pathAllowed's verdict (the front twin of agentimpl.PathDecision, BA09). */
export interface PathDecision {
	allowed: boolean;
	blockReason?: BlockReason;
}

/** coveredByPrefix — does some NON-EMPTY prefix cover target? (an empty target never is) */
function coveredByPrefix(prefixes: string[], target: string): boolean {
	if (target === "") return false;
	return prefixes.some((p) => p !== "" && target.startsWith(p));
}

/**
 * pathAllowed — the CONFINEMENT-axis enforcer (BA09), the front twin of
 * agentimpl.PathAllowed and the 4th declared axis. PURE, TOTAL, fail-closed ALLOW-LIST
 * over impl.allowedPaths MINUS impl.forbiddenPaths:
 *
 *   allowed IFF (∃ a ∈ allowedPaths: prefix(a, target)) ∧ (∄ f ∈ forbiddenPaths: prefix(f, target))
 *
 * Anything not covered by allowedPaths is DENIED (default-deny — an empty allowedPaths
 * denies every path, the max-confinement default), as is anything under a forbiddenPaths
 * prefix, with the S13 AGENT_PATH_NOT_ALLOWED BlockReason. DISTINCT from the zone
 * deny-list (a path not above the waterline can still be denied here). Prefix-membership,
 * NEVER a judgment; no I/O, no Date.now(), no Math.random() — same input ⇒ same verdict.
 */
export function pathAllowed(
	impl: AgentImplementation,
	target: string,
): PathDecision {
	if (
		coveredByPrefix(impl.allowedPaths, target) &&
		!coveredByPrefix(impl.forbiddenPaths, target)
	) {
		return { allowed: true };
	}
	return { allowed: false, blockReason: AGENT_PATH_NOT_ALLOWED_REASON };
}

/** EgressDecision — egressDecision's verdict (the front twin of agentimpl.EgressDecision, BA09). */
export interface EgressDecision {
	allowed: boolean;
	blockReason?: BlockReason;
}

/**
 * egressDecision — the network-CONFINEMENT enforcer (BA09), the front twin of
 * agentimpl.EgressAllowed. PURE, TOTAL, fail-closed: allowed IFF host ∈
 * allowedNetworkHosts (empty ⇒ no egress), denied otherwise with the S13
 * AGENT_EGRESS_NOT_ALLOWED BlockReason. Set-membership, NEVER a judgment; deterministic.
 */
export function egressDecision(
	impl: AgentImplementation,
	host: string,
): EgressDecision {
	if (implEgressAllowed(impl, host)) {
		return { allowed: true };
	}
	return { allowed: false, blockReason: AGENT_EGRESS_NOT_ALLOWED_REASON };
}

/** ExecDecision — execDecision's verdict (the front twin of agentimpl.ExecDecision, BA09). */
export interface ExecDecision {
	allowed: boolean;
	blockReason?: BlockReason;
}

/**
 * execDecision — the exec-CONFINEMENT enforcer (BA09), the front twin of
 * agentimpl.ExecAllowed. PURE, TOTAL, fail-closed: allowed IFF cmd ∈ allowedExec
 * (empty ⇒ no subprocess), denied otherwise with the S13 AGENT_EXEC_NOT_ALLOWED
 * BlockReason. The agent's Bash is itself gated — every command passes here, never a
 * free shell. Set-membership, NEVER a judgment; deterministic.
 */
export function execDecision(
	impl: AgentImplementation,
	cmd: string,
): ExecDecision {
	if (implExecAllowed(impl, cmd)) {
		return { allowed: true };
	}
	return { allowed: false, blockReason: AGENT_EXEC_NOT_ALLOWED_REASON };
}

/**
 * HookVerdict — one hook binary's deterministic outcome for a turn (the front twin of
 * agentimpl.HookVerdict, BA10): the (phase, hook) it ran for, whether it RAN, whether it
 * is GREEN. It is the binary's OWN verdict (its exit / BlockReason), NEVER an
 * agent-self-reported claim (CLAUDE.md §8 — the judge is deterministic, not the transcript).
 */
export interface HookVerdict {
	phase: string;
	hook: string;
	ran: boolean;
	green: boolean;
}

/**
 * hooksSatisfied — the turn-ACCEPTANCE gate over the MANDATORY hooks (BA10), the front
 * twin of agentimpl.HooksSatisfied. The four wall axes (zone/capacity/skill/confinement)
 * gate what an action may TOUCH; this gates whether a TURN may be ACCEPTED. Returns null
 * (accepted) IFF every resolved mandatory hook actually RAN and is GREEN, judged by the
 * hook BINARY's verdict — never the agent's transcript. PURE, TOTAL, fail-closed:
 *
 *   - a mandatory hook with NO verdict (or ran:false) — never ran — ⇒
 *     AGENT_MANDATORY_HOOK_SKIPPED (reported first: absent is "skipped", never "red");
 *   - a mandatory hook that ran but is NOT green ⇒ AGENT_MANDATORY_HOOK_RED (presence ≠ green).
 *
 * Non-mandatory hooks are advisory: they never block. No I/O, no Date.now(), no
 * Math.random() — same input → same verdict (determinism-first, CLAUDE.md §6/§8).
 */
export function hooksSatisfied(
	impl: AgentImplementation,
	verdicts: HookVerdict[],
): BlockReason | null {
	const verdictFor = (phase: string, hook: string): HookVerdict | undefined =>
		verdicts.find((v) => v.phase === phase && v.hook === hook);
	// First pass: any mandatory hook that NEVER ran is SKIPPED (reported before red).
	for (const h of impl.hooks) {
		if (!h.mandatory) continue;
		const v = verdictFor(h.phase, h.hook);
		if (!v || !v.ran) return AGENT_MANDATORY_HOOK_SKIPPED_REASON;
	}
	// Second pass: any mandatory hook that ran but is NOT green is RED (presence ≠ green).
	for (const h of impl.hooks) {
		if (!h.mandatory) continue;
		const v = verdictFor(h.phase, h.hook);
		if (!v || !v.green) return AGENT_MANDATORY_HOOK_RED_REASON;
	}
	return null;
}

/**
 * RunMeter — the MONOTONE tally of a run's consumed cost (the front twin of
 * agentimpl.RunMeter, BA11): tokens / turns / ci-minutes / wall-clock seconds. The zero
 * meter is a fresh run; tally returns a NEW meter (no mutation).
 */
export interface RunMeter {
	tokens: number;
	turns: number;
	ciMinutes: number;
	wallClockSecs: number;
}

/** RunDelta — one increment of consumed cost fed to tally (the front twin of agentimpl.RunDelta). */
export interface RunDelta {
	tokens: number;
	turns: number;
	ciMinutes: number;
	wallClockSecs: number;
}

/** goal.Budgets (S29) — the secondary anti-runaway caps (time/turns/tokens). */
export interface Budgets {
	timeSeconds: number;
	turns: number;
	tokens: number;
}

/** economics.HarnessCostBudget (S51) — the per-cell declared harness cap (the axes BA11 reads). */
export interface HarnessCostBudget {
	cellRef: string;
	maxCiMinutes: number;
	maxLlmTokensPerGoal: number;
}

/** BudgetVerdict — CheckBudget's typed result (the front twin of agentimpl.BudgetVerdict). */
export interface BudgetVerdict {
	withinBudget: boolean;
	breachedAxis: string;
	costAware: number;
	cellRef: string;
	blockReason: BlockReason | null;
}

const nonNeg = (x: number): number => (x < 0 ? 0 : x);

/**
 * tally — fold a delta into the meter, returning a NEW meter. Pure and MONOTONE: every
 * axis of the result is ≥ the receiver (negatives clamped to zero). No Date.now().
 */
export function tally(m: RunMeter, d: RunDelta): RunMeter {
	return {
		tokens: m.tokens + nonNeg(d.tokens),
		turns: m.turns + nonNeg(d.turns),
		ciMinutes: m.ciMinutes + nonNeg(d.ciMinutes),
		wallClockSecs: m.wallClockSecs + nonNeg(d.wallClockSecs),
	};
}

/** costAware — the comparable money/credit unit: tokens × the declared per-token rate. */
export function costAware(m: RunMeter, ratePerToken: number): number {
	return m.tokens * ratePerToken;
}

/**
 * effectiveTokensCap — the reconciled tokens cap (gap G1): min(goal.Budgets.tokens (S29),
 * economics.HarnessCostBudget.maxLlmTokensPerGoal (S51)). The tightest cap wins
 * (fail-closed); the min() is the AUTHORITATIVE rule (CLAUDE.md §8).
 */
export function effectiveTokensCap(h: HarnessCostBudget, b: Budgets): number {
	return Math.min(b.tokens, h.maxLlmTokensPerGoal);
}

/**
 * checkBudget — the PURE, TOTAL budget gate (the front twin of agentimpl.CheckBudget,
 * BA11). The effective per-shared-axis cap is the MIN of the two declarations (tokens is
 * the shared axis; turns from S29, ci-minutes from S51, wall-clock from S29.timeSeconds).
 * A cost EXACTLY EQUAL to the cap is within budget (inclusive ceiling); cap+1 breaches.
 * Over on ANY axis breaches (per-axis OR, fail-closed); breachedAxis follows a fixed
 * precedence (tokens → turns → ci_minutes → wall_clock) so the verdict is deterministic.
 * No I/O, no Date.now(), no Math.random() — same input → same verdict.
 */
export function checkBudget(
	m: RunMeter,
	h: HarnessCostBudget,
	b: Budgets,
	ratePerToken: number,
): BudgetVerdict {
	const cost = costAware(m, ratePerToken);
	const effTokens = effectiveTokensCap(h, b);
	let axis = "";
	if (m.tokens > effTokens) axis = "tokens";
	else if (m.turns > b.turns) axis = "turns";
	else if (m.ciMinutes > h.maxCiMinutes) axis = "ci_minutes";
	else if (m.wallClockSecs > b.timeSeconds) axis = "wall_clock";

	if (axis === "") {
		return {
			withinBudget: true,
			breachedAxis: "",
			costAware: cost,
			cellRef: h.cellRef,
			blockReason: null,
		};
	}
	return {
		withinBudget: false,
		breachedAxis: axis,
		costAware: cost,
		cellRef: h.cellRef,
		blockReason: AGENT_BUDGET_EXCEEDED_REASON,
	};
}

/** The unit separator — same as the Go side, so (impl,pack,item) cannot collide. */
const SEED_SEPARATOR = String.fromCharCode(31); // ASCII US (0x1f), same as the Go side

/**
 * deriveSeed — the DETERMINISTIC replay seed from (impl, pack, item). NEVER an RNG.
 * The Go side hashes with SHA-256 (records.Hash); this UI twin uses a stable FNV-1a
 * content-address (same intent as lib/context-pack.ts: a stable deterministic id for
 * display + replay — same triple ⇒ same seed). Determinism-first (CLAUDE.md §6/§8).
 */
export function deriveSeed(impl: string, pack: string, item: string): string {
	const s = impl + SEED_SEPARATOR + pack + SEED_SEPARATOR + item;
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

/** seedFor — the effective seed: the pinned spec.seed if set, else the derived one. */
export function seedFor(
	spec: AgentSpec,
	impl: string,
	pack: string,
	item: string,
): string {
	return spec.seed.trim() !== "" ? spec.seed : deriveSeed(impl, pack, item);
}

/** validateKnobs — fail-closed range guard, mirrors agentlayer.validateKnobs. */
export function validateKnobs(spec: AgentSpec): string | null {
	if (spec.temperature < 0 || spec.temperature > 2)
		return "temperature must be in [0, 2]";
	if (spec.maxTurns < 0) return "max_turns must be >= 0";
	if (spec.maxConcurrency < 0) return "max_concurrency must be >= 0";
	const r = spec.resourceLimits;
	if (r.maxMemoryMb < 0 || r.maxCpuMillis < 0 || r.maxWallSeconds < 0)
		return "resource_limits axes must be >= 0";
	return null;
}

// ── BA02 — AgentImplementation (the PROJECTION TYPE, the front twin) ─────────────
// Mirrors back/runtime/agentimpl/agentimpl.go. An AgentImplementation is a
// BELOW-the-line PROJECTION that carries NO truth: it has NO `version` field and NO
// `mirror` field — a projection is UNREPRESENTABLE as a CoucheAgent (the same
// discipline as agentrun "a run is not a layer"). `layerRef` is a plain string ref
// back to CoucheAgent@version, never a re-embedded SOURCE. `validateImpl`,
// `implEgressAllowed`, `implExecAllowed`, `wallForbiddenPaths` are PURE/TOTAL —
// covered by the reproducibility mirror lib/agentlayer.test.ts. TYPE + invariants
// only — NO emitter (Project is BA03).

/** A concrete MCP tool binding in the projection (BA05 resolves; BA02 fixes the type). */
export interface ResolvedTool {
	server: string;
	tool: string;
}

/** A concrete mandatory-hook binding in the projection. */
export interface ResolvedHook {
	phase: string;
	hook: string;
	mandatory: boolean;
}

// ── BA05 — binding resolution (the front twin) ───────────────────────────────────
// Mirrors back/runtime/agentimpl/bindings.go function-for-function. The one law BA05
// proves: GOVERNANCE CAN ONLY NARROW THE CAPABILITY SURFACE, NEVER WIDEN IT. tools[]
// derive ONLY from enabled mcp bindings; skills[] ONLY from enabled skill bindings;
// hooks[] preserve the mandatory flag (a mandatory hook always survives). PURE,
// deterministic, order-independent (sorted), byte-stable. There is ONE resolution —
// project() delegates to these. Covered by the reproducibility mirror agentlayer.test.ts.

/**
 * resolveTools — the enabled mcp bindings → ResolvedTool[], canonical (server,tool)
 * order, de-duplicated. A disabled/absent binding NEVER appears (no widening).
 */
export function resolveTools(bindings: McpBinding[]): ResolvedTool[] {
	const seen = new Set<string>();
	const out: ResolvedTool[] = [];
	for (const b of bindings) {
		if (!b.enabled) continue;
		const key = `${b.server} ${b.tool}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ server: b.server, tool: b.tool });
	}
	out.sort((a, b) =>
		a.server !== b.server
			? a.server.localeCompare(b.server)
			: a.tool.localeCompare(b.tool),
	);
	return out;
}

/**
 * resolveSkills — the enabled skill bindings → names, sorted + de-duplicated. A
 * disabled/absent skill NEVER appears (no widening).
 */
export function resolveSkills(bindings: SkillBinding[]): string[] {
	return [
		...new Set(bindings.filter((b) => b.enabled).map((b) => b.skillName)),
	].sort();
}

/**
 * resolveHooks — the mandatory-hook policies → ResolvedHook[], PRESERVING mandatory,
 * sorted by (phase, hook, mandatory), de-duplicated. A mandatory hook ALWAYS survives;
 * it never invents a hook not declared in the SOURCE.
 */
export function resolveHooks(policies: HookPolicy[]): ResolvedHook[] {
	const seen = new Set<string>();
	const out: ResolvedHook[] = [];
	for (const p of policies) {
		const key = `${p.phase} ${p.hook} ${p.mandatory}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ phase: p.phase, hook: p.hook, mandatory: p.mandatory });
	}
	out.sort((a, b) => {
		if (a.phase !== b.phase) return a.phase.localeCompare(b.phase);
		if (a.hook !== b.hook) return a.hook.localeCompare(b.hook);
		return a.mandatory === b.mandatory ? 0 : a.mandatory ? 1 : -1;
	});
	return out;
}

/**
 * AgentImplementation — the projection of a CoucheAgent into a runnable session config.
 * It carries NO truth: NO `version`, NO `mirror`. `layerRef` points back to the SOURCE.
 */
export interface AgentImplementation {
	layerRef: string; // CoucheAgent@version this projects (a ref, NOT a version-as-truth)
	// Declared identity/intent — the DECLARED inputs of assembleSystemPrompt (BA04).
	role: string;
	objectif: string;
	stopConditions: string[];
	provider: Provider;
	model: string;
	temperature: number;
	maxTurns: number;
	seed: string;
	tools: ResolvedTool[];
	skills: string[];
	hooks: ResolvedHook[];
	allowedPaths: string[];
	forbiddenPaths: string[];
	allowedNetworkHosts: string[]; // EMPTY ⇒ no egress (fail-closed)
	allowedExec: string[]; // EMPTY ⇒ no subprocess (fail-closed)
	resourceLimits: ResourceLimits;
	maxConcurrency: number;
}

/**
 * wallForbiddenPaths — the closed truth-zone set a projection MUST forbid (the wall,
 * single-sourced with the Go side). Non-empty by construction. Returns a fresh copy.
 */
export function wallForbiddenPaths(): string[] {
	return ["kernel", "mirrors", "fitness", "back/kernel/", "back/migrations/"];
}

/** implEgressAllowed — defers to the governed-layer allow-list (empty ⇒ deny all). */
export function implEgressAllowed(
	impl: AgentImplementation,
	host: string,
): boolean {
	const want = host.trim().toLowerCase();
	if (want === "") return false;
	return impl.allowedNetworkHosts.some((h) => h.trim().toLowerCase() === want);
}

/** implExecAllowed — defers to the governed-layer allow-list (empty ⇒ deny all). */
export function implExecAllowed(
	impl: AgentImplementation,
	cmd: string,
): boolean {
	const want = cmd.trim();
	if (want === "") return false;
	return impl.allowedExec.some((c) => c.trim() === want);
}

/**
 * validateImpl — the PURE shape + wall guard of an AgentImplementation. Fail-closed:
 * layerRef/model non-empty; provider known; knobs in range; no allowedPath above the
 * waterline; forbiddenPaths carries the full wall zone set. Mirrors Go Validate.
 */
export function validateImpl(impl: AgentImplementation): string | null {
	if (impl.layerRef.trim() === "") return "layer_ref must be non-empty";
	if (impl.model.trim() === "") return "model must be non-empty";
	if (!PROVIDERS.includes(impl.provider)) return "unknown provider";
	if (impl.temperature < 0 || impl.temperature > 2)
		return "temperature must be in [0, 2]";
	if (impl.maxTurns < 0) return "max_turns must be >= 0";
	if (impl.maxConcurrency < 0) return "max_concurrency must be >= 0";
	const r = impl.resourceLimits;
	if (r.maxMemoryMb < 0 || r.maxCpuMillis < 0 || r.maxWallSeconds < 0)
		return "resource_limits axes must be >= 0";
	for (const p of impl.allowedPaths)
		if (aboveWaterline(p))
			return `allowed path ${p} resolves above the waterline`;
	for (const w of wallForbiddenPaths())
		if (!impl.forbiddenPaths.includes(w))
			return `forbidden_paths must carry the wall zone ${w}`;
	return null;
}

// ── BA03 — the DETERMINISTIC EMITTER project() (the front twin) ──────────────────
// Mirrors back/runtime/agentimpl/project.go verdict-for-verdict. PURE, TOTAL,
// DETERMINISTIC: same (layer, cfg, pack) → byte-identical projection + identical
// content-hash. NO LLM, NO Date.now(), NO Math.random(). The providerCfg carries ONLY
// the resolved endpoint/key — NEVER a behaviour knob (temperature/seed/maxturns come
// UNIQUELY from the layer). Covered by the reproducibility mirror lib/agentlayer.test.ts.

/** The CLOSED model set per provider — pinned, never discovered (mirrors Go knownModelsByProvider). */
export const KNOWN_MODELS_BY_PROVIDER: Record<Provider, readonly string[]> = {
	anthropic: ["claude-fable-5", "claude-sonnet-4-5", "claude-haiku-4-5"],
	openai: ["gpt-5", "gpt-5-mini", "o4"],
	google: ["gemini-3-pro", "gemini-3-flash"],
};

/** isKnownProvider — membership of the closed provider set. */
export function isKnownProvider(p: string): p is Provider {
	return (PROVIDERS as readonly string[]).includes(p);
}

/** isKnownModel — membership of the closed per-provider model set (fail-closed). */
export function isKnownModel(provider: Provider, model: string): boolean {
	const set = KNOWN_MODELS_BY_PROVIDER[provider];
	return set !== undefined && set.includes(model);
}

/**
 * ProviderCfg — the RESOLVED provider configuration: endpoint + key ONLY, plus the
 * provider/model GATE inputs. It carries NO behaviour knob. endpoint/apiKey are NEVER
 * copied into the projection (a secret is not part of the projection identity).
 */
export interface ProviderCfg {
	provider: Provider;
	model: string;
	endpoint?: string; // resolved endpoint — NOT part of the projection identity
	apiKey?: string; // resolved credential — NEVER in the projection
}

export interface ProjectResult {
	impl?: AgentImplementation;
	error?: string;
}

/** validateLayer — the front twin of agentlayer.Validate (the gate's first check). */
function validateLayer(c: CoucheAgent): string | null {
	if (!LAYER_KINDS.includes(c.kind)) return "unknown layer kind";
	if (c.spec.nom.trim() === "" || c.spec.role.trim() === "")
		return "spec nom and role must be non-empty";
	if (!isKnownProvider(c.spec.provider)) return "unknown provider";
	if (c.spec.peutModifierNoyau)
		return "peut_modifier_noyau must be false (the wall)";
	if (c.spec.peutModifierFitness)
		return "peut_modifier_fitness must be false (the wall)";
	for (const z of c.spec.zonesEcriture)
		if (aboveWaterline(z))
			return `write zone ${z} resolves above the waterline`;
	return validateKnobs(c.spec);
}

/** normalizePaths — sort + de-duplicate for byte-stable projection (mirrors Go). */
function normalizePaths(input: string[]): string[] {
	if (input.length === 0) return [];
	return [...new Set(input)].sort();
}

/**
 * project — the DETERMINISTIC EMITTER (BA03). Projects a governed CoucheAgent SOURCE
 * into a runnable AgentImplementation under a resolved ProviderCfg (credentials only)
 * and a ContextPack ref. Fail-closed: refuses an invalid layer, a cfg whose
 * provider/model != the layer's, an unknown provider, an unknown model. The behaviour
 * knobs come UNIQUELY from the layer; the wall is always carried. Pure, deterministic.
 */
export function project(
	layer: CoucheAgent,
	cfg: ProviderCfg,
	_pack: string,
): ProjectResult {
	const layerErr = validateLayer(layer);
	if (layerErr) return { error: `invalid layer: ${layerErr}` };
	const spec = layer.spec;
	if (cfg.provider !== spec.provider)
		return { error: "providerCfg.provider must equal the layer's provider" };
	if (cfg.model !== spec.modele)
		return {
			error:
				"providerCfg.model must equal Spec.modele (cfg carries no model choice)",
		};
	if (!isKnownProvider(spec.provider)) return { error: "unknown provider" };
	if (!isKnownModel(spec.provider, spec.modele))
		return {
			error: `unknown model for provider (not in the closed declared set): ${spec.modele}`,
		};

	const impl: AgentImplementation = {
		layerRef: `agentlayer:${spec.id !== "" ? spec.id : spec.modele}`,
		role: spec.role,
		objectif: spec.objectif,
		stopConditions: normalizePaths(spec.stopConditions),
		provider: spec.provider,
		model: spec.modele,
		temperature: spec.temperature,
		maxTurns: spec.maxTurns,
		seed: spec.seed,
		// Resolved capability surface — delegated to the BA05 resolvers (one resolution,
		// proven to NARROW, never widen, the governed surface).
		tools: resolveTools(layer.mcp),
		skills: resolveSkills(layer.skills),
		hooks: resolveHooks(layer.hooks),
		allowedPaths: normalizePaths(spec.zonesEcriture),
		forbiddenPaths: wallForbiddenPaths(),
		allowedNetworkHosts: normalizePaths(spec.allowedNetworkHosts),
		allowedExec: normalizePaths(spec.allowedExec),
		resourceLimits: spec.resourceLimits,
		maxConcurrency: spec.maxConcurrency,
	};
	const implErr = validateImpl(impl);
	if (implErr)
		return { error: `emitted projection failed validate: ${implErr}` };
	return { impl };
}

/**
 * implContentHash — the deterministic content-address of a projection (display + the
 * byte-stability check). The Go side hashes records.Canonicalize+SHA-256; this twin
 * uses a stable FNV-1a over the canonical JSON (object keys sorted) — same intent as
 * deriveSeed/context-pack: same projection ⇒ same hash. NOT a cryptographic claim,
 * a stable display id (the byte-stability invariant is what the mirror pins).
 */
export function implContentHash(impl: AgentImplementation): string {
	const canon = canonicalJSON(impl);
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

// ── BA18 — AGENT IDENTITY/AUTH toward MCP servers (the front twin) ───────────────

/**
 * The S13 BlockReason code an MCP server emits when a presented capability token does
 * not bind the caller to the expected CoucheAgent@version (gap K3).
 */
export const CODE_AGENT_IDENTITY_UNVERIFIED = "AGENT_IDENTITY_UNVERIFIED";

/**
 * IdentityVerdict — the deterministic result of verifying a presented token against the
 * identity an MCP server expects. `verified` is true ONLY when the token binds the caller
 * to EXACTLY that CoucheAgent@version. On refusal, `reason` carries the actionable
 * AGENT_IDENTITY_UNVERIFIED BlockReason (how_to_fix non-empty — no prison).
 */
export interface IdentityVerdict {
	verified: boolean;
	reason?: BlockReason;
}

/**
 * identityHash — the content-address of an agent IDENTITY (its CoucheAgent@version, the
 * LayerRef). It hashes ONLY the layer-ref under a "kind" namespace, the front twin of the
 * Go `agentimpl.identityBody` ∘ `records.Hash`: the identity is the layer, NOT the mutable
 * runtime knobs, so two projections of the same @version share a token; a different
 * @version is a different identity. Stable FNV-1a (same intent as implContentHash). PURE.
 */
function identityHash(layerRef: string): string {
	const canon = canonicalJSON({
		kind: "agent_capability_token",
		layer_ref: layerRef,
	});
	let h = 0x811c9dc5;
	for (let i = 0; i < canon.length; i++) {
		h ^= canon.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * mintToken — the capability token an agent loop presents on every MCP call: the
 * content-hash of its identity (LayerRef = CoucheAgent@version). PURE and TOTAL — same
 * identity ⇒ same token. The front twin of Go `agentimpl.MintToken`. The loop cannot mint
 * a token for an identity it does not project (the LayerRef comes from the governed
 * SOURCE).
 */
export function mintToken(impl: AgentImplementation): string {
	return identityHash(impl.layerRef);
}

/**
 * mintTokenFor — the token an MCP server EXPECTS for a given CoucheAgent@version it is
 * asked to act for. The server-side twin of mintToken: the server never trusts a
 * self-asserted owner, it re-derives the token the holder WOULD present and compares.
 * PURE and TOTAL. Front twin of Go `agentimpl.MintTokenFor`.
 */
export function mintTokenFor(layerRef: string): string {
	return identityHash(layerRef);
}

/**
 * verifyToken — the deterministic gate every MCP server runs before honouring a call: the
 * presented token is accepted ONLY when it equals the token the EXPECTED identity would
 * mint. A missing token (empty), a malformed token, or a token minted for ANOTHER identity
 * all fail the equality check and are refused fail-closed with AGENT_IDENTITY_UNVERIFIED.
 * The owner is PROVEN by the token, never read from a self-declared request field. PURE
 * and TOTAL. Front twin of Go `agentimpl.VerifyToken`.
 */
export function verifyToken(
	presented: string,
	expectedLayerRef: string,
): IdentityVerdict {
	const expected = mintTokenFor(expectedLayerRef);
	if (presented !== "" && presented === expected) {
		return { verified: true };
	}
	return {
		verified: false,
		reason: {
			code: CODE_AGENT_IDENTITY_UNVERIFIED,
			severity: "error",
			explanation:
				"L'appel MCP n'est pas accepté : le token de capacité présenté ne lie pas le processus appelant à la CoucheAgent@version attendue. owner_agent est PROUVÉ par le token, jamais déclaré par la chaîne d'appel.",
			howToFix: [
				"Présentez le token de capacité de VOTRE propre AgentImplementation (le content-hash de sa LayerRef), jamais celui d'une autre identité.",
				"Vérifiez que la LayerRef de votre projection correspond exactement à la CoucheAgent@version que le serveur attend.",
			],
		},
	};
}

// ── BA04 — the DETERMINISTIC SystemPrompt assembly (the front twin) ──────────────
// Mirrors back/runtime/agentimpl/systemprompt.go byte-for-byte. A PURE TEMPLATE over
// the ONLY declared fields: role, objectif, stopConditions, the wall boundary in
// prose, forbiddenPaths verbatim, allowedPaths verbatim. NEVER hand-authored. Same
// input ⇒ same output (no Date.now/Math.random). Covered by lib/agentlayer.test.ts.

/** promptLine — a declared value on its own line, with a stable marker when empty. */
function promptLine(v: string): string {
	return v.trim() === "" ? "(non déclaré)\n" : `${v}\n`;
}

/** promptBullets — a verbatim markdown bullet list, stable marker when empty. */
function promptBullets(items: string[]): string {
	if (items.length === 0) return "- (aucun)\n";
	return `${items.map((it) => `- ${it}`).join("\n")}\n`;
}

/**
 * assembleSystemPrompt — the deterministic system prompt for a projected
 * AgentImplementation. Only role/objectif/stopConditions/allowedPaths/forbiddenPaths
 * feed the template; no knob/binding/credential/layerRef leaks. Byte-identical to the
 * Go AssembleSystemPrompt (the reproducibility mirror pins the invariants).
 */
export function assembleSystemPrompt(impl: AgentImplementation): string {
	let b = "";
	b += "# AIDOS Build-Agent — System Prompt (assembled, deterministic)\n";
	b += "\n";
	b +=
		"Vous êtes une couche gouvernée d'AIDOS : vous proposez, exécutez, explorez ; ";
	b += "vous ne déclarez jamais seul ce qui est vrai. Ce prompt est ASSEMBLÉ ";
	b +=
		"déterministiquement à partir des seuls champs déclarés de votre couche — ";
	b += "il n'est jamais écrit à la main.\n";
	b += "\n";
	b += "## Rôle\n";
	b += promptLine(impl.role);
	b += "\n";
	b += "## Objectif\n";
	b += promptLine(impl.objectif);
	b += "\n";
	b += "## Conditions d'arrêt\n";
	b += promptBullets(impl.stopConditions);
	b += "\n";
	b += "## Le mur — vous n'écrivez JAMAIS la vérité\n";
	b +=
		"Les zones suivantes sont AU-DESSUS de la ligne (le noyau, les miroirs, la fitness). ";
	b +=
		"Elles sont interdites en écriture : la seule porte est idée → miroir → /goal → approbation humaine. ";
	b +=
		"Cette interdiction est aussi appliquée par le hook PreToolUse et par les GRANTs Postgres (défense en profondeur).\n";
	b += "Zones interdites (verbatim) :\n";
	b += promptBullets(impl.forbiddenPaths);
	b += "\n";
	b += "## Chemins autorisés en écriture (verbatim)\n";
	b += "Vous n'écrivez QUE dans ces préfixes (allow-list, fail-closed) :\n";
	b += promptBullets(impl.allowedPaths);
	return b;
}

/** canonicalJSON — JSON with object keys sorted recursively (mirrors records.Canonicalize). */
function canonicalJSON(v: unknown): string {
	if (v === null || typeof v !== "object") return JSON.stringify(v);
	if (Array.isArray(v)) return `[${v.map(canonicalJSON).join(",")}]`;
	const obj = v as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`).join(",")}}`;
}

// ── BA12 — the determinism-first ARBITER (the front twin of agentimpl/arbiter.go) ────────
//
// Arbitrate encodes the determinism-first SKILL mapping table IN CODE: diff → jj/Myers,
// search → rg, format → biome/gofmt, codegen → S34 emitters, validate → kernel validators.
// The intent is classified from the action's STRUCTURE (tool name + args), NEVER from a
// model-supplied label — re-labelling the displayed intent CANNOT change the verdict, only
// the structure can. If a deterministic tool exists for the structure, Arbitrate NEVER
// returns LLMGated (the code wins). Pure, total, deterministic — no I/O, no Date.now(), no
// Math.random(). The Vitest twin (agentlayer.test.ts) pins the same properties.

/** The deterministic tool families — the codomain of the SKILL mapping table (BA12). */
export const TOOL_DIFF = "diff";
export const TOOL_SEARCH = "search";
export const TOOL_FORMAT = "format";
export const TOOL_CODEGEN = "codegen";
export const TOOL_VALIDATE = "validate";

/** VerdictKind — the closed outcome of arbitrate (BA12). */
export type VerdictKind = "DeterministicTool" | "LLMGated";

/** AgentAction — the STRUCTURE of one action: tool + args. displayedIntent is the
 * model-supplied label, carried for the panel but NEVER read by arbitrate (gap D1).
 * requestedLlm is the loop's signal that it would route the action to the LLM. */
export interface AgentAction {
	tool: string;
	args: string[];
	displayedIntent?: string;
	requestedLlm?: boolean;
}

/** Verdict — arbitrate's typed result: the kind, the tool family on a DeterministicTool
 * verdict (empty when LLMGated), and the S13 BlockReason (null from arbitrate itself). */
export interface Verdict {
	kind: VerdictKind;
	tool: string;
	blockReason: BlockReason | null;
}

/** classify — the pure structural classifier: maps (tool, args) to a deterministic tool
 * family, or "" (the residual LLM case). Reads ONLY tool + args, NEVER displayedIntent. */
function classify(a: AgentAction): string {
	const head = a.args.length > 0 ? a.args[0] : "";
	const second = a.args.length > 1 ? a.args[1] : "";
	switch (a.tool) {
		case "bash":
		case "shell":
		case "sh":
			switch (head) {
				case "rg":
				case "ripgrep":
				case "grep":
				case "ag":
				case "ack":
					return TOOL_SEARCH;
				case "gofmt":
				case "biome":
				case "prettier":
				case "go-arch-lint":
				case "depguard":
				case "dependency-cruiser":
					return TOOL_FORMAT;
				case "git":
				case "jj":
					return second === "diff" ? TOOL_DIFF : "";
				case "go":
					return second === "fmt" ? TOOL_FORMAT : "";
				default:
					return "";
			}
		case "aidos":
			switch (head) {
				case "project":
				case "emit":
				case "codegen":
				case "materialize":
					return TOOL_CODEGEN;
				case "check":
				case "validate":
					return TOOL_VALIDATE;
				case "diff":
					return TOOL_DIFF;
				default:
					return "";
			}
		default:
			return "";
	}
}

/** arbitrate — the PURE determinism-first verdict (BA12). Classifies from STRUCTURE only;
 * re-labelling displayedIntent cannot change it; if a deterministic tool exists, never
 * returns LLMGated. */
export function arbitrate(a: AgentAction): Verdict {
	const tool = classify(a);
	if (tool !== "") {
		return { kind: "DeterministicTool", tool, blockReason: null };
	}
	return { kind: "LLMGated", tool: "", blockReason: null };
}

/** arbitrateGated — the wall form the loop calls (BA12): a BlockReason IFF the action is a
 * DETERMINISM GAP — the loop would route to the LLM (requestedLlm) where a deterministic
 * tool EXISTS for the structure. Otherwise null. Computed from the structure, never the
 * label. */
export function arbitrateGated(a: AgentAction): BlockReason | null {
	const v = arbitrate(a);
	if (a.requestedLlm && v.kind === "DeterministicTool") {
		return AGENT_DETERMINISM_GAP_REASON;
	}
	return null;
}

// ── BA13 — gateAction: the SINGLE composed verdict over ALL declared axes ──────────────
//
// gateAction is the front twin of agentimpl.GateAction: it folds EVERY enforcer (BA07–
// BA12) into ONE pure verdict, in the SAME explicit precedence the Go side fixes (gap D3):
//
//   1 determinism (arbitrate) → 2 zone (aboveWaterline deny) → 3 path (pathAllowed allow)
//   → 4 egress → 5 exec → 6 capacity (toolAllowed) → 7 skill (skillAllowed)
//   → 8 budget (checkBudget) → 9 hook (hooksSatisfied)
//
// arbitrate is FIRST and INSIDE the gate (the determinism axis is part of the single
// verdict). The zone deny-list precedes the path allow-list (a kernel write inside an
// over-broad allowedPaths still trips the ZONE axis). Each axis is checked only when its
// inputs are present, so the gate is total over any action shape. Same input ⇒ same
// verdict (no Date.now(), no Math.random(), no I/O — determinism-first, CLAUDE.md §6/§8).

/** The canonical axis names, in precedence order (single source for the panel). */
export const AXIS_DETERMINISM = "determinism";
export const AXIS_ZONE = "zone";
export const AXIS_PATH = "path";
export const AXIS_EGRESS = "egress";
export const AXIS_EXEC = "exec";
export const AXIS_CAPACITY = "capacity";
export const AXIS_SKILL = "skill";
export const AXIS_BUDGET = "budget";
export const AXIS_HOOK = "hook";

/** PRECEDENCE_AXES — the fixed precedence order gateAction evaluates (panel renders in this order). */
export const PRECEDENCE_AXES = [
	AXIS_DETERMINISM,
	AXIS_ZONE,
	AXIS_PATH,
	AXIS_EGRESS,
	AXIS_EXEC,
	AXIS_CAPACITY,
	AXIS_SKILL,
	AXIS_BUDGET,
	AXIS_HOOK,
] as const;

/**
 * GateActionInput — the STRUCTURE of one action gateAction evaluates (the front twin of
 * agentimpl.Action). A field left empty means "this axis does not apply" (no target ⇒ the
 * zone/path axes are skipped; no server/tool ⇒ the capacity axis is skipped; …) — so the
 * gate is total. agentAction is the STRUCTURAL input the determinism arbiter reads.
 */
export interface GateActionInput {
	agentAction: AgentAction;
	target?: string;
	server?: string;
	tool?: string;
	skill?: string;
	host?: string;
	exec?: string;
}

/**
 * GateDecision — gateAction's single composed verdict (the front twin of
 * agentimpl.Decision): allowed when EVERY applicable axis passes; on the FIRST violation
 * in precedence, allowed:false with the failing axis's BlockReason and deniedAxis.
 */
export interface GateDecision {
	allowed: boolean;
	deniedAxis: string;
	blockReason: BlockReason | null;
}

const denyGate = (
	deniedAxis: string,
	blockReason: BlockReason,
): GateDecision => ({
	allowed: false,
	deniedAxis,
	blockReason,
});

/**
 * gateAction — the SINGLE composed, pure, total verdict over all declared axes, in the
 * explicit precedence (gap D3). Returns the FIRST violation, or an allowed decision when
 * every applicable axis passes. hookVerdicts are the per-hook BINARY verdicts (never the
 * agent transcript — §8). The front twin of agentimpl.GateAction.
 */
export function gateAction(
	impl: AgentImplementation,
	act: GateActionInput,
	meter: RunMeter,
	h: HarnessCostBudget,
	b: Budgets,
	ratePerToken: number,
	hookVerdicts: HookVerdict[],
): GateDecision {
	// 1. DETERMINISM — arbitrate is FIRST (gap D3).
	const gap = arbitrateGated(act.agentAction);
	if (gap) return denyGate(AXIS_DETERMINISM, gap);

	// 2. ZONE — the deny-list, BEFORE the path allow-list.
	if (act.target && aboveWaterline(act.target)) {
		return denyGate(AXIS_ZONE, AGENT_WRITE_ABOVE_WATERLINE_REASON);
	}

	// 3. PATH — the confinement allow-list (default-deny).
	if (act.target) {
		const pd = pathAllowed(impl, act.target);
		if (!pd.allowed && pd.blockReason)
			return denyGate(AXIS_PATH, pd.blockReason);
	}

	// 4. EGRESS — declared hosts (empty ⇒ no egress).
	if (act.host) {
		const ed = egressDecision(impl, act.host);
		if (!ed.allowed && ed.blockReason)
			return denyGate(AXIS_EGRESS, ed.blockReason);
	}

	// 5. EXEC — declared subprocess allow-list (empty ⇒ no exec).
	if (act.exec) {
		const xd = execDecision(impl, act.exec);
		if (!xd.allowed && xd.blockReason)
			return denyGate(AXIS_EXEC, xd.blockReason);
	}

	// 6. CAPACITY — the bound MCP (server, tool).
	if (act.server || act.tool) {
		const td = toolAllowed(impl, act.server ?? "", act.tool ?? "");
		if (!td.allowed && td.blockReason)
			return denyGate(AXIS_CAPACITY, td.blockReason);
	}

	// 7. SKILL — the bound skill.
	if (act.skill) {
		const sd = skillAllowed(impl, act.skill);
		if (!sd.allowed && sd.blockReason)
			return denyGate(AXIS_SKILL, sd.blockReason);
	}

	// 8. BUDGET — the min() of the two declared caps (the tightest wins — BA11).
	const bv = checkBudget(meter, h, b, ratePerToken);
	if (!bv.withinBudget && bv.blockReason)
		return denyGate(AXIS_BUDGET, bv.blockReason);

	// 9. HOOK — every mandatory hook ran AND is green.
	const hr = hooksSatisfied(impl, hookVerdicts);
	if (hr) return denyGate(AXIS_HOOK, hr);

	return { allowed: true, deniedAxis: "", blockReason: null };
}

// ── BA14 — the arch-fitness invariant "one single LLM function" ────────────────────────
//
// checkLlmIsolation is the front twin of agentloop.CheckLLMIsolation (Go). It is a PURE
// function over a supplied import graph + the declared policy: it returns every package
// OTHER than the single gated exception (back/runtime/agentloop/provider) that imports an
// LLM SDK. The panel renders the LIVE "what would flip red" preview — adding an LLM-SDK
// import anywhere else turns the rule red. Same (graph, policy) ⇒ same violations (no
// Date.now(), no Math.random(), no I/O — determinism-first, CLAUDE.md §6/§8).

/** The BA14 architectural-invariant violation code. */
export const LLM_SDK_IMPORT_OUTSIDE_PROVIDER =
	"LLM_SDK_IMPORT_OUTSIDE_PROVIDER";

/** ArchFitnessPolicy — the declared invariant: which import prefixes are LLM SDKs, and the
 * single set of packages allowed to import them (the gated exception). */
export interface ArchFitnessPolicy {
	llmSdkPrefixes: string[];
	allowedImporters: string[];
}

/** PackageImports — one node of the import graph. */
export interface PackageImports {
	importPath: string;
	imports: string[];
}

/** ImportGraph — the module's import graph (the input the rule checks). */
export interface ImportGraph {
	packages: PackageImports[];
}

/** LlmIsolationViolation — one breach: a package (not an allowed importer) importing an LLM
 * SDK, with its actionable BlockReason. */
export interface LlmIsolationViolation {
	package: string;
	import: string;
	blockReason: BlockReason;
}

/** DEFAULT_ARCH_FITNESS_POLICY — the live BA14 policy for AIDOS (kept in parity with the Go
 * agentloop.DefaultPolicy() / arch-fitness.json). No SDK is wired yet; the rule pre-enforces
 * the seam. */
export const DEFAULT_ARCH_FITNESS_POLICY: ArchFitnessPolicy = {
	llmSdkPrefixes: [
		"github.com/anthropics/anthropic-sdk-go",
		"github.com/openai/openai-go",
		"google.golang.org/genai",
		"github.com/sashabaranov/go-openai",
	],
	allowedImporters: [
		"github.com/steph-frtech/aidos/back/runtime/agentloop/provider",
	],
};

/** matchesAnyPrefix — segment-aware prefix match (twin of the Go helper): "a/b" matches
 * "a/b" and "a/b/c" but NOT "ab/c". */
function matchesAnyPrefix(path: string, prefixes: string[]): boolean {
	return prefixes.some(
		(p) => p !== "" && (path === p || path.startsWith(`${p}/`)),
	);
}

function llmIsolationBlockReason(
	pkg: string,
	imp: string,
	allowed: string,
): BlockReason {
	return {
		code: LLM_SDK_IMPORT_OUTSIDE_PROVIDER,
		severity: "blocking",
		explanation:
			`Refus de l'arch-fitness — invariant « une seule fonction LLM » : le paquet ${pkg} ` +
			`importe un SDK LLM (${imp}). Seul ${allowed} peut importer le SDK LLM — le LLM est ` +
			"l'EXCEPTION gatée, isolée à un seul endroit (CLAUDE.md §6/§8). Cette règle le refuse au build.",
		howToFix: [
			`route_through_provider : faites passer tout appel LLM par le paquet provider (${allowed}) — l'unique exception gatée.`,
			"prefer_deterministic : si l'usage peut être une fonction pure, il DOIT l'être (determinism-first) — pas un appel LLM de plus.",
			"widen_via_goal : autoriser un 2ᵉ importateur est un changement de vérité (idée → miroir → /goal → approbation), jamais un élargissement silencieux.",
		],
	};
}

/** checkLlmIsolation — the PURE arch-fitness rule: one violation per (package, import) where
 * the import is an LLM SDK and the package is not an allowed importer, in graph order. An
 * empty result means the invariant holds. */
export function checkLlmIsolation(
	g: ImportGraph,
	p: ArchFitnessPolicy,
): LlmIsolationViolation[] {
	const allowedName =
		p.allowedImporters[0] ?? "back/runtime/agentloop/provider";
	const out: LlmIsolationViolation[] = [];
	for (const pkg of g.packages) {
		if (matchesAnyPrefix(pkg.importPath, p.allowedImporters)) continue;
		for (const imp of pkg.imports) {
			if (matchesAnyPrefix(imp, p.llmSdkPrefixes)) {
				out.push({
					package: pkg.importPath,
					import: imp,
					blockReason: llmIsolationBlockReason(
						pkg.importPath,
						imp,
						allowedName,
					),
				});
			}
		}
	}
	return out;
}
