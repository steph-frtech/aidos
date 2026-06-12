import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { seedComposes } from "../../../lib/v2/composition";
import type { Besoin } from "../../../lib/v2/idea";
import { ideaWizardMachine, WIZARD_STEPS } from "./IdeaWizardMachine";

/**
 * WB2-03 — miroir des TRANSITIONS du wizard d'idée (la machine XState).
 * mirror record: reflects=WB2-03-idea-wizard, test_kind=fixture (état→commande→état),
 * liveness=live, authority=above (le wizard PROPOSE, n'écrit aucune vérité).
 *
 * Le critère de done WB2-03 exige « XState : états visibles, transitions testées ». Ces fixtures
 * pilotent la machine et asserent l'état atteint + l'invariant du mur sur l'idée proposée.
 * L'ÉCHELLE VIVANTE (ADR 0055) : SET_SCALE choisit une POSITION (un chemin), GROW_SCALE fait
 * POUSSER l'arbre composes (twin pur, fail-closed/idempotent) et auto-sélectionne la greffe.
 */

const VALID: Besoin = {
	intent: "Je veux payer en un clic",
	level: "operation",
	facet: "F",
	// L'échelle = un CHEMIN dans l'arbre composes (ADR 0055) — un nœud MEMBRE du seed canonique.
	scale: "app/paiement/checkout",
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

describe("ideaWizardMachine — l'échelle vivante (ADR 0055 : un chemin dans l'arbre composes)", () => {
	/** Amène l'acteur à l'étape coordonnée (où vit la zone d'échelle). */
	function atCoordonnee() {
		const a = start();
		a.send({ type: "SUIVANT" });
		return a;
	}

	it("le contexte porte l'arbre composes seed (5 nœuds canoniques)", () => {
		const a = start();
		expect(a.getSnapshot().context.tree).toEqual(seedComposes());
		expect(a.getSnapshot().context.tree).toHaveLength(5);
	});

	it("SET_SCALE sélectionne un chemin comme échelle", () => {
		const a = atCoordonnee();
		a.send({ type: "SET_SCALE", path: "app/paiement" });
		expect(a.getSnapshot().context.besoin.scale).toBe("app/paiement");
	});

	it("GROW_SCALE greffe sous le parent ET auto-sélectionne le nouveau chemin", () => {
		const a = atCoordonnee();
		a.send({
			type: "GROW_SCALE",
			parentPath: "app/catalogue",
			label: "Recherche produit",
		});
		const snap = a.getSnapshot();
		expect(snap.context.tree).toHaveLength(6);
		expect(snap.context.besoin.scale).toBe("app/catalogue/recherche-produit");
	});

	it("GROW_SCALE sur un parent inconnu → fail-closed (arbre et échelle inchangés)", () => {
		const a = atCoordonnee();
		a.send({ type: "SET_SCALE", path: "app/paiement" });
		a.send({
			type: "GROW_SCALE",
			parentPath: "app/inexistant",
			label: "Fantôme",
		});
		const snap = a.getSnapshot();
		expect(snap.context.tree).toHaveLength(5);
		expect(snap.context.besoin.scale).toBe("app/paiement");
	});

	it("GROW_SCALE est idempotente : re-greffer le même libellé ne crée rien", () => {
		const a = atCoordonnee();
		a.send({
			type: "GROW_SCALE",
			parentPath: "app/catalogue",
			label: "Recherche produit",
		});
		a.send({
			type: "GROW_SCALE",
			parentPath: "app/catalogue",
			label: "Recherche produit",
		});
		expect(a.getSnapshot().context.tree).toHaveLength(6);
	});

	it("la validation utilise l'arbre VIVANT : un chemin greffé devient une échelle valide", () => {
		const a = atCoordonnee();
		a.send({
			type: "GROW_SCALE",
			parentPath: "app/paiement/checkout",
			label: "Paiement différé",
		});
		// GROW_SCALE a auto-sélectionné l'échelle ; on complète les autres champs du besoin.
		a.send({
			type: "PATCH",
			patch: {
				intent: VALID.intent,
				level: VALID.level,
				facet: VALID.facet,
				provenance: VALID.provenance,
			},
		});
		a.send({ type: "SUIVANT" });
		a.send({ type: "SUIVANT" });
		a.send({ type: "PROPOSER" });
		const snap = a.getSnapshot();
		expect(snap.value).toBe("proposee");
		expect(snap.context.idea?.coordinate.scale).toBe(
			"app/paiement/checkout/paiement-differe",
		);
	});

	it("RECOMMENCER remet le besoin à zéro mais l'arbre GREFFÉ survit (append-only, §9)", () => {
		const a = atCoordonnee();
		a.send({
			type: "GROW_SCALE",
			parentPath: "app/catalogue",
			label: "Recherche produit",
		});
		a.send({
			type: "PATCH",
			patch: {
				intent: VALID.intent,
				level: VALID.level,
				facet: VALID.facet,
				provenance: VALID.provenance,
			},
		});
		a.send({ type: "SUIVANT" });
		a.send({ type: "SUIVANT" });
		a.send({ type: "PROPOSER" });
		a.send({ type: "RECOMMENCER" });
		const snap = a.getSnapshot();
		expect(snap.context.besoin.scale).toBe("");
		expect(snap.context.tree).toHaveLength(6);
	});
});
