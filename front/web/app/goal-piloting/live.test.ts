import { describe, expect, it } from "vitest";
import {
	DEMO_ACTOR,
	DEMO_IDEA_ID,
	DEMO_OPEN_RESULT,
	DEMO_RED_SET,
} from "../../lib/goal-piloting-data";
import { closeDecoder, openDecoder, redSetDecoder } from "./live";

/**
 * /goal-piloting live read — the PARITY MIRROR (Vitest, the frozen front N1 slot; ADR 0092
 * kill-twins batch).
 *
 * It proves the TS decoders decode a SAMPLE of the Go goal-piloting tool outputs
 * (goalpilotingsrv.openOutput / closeOutput / redSetOutput, snake_case fields) — the tools'
 * CONTRACT, NOT a second implementation of the goal-piloting logic (the Go
 * goalpiloting.PilotOpenGoal / PilotCloseGoal / LiveRedSet is authoritative; the Go engine is the
 * SINGLE live source). This test pins only that the wire shapes decode faithfully (the open
 * proposal, the actor/open refusals, the non-gameable close verdict, the sorted red set) and that a
 * malformed payload deterministically falls back to null (→ the demo fixture).
 *
 * DETERMINISM-FIRST (§6/§8): same input → same verdict, zero LLM.
 */

describe("goal-piloting live — openDecoder parity", () => {
	it("decodes a Go-sample openOutput (a successful DRAFT ChangeSet proposal)", () => {
		const goSample = {
			ok: true,
			goal_id: `goal:${DEMO_IDEA_ID}`,
			idea_ref: DEMO_IDEA_ID,
			changeset_ref: `cs:${DEMO_IDEA_ID}`,
			changeset_status: "DRAFT",
			status: "OPEN",
			red_set: ["Order.discount.fixture"],
			actor_identity: DEMO_ACTOR.identity,
			actor_display: DEMO_ACTOR.display,
		};
		const decoded = openDecoder(goSample);
		expect(decoded).toEqual(DEMO_OPEN_RESULT);
	});

	it("decodes an actor/open refusal (block carried verbatim, ok:false)", () => {
		const decoded = openDecoder({
			ok: false,
			block: {
				code: "IDEA_WITHOUT_MIRROR",
				severity: "blocking",
				explanation: "Une vérité sans miroir est un vœu.",
				how_to_fix: ["draft_mirror_for_idea", "idea → mirror → /goal"],
			},
		});
		expect(decoded).toEqual({
			ok: false,
			block: {
				code: "IDEA_WITHOUT_MIRROR",
				severity: "blocking",
				explanation: "Une vérité sans miroir est un vœu.",
				howToFix: ["draft_mirror_for_idea", "idea → mirror → /goal"],
			},
		});
	});

	it("tolerates an absent how_to_fix on a refusal (decodes to [])", () => {
		const decoded = openDecoder({
			ok: false,
			block: {
				code: "PLACEHOLDER_ACTOR",
				severity: "blocking",
				explanation: "Un acteur placeholder est refusé.",
			},
		});
		expect(decoded).toEqual({
			ok: false,
			block: {
				code: "PLACEHOLDER_ACTOR",
				severity: "blocking",
				explanation: "Un acteur placeholder est refusé.",
				howToFix: [],
			},
		});
	});

	it("rejects a malformed openOutput (→ demo fallback)", () => {
		expect(openDecoder(null)).toBeNull();
		expect(openDecoder({})).toBeNull(); // no ok flag → not a success, no block → null
		// ok:true but a required field missing → null.
		expect(
			openDecoder({
				ok: true,
				goal_id: "goal:x",
				idea_ref: "x",
				changeset_ref: "cs:x",
				changeset_status: "DRAFT",
				status: "OPEN",
				// red_set present but actor missing
				red_set: [],
				actor_identity: "u-amelie",
				// actor_display missing
			}),
		).toBeNull();
		// ok:false but no/malformed block → null.
		expect(openDecoder({ ok: false })).toBeNull();
		expect(openDecoder({ ok: false, block: { code: "X" } })).toBeNull();
	});

	it("the demo open result matches the decoded Go sample (twin ≡ the live contract shape)", () => {
		const goSample = {
			ok: true,
			goal_id: DEMO_OPEN_RESULT.ok ? DEMO_OPEN_RESULT.goalId : "",
			idea_ref: DEMO_IDEA_ID,
			changeset_ref: DEMO_OPEN_RESULT.ok ? DEMO_OPEN_RESULT.changeSetRef : "",
			changeset_status: "DRAFT",
			status: "OPEN",
			red_set: DEMO_RED_SET,
			actor_identity: DEMO_ACTOR.identity,
			actor_display: DEMO_ACTOR.display,
		};
		expect(openDecoder(goSample)).toEqual(DEMO_OPEN_RESULT);
	});
});

describe("goal-piloting live — closeDecoder parity", () => {
	it("decodes a closeable verdict (all four conditions hold)", () => {
		expect(closeDecoder({ closeable: true })).toEqual({ closeable: true });
	});

	it("decodes a GOAL_STILL_RED refusal (not closeable, block verbatim)", () => {
		const decoded = closeDecoder({
			closeable: false,
			block: {
				code: "GOAL_STILL_RED",
				severity: "blocking",
				explanation: "Au moins une condition échoue.",
				how_to_fix: ["turn the red set green"],
			},
		});
		expect(decoded).toEqual({
			closeable: false,
			block: {
				code: "GOAL_STILL_RED",
				severity: "blocking",
				explanation: "Au moins une condition échoue.",
				howToFix: ["turn the red set green"],
			},
		});
	});

	it("rejects a malformed closeOutput (→ demo fallback)", () => {
		expect(closeDecoder(null)).toBeNull();
		expect(closeDecoder({})).toBeNull(); // closeable not a boolean
		expect(closeDecoder({ closeable: "yes" })).toBeNull();
	});
});

describe("goal-piloting live — redSetDecoder parity", () => {
	it("decodes the sorted red-set worklist", () => {
		expect(redSetDecoder({ red_set: ["a.fixture", "b.fixture"] })).toEqual([
			"a.fixture",
			"b.fixture",
		]);
	});

	it("tolerates an absent red_set (decodes to [])", () => {
		expect(redSetDecoder({})).toEqual([]);
	});

	it("rejects a malformed redSetOutput (→ demo fallback)", () => {
		expect(redSetDecoder(null)).toBeNull();
		expect(redSetDecoder({ red_set: [1, 2] })).toBeNull();
	});
});
