import { assign, setup } from "xstate";
import type { MirrorForm } from "../../../lib/besoin-completeness";
import {
	type BlockReason,
	type MirrorSpec,
	type PromoteError,
	type ProposedKernel,
	promoteIdea,
	refuseDirectWrite,
	syntheticIdea,
	syntheticMirror,
	validateMirror,
} from "../../../lib/v2/goal";
import type { Idea } from "../../../lib/v2/idea";

/**
 * WB2-11 — la MACHINE À ÉTATS du wizard /goal (XState v5, ADR 0053).
 *
 * La transition idée → ÉCRIRE LE MIROIR → /goal → GEL (KRD §116) EST une machine : une idée
 * (hasMirror=false, PROPOSE) → on écrit son miroir (HasMirror false→true, le mur franchi) → /goal
 * gèle une version dans un ChangeSet DRAFT (proposé, jamais appliqué). Les étapes sont des ÉTATS
 * VISIBLES ; les transitions (ÉCRIRE_MIROIR / GOAL / RECOMMENCER / ÉCRIRE_DIRECT) sont explicites.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : la machine NE JUGE RIEN — elle DÉLÈGUE validation, promotion
 * et refus-du-mur au twin pur lib/v2/goal.ts (validateMirror, promoteIdea, refuseDirectWrite). XState
 * orchestre l'état d'écran ; le franchissement (le miroir est-il de la bonne forme ? la version gelée ?)
 * est CALCULÉ par le code, jamais appris.
 * LE MUR (§2) : GOAL appelle promoteIdea → un ChangeSet DRAFT (wroteKernel=false, PROPOSE) ;
 * ÉCRIRE_DIRECT appelle refuseDirectWrite → un BlockReason — l'écriture-vérité directe est REFUSÉE.
 */

/** Le contexte porté par la machine : l'idée, le miroir saisi, le kernel proposé, les refus. */
export interface GoalContext {
	idea: Idea;
	mirror: MirrorSpec;
	proposed: ProposedKernel | null;
	errors: PromoteError[];
	/** Le refus du mur (si l'écran a tenté une écriture-vérité directe). */
	block: BlockReason | null;
}

/** Le miroir vierge initial (forme attendue par l'idée synthétique). */
export const EMPTY_MIRROR: MirrorSpec = { form: "fixture_n2", text: "" };

/** Les événements du wizard. */
export type GoalEvent =
	| { type: "SET_FORM"; form: MirrorForm }
	| { type: "SET_MIRROR_TEXT"; text: string }
	| { type: "ECRIRE_MIROIR" } // idea → mirror_written (HasMirror false→true)
	| { type: "GOAL" } // mirror_written → frozen (promoteIdea → ChangeSet DRAFT)
	| { type: "ECRIRE_DIRECT" } // tentative d'écriture-vérité directe → refusée (le mur)
	| { type: "RECOMMENCER" };

/** Les noms d'états, dans l'ordre du parcours (réutilisés par l'UI pour le stepper). */
export const GOAL_STEPS = ["idea", "mirror_written", "frozen"] as const;
export type GoalStep = (typeof GOAL_STEPS)[number];

export const goalWizardMachine = setup({
	types: {} as { context: GoalContext; events: GoalEvent },
	actions: {
		setForm: assign({
			mirror: ({ context, event }) =>
				event.type === "SET_FORM"
					? { ...context.mirror, form: event.form }
					: context.mirror,
		}),
		setMirrorText: assign({
			mirror: ({ context, event }) =>
				event.type === "SET_MIRROR_TEXT"
					? { ...context.mirror, text: event.text }
					: context.mirror,
		}),
		// GOAL : délègue au twin pur. ok → kernel proposé (version gelée) ; sinon → erreurs (reste).
		goal: assign(({ context }) => {
			const r = promoteIdea(context.idea, context.mirror);
			if (r.ok) return { proposed: r.proposed, errors: [] };
			return { proposed: null, errors: r.errors };
		}),
		// ÉCRIRE_DIRECT : le mur — refuse TOUJOURS, pose un BlockReason (jamais une écriture).
		refuse: assign({
			block: ({ context }) =>
				refuseDirectWrite(
					`${context.idea.coordinate.level}×${context.idea.coordinate.facet}`,
				),
		}),
		clearBlock: assign({ block: () => null }),
		reset: assign({
			mirror: () => ({ ...EMPTY_MIRROR }),
			proposed: () => null,
			errors: () => [] as PromoteError[],
			block: () => null,
		}),
	},
	guards: {
		// ÉCRIRE_MIROIR ne franchit que si le miroir saisi est valide (forme attendue, texte non vide).
		mirrorValide: ({ context }) =>
			validateMirror(context.idea, context.mirror).length === 0,
		// GOAL ne gèle que si la promotion réussit (le twin décide, pas le LLM).
		promotable: ({ context }) => promoteIdea(context.idea, context.mirror).ok,
	},
}).createMachine({
	id: "goalWizard",
	initial: "idea",
	context: {
		idea: syntheticIdea(),
		mirror: { ...EMPTY_MIRROR, text: syntheticMirror().text },
		proposed: null,
		errors: [],
		block: null,
	},
	states: {
		idea: {
			on: {
				SET_FORM: { actions: "setForm" },
				SET_MIRROR_TEXT: { actions: "setMirrorText" },
				// Le mur : tenter une écriture directe depuis l'étape idée → refus (BlockReason), pas de transition.
				ECRIRE_DIRECT: { actions: "refuse" },
				ECRIRE_MIROIR: [
					{
						target: "mirror_written",
						guard: "mirrorValide",
						actions: "clearBlock",
					},
				],
			},
		},
		mirror_written: {
			on: {
				ECRIRE_DIRECT: { actions: "refuse" },
				GOAL: [
					{ target: "frozen", guard: "promotable", actions: "goal" },
					{ actions: "goal" },
				],
			},
		},
		frozen: {
			on: {
				ECRIRE_DIRECT: { actions: "refuse" },
				RECOMMENCER: { target: "idea", actions: "reset" },
			},
		},
	},
});
