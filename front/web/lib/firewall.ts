/**
 * MemoryFirewall — the Workbench /memory-firewall source (AIDOS step S30).
 *
 * KRD §119.1: the gate in the engine-side `/brain` store that forbids any `MemoryItem` from
 * reaching the kernel except through the mandatory one-way flow:
 *
 *     Memory → ContextPack → Idea → Mirror → Goal → Kernel
 *
 * "La mémoire propose ; le noyau déclare le vrai." A MemoryItem is CONTEXT FUEL, never a truth:
 * it carries content + provenance + validity_scope + expires_at + confidence + taint, and — by
 * construction — NO version-freeze and NO mirror. That double absence is what makes it memory
 * and not a truth.
 *
 * This module is the DECLARED TWIN of the Go package back/archive/brain/firewall — the SAME
 * always-blocked ToKernel gate, the SAME closed taint enum, the SAME MEMORY_CANNOT_DECLARE_TRUTH
 * refusal, the SAME six-stage flow. One semantics, no drift — so /memory-firewall renders
 * EXACTLY what the Go engine computes. The reproducibility mirror lib/firewall.test.ts
 * (fast-check) pins it.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /memory-firewall PROJECTS the firewall and
 * the blocked edge; it never re-implements the firewall as truth. The `/brain` store is below
 * the waterline (the agent reads/appends memory); the kernel write at the far end is the aidos
 * CLI role via /goal, never this screen.
 */

/** The closed taint enum (twin of firewall.Taint) — a memory's provenance-quality markers. */
export type Taint =
	| "unverified"
	| "stale"
	| "user_claim"
	| "incident_derived"
	| "external_source";

/** The closed taint enum in canonical order (twin of firewall.Taints). */
export const TAINTS: Taint[] = [
	"unverified",
	"stale",
	"user_claim",
	"incident_derived",
	"external_source",
];

/**
 * A MemoryItem as the panel renders it (twin of firewall.MemoryItem): context fuel, never
 * truth. It carries NO version and NO mirror field — that absence is the contract.
 */
export interface MemoryItem {
	id: string;
	content: string;
	provenance: string;
	validityScope: string;
	expiresAt: string;
	confidence: number;
	taint: Taint[];
	branch: string;
}

/** A memory proposed into a goal's ContextPack (twin of firewall.ContextPackEntry). */
export interface ContextPackEntry {
	memoryId: string;
	goal: string;
	content: string;
	/** taint travels with the entry — never silently dropped. */
	taint: Taint[];
}

/** The actionable refusal shape (mirrors blockreason.BlockReason, KRD §44.5). */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** The canonical MEMORY_CANNOT_DECLARE_TRUTH BlockReason — the twin of blockreason.For (FR). */
export const MEMORY_CANNOT_DECLARE_TRUTH: BlockReason = {
	code: "MEMORY_CANNOT_DECLARE_TRUTH",
	severity: "blocking",
	explanation:
		"Refus du MemoryFirewall (KRD §119.1) : un `MemoryItem` est du carburant de contexte, JAMAIS une vérité. Aucune mémoire n'entre dans /kernel par l'arête directe Memory → Kernel ; la seule porte est le flux obligatoire à sens unique Memory → ContextPack → Idea → Mirror → Goal → Kernel — quels que soient sa confiance ou son taint (même une mémoire propre et pleinement confiante n'est pas une vérité). « La mémoire propose ; le noyau déclare le vrai. »",
	howToFix: [
		"memory_to_contextpack_to_idea_to_mirror_to_goal_to_kernel : routez la mémoire par le flux complet — proposez-la dans un ContextPack, puis remettez-la à l'idea-intake (S27) comme idée draft.",
		"write_mirror_run_goal_freeze : l'idée draft DOIT encore acquérir son miroir (le /goal) pour atteindre le noyau ; sans miroir, aucune idée n'entre jamais dans /kernel.",
		"assign_authority : faites approuver le /goal par l'autorité du sous-graphe (idea → mirror → /goal → approbation).",
		"rerun aidos check : le gel dans /kernel est écrit par le rôle `aidos` via /goal, jamais par la mémoire ni par l'agent.",
	],
};

/**
 * propose — pack a memory into a goal's ContextPack entry (twin of firewall.Propose). The
 * allowed read-side edge of the flow; the taint travels with the entry, in order — never
 * silently dropped. Pure.
 */
export function propose(m: MemoryItem, goal: string): ContextPackEntry {
	return {
		memoryId: m.id,
		goal,
		content: m.content,
		taint: [...m.taint],
	};
}

/**
 * toKernel — the GATE (twin of firewall.ToKernel). It ALWAYS refuses the direct edge
 * Memory → Kernel, returning MEMORY_CANNOT_DECLARE_TRUTH — REGARDLESS of confidence or taint.
 * There is no "trusted-memory" bypass: a clean, fully-confident memory is STILL not truth. It
 * never returns null (a kernel write never occurs). Pure, total.
 */
export function toKernel(_m: MemoryItem): BlockReason {
	return MEMORY_CANNOT_DECLARE_TRUTH;
}

/** The DRAFT idea a memory becomes via the only legal door (twin of firewall.IdeaCandidate). */
export interface IdeaCandidate {
	/** The idea's provenance points back to the memory — `memory:<id>`. */
	provenance: string;
	intent: string;
	status: "draft";
	/** The idea still has NO mirror — it must acquire one via /goal to reach the kernel. */
	hasMirror: false;
	/** ALWAYS false — ViaIdea performs no kernel write (promotion is the /goal flow, S27). */
	wroteKernel: false;
}

/**
 * viaIdea — route a memory through the ONLY legal door (twin of firewall.ViaIdea). It hands the
 * memory's content to the S27 idea-intake as a `draft` idea whose provenance points back to the
 * memory. The idea STILL has no mirror; ViaIdea performs no kernel write. Pure.
 */
export function viaIdea(m: MemoryItem): IdeaCandidate {
	return {
		provenance: `memory:${m.id}`,
		intent: m.content,
		status: "draft",
		hasMirror: false,
		wroteKernel: false,
	};
}

/** The six stages of the mandatory one-way flow, in order (what the pipeline renders). */
export const FLOW_STAGES = [
	"Memory",
	"ContextPack",
	"Idea",
	"Mirror",
	"Goal",
	"Kernel",
] as const;
export type FlowStage = (typeof FLOW_STAGES)[number];
