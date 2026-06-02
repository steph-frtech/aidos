/**
 * RealityMirror — the Workbench /incidents-to-ideas source (AIDOS step S43).
 *
 * KRD §53/§67/§117/§1099: the EXTERNAL loop (boucle ③) that turns a prod incident /
 * telemetry signal into an `Idea` DRAFT, so reality becomes a SENSOR that injects ideas:
 *
 *     Incident → Learn → Idea (draft, incident:#NNNN) → [human] Mirror → Goal → Kernel
 *
 * "Le système a appris du MONDE, pas de lui-même." An Incident is REALITY — a recurring
 * failure / breached budget that no existing fixture covered. It carries a signal + a cause
 * SKETCH (a hypothesis, never a falsifiable assertion) + the incident_derived taint, and — by
 * construction — NO version-freeze and NO mirror. That double absence is what makes it reality
 * and not a truth: an incident PROPOSES a mirror, it is not one.
 *
 * This module is the DECLARED TWIN of the Go package back/runtime/reality — the SAME
 * always-blocked ToKernel gate, the SAME conservative proposes inference (unset ⇒ OpenQuestion,
 * never guessed), the SAME REALITY_CANNOT_DECLARE_TRUTH refusal, the SAME single outward edge to
 * the S27 idea door. One semantics, no drift — so /incidents-to-ideas renders EXACTLY what the
 * Go engine computes. The reproducibility mirror lib/reality.test.ts (fast-check) pins it.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /incidents-to-ideas PROJECTS the external
 * loop and the blocked edge; it never re-implements it as truth. incidents.* is below the
 * waterline (the agent observes/appends incidents); the kernel write at the far end is the
 * human's mirror + /goal + approval, never this screen.
 */

/** The closed taint enum (twin of firewall.Taint) — an incident's provenance-quality markers. */
export type Taint =
	| "unverified"
	| "stale"
	| "user_claim"
	| "incident_derived"
	| "external_source";

/** The proposes kinds an idea may target (twin of ideas.Proposes); "" = unset (unpinned). */
export type Proposes =
	| ""
	| "control"
	| "policy"
	| "operation"
	| "action"
	| "entity"
	| "product";

/** The observed reality of an incident (twin of reality.Signal). */
export interface Signal {
	operation: string;
	error: string;
	recurrence: number;
}

/**
 * An Incident as the panel renders it (twin of reality.Incident): reality, never truth. It
 * carries NO version and NO mirror field — that absence is the contract. `ideaId` is set once
 * /learn has run (the loop traced back).
 */
export interface Incident {
	id: string;
	ref: string;
	signal: Signal;
	causeSketch: string;
	taint: Taint[];
	linkedBranches: string[];
	ideaId?: string;
}

/** The actionable refusal shape (mirrors blockreason.BlockReason, KRD §44.5). */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** The canonical REALITY_CANNOT_DECLARE_TRUTH BlockReason — the twin of blockreason.For (FR). */
export const REALITY_CANNOT_DECLARE_TRUTH: BlockReason = {
	code: "REALITY_CANNOT_DECLARE_TRUTH",
	severity: "blocking",
	explanation:
		"Refus du RealityMirror (boucle externe, KRD §53/§67/§117/§1099) : un incident de prod / un signal de télémétrie est de la RÉALITÉ, jamais une vérité. La réalité est un sensor qui LIT le monde et PROPOSE — elle n'écrit jamais le noyau. Juger qu'un désaccord avec le réel est vrai est une DÉCISION DE VÉRITÉ, au-dessus de la ligne, détenue par l'humain + la réalité, pas par l'agent. La seule arête sortante d'un RealityMirror est vers la porte idea-intake (S27) : un incident devient une idée DRAFT, jamais une vérité.",
	howToFix: [
		"incident_then_learn_then_mirror_then_goal_then_approval : observez l'incident → /learn le transforme en idée DRAFT (provenance incident:#NNNN) → écrivez son miroir (le /goal) → approbation de l'autorité → gel dans /kernel.",
		"reality_proposes_only : la boucle externe lit la réalité et PROPOSE une idée ; elle n'écrit jamais /kernel, /mirrors ou /fitness — il n'existe aucune porte Incident → Kernel.",
		"rerun aidos check : le blocage est permanent sur l'arête directe ; la seule sortie est l'idée DRAFT remise à l'idea-intake (S27), qui doit encore acquérir son miroir.",
	],
};

/**
 * inferProposes — the conservative mapping (twin of reality.InferProposes). A failing OPERATION
 * reference pins proposes=operation; anything else is UNPINNED (returns ["", false]) — a kind is
 * NEVER guessed (CLAUDE.md §8 honesty). Pure.
 */
export function inferProposes(sig: Signal): [Proposes, boolean] {
	if (sig.operation !== "") {
		return ["operation", true];
	}
	return ["", false];
}

/** The DRAFT idea an incident becomes via Learn (twin of reality.IdeaCandidate). */
export interface IdeaCandidate {
	/** The idea's provenance points back to the incident — incident:#NNNN, verbatim. */
	provenanceSource: "incident";
	provenanceDetail: string;
	intent: string;
	proposes: Proposes;
	status: "draft";
	/** Whether the signal pinned proposes; when false, openQuestion carries the honest note. */
	proposesPinned: boolean;
	openQuestion?: string;
	/** The idea still has NO mirror — it must acquire one via /goal to reach the kernel. */
	hasMirror: false;
	/** ALWAYS false — Learn performs no kernel write (promotion is the /goal flow, S27). */
	wroteKernel: false;
}

/**
 * learn — map an incident into the SHAPE of an S27 idea (twin of reality.Learn). The idea is a
 * DRAFT whose provenance points back to the incident VERBATIM, whose intent is the cause SKETCH,
 * and whose proposes is inferred ONLY when the signal pins it (else unset with an OpenQuestion).
 * Learn performs no kernel write. Pure.
 */
export function learn(inc: Incident): IdeaCandidate {
	const [proposes, pinned] = inferProposes(inc.signal);
	const cand: IdeaCandidate = {
		provenanceSource: "incident",
		provenanceDetail: inc.ref,
		intent: inc.causeSketch,
		proposes,
		status: "draft",
		proposesPinned: pinned,
		hasMirror: false,
		wroteKernel: false,
	};
	if (!pinned) {
		cand.openQuestion = `OQ: le signal de l'incident ${inc.ref} ne fixe pas de couche \`proposes\` — laissée non définie (jamais devinée). L'humain décide la couche visée en écrivant le miroir au /goal.`;
	}
	return cand;
}

/**
 * toKernel — the GATE (twin of reality.ToKernel). It ALWAYS refuses the direct edge
 * Incident → Kernel, returning REALITY_CANNOT_DECLARE_TRUTH — REGARDLESS of recurrence or taint.
 * There is no "high-recurrence" bypass. It never returns null (a kernel write never occurs).
 * Pure, total.
 */
export function toKernel(_inc: Incident): BlockReason {
	return REALITY_CANNOT_DECLARE_TRUTH;
}

/** The stages of the external loop, in order (what the pipeline renders). */
export const FLOW_STAGES = [
	"Incident",
	"Learn",
	"Idea",
	"Mirror",
	"Goal",
	"Kernel",
] as const;
export type FlowStage = (typeof FLOW_STAGES)[number];
