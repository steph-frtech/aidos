/**
 * agentloop-economics.test.ts — the BA27 reproducibility mirror (front twin of
 * back/runtime/agentloop/economics_loop_*_test.go), determinism-first. It pins the live
 * meter + halt-on-budget wired into the loop and the harness-economy feed:
 *
 *   - PRE-CALL HALT (gap G3): a run whose next turn WOULD cross the cap is refused BEFORE
 *     that turn starts — abandoned at/before the cap, the breaching cost never landing.
 *   - MONOTONE / NEVER-CROSS: the returned meter never exceeds the effective token cap.
 *   - ECONOMICS FEED: the meter maps onto economics.MeasuredCost (token → llmTokens) and
 *     evaluateRun defers to the AUTHORITATIVE economics.evaluate (within / over_budget).
 *   - REPRODUCIBLE: identical input ⇒ identical { run, meter } (no Date.now, no rng).
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AgentImplementation, RunDelta, RunMeter } from "./agentlayer";
import { effectiveTokensCap, wallForbiddenPaths } from "./agentlayer";
import {
	type DriveInputTs,
	driveWithEconomics,
	evaluateRun,
	measuredCostOf,
	type ScriptedTurnTs,
	type SensorStateTs,
} from "./agentrun";
import type { HarnessCostBudget } from "./economics";

const permissiveImpl: AgentImplementation = {
	layerRef: "couche-agent@deadbeef",
	role: "builder",
	objectif: "make the app tree green",
	stopConditions: ["red set still red"],
	provider: "anthropic",
	model: "claude-opus-4-8",
	temperature: 0,
	maxTurns: 64,
	seed: "",
	tools: [{ server: "store", tool: "read" }],
	skills: ["tdd"],
	hooks: [], // no mandatory hook → the hook axis is satisfied
	allowedPaths: ["app/"],
	forbiddenPaths: wallForbiddenPaths(),
	allowedNetworkHosts: [],
	allowedExec: [],
	resourceLimits: {
		maxMemoryMb: 2048,
		maxCpuMillis: 2000,
		maxWallSeconds: 900,
	},
	maxConcurrency: 1,
};

const writeTurn = (target: string, flip: string): ScriptedTurnTs => ({
	action: { target, agentAction: { tool: "write", args: [target] } },
	body: { type: "write", cible: target },
	cost: { tokens: 10, turns: 1, ciMinutes: 0, wallClockSecs: 1 },
	effects: [{ mirror: flip, state: "green" as SensorStateTs }],
});

const baseInput = (
	turns: ScriptedTurnTs[],
	tokensCap: number,
): DriveInputTs => ({
	impl: permissiveImpl,
	goal: {
		id: "goal-ba27",
		redSet: ["mirror.a", "mirror.b"],
		budgets: { timeSeconds: 10000, turns: 10000, tokens: tokensCap },
	},
	redWorkItem: "item-1",
	contextPack: "pack-1",
	sensors: { "mirror.a": "red", "mirror.b": "red" },
	priorGreen: "intact",
	mutation: 1,
	mutationFloor: 0,
	monsters: [],
	harnessBudget: {
		cellRef: "cell-ba27",
		maxCiMinutes: 10000,
		maxLlmTokensPerGoal: 1000000,
	},
	ratePerToken: 0.000001,
	hookVerdicts: [],
	turns,
	startedAt: "2026-06-03T00:00:00Z",
	endedAt: "2026-06-03T00:05:00Z",
});

describe("BA27 — pre-call halt (gap G3): a breaching turn never STARTS", () => {
	it("abandons at/before the cap; the breaching cost never lands in the meter", () => {
		// Cap 10 tokens. Turn 1 = 10 (== cap, allowed). Turn 2 = +10 → would breach.
		const { run, meter } = driveWithEconomics(
			baseInput(
				[writeTurn("app/a.go", "mirror.a"), writeTurn("app/b.go", "mirror.b")],
				10,
			),
		);
		expect(run.result).toBe("abandoned");
		expect(meter.tokens).toBe(10); // AT the cap, NOT 20
		expect(run.actions).toHaveLength(2);
		expect(run.actions[0].autorisee).toBe(true);
		expect(run.actions[1].autorisee).toBe(false);
		expect(run.actions[1].raisonBlocage?.code).toBe("AGENT_BUDGET_EXCEEDED");
	});

	it("a within-budget run closes green and the meter totals the executed turns", () => {
		const { run, meter } = driveWithEconomics(
			baseInput(
				[writeTurn("app/a.go", "mirror.a"), writeTurn("app/b.go", "mirror.b")],
				1000,
			),
		);
		expect(run.result).toBe("green");
		expect(meter.tokens).toBe(20);
	});
});

describe("BA27 — economics feed: the run's measured cost reaches evaluate", () => {
	it("maps the token tally to llmTokens", () => {
		const m: RunMeter = {
			tokens: 20,
			turns: 2,
			ciMinutes: 3,
			wallClockSecs: 2,
		};
		const c = measuredCostOf(m);
		expect(c.llmTokens).toBe(20);
		expect(c.ciMinutes).toBe(3);
		expect(c.mutationRuntimeSeconds).toBe(0);
		expect(c.humanReviewMinutes).toBe(0);
	});

	it("a run under the cell budget evaluates within_budget", () => {
		const { meter } = driveWithEconomics(
			baseInput(
				[writeTurn("app/a.go", "mirror.a"), writeTurn("app/b.go", "mirror.b")],
				1000,
			),
		);
		const cell: HarnessCostBudget = {
			cellRef: "cell-ba27",
			maxCiMinutes: 1000,
			maxLlmTokensPerGoal: 1000,
			maxMutationRuntimeSeconds: 1000,
			maxHumanReviewMinutes: 1000,
			expectedRiskReduction: "medium",
		};
		expect(evaluateRun(meter, cell, null).verdict).toBe("within_budget");
	});

	it("a run over the (tighter) cell budget with no justified ValueCase is over_budget_flagged", () => {
		const { meter } = driveWithEconomics(
			baseInput(
				[writeTurn("app/a.go", "mirror.a"), writeTurn("app/b.go", "mirror.b")],
				1000,
			),
		);
		const cell: HarnessCostBudget = {
			cellRef: "cell-ba27",
			maxCiMinutes: 1000,
			maxLlmTokensPerGoal: 5, // the 20-token run blows past it
			maxMutationRuntimeSeconds: 1000,
			maxHumanReviewMinutes: 1000,
			expectedRiskReduction: "medium",
		};
		const dec = evaluateRun(meter, cell, null);
		expect(dec.verdict).toBe("over_budget_flagged");
		expect(dec.blockReason?.code).toBe("HARNESS_COST_EXCEEDS_BUDGET");
	});
});

describe("BA27 — properties (determinism-first)", () => {
	const arbTurns = fc.array(
		fc.constantFrom("app/a.go", "app/b.go", "app/c.go").map((t) => {
			const mir = t === "app/b.go" ? "mirror.b" : "mirror.a";
			const cost: RunDelta = {
				tokens: 7,
				turns: 1,
				ciMinutes: 0,
				wallClockSecs: 1,
			};
			return {
				action: { target: t, agentAction: { tool: "write", args: [t] } },
				body: { type: "write" as const, cible: t },
				cost,
				effects: [{ mirror: mir, state: "green" as SensorStateTs }],
			};
		}),
		{ maxLength: 8 },
	);

	it("the meter NEVER crosses the effective token cap (pre-call halt holds)", () => {
		fc.assert(
			fc.property(arbTurns, fc.integer({ min: 0, max: 50 }), (turns, cap) => {
				const in_ = baseInput(turns, cap);
				const { meter } = driveWithEconomics(in_);
				const eff = effectiveTokensCap(in_.harnessBudget, in_.goal.budgets);
				expect(meter.tokens).toBeLessThanOrEqual(eff);
			}),
		);
	});

	it("identical input ⇒ identical { run, meter } (reproducible)", () => {
		fc.assert(
			fc.property(arbTurns, fc.integer({ min: 0, max: 50 }), (turns, cap) => {
				const a = driveWithEconomics(baseInput(turns, cap));
				const b = driveWithEconomics(baseInput(turns, cap));
				expect(a).toStrictEqual(b);
			}),
		);
	});

	it("measuredCostOf is deterministic and maps tokens→llmTokens", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 0, max: 1000000 }),
				fc.integer({ min: 0, max: 10000 }),
				(tokens, ci) => {
					const m: RunMeter = {
						tokens,
						turns: 0,
						ciMinutes: ci,
						wallClockSecs: 0,
					};
					expect(measuredCostOf(m)).toStrictEqual(measuredCostOf(m));
					expect(measuredCostOf(m).llmTokens).toBe(tokens);
				},
			),
		);
	});
});
