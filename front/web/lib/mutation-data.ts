// Seeded, declared scenarios for /mutation-score (determinism-first: static data,
// no I/O). Each scenario is a (report, threshold) pair the panel re-runs through
// the gate() twin live. The declared threshold (0.80) is the EXAMPLE bar read
// SELECT-only from fitness above the line — rendered READ-ONLY (no loop edits it).
// The live source is runtime.mutation_runs + fitness (SELECT-only); until that
// wiring lands the seeded scenarios render meanwhile (OQ-S40-ui-live).

import type { MutationReport } from "./mutation";

// The declared mutation-score bar, read SELECT-only from fitness (above the
// waterline). This is an EXAMPLE value rendered read-only — NOT authored here.
export const DECLARED_THRESHOLD = 0.8;

export interface Scenario {
	id: string;
	titleKey: string;
	report: MutationReport;
	// threshold for THIS scenario: the declared bar, or null to demonstrate the
	// MISSING_THRESHOLD block (the gate never invents a bar).
	threshold: number | null;
}

const SURVIVORS_40: MutationReport["survivingMutants"] = Array.from(
	{ length: 3 },
	(_, i) => ({
		file: "back/kernel/eval.go",
		line: 12 + i,
		operator: "CONDITIONALS_BOUNDARY",
		gap: "no invariant on the boundary — add a property/fixture",
	}),
);

// THE done criterion: a 40% report blocks the 80% bar.
function below(): MutationReport {
	return {
		scope: "go",
		runner: "gremlins",
		killed: 40,
		survived: 60,
		timedOut: 0,
		notCovered: 0,
		total: 100,
		survivingMutants: SURVIVORS_40,
	};
}

// A 80% report passes the 80% bar.
function atBar(): MutationReport {
	return {
		scope: "go",
		runner: "gremlins",
		killed: 80,
		survived: 20,
		timedOut: 0,
		notCovered: 0,
		total: 100,
		survivingMutants: [],
	};
}

// A weakened mirror: one boundary mutant survives → 0.75 < 0.80 (fault-injection).
function weakened(): MutationReport {
	return {
		scope: "go",
		runner: "gremlins",
		killed: 75,
		survived: 25,
		timedOut: 0,
		notCovered: 0,
		total: 100,
		survivingMutants: [
			{
				file: "back/kernel/eval.go",
				line: 12,
				operator: "CONDITIONALS_BOUNDARY",
				gap: "weakened mirror — the densimètre read the hole",
			},
		],
	};
}

export const SCENARIOS: Scenario[] = [
	{
		id: "below",
		titleKey: "scenarioBelow",
		report: below(),
		threshold: DECLARED_THRESHOLD,
	},
	{
		id: "at-bar",
		titleKey: "scenarioAtBar",
		report: atBar(),
		threshold: DECLARED_THRESHOLD,
	},
	{
		id: "weakened",
		titleKey: "scenarioWeakened",
		report: weakened(),
		threshold: DECLARED_THRESHOLD,
	},
	{
		id: "missing-threshold",
		titleKey: "scenarioMissingThreshold",
		report: atBar(),
		threshold: null,
	},
];

// A representative append-only run history (the serrage journal), as the panel
// projects runtime.mutation_runs.
export interface RunHistoryRow {
	runId: string;
	scope: string;
	score: number;
	threshold: number;
	verdict: "pass" | "block";
	startedAt: string;
}

export const RUN_HISTORY: RunHistoryRow[] = [
	{
		runId: "run-3",
		scope: "go",
		score: 0.8,
		threshold: 0.8,
		verdict: "pass",
		startedAt: "2026-06-01T09:00:00Z",
	},
	{
		runId: "run-2",
		scope: "go",
		score: 0.75,
		threshold: 0.8,
		verdict: "block",
		startedAt: "2026-05-31T18:00:00Z",
	},
	{
		runId: "run-1",
		scope: "go",
		score: 0.4,
		threshold: 0.8,
		verdict: "block",
		startedAt: "2026-05-31T12:00:00Z",
	},
];
