import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { goalWizardMachine } from "./GoalWizardMachine";

/**
 * WB2-11 — les FIXTURES de la machine /goal (état → commande → events ; ADR 0053).
 * La machine ne juge rien : elle délègue au twin pur lib/v2/goal.ts. Ces fixtures épinglent les
 * transitions VISIBLES (idea → mirror_written → frozen) + le MUR (écriture directe refusée).
 */

function start() {
	const actor = createActor(goalWizardMachine);
	actor.start();
	return actor;
}

describe("WB2-11 GoalWizardMachine — la transition idée → miroir → /goal → gel", () => {
	it("démarre à l'étape idée (l'idée seule, hasMirror=false, PROPOSE)", () => {
		const a = start();
		expect(a.getSnapshot().value).toBe("idea");
		expect(a.getSnapshot().context.idea.hasMirror).toBe(false);
		expect(a.getSnapshot().context.proposed).toBeNull();
	});

	it("ÉCRIRE_MIROIR (forme valide) franchit vers mirror_written", () => {
		const a = start();
		// le contexte initial porte déjà un texte de miroir valide (forme fixture_n2 attendue)
		a.send({ type: "ECRIRE_MIROIR" });
		expect(a.getSnapshot().value).toBe("mirror_written");
	});

	it("GOAL gèle une version + un ChangeSet DRAFT (le kernel proposé), wroteKernel=false", () => {
		const a = start();
		a.send({ type: "ECRIRE_MIROIR" });
		a.send({ type: "GOAL" });
		const snap = a.getSnapshot();
		expect(snap.value).toBe("frozen");
		const p = snap.context.proposed;
		expect(p).not.toBeNull();
		expect(p?.hasMirror).toBe(true);
		expect(p?.wroteKernel).toBe(false);
		expect(p?.version.startsWith("k:")).toBe(true);
		expect(p?.changeSet.status).toBe("DRAFT");
	});

	it("un miroir de MAUVAISE forme ne franchit pas (le mur §116)", () => {
		const a = start();
		a.send({ type: "SET_FORM", form: "gherkin_n0" }); // ≠ fixture_n2 attendue
		a.send({ type: "ECRIRE_MIROIR" });
		expect(a.getSnapshot().value).toBe("idea"); // resté — non franchi
	});

	it("LE MUR : ÉCRIRE_DIRECT refuse toujours (BlockReason), sans transition ni écriture", () => {
		const a = start();
		a.send({ type: "ECRIRE_DIRECT" });
		const snap = a.getSnapshot();
		expect(snap.value).toBe("idea"); // aucune transition
		expect(snap.context.block).not.toBeNull();
		expect(snap.context.block?.code).toBe("WALL_DIRECT_TRUTH_WRITE_FORBIDDEN");
	});

	it("RECOMMENCER revient à idée et réinitialise le kernel proposé", () => {
		const a = start();
		a.send({ type: "ECRIRE_MIROIR" });
		a.send({ type: "GOAL" });
		a.send({ type: "RECOMMENCER" });
		const snap = a.getSnapshot();
		expect(snap.value).toBe("idea");
		expect(snap.context.proposed).toBeNull();
		expect(snap.context.block).toBeNull();
	});
});
