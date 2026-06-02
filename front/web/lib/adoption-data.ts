// Seeded, declared scenarios for /adoption (determinism-first: static data, no I/O).
// Each scenario is a read-only capability set + an inventory View the panel re-runs
// through plan() + assemble() live. The live source is fitness.release_pack (SELECT-
// only) fed by the aidos writer via a ChangeSet; until that wiring lands the seeded
// scenarios render meanwhile (OQ-S47-ui-live).

import type { Capability, View } from "./adoption";

export interface Scenario {
	id: string;
	titleKey: string;
	capabilities: Capability[];
	view: View;
}

// The worked-example inventory View — the live CLI surface, Workbench routes, the demo
// cell (the S46 checkout slice), docs index, the test inventory (live mirrors), the
// changelog (from changesets) and the honest known-limits (declared OpenQuestions).
const EXAMPLE_VIEW: View = {
	kernelHead: "head-47",
	cliCommands: [
		{ name: "check", summary: "valider le dépôt de vérité" },
		{ name: "impact", summary: "rayon d'impact d'un changement" },
		{ name: "stable", summary: "sceller une phase stable" },
		{ name: "diff", summary: "SemanticDiff d'un changeset" },
		{ name: "explain", summary: "transformer un blocage en BlockReason" },
		{ name: "goal", summary: "promouvoir une idée en vérité" },
	],
	workbenchRoutes: [
		{ path: "/kernel-debt", title: "Dette du noyau" },
		{ path: "/evolution-sandbox", title: "Bac à sable d'évolution" },
		{ path: "/demo-checkout", title: "Démo checkout" },
		{ path: "/adoption", title: "Adoption + Release v0" },
	],
	demo: { ref: "examples.checkout.full-loop", title: "Slice checkout (S46)" },
	docs: [
		{
			slug: "steps/concept/s47-adoption-release",
			title: "Concept : Adoption + Release",
		},
		{
			slug: "steps/internals/s47-adoption-release",
			title: "Internes : Adoption + Release",
		},
	],
	mirrors: [
		{
			id: "mir-adoption-fixture",
			reflects: "adoption.Plan",
			testKind: "fixture",
		},
		{
			id: "mir-adoption-property",
			reflects: "adoption.Plan",
			testKind: "property",
		},
		{
			id: "mir-release-fixture",
			reflects: "release.Assemble",
			testKind: "fixture",
		},
	],
	changesets: [
		{
			ref: "cs-S47-adoption",
			summary: "S47 : ladder AdoptionStage + Release v0",
		},
		{ ref: "cs-S46-checkout", summary: "S46 : slice checkout de bout en bout" },
	],
	declaredLimits: [
		{
			ref: "OQ-S47-no-install",
			description:
				"ladder + assemble seulement : aucune installation, aucun shipping, aucune publication (autres goals)",
		},
		{
			ref: "OQ-S47-consumed-facts",
			description:
				"RealityMirror / EvolutionSandbox / QualityDiversity et le mapping stage→tier sont CONSOMMÉS, jamais inventés",
		},
		{
			ref: "OQ-S47-ui-live",
			description:
				"le panneau rejoue les scénarios seedés ; le câblage live fitness.release_pack (SELECT-only) suit",
		},
	],
};

export const SCENARIOS: Scenario[] = [
	{
		// The worked example: T0 satisfied, the next ratchet is T1 (one_krd_cell).
		id: "floor-t0",
		titleKey: "scenarioFloor",
		capabilities: ["tests", "mutation"],
		view: EXAMPLE_VIEW,
	},
	{
		// T1 reached: the next ratchet is T2, blocked until the RealityMirror is live.
		id: "t1-cell",
		titleKey: "scenarioT1Cell",
		capabilities: ["tests", "mutation", "one_krd_cell", "kernel", "mirror"],
		view: EXAMPLE_VIEW,
	},
	{
		// T2 unlocked once the RealityMirror is live.
		id: "t2-reality",
		titleKey: "scenarioT2Reality",
		capabilities: [
			"tests",
			"mutation",
			"one_krd_cell",
			"kernel",
			"mirror",
			"reality_mirror_live",
		],
		view: EXAMPLE_VIEW,
	},
	{
		// Through T3: the next ratchet is T4, blocked until the EvolutionSandbox exists.
		id: "t4-sandbox-blocked",
		titleKey: "scenarioT4Blocked",
		capabilities: [
			"tests",
			"mutation",
			"one_krd_cell",
			"kernel",
			"mirror",
			"reality_mirror_live",
			"context_graph",
			"memory",
		],
		view: EXAMPLE_VIEW,
	},
	{
		// An empty capability view + empty inventory → the empty-but-valid pack state.
		id: "empty",
		titleKey: "scenarioEmpty",
		capabilities: [],
		view: {
			kernelHead: "",
			cliCommands: [],
			workbenchRoutes: [],
			demo: {},
			docs: [],
			mirrors: [],
			changesets: [],
			declaredLimits: [],
		},
	},
];
