import type { ConsciousnessReport, SourcedVerdict } from "@/lib/conscience";
import {
	type Column,
	type Facet,
	NON_FUNCTIONAL_COLUMNS,
	RUNGS,
	wireSkeleton,
} from "@/lib/facetwire";

/**
 * Non-action module for /conscience (FK09): the reconciliation scenarios + view types + empty
 * view. Kept OUT of actions.ts because a "use server" module may export ONLY async Server
 * Actions. Each scenario hands the conscience a kernel's FK08 facet skeleton + the extra sourced
 * verdicts of the existing judges, demonstrating the FK09 outcomes: aligned (no card), a runner
 * divergence (its decision card), a broken hard facet (a security card + drift), and a broken
 * soft X facet (advisory card, stays aligned).
 */

function alignedSkeleton() {
	const cols: Column[] = NON_FUNCTIONAL_COLUMNS.map((facet: Facet) => ({
		kernel_id: "checkout",
		facet,
		rungs: RUNGS.map((rung) => ({ rung, declared: true, proven: true })),
	}));
	return wireSkeleton({ kernel_id: "checkout", columns: cols });
}

function brokenSkeleton(broken: Facet) {
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

export interface Scenario {
	id: string;
	label: string;
	skeleton: ReturnType<typeof wireSkeleton>;
	verdicts: SourcedVerdict[];
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

/** the four FK09 demonstration scenarios. */
export const SCENARIOS: Scenario[] = [
	{
		id: "aligned",
		label: "Tout aligné — aucune decision card",
		skeleton: alignedSkeleton(),
		verdicts: [runnerGreen, completenessGreen],
	},
	{
		id: "runner-drift",
		label: "Drift du runner (s2↔s9) — produit sa decision card",
		skeleton: alignedSkeleton(),
		verdicts: [
			{
				source: "runner",
				facet: "F",
				pair: "s2↔s9",
				verdict: "red",
				drift: "semantic_drift",
				detail: "le code accepte 31 jours ; le contrat dit 30",
				blast: "medium",
			},
			completenessGreen,
		],
	},
	{
		id: "break-security",
		label: "Casser une paire de S (Sécurité) — carte de blocage",
		skeleton: brokenSkeleton("S"),
		verdicts: [runnerGreen],
	},
	{
		id: "break-experience",
		label: "Casser une paire de X (Expérience) — carte advisory, reste aligné",
		skeleton: brokenSkeleton("X"),
		verdicts: [runnerGreen],
	},
];

export interface ConscienceView {
	ok: boolean;
	report?: ConsciousnessReport;
	deterministic?: boolean;
	error?: string;
}

export const emptyView: ConscienceView = { ok: false };
