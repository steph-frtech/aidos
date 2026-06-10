import { assign, setup } from "xstate";
import {
	type Besoin,
	composeIdea,
	type Idea,
	validateBesoin,
} from "../../../lib/v2/idea";

/**
 * WB2-03 — la MACHINE À ÉTATS du wizard d'idée (XState v5, ADR 0053).
 *
 * Un geste KRD EST une machine à états (CLAUDE.md §3) : ici, capturer un besoin = avancer d'un
 * étage à l'autre du wizard. Les étapes (intention → coordonnée → provenance → revue → proposée)
 * sont des ÉTATS VISIBLES ; les transitions (SUIVANT/PRÉCÉDENT/PROPOSER/RECOMMENCER) sont
 * explicites et testées.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : la machine NE JUGE RIEN — elle DÉLÈGUE validation et
 * composition au twin pur lib/v2/idea.ts (validateBesoin, composeIdea). XState orchestre l'état
 * d'écran ; le verdict (idée valide ? quelle empreinte ?) est calculé par le code, jamais appris.
 * LE MUR (§2) : PROPOSER appelle composeIdea (hasMirror=false, wroteKernel=false) — aucune
 * écriture-vérité, jamais un kernel.
 */

/** Le contexte porté par la machine : le besoin en cours + l'idée proposée + les erreurs. */
export interface WizardContext {
	besoin: Besoin;
	idea: Idea | null;
	errors: string[];
}

/** Le besoin vide initial (avant toute saisie). */
export const EMPTY_BESOIN: Besoin = {
	intent: "",
	level: "",
	facet: "",
	scale: "",
	provenance: "",
};

/** Les événements du wizard. PATCH met à jour un champ ; les autres pilotent la navigation. */
export type WizardEvent =
	| { type: "PATCH"; patch: Partial<Besoin> }
	| { type: "SUIVANT" }
	| { type: "PRECEDENT" }
	| { type: "PROPOSER" }
	| { type: "RECOMMENCER" };

/** Les noms d'états du wizard, dans l'ordre du parcours (réutilisés par l'UI pour le stepper). */
export const WIZARD_STEPS = [
	"intention",
	"coordonnee",
	"provenance",
	"revue",
	"proposee",
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const ideaWizardMachine = setup({
	types: {} as { context: WizardContext; events: WizardEvent },
	actions: {
		patch: assign({
			besoin: ({ context, event }) =>
				event.type === "PATCH"
					? { ...context.besoin, ...event.patch }
					: context.besoin,
		}),
		// PROPOSER : délègue au twin pur. ok → idée posée ; sinon → erreurs (reste sur revue).
		compose: assign(({ context }) => {
			const r = composeIdea(context.besoin);
			if (r.ok) return { idea: r.idea, errors: [] as string[] };
			return { idea: null, errors: r.errors };
		}),
		reset: assign({
			besoin: () => ({ ...EMPTY_BESOIN }),
			idea: () => null,
			errors: () => [] as string[],
		}),
	},
	guards: {
		// PROPOSER ne franchit vers « proposée » que si le besoin est valide (code, pas LLM).
		besoinValide: ({ context }) => validateBesoin(context.besoin).length === 0,
	},
}).createMachine({
	id: "ideaWizard",
	initial: "intention",
	context: { besoin: { ...EMPTY_BESOIN }, idea: null, errors: [] },
	states: {
		intention: {
			on: {
				PATCH: { actions: "patch" },
				SUIVANT: { target: "coordonnee" },
			},
		},
		coordonnee: {
			on: {
				PATCH: { actions: "patch" },
				SUIVANT: { target: "provenance" },
				PRECEDENT: { target: "intention" },
			},
		},
		provenance: {
			on: {
				PATCH: { actions: "patch" },
				SUIVANT: { target: "revue" },
				PRECEDENT: { target: "coordonnee" },
			},
		},
		revue: {
			on: {
				PRECEDENT: { target: "provenance" },
				PROPOSER: [
					{ target: "proposee", guard: "besoinValide", actions: "compose" },
					{ actions: "compose" },
				],
			},
		},
		proposee: {
			on: {
				RECOMMENCER: { target: "intention", actions: "reset" },
			},
		},
	},
});
