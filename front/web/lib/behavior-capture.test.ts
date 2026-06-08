/**
 * S67 — the attach-at-capture REPRODUCIBILITY mirror (TS twin). It pins the EXACT done-criteria:
 *
 *   - SINGLE FUNCTION / BYTE-IDENTICAL: the attach carries lib/behavior's `expand` VERBATIM — the
 *     expansionId equals the Go golden (no second implementation crept in).
 *   - RENDERED AS A PROPOSED CHANGESET: every Proposal carries a DRAFT ChangeSet (never applied).
 *   - DETERMINISM: same (ideaRef, attachment) → byte-identical Proposal.
 *   - THE WALL: the carried expansion wroteKernel=false; the proposal is DRAFT.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { catalogue, expand } from "./behavior";
import {
	attachBehaviorAtCapture,
	library,
	proposalPieceCount,
	proposalPreview,
} from "./behavior-capture";

describe("attachBehaviorAtCapture — byte-identical to the single expander (S76)", () => {
	it("carries expand() verbatim for every catalogue behavior (∀)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...catalogue()),
				fc.stringMatching(/^[A-Z][a-z]{0,8}$/),
				fc.stringMatching(/^idea-[a-z0-9]{4,10}$/),
				(behavior, entity, idea) => {
					const { result, error } = attachBehaviorAtCapture(idea, {
						behavior,
						entity,
					});
					expect(error).toBeNull();
					expect(result?.expansion).toEqual(expand({ behavior, entity }));
				},
			),
		);
	});
});

describe("attachBehaviorAtCapture — rendered as a DRAFT proposal", () => {
	it("the §24.6 owner-scoping proposal (ownable on Order)", () => {
		const { result, error } = attachBehaviorAtCapture("idea-001", {
			behavior: "ownable",
			entity: "Order",
		});
		expect(error).toBeNull();
		expect(result?.changeSet.status).toBe("DRAFT");
		expect(result?.changeSet.specDeltaTarget).toBe("Order");
		expect(result?.expansion.policies[0].name).toBe("owner-scoping");
		expect(result?.expansion.wroteKernel).toBe(false);
		if (result === null) throw new Error("expected a proposal");
		expect(proposalPieceCount(result)).toBeGreaterThan(0);
		expect(proposalPreview(result)).toContain("attr:owner_id");
	});
});

describe("attachBehaviorAtCapture — determinism + the wall", () => {
	it("same input → byte-identical proposal (∀)", () => {
		fc.assert(
			fc.property(
				fc.constantFrom(...catalogue()),
				fc.stringMatching(/^[A-Z][a-z]{0,8}$/),
				(behavior, entity) => {
					const a = attachBehaviorAtCapture("idea-x", { behavior, entity });
					const b = attachBehaviorAtCapture("idea-x", { behavior, entity });
					expect(a).toEqual(b);
				},
			),
		);
	});

	it("the proposal is always DRAFT + writes no kernel truth (∀)", () => {
		fc.assert(
			fc.property(fc.constantFrom(...catalogue()), (behavior) => {
				const { result } = attachBehaviorAtCapture("idea-x", {
					behavior,
					entity: "E",
				});
				expect(result?.changeSet.status).toBe("DRAFT");
				expect(result?.expansion.wroteKernel).toBe(false);
			}),
		);
	});
});

describe("attachBehaviorAtCapture — refusals + library", () => {
	it("the surfaced library is the S76 catalogue", () => {
		expect(library()).toEqual(catalogue());
	});
	it("refuses an attach with no captured idea", () => {
		const { result, error } = attachBehaviorAtCapture("", {
			behavior: "ownable",
			entity: "Order",
		});
		expect(result).toBeNull();
		expect(error).toBeTruthy();
	});
	it("refuses an unknown behavior (the single-function error)", () => {
		const { result, error } = attachBehaviorAtCapture("idea-x", {
			behavior: "telepathic" as Kind,
			entity: "Order",
		});
		expect(result).toBeNull();
		expect(error).toContain("catalogue");
	});
});
