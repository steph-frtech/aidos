import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	auditTimeline,
	COCKPIT_LADDER,
	COCKPIT_PROFILES,
	type CockpitInput,
	defaultLadder,
	livenessAttr,
	livenessOf,
	type PhaseInput,
	profiles,
	project,
} from "./deploy-cockpit";

/**
 * deploy-cockpit.test.ts — the DP29 cockpit projection reproducibility mirror (fast-check). The
 * verdict-for-verdict twin of back/runtime/deploycockpit's property mirror:
 *   1. reproducibility — same input ⇒ byte-identical Projection (same hash) ;
 *   2. liveness is a PURE projection — rouge ⇒ never green, no estimation (stable+no-evidence ⇒
 *      inconnu) ;
 *   3. deployability == the DP26 Stop-gate (a rouge phase is NON-deployable + reasons) ;
 *   4. the DP28 human gate is fail-closed (preview → staging promotable iff validated ∧ served) ;
 *   5. the profiles are the closed DP11 set ; the ladder is the closed DP06 set ;
 *   6. totality — an empty input never throws and yields a stable hash ;
 *   7. content-address sensitivity — a phase-liveness flip changes the hash ;
 *   8. the audit timeline preserves the recorded order (append-only, never re-sorted).
 */

const STABLE_GATE = {
	mutationScore: 0.9,
	mutationThreshold: 0.8,
	monsterCount: 0,
};

function stablePhase(nodeId: string): PhaseInput {
	return {
		nodeId,
		label: nodeId,
		head: true,
		phase: { phaseHash: nodeId, stable: true, reasons: [] },
		gate: STABLE_GATE,
	};
}

function redPhase(nodeId: string): PhaseInput {
	return {
		nodeId,
		phase: {
			phaseHash: nodeId,
			stable: false,
			reasons: ["createOrder.fixture"],
		},
		gate: STABLE_GATE,
	};
}

describe("DP29 — livenessOf is a PURE projection of the cut (never estimates green)", () => {
	it("an UNSTABLE phase is rouge", () => {
		expect(livenessOf(redPhase("p1"))).toBe("rouge");
	});
	it("a STABLE phase WITH evidence is vert", () => {
		expect(livenessOf(stablePhase("p1"))).toBe("vert");
	});
	it("a STABLE phase with NO evidence is inconnu (never green on nothing)", () => {
		expect(livenessOf({ ...stablePhase("p1"), hasEvidence: false })).toBe(
			"inconnu",
		);
	});
	it("a rouge phase is NEVER painted green, ∀ gates", () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0, max: 1, noNaN: true }),
				fc.double({ min: 0, max: 1, noNaN: true }),
				fc.nat({ max: 5 }),
				(score, threshold, monsters) => {
					const p: PhaseInput = {
						nodeId: "p",
						phase: { phaseHash: "p", stable: false, reasons: ["x"] },
						gate: {
							mutationScore: score,
							mutationThreshold: threshold,
							monsterCount: monsters,
						},
					};
					expect(livenessOf(p)).toBe("rouge");
					expect(livenessAttr(livenessOf(p))).toBe("red");
				},
			),
		);
	});
});

describe("DP29 — project() reproducibility (same input ⇒ byte-identical projection)", () => {
	const input: CockpitInput = {
		project: "shop",
		phases: [stablePhase("phase-n"), redPhase("phase-red")],
		environments: [
			{ env: "preview", servedPhaseId: "phase-n", humanValidated: true },
			{ env: "staging", servedPhaseId: "phase-n" },
			{ env: "prod" },
			{ env: "future_cloud" },
		],
	};

	it("two projections of the same input have the same hash", () => {
		expect(project("shop", input).hash).toBe(project("shop", input).hash);
	});

	it("projectID wins over input.project, falls back when empty", () => {
		expect(project("override", input).project).toBe("override");
		expect(project("", input).project).toBe("shop");
	});

	it("the projection is byte-stable across many re-runs (fast-check)", () => {
		fc.assert(
			fc.property(fc.constant(input), (inp) => {
				const a = JSON.stringify(project("shop", inp));
				const b = JSON.stringify(project("shop", inp));
				expect(a).toBe(b);
			}),
		);
	});
});

describe("DP29 — deployability == the DP26 Stop-gate", () => {
	it("a STABLE phase is deployable with no reasons", () => {
		const card = project("shop", {
			project: "shop",
			phases: [stablePhase("phase-n")],
		}).phases[0];
		expect(card.deployable).toBe(true);
		expect(card.reasons).toEqual([]);
		expect(card.liveness).toBe("vert");
	});
	it("a RED phase is NON-deployable and names its reasons (PHASE_NOT_STABLE source)", () => {
		const card = project("shop", {
			project: "shop",
			phases: [redPhase("phase-red")],
		}).phases[0];
		expect(card.deployable).toBe(false);
		expect(card.reasons).toContain("createOrder.fixture");
		expect(card.liveness).toBe("rouge");
	});
	it("a below-threshold mutation score disables deploy even on a stable cut", () => {
		const card = project("shop", {
			project: "shop",
			phases: [
				{
					nodeId: "p",
					phase: { phaseHash: "p", stable: true, reasons: [] },
					gate: { mutationScore: 0.5, mutationThreshold: 0.8, monsterCount: 0 },
				},
			],
		}).phases[0];
		expect(card.deployable).toBe(false);
		expect(card.reasons.length).toBeGreaterThan(0);
	});
});

