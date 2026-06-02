// Seeded, declared scenarios for /kernel-debt (determinism-first: static data, no
// I/O). Each scenario is a read-only Snapshot the panel re-runs through scan() +
// suggestTrim() live. The live source is fitness.kernel_debt_snapshot (SELECT-only)
// fed by the aidos writer via a ChangeSet; until that wiring lands the seeded
// scenarios render meanwhile (OQ-S41-ui-live).

import type { Snapshot } from "./kernel-debt";

export interface Scenario {
	id: string;
	titleKey: string;
	snapshot: Snapshot;
}

// A snapshot carrying all three kinds of rot at once (the worked example).
const ALL_THREE: Snapshot = {
	kernelHead: "head-1",
	mutationRunRef: "mut-run-7",
	truths: [
		{ id: "truth-2", version: "v3", live: true },
		{ id: "truth-3", version: "v1", live: true },
	],
	mirrors: [
		{
			id: "mir-9",
			reflects: { layerId: "truth-GONE", version: "v1" },
			testKind: "property",
			liveness: "alive",
		},
		{
			id: "fix-4",
			reflects: { layerId: "truth-2", version: "v1" },
			testKind: "fixture",
			liveness: "alive",
		},
		{
			id: "mir-5",
			reflects: { layerId: "truth-3", version: "v1" },
			testKind: "property",
			liveness: "alive",
		},
	],
	mutation: [
		{
			target: "truth-3",
			status: "survived",
			file: "back/kernel/eval.go",
			line: 12,
			operator: "CONDITIONALS_BOUNDARY",
		},
	],
};

const ORPHAN_ONLY: Snapshot = {
	kernelHead: "head-1",
	truths: [{ id: "truth-1", version: "v1", live: true }],
	mirrors: [
		{
			id: "mir-9",
			reflects: { layerId: "truth-GONE", version: "v1" },
			testKind: "property",
			liveness: "alive",
		},
	],
	mutation: [],
};

const STALE_ONLY: Snapshot = {
	kernelHead: "head-1",
	truths: [{ id: "truth-2", version: "v3", live: true }],
	mirrors: [
		{
			id: "fix-4",
			reflects: { layerId: "truth-2", version: "v1" },
			testKind: "fixture",
			liveness: "alive",
		},
	],
	mutation: [],
};

const SURVIVOR_ONLY: Snapshot = {
	kernelHead: "head-1",
	mutationRunRef: "mut-run-7",
	truths: [{ id: "truth-3", version: "v1", live: true }],
	mirrors: [
		{
			id: "mir-5",
			reflects: { layerId: "truth-3", version: "v1" },
			testKind: "property",
			liveness: "alive",
		},
	],
	mutation: [
		{
			target: "truth-3",
			status: "survived",
			file: "back/kernel/eval.go",
			line: 12,
			operator: "CONDITIONALS_BOUNDARY",
		},
	],
};

const CLEAN: Snapshot = {
	kernelHead: "head-1",
	truths: [{ id: "truth-1", version: "v1", live: true }],
	mirrors: [
		{
			id: "mir-1",
			reflects: { layerId: "truth-1", version: "v1" },
			testKind: "property",
			liveness: "alive",
		},
	],
	mutation: [{ target: "truth-1", status: "killed" }],
};

export const SCENARIOS: readonly Scenario[] = [
	{ id: "all-three", titleKey: "scenarioAllThree", snapshot: ALL_THREE },
	{ id: "orphan", titleKey: "scenarioOrphan", snapshot: ORPHAN_ONLY },
	{ id: "stale", titleKey: "scenarioStale", snapshot: STALE_ONLY },
	{ id: "survivor", titleKey: "scenarioSurvivor", snapshot: SURVIVOR_ONLY },
	{ id: "clean", titleKey: "scenarioClean", snapshot: CLEAN },
] as const;
