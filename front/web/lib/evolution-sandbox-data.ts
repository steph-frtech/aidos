// Deterministic example data for the /evolution-sandbox panel. These are EXAMPLE
// inputs (illustrative variant ids — var-7, var-9, var-3 from the S42 spec), not
// authored truths: the panel re-runs the pure twin (confine/promote) over them. The
// quarantine write ledger mixes can_write and cannot_write paths so the wall is
// visible; the candidates exercise the three-condition promotion gate.

import type { Evidence } from "@/lib/evolution-sandbox";

export interface WriteLedgerEntry {
	path: string;
	// kind labels the row for the tutorial — branch | report | idea | governing.
	kind: "branch" | "report" | "idea" | "governing";
}

// The quarantine write ledger: three allowed can_write writes + four governing
// cannot_write writes (each will render RED with its BlockReason).
export const WRITE_LEDGER: readonly WriteLedgerEntry[] = [
	{ path: "/branches/evolution/var-7", kind: "branch" },
	{ path: "/reports/var-7.json", kind: "report" },
	{ path: "/ideas/proposed/retry-cap", kind: "idea" },
	{ path: "/kernel/createOrder.operation", kind: "governing" },
	{ path: "/fitness/createOrder.budget", kind: "governing" },
	{ path: "/authority/createOrder", kind: "governing" },
	{ path: "/mirrors/above/createOrder.feature", kind: "governing" },
] as const;

export interface Candidate {
	id: string;
	niche: string;
	evidence: Evidence;
	// score is the in-sample backtest score — shown to make the anti-Goodhart anchor
	// visible: a RED-mirror candidate with a HIGHER score is still NOT promotable.
	score: number;
}

// The MAP-Elites niche grid candidates of this run. var-7 passes all three; var-9 has
// a RED mirror but the HIGHEST score (not promotable); var-3 passes the mirror but
// fails out-of-sample.
export const CANDIDATES: readonly Candidate[] = [
	{
		id: "var-7",
		niche: "createOrder/discount",
		evidence: {
			mirror: "green",
			outOfSample: "green",
			authorityApproved: true,
			fitness: 0.72,
		},
		score: 0.72,
	},
	{
		id: "var-9",
		niche: "createOrder/express",
		evidence: {
			mirror: "red",
			outOfSample: "green",
			authorityApproved: true,
			fitness: 0.99,
		},
		score: 0.99,
	},
	{
		id: "var-3",
		niche: "createOrder/bulk",
		evidence: {
			mirror: "green",
			outOfSample: "red",
			authorityApproved: true,
			fitness: 0.81,
		},
		score: 0.81,
	},
] as const;