describe("DP29 — the DP28 human gate is fail-closed (preview → staging)", () => {
	it("a VALIDATED preview deployment is staging-promotable", () => {
		const env = project("shop", {
			project: "shop",
			phases: [stablePhase("phase-n")],
			environments: [
				{ env: "preview", servedPhaseId: "phase-n", humanValidated: true },
			],
		}).environments.find((e) => e.env === "preview");
		expect(env?.humanValidated).toBe(true);
		expect(env?.stagingPromotable).toBe(true);
	});
	it("an UN-validated preview deployment is NOT staging-promotable", () => {
		const env = project("shop", {
			project: "shop",
			phases: [stablePhase("phase-n")],
			environments: [{ env: "preview", servedPhaseId: "phase-n" }],
		}).environments.find((e) => e.env === "preview");
		expect(env?.humanValidated).toBe(false);
		expect(env?.stagingPromotable).toBe(false);
	});
	it("a preview rung with NO served phase is never promotable, even if validated", () => {
		const env = project("shop", {
			project: "shop",
			phases: [],
			environments: [{ env: "preview", humanValidated: true }],
		}).environments.find((e) => e.env === "preview");
		expect(env?.stagingPromotable).toBe(false);
	});
});

describe("DP29 — served-phase liveness + live URL (read from the same projection)", () => {
	it("an env serving a phase colours it from the SAME phase index and gets an https URL", () => {
		const proj = project("shop", {
			project: "shop",
			phases: [redPhase("phase-red")],
			environments: [{ env: "prod", servedPhaseId: "phase-red" }],
		});
		const env = proj.environments.find((e) => e.env === "prod");
		// the served-phase liveness equals the phase card's liveness (one source).
		expect(env?.servedLiveness).toBe("rouge");
		expect(env?.liveUrl).toMatch(/^https:\/\//);
	});
	it("an env serving NOTHING has no URL and no served-liveness", () => {
		const env = project("shop", {
			project: "shop",
			phases: [stablePhase("phase-n")],
			environments: [{ env: "prod" }],
		}).environments.find((e) => e.env === "prod");
		expect(env?.liveUrl).toBeUndefined();
		expect(env?.servedLiveness).toBeUndefined();
	});
});

describe("DP29 — the closed sets (DP11 profiles, DP06 ladder)", () => {
	it("the profile set is the closed DP11 nine-rung set in canonical order", () => {
		expect(profiles()).toEqual([
			"core",
			"docs",
			"observability",
			"qa",
			"git",
			"tickets",
			"connectors",
			"non-prod",
			"full",
		]);
		expect(COCKPIT_PROFILES.length).toBe(9);
	});
	it("the ladder is the closed DP06 four-rung set", () => {
		expect(defaultLadder()).toEqual([
			"preview",
			"staging",
			"prod",
			"future_cloud",
		]);
		expect(COCKPIT_LADDER.length).toBe(4);
	});
	it("an empty environments input falls back to the default ladder", () => {
		const envs = project("shop", { project: "shop", phases: [] }).environments;
		expect(envs.map((e) => e.env)).toEqual([...COCKPIT_LADDER]);
	});
});

describe("DP29 — totality + content-address sensitivity", () => {
	it("an empty input never throws and yields a stable hash", () => {
		const a = project("", { project: "", phases: [] });
		const b = project("", { project: "", phases: [] });
		expect(a.hash).toBe(b.hash);
		expect(a.phases).toEqual([]);
		expect(a.profiles.length).toBe(9);
	});
	it("flipping a phase's liveness (stable→red) changes the projection hash", () => {
		const stable = project("shop", {
			project: "shop",
			phases: [stablePhase("phase-x")],
		}).hash;
		const red = project("shop", {
			project: "shop",
			phases: [redPhase("phase-x")],
		}).hash;
		expect(stable).not.toBe(red);
	});
});

describe("DP29 — the audit timeline preserves the recorded order (append-only)", () => {
	it("entries keep their recorded order with stamped seq", () => {
		const tl = auditTimeline([
			{
				kind: "deploy",
				env: "prod",
				phaseHash: "phase-n",
				summary: "deploy n",
			},
			{
				kind: "incident",
				env: "prod",
				phaseHash: "phase-n",
				summary: "incident",
			},
			{
				kind: "rollback",
				env: "prod",
				phaseHash: "phase-n-1",
				fromPhaseHash: "phase-n",
				summary: "rollback to n-1",
			},
		]);
		expect(tl.map((e) => e.seq)).toEqual([0, 1, 2]);
		expect(tl.map((e) => e.kind)).toEqual(["deploy", "incident", "rollback"]);
		// it is reproducible (same input → same timeline).
		expect(
			JSON.stringify(
				auditTimeline([
					{ kind: "deploy", env: "prod", phaseHash: "p", summary: "s" },
				]),
			),
		).toBe(
			JSON.stringify(
				auditTimeline([
					{ kind: "deploy", env: "prod", phaseHash: "p", summary: "s" },
				]),
			),
		);
	});
});
