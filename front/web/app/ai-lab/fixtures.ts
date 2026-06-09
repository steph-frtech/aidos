import {
	buildGrid,
	type ChatTurn,
	type CockpitState,
	type GeneratedSpec,
	type GridCell,
	type Mode,
	type PairScope,
	type ProposedSlot,
	turnId,
	type WallRefusal,
} from "@/lib/ai-lab";
import {
	type ConsciousnessReport,
	reconcile,
	type SourcedVerdict,
} from "@/lib/conscience";
import {
	type Column,
	type Facet,
	NON_FUNCTIONAL_COLUMNS,
	RUNGS,
	wireSkeleton,
} from "@/lib/facetwire";

/**
 * Non-action module for /ai-lab (FK11 — the AI Lab cockpit, the trialogue). The view types + the
 * demonstration scenarios + the empty view. Kept OUT of actions.ts because a "use server" module
 * may export ONLY async Server Actions. Each scenario hands the cockpit a kernel's FK08 facet
 * skeleton + the extra sourced verdicts of the existing judges (FK09), so the cockpit composes a
 * CENTRE navigable layer (voyants per pair), a DROITE of decision cards + red-wave + blast +
 * promotion gate, and a GAUCHE chat scoped to the open node.
 */

function skeleton(broken: Facet | null) {
	const cols: Column[] = NON_FUNCTIONAL_COLUMNS.map((facet: Facet) => ({
		kernel_id: "checkout",
		facet,
		rungs: RUNGS.map((rung) => ({
			rung,
			declared: true,
			proven: !(facet === broken && rung === "6-evidence"),
		})),
	}));
	return wireSkeleton({ kernel_id: "checkout", columns: cols });
}

const runnerGreen: SourcedVerdict = {
	source: "runner",
	facet: "F",
	pair: "s2↔s9",
	verdict: "green",
};
const completenessGreen: SourcedVerdict = {
	source: "completeness",
	facet: "F",
	pair: "completeness",
	verdict: "green",
};
/** a BELOW-the-line sensor verdict (read-only from the cockpit) — so the wall is drawn both sides. */
const sensorGreen: SourcedVerdict = {
	source: "sensor",
	facet: "F",
	pair: "latency-meter",
	verdict: "green",
};
const runnerRed: SourcedVerdict = {
	source: "runner",
	facet: "F",
	pair: "s2↔s9",
	verdict: "red",
	drift: "semantic_drift",
	detail: "le code accepte 31 jours ; le contrat dit 30",
	blast: "medium",
};

export interface Scenario {
	id: string;
	label: string;
	report: ConsciousnessReport;
}

/** The FK11 cockpit scenarios: aligned, a runner drift (red wave + card), a broken hard facet. */
export const SCENARIOS: Scenario[] = [
	{
		id: "aligned",
		label: "Tout aligné — voyants verts, aucune carte",
		report: reconcile({
			kernel_id: "checkout",
			skeleton: skeleton(null),
			verdicts: [runnerGreen, completenessGreen, sensorGreen],
		}),
	},
	{
		id: "runner-drift",
		label: "Drift du runner (s2↔s9) 🔴 — sa decision card + red wave",
		report: reconcile({
			kernel_id: "checkout",
			skeleton: skeleton(null),
			verdicts: [runnerRed, completenessGreen, sensorGreen],
		}),
	},
	{
		id: "break-security",
		label: "Casser une paire de S (Sécurité) 🔴 — carte de blocage",
		report: reconcile({
			kernel_id: "checkout",
			skeleton: skeleton("S"),
			verdicts: [runnerGreen, sensorGreen],
		}),
	},
];

export function scenario(id: string): Scenario | undefined {
	return SCENARIOS.find((s) => s.id === id);
}

/** The promotion gate (DROITE, FK10) shown in the cockpit — a declared, deterministic sample. */
export const SAMPLE_GATE = { level: 2, canPromote: false, nextLevel: 3 };

export interface CockpitView {
	ok: boolean;
	state?: CockpitState;
	deterministic?: boolean;
	slot?: ProposedSlot;
	refusal?: WallRefusal;
	scope?: PairScope;
	flippedPair?: string;
	openedGoal?: boolean;
	error?: string;
}

export const emptyView: CockpitView = { ok: false };

export const DEFAULT_MODE: Mode = "navigational";

// ── The 6×6 generative lab view (FKE-38, corrected) ──────────────────────────

/** The 6 facet COLUMNS of the 6×6 grid (F·S·B·R·V·M — I/X kept off the default grid). */
export const GRID_FACETS: Facet[] = ["F", "S", "B", "R", "V", "M"];

/**
 * Seeded DIVERGENT machine cells (key `pairId@facet`): a contract whose security machine
 * diverges from its spec — the conscience computes it 🔴 even after a spec is generated there,
 * so the lab shows « une spec générée dont la machine diverge ». DECLARED, deterministic.
 */
export const SEEDED_DIVERGENT: string[] = ["contract@S"];

/** The 6×6 generative lab view: the chat THREAD + accumulated specs + the rebuilt grid. */
export interface LabView {
	ok: boolean;
	selectedFacet: Facet;
	/** the multi-turn conversation (user + left-brain assistant turns). */
	thread: ChatTurn[];
	specs: GeneratedSpec[];
	cells: GridCell[];
	refusal?: WallRefusal;
	error?: string;
}

export function emptyLab(): LabView {
	return {
		ok: true,
		selectedFacet: "F",
		thread: [
			{
				id: turnId(0, "assistant"),
				role: "assistant",
				text: "",
				reply: { kind: "greeting" },
			},
		],
		specs: [],
		cells: buildGrid({
			facets: GRID_FACETS,
			specs: [],
			divergent: SEEDED_DIVERGENT,
		}),
	};
}
