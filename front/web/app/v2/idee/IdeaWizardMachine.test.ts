import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import type { Besoin } from "../../../lib/v2/idea";
import { ideaWizardMachine, WIZARD_STEPS } from "./IdeaWizardMachine";

/**
 * WB2-03 — miroir des TRANSITIONS du wizard d'idée (la machine XState).
 * mirror record: reflects=WB2-03-idea-wizard, test_kind=fixture (état→commande→état),
 * liveness=live, authority=above (le wizard PROPOSE, n'écrit aucune vérité).
 *
 * Le critère de done WB2-03 exige « XState : états visibles, transitions testées ». Ces fixtures
 * pilotent la machine et asserent l'état atteint + l'invariant du mur sur l'idée proposée.
 */

const VALID: Besoin = {
	intent: "Je veux payer en un clic",
	level: "operation",
	facet: "F",
	scale: "kernel",
	provenance: "humain",
};

function start() {
	const actor = createActor(ideaWizardMachine);
	actor.start();
	return actor;
}

describe("ideaWizardMachine — états visibles, transitions testées", () => {
	it("démarre à l'étape intention", () => {
		const a = start();
		expect(a.getSnapshot().value).toBe("intention");
	});

	it("avance étage par étage : intention → coordonnée → provenance → revue", () => {
		const a = start();
		a.send({ type: "SUIVANT" });
		expect(a.getSnapshot().value).toBe("coordonnee");
		a.send({ type: "SUIVANT" });
		expect(a.getSnapshot().value).toBe("provenance");
		a.send({ type: "SUIVANT" });
		expect(a.getSnapshot().value).toBe("revue");
	});

	it("PRÉCÉDENT recule d'un étage", () => {
		const a = start();
		a.send({ type: "SUIVANT" });
		a.send({ type: "SUIVANT" });
		a.send({ type: "PRECEDENT" });
		expect(a.getSnapshot().value).toBe("coordonnee");
	});

	it("PATCH accumule le besoin dans le contexte", () => {
		const a = start();
		a.send({ type: "PATCH", patch: { intent: VALID.intent } });
		a.send({
			type: "PATCH",
			patch: { level: VALID.level, facet: VALID.facet },
		});
		expect(a.getSnapshot().context.besoin.intent).toBe(VALID.intent);
		expect(a.getSnapshot().context.besoin.level).toBe(VALID.level);
		expect(a.getSnapshot().context.besoin.facet).toBe(VALID.facet);
	});

	it("PROPOSER sur un besoin VALIDE → état proposée + idée (le mur : hasMirror/wroteKernel false)", () => {
		const a = start();
		for (const k of Object.keys(VALID) as (keyof Besoin)[]) {
			a.send({ type: "PATCH", patch: { [k]: VALID[k] } as Partial<Besoin> });
		}
		a.send({ type: "SUIVANT" });
		a.send({ type: "SUIVANT" });
		a.send({ type: "SUIVANT" });
		expect(a.getSnapshot().value).toBe("revue");
		a.send({ type: "PROPOSER" });
		const snap = a.getSnapshot();
		expect(snap.value).toBe("proposee");
		expect(snap.context.idea).not.toBeNull();
		expect(snap.context.idea?.hasMirror).toBe(false);
		expect(snap.context.idea?.wroteKernel).toBe(false);
		expect(snap.context.errors).toEqual([]);
	});

	it("PROPOSER sur un besoin INVALIDE → reste sur revue, expose les erreurs", () => {
		const a = start();
		a.send({ type: "PATCH", patch: { intent: "x" } }); // trop court
		a.send({ type: "SUIVANT" });
		a.send({ type: "SUIVANT" });
		a.send({ type: "SUIVANT" });
		a.send({ type: "PROPOSER" });
		const snap = a.getSnapshot();
		expect(snap.value).toBe("revue");
		expect(snap.context.idea).toBeNull();
		expect(snap.context.errors.length).toBeGreaterThan(0);
	});

	it("RECOMMENCER remet le wizard à zéro depuis l'état proposée", () => {
		const a = start();
		for (const k of Object.keys(VALID) as (keyof Besoin)[]) {
			a.send({ type: "PATCH", patch: { [k]: VALID[k] } as Partial<Besoin> });
		}
		a.send({ type: "SUIVANT" });
		a.send({ type: "SUIVANT" });
		a.send({ type: "SUIVANT" });
		a.send({ type: "PROPOSER" });
		a.send({ type: "RECOMMENCER" });
		const snap = a.getSnapshot();
		expect(snap.value).toBe("intention");
		expect(snap.context.besoin.intent).toBe("");
		expect(snap.context.idea).toBeNull();
	});

	it("les 5 étapes du parcours sont déclarées dans l'ordre", () => {
		expect(WIZARD_STEPS).toEqual([
			"intention",
			"coordonnee",
			"provenance",
			"revue",
			"proposee",
		]);
	});
});
