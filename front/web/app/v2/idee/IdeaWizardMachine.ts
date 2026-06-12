import { assign, setup } from "xstate";
import {
	growComposes,
	nodeByPath,
	nodePath,
	seedComposes,
} from "../../../lib/v2/composition";
import {
	type Besoin,
	composeIdea,
	type Idea,
	validateBesoin,
} from "../../../lib/v2/idea";
import type { KernelNode } from "../../../lib/v2/kernel-tree";

/**
 * WB2-03 — la MACHINE À ÉTATS du wizard d'idée (XState v5, ADR 0053).
 *
 * Un geste KRD EST une machine à états (CLAUDE.md §3) : ici, capturer un besoin = avancer d'un
 * étage à l'autre du wizard. Les étapes (intention → coordonnée → provenance → revue → proposée)
 * sont des ÉTATS VISIBLES ; les transitions (SUIVANT/PRÉCÉDENT/PROPOSER/RECOMMENCER) sont
 * explicites et testées.
 *
 * L'ÉCHELLE VIVANTE (ADR 0055, §49/§108) : le contexte porte l'ARBRE composes (seed canonique,
 * puis il POUSSE via GROW_SCALE — « l'arbre se construit au fur et à mesure des ajouts ») et
 * l'échelle du besoin est un CHEMIN dans cet arbre (SET_SCALE). La greffe DÉLÈGUE au twin pur
 * growComposes (fail-closed : parent inconnu ou libellé vide → arbre inchangé ; idempotente) et
 * AUTO-SÉLECTIONNE le chemin du nouveau nœud. L'arbre SURVIT à RECOMMENCER (append-only, §9 —
 * il n'appartient pas à un besoin, il est la carte partagée des échelles).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : la machine NE JUGE RIEN — elle DÉLÈGUE validation et
 * composition au twin pur lib/v2/idea.ts (validateBesoin, composeIdea) contre l'arbre VIVANT du
 * contexte. XState orchestre l'état d'écran ; le verdict (idée valide ? quelle empreinte ?) est
 * calculé par le code, jamais appris.
 * LE MUR (§2) : PROPOSER appelle composeIdea (hasMirror=false, wroteKernel=false) — aucune
 * écriture-vérité, jamais un kernel ; la greffe ne touche que la PROJECTION locale de l'arbre.
 */

/** Le contexte porté par la machine : l'arbre composes vivant + le besoin + l'idée + les erreurs. */
export interface WizardContext {
	besoin: Besoin;
	idea: Idea | null;
	errors: string[];
	/** L'arbre composes VIVANT (ADR 0055) — seed canonique, pousse via GROW_SCALE, append-only. */
	tree: readonly KernelNode[];
}

/** Le besoin vide initial (avant toute saisie). scale = "" ⇒ aucune position choisie. */
export const EMPTY_BESOIN: Besoin = {
	intent: "",
	level: "",
	facet: "",
	scale: "",
	provenance: "",
};

/** Les événements du wizard. PATCH met à jour un champ ; SET_SCALE/GROW_SCALE pilotent l'échelle. */
export type WizardEvent =
	| { type: "PATCH"; patch: Partial<Besoin> }
	| { type: "SET_SCALE"; path: string }
	| { type: "GROW_SCALE"; parentPath: string; label: string }
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
		// SET_SCALE : l'humain (ou le placement proposé) choisit une POSITION — un chemin.
		setScale: assign({
			besoin: ({ context, event }) =>
				event.type === "SET_SCALE"
					? { ...context.besoin, scale: event.path }
					: context.besoin,
		}),
		// GROW_SCALE : greffe via le twin pur (fail-closed, idempotent, append-only) et
		// auto-sélectionne le chemin du nouveau nœud quand la greffe a réellement poussé.
		grow: assign(({ context, event }) => {
			if (event.type !== "GROW_SCALE") return {};
			const parent = nodeByPath(context.tree, event.parentPath);
			if (parent === null) return {}; // parent inconnu → rien (le twin est fail-closed)
			const grown = growComposes(context.tree, parent.id, event.label);
			if (grown.length === context.tree.length) return {}; // idempotence / libellé vide
			const child = grown[grown.length - 1]; // append-only : le nouveau nœud est en queue
			return {
				tree: grown,
				besoin: {
					...context.besoin,
					scale: nodePath(grown, child.id).join("/"),
				},
			};
		}),
		// PROPOSER : délègue au twin pur. ok → idée posée ; sinon → erreurs (reste sur revue).
		compose: assign(({ context }) => {
			const r = composeIdea(context.besoin, context.tree);
			if (r.ok) return { idea: r.idea, errors: [] as string[] };
			return { idea: null, errors: r.errors };
		}),
		// RECOMMENCER : le besoin repart à zéro ; l'ARBRE reste (append-only, jamais détruit §9).
		reset: assign({
			besoin: () => ({ ...EMPTY_BESOIN }),
			idea: () => null,
			errors: () => [] as string[],
		}),
	},
	guards: {
		// PROPOSER ne franchit vers « proposée » que si le besoin est valide CONTRE L'ARBRE VIVANT.
		besoinValide: ({ context }) =>
			validateBesoin(context.besoin, context.tree).length === 0,
	},
}).createMachine({
	id: "ideaWizard",
	initial: "intention",
	context: {
		besoin: { ...EMPTY_BESOIN },
		idea: null,
		errors: [],
		tree: seedComposes(),
	},
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
				SET_SCALE: { actions: "setScale" },
				GROW_SCALE: { actions: "grow" },
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
