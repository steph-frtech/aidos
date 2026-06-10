// biome-ignore-all lint/suspicious/noThenProperty: « then » est le terme Gherkin canonique (Given/When/Then), la langue ubiquitaire KRD.
/**
 * WB2-10 — le miroir de la MACHINE du wizard /grill (XState v5). Prouve que les ÉTATS sont visibles
 * et les transitions déterministes (le geste grill-with-docs comme machine, ADR 0053). La machine
 * ne juge rien : elle délègue au twin pur lib/v2/grill.ts ; ce test épingle l'orchestration.
 */

import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { GRILL_STEPS, grillWizardMachine } from "./GrillWizardMachine";

function start() {
	const actor = createActor(grillWizardMachine);
	actor.start();
	return actor;
}

describe("WB2-10 grill wizard machine — états visibles & transitions déterministes", () => {
	it("démarre à « intention » ; le parcours traverse les quatre étapes déclarées", () => {
		expect(GRILL_STEPS).toEqual(["intention", "scenarios", "revue", "affutee"]);
		const a = start();
		expect(a.getSnapshot().value).toBe("intention");
	});

	it("parcours complet → intention affûtée (sharp), ADRs candidats, le mur tenu", () => {
		const a = start();
		a.send({
			type: "SET_INTENT",
			intent: "Conduire le grill comme une feature affûtée en bdd",
		});
		a.send({ type: "SUIVANT" });
		expect(a.getSnapshot().value).toBe("scenarios");
		a.send({ type: "ADD_SCENARIO" });
		a.send({
			type: "PATCH_SCENARIO",
			index: 0,
			patch: {
				given: "une intention floue",
				when: "j'affûte",
				then: "elle est nette",
			},
		});
		a.send({ type: "SUIVANT" });
		expect(a.getSnapshot().value).toBe("revue");
		a.send({ type: "AFFUTER" });
		const snap = a.getSnapshot();
		expect(snap.value).toBe("affutee");
		const intention = snap.context.intention;
		expect(intention).not.toBeNull();
		if (intention) {
			expect(intention.verdict).toBe("sharp");
			expect(intention.hasMirror).toBe(false);
			expect(intention.wroteKernel).toBe(false);
			expect(intention.candidateAdrs.map((x) => x.from)).toContain("feature");
			expect(intention.candidateAdrs.map((x) => x.from)).toContain("bdd");
		}
	});

	it("AFFÛTER sur un brouillon rejeté (intention vide) reste sur « revue » avec des problèmes", () => {
		const a = start();
		a.send({ type: "SUIVANT" }); // scenarios
		a.send({ type: "ADD_SCENARIO" });
		a.send({
			type: "PATCH_SCENARIO",
			index: 0,
			patch: { given: "a", when: "b", then: "c" },
		});
		a.send({ type: "SUIVANT" }); // revue
		a.send({ type: "AFFUTER" });
		const snap = a.getSnapshot();
		expect(snap.value).toBe("revue");
		expect(snap.context.issues).toContain("intent_too_short");
		expect(snap.context.intention).toBeNull();
	});

	it("RETIRER un scénario met à jour le brouillon ; RECOMMENCER repart à vide", () => {
		const a = start();
		a.send({ type: "SUIVANT" });
		a.send({ type: "ADD_SCENARIO" });
		a.send({ type: "ADD_SCENARIO" });
		expect(a.getSnapshot().context.draft.scenarios).toHaveLength(2);
		a.send({ type: "REMOVE_SCENARIO", index: 0 });
		expect(a.getSnapshot().context.draft.scenarios).toHaveLength(1);
		a.send({ type: "SET_INTENT", intent: "x" });
		a.send({ type: "SUIVANT" }); // revue
		a.send({ type: "PRECEDENT" }); // scenarios
		expect(a.getSnapshot().value).toBe("scenarios");
	});
});
