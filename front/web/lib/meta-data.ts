// Seeded, declared scenarios for /meta (determinism-first: static data, no I/O). Each
// scenario is a Harness the panel re-runs through the run() twin live. The fitness
// baseline rows + their faux hash are the graven NIVEAU 3 the self-test asserts
// unchanged — rendered READ-ONLY (no loop edits this). The live source is
// runtime.self_test_runs + fitness (SELECT-only); until that wiring lands the seeded
// scenarios render meanwhile (OQ-S39-ui-live).

import { CANONICAL_SENSORS, fauxHash, type Harness } from "./meta";

// The graven fitness baseline (NIVEAU 3): the waterline + the definition of "passed".
// Owned by the human + reality — no loop edits it.
export const FITNESS_BASELINE_ROWS = JSON.stringify({
	waterline: {
		above: ["kernel", "mirrors", "fitness"],
		below: ["runtime", "gen"],
	},
	definition_of_passed:
		"red_set_green AND prior_green_intact AND mutation_ge_threshold AND no_monster",
});

export const FITNESS_BASELINE_HASH = fauxHash(FITNESS_BASELINE_ROWS);

export interface Scenario {
	id: string;
	titleKey: string;
	harness: Harness;
}

// The healthy harness: every guarantee holds (THE done criterion).
function healthy(): Harness {
	return {
		sensors: [...CANONICAL_SENSORS],
		mutedSensors: [],
		breachedSchemas: [],
		fitnessRows: FITNESS_BASELINE_ROWS,
		baselineHash: FITNESS_BASELINE_HASH,
	};
}

export const SCENARIOS: Scenario[] = [
	{ id: "healthy", titleKey: "scenarioHealthy", harness: healthy() },
	{
		id: "muted-sensor",
		titleKey: "scenarioMutedSensor",
		harness: { ...healthy(), mutedSensors: ["archtest"] },
	},
	{
		id: "breached-wall",
		titleKey: "scenarioBreachedWall",
		harness: { ...healthy(), breachedSchemas: ["kernel"] },
	},
	{
		id: "mutated-fitness",
		titleKey: "scenarioMutatedFitness",
		harness: {
			...healthy(),
			fitnessRows: JSON.stringify({
				definition_of_passed: "anything I declare green",
				waterline: { above: [], below: ["everything"] },
			}),
		},
	},
];

// The append-only run history seed (most recent first) — the ledger the panel shows
// below the latest run. Each row is a prior self-test outcome (verdict + when).
export interface RunHistoryRow {
	at: string;
	verdict: "green" | "red";
	code?: string;
}

export const RUN_HISTORY: RunHistoryRow[] = [
	{ at: "2026-06-01T08:00:00Z", verdict: "green" },
	{ at: "2026-05-31T08:00:00Z", verdict: "green" },
	{ at: "2026-05-30T08:00:00Z", verdict: "red", code: "FITNESS_MUTATED" },
	{ at: "2026-05-30T07:30:00Z", verdict: "green" },
];

export const SELF_TEST_AT = "2026-06-01T10:00:00Z";
