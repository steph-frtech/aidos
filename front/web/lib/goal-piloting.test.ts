/**
 * Reproducibility mirror (Vitest + fast-check) for lib/goal-piloting — the S66 UI-piloted /goal.
 *
 * It pins the SAME semantics as the Go reproducibility mirror goalpiloting_property_test.go:
 * pilotOpenGoal / pilotCloseGoal are pure, total and deterministic; the actor gate refuses every
 * placeholder; the close is non-gameable (closeable IFF all four conditions hold); no agent-
 * confidence is ever an input. The id is anchored to the idea so it agrees with the Go authority.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { RealActor } from "./authority-binding";
import {
	type Budgets,
	canClose,
	IDEA_WITHOUT_MIRROR,
	liveRedSet,
	NO_RED_SET,
	type PilotOpenInput,
	pilotCloseGoal,
	pilotOpenGoal,
} from "./goal-piloting";

const budgets: Budgets = { timeSeconds: 600, turns: 20, tokens: 100000 };

function openInput(ideaId: string, withMirror: boolean): PilotOpenInput {
	return {
		ideaId,
		specDelta: { kind: "add", target: "Order.discount" },
		mirrorDelta: withMirror
			? { kind: "add", target: "Order.discount.fixture" }
			: undefined,
		parentPhase: "phase-0",
		redSet: ["Order.discount.fixture"],
		budgets,
	};
}

const PLACEHOLDERS = [
	"",
	"  ",
	"agent",
	"system",
	"aidos",
	"aidos_agent",
	"tbd",
	"todo",
	"placeholder",
	"anonymous",
	"anon",
	"unknown",
	"none",
	"null",
	"nobody",
];

describe("S66 pilotOpenGoal — the actor gate + the open", () => {
	it("an authority-bearing user opens a DRAFT ChangeSet proposal + a non-empty live red set", () => {
		const actor: RealActor = { identity: "u-amelie", display: "Amélie Roy" };
		const { result, block } = pilotOpenGoal(
			actor,
			openInput("idea-order-discount", true),
		);
		expect(block).toBeNull();
		expect(result).not.toBeNull();
		expect(result?.goal.changeSetStatus).toBe("DRAFT");
		expect(result?.goal.status).toBe("OPEN");
		expect(result?.goal.redSet.length).toBeGreaterThan(0);
		expect(result?.actor.identity).toBe("u-amelie");
		// id anchored to the idea ⇒ agrees with the Go authority's content-addressing intent.
		expect(result?.goal.ideaRef).toBe("idea-order-discount");
	});

	it("refuses every placeholder actor with PLACEHOLDER_ACTOR and opens no changeset", () => {
		for (const id of PLACEHOLDERS) {
			const { result, block } = pilotOpenGoal(
				{ identity: id, display: id },
				openInput("i", true),
			);
			expect(result).toBeNull();
			expect(block?.code).toBe("PLACEHOLDER_ACTOR");
			expect(block?.howToFix.length).toBeGreaterThan(0);
		}
	});

	it("refuses a mirror-less idea with IDEA_WITHOUT_MIRROR", () => {
		const { result, block } = pilotOpenGoal(
			{ identity: "u-amelie", display: "Amélie Roy" },
			openInput("idea-no-mirror", false),
		);
		expect(result).toBeNull();
		expect(block).toEqual(IDEA_WITHOUT_MIRROR);
	});

	it("refuses an empty red set with NO_RED_SET", () => {
		const input = openInput("idea-already-true", true);
		input.redSet = [];
		const { result, block } = pilotOpenGoal(
			{ identity: "u-amelie", display: "Amélie Roy" },
			input,
		);
		expect(result).toBeNull();
		expect(block).toEqual(NO_RED_SET);
	});

	it("is deterministic — same (actor, input) ⇒ identical goal id (property)", () => {
		fc.assert(
			fc.property(
				fc.stringMatching(/^u-[a-z]{2,10}$/),
				fc.stringMatching(/^idea-[a-z]{2,10}$/),
				(identity, ideaId) => {
					const actor: RealActor = { identity, display: "Real Person" };
					const a = pilotOpenGoal(actor, openInput(ideaId, true));
					const b = pilotOpenGoal(actor, openInput(ideaId, true));
					expect(a.result?.goal.id).toBe(b.result?.goal.id);
				},
			),
		);
	});
});

describe("S66 pilotCloseGoal — the non-gameable stop", () => {
	const redSet = ["Order.discount.fixture"];

	it("closeable IFF red→green ∧ prior intact ∧ mutation ≥ floor ∧ no monster (property)", () => {
		fc.assert(
			fc.property(
				fc.boolean(),
				fc.boolean(),
				fc.double({ min: 0, max: 1, noNaN: true }),
				fc.double({ min: 0, max: 1, noNaN: true }),
				fc.boolean(),
				(redGreen, priorIntact, mutation, floor, hasMonster) => {
					const input = {
						sensors: {
							"Order.discount.fixture": redGreen ? "green" : "red",
						} as Record<string, "green" | "red">,
						priorGreen: priorIntact ? ("intact" as const) : ("broken" as const),
						mutation,
						mutationFloor: floor,
						monsters: hasMonster ? ["m"] : [],
					};
					const want =
						redGreen && priorIntact && mutation >= floor && !hasMonster;
					const block = pilotCloseGoal(redSet, input);
					expect(block === null).toBe(want);
					expect(canClose(redSet, input)).toBe(want);
					if (!want) {
						expect(block?.code).toBe("GOAL_STILL_RED");
					}
				},
			),
		);
	});
});

describe("S66 liveRedSet", () => {
	it("returns the worklist in stable sorted order", () => {
		expect(liveRedSet(["b.fixture", "a.fixture"])).toEqual([
			"a.fixture",
			"b.fixture",
		]);
	});
});
