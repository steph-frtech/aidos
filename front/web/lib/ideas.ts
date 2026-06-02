/**
 * Ideas lifecycle — the Workbench /ideas source (AIDOS step S27).
 *
 * KRD §115/§116/§118/§119: an Idea is a CANDIDATE-truth staged ABOVE product but BELOW the freeze —
 * a sketched body (proposes + intent + provenance) with NO version-freeze and NO mirror. That double
 * absence is EXACTLY what makes it an idea and not a truth. The lifecycle runs
 * draft → grilled → {spiking → harvested | harvested}, with a parallel rejected lane (traced, kept).
 * "Promote" is NOT a status — it is the ACT of writing the idea's mirror, which IS the /goal, which
 * IS the freeze into /kernel. An idea with no mirror can NEVER enter the kernel: Promote without a
 * mirror returns the NO_MIRROR_NO_KERNEL BlockReason (the wall, KRD §44.5).
 *
 * This module is the DECLARED TWIN of the Go package back/kernel/ideas — the SAME five statuses, the
 * SAME §75 gestures, the SAME promotion gate (no mirror ⇒ NO_MIRROR_NO_KERNEL with the fix path
 * write_mirror_run_goal_freeze). One semantics, no drift — so /ideas renders EXACTLY the lifecycle
 * the Go deciders compute. The reproducibility mirror lib/ideas.test.ts (fast-check) pins it.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /ideas PROJECTS the lifecycle and the gate
 * verdict; capturing/advancing an idea rides the idea-intake MCP (ideas schema, ABOVE the wall), and
 * a PROMOTION writes a kernel truth via the S20 ChangeSet path under the aidos writer role — never a
 * write from this screen. The agent DB role is SELECT-only on kernel/mirrors (the wall holds).
 */

/** The five lifecycle statuses — the closed set KRD §118 names (no sixth status). */
export type Status = "draft" | "grilled" | "spiking" | "harvested" | "rejected";

/** The layer/kind an idea would become if promoted (KRD §118). */
export type Proposes =
	| "control"
	| "policy"
	| "operation"
	| "action"
	| "entity"
	| "product";

/** The provenance source — the two legal on-ramps (KRD §117). */
export type ProvenanceSource = "human" | "incident";

/** Who/what engendered an idea (KRD §119): source + verbatim detail. */
export interface Provenance {
	source: ProvenanceSource;
	/** The human utterance ("finalement je veux une remise") or the incident ref ("#1234"). */
	detail: string;
}

/**
 * An Idea — a candidate-truth (mirrors ideas.Idea). It carries NO `version` and NO `mirror` field:
 * those two absences are what distinguish an idea from a truth, and the type makes them
 * unrepresentable (there is simply no field for them). The id is the content hash of the sketch.
 */
export interface Idea {
	id: string;
	proposes: Proposes;
	intent: string;
	provenance: Provenance;
	status: Status;
	/** The traced reason an idea was rejected (kept, never deleted). Empty unless rejected. */
	rejectReason?: string;
}

/** The actionable refusal shape (mirrors blockreason.BlockReason, KRD §44.5). */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** The legal outcome of promoting an idea: a kernel truth via /goal, back-linked to the idea. */
export interface Promotion {
	ideaId: string;
	mirrorRef: string;
	/** The back-link the new kernel truth carries — the idea it came from (KRD §119). */
	provenanceIdeaId: string;
}

/** The canonical NO_MIRROR_NO_KERNEL BlockReason — the twin of blockreason.For (FR prose). */
export const NO_MIRROR_NO_KERNEL: BlockReason = {
	code: "NO_MIRROR_NO_KERNEL",
	severity: "blocking",
	explanation:
		"Refus du mur : on promeut une idée vers le noyau SANS miroir. Une idée est une vérité-candidate sans gel ni miroir ; la seule porte vers /kernel est idea → miroir → /goal → gel. Sans miroir, aucune idée n'entre jamais dans le noyau.",
	howToFix: [
		"write_mirror_run_goal_freeze : écrivez le miroir BDD rouge de l'idée — ce rouge EST le /goal, et le /goal EST le gel dans /kernel.",
		"assign_authority : faites approuver le /goal par l'autorité du sous-graphe.",
		"rerun aidos check : la promotion passe le mur dès que l'idée porte son miroir.",
	],
};

/** The legal next-gestures from each status (the state machine; mirrors the Go transitions). */
const TRANSITIONS: Record<Status, Status[]> = {
	draft: ["grilled", "rejected"],
	grilled: ["spiking", "harvested", "rejected"],
	spiking: ["harvested", "rejected"],
	harvested: ["rejected"], // promotion is NOT a status — it is the /goal act.
	rejected: [],
};

/** canPromote: only a harvested idea is eligible (and still needs a mirror). */
export function canPromote(idea: Idea): boolean {
	return idea.status === "harvested";
}

/**
 * promote is the GATE — the deterministic twin of ideas.Promote (KRD §116/§44.5). It refuses unless
 * the idea is harvested AND a non-empty mirror reference is supplied. No mirror ⇒ NO_MIRROR_NO_KERNEL
 * and NO kernel write (the idea stays harvested). A non-empty mirror ⇒ a Promotion whose provenance
 * points back to the idea (the freeze itself is the aidos CLI role via /goal, never here). Exactly
 * one of {promotion, block} is set.
 */
export function promote(
	idea: Idea,
	mirrorRef: string,
): { promotion?: Promotion; block?: BlockReason } {
	if (idea.status !== "harvested" || mirrorRef === "") {
		return { block: NO_MIRROR_NO_KERNEL };
	}
	return {
		promotion: {
			ideaId: idea.id,
			mirrorRef,
			provenanceIdeaId: idea.id,
		},
	};
}

/** An idea has no mirror, by definition — the "no mirror yet" marker is always true here. */
export function hasMirror(): boolean {
	return false;
}

/** legalNext returns the gestures legal from an idea's current status (for the board controls). */
export function legalNext(idea: Idea): Status[] {
	return TRANSITIONS[idea.status];
}

/** byLane groups ideas by status into the board's lanes, in canonical lane order. */
export function lanes(): Status[] {
	return ["draft", "grilled", "spiking", "harvested", "rejected"];
}
