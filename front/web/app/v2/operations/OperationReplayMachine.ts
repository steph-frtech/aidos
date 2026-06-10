import { assign, setup } from "xstate";
import {
	frames,
	type OperationFixture,
	type ReplayFrame,
} from "../../../lib/v2/operations";

/**
 * WB2-12 — la MACHINE À ÉTATS du REJEU d'une fixture Operation DSL (XState v5, ADR 0053).
 *
 * Une fixture S10 `état → commande → events` EST une machine : on la rejoue PAS-À-PAS — chaque verbe est
 * une commande qui peut émettre un event. La machine porte un CURSEUR dans la suite de frames calculée
 * PAR LE TWIN PUR (lib/v2/operations.frames) : AVANCER (jouer le pas suivant), REJOUER_TOUT (aller au
 * bout), RECOMMENCER (revenir à l'état initial). Les états visibles sont `idle` (au début ou en cours) et
 * `finished` (la dernière frame atteinte).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : la machine NE JUGE RIEN — elle ne fait qu'AVANCER un curseur
 * dans des frames que le TWIN a calculées (run S10 pur : mêmes commandes → mêmes events). XState orchestre
 * l'avancement de l'écran ; les events, les états et le verdict sont CALCULÉS par le code, jamais appris.
 * LE MUR (§2) : rejouer n'écrit aucune vérité — c'est une lecture du comportement (mutate via mock).
 */

/** Le contexte porté par la machine : la fixture, ses frames pré-calculées, et le curseur de rejeu. */
export interface ReplayContext {
	fixture: OperationFixture;
	allFrames: ReplayFrame[];
	/** L'index DANS allFrames de la frame courante (0 = l'état initial idle). */
	cursor: number;
}

/** Les événements du rejeu. */
export type ReplayEvent =
	| { type: "AVANCER" } // jouer le pas suivant (avance le curseur d'une frame)
	| { type: "REJOUER_TOUT" } // aller directement à la dernière frame
	| { type: "RECOMMENCER" }; // revenir à l'état initial (curseur 0)

/** Construit le contexte initial d'une fixture : ses frames (twin pur) + le curseur à 0 (état initial). */
export function initialReplayContext(fixture: OperationFixture): ReplayContext {
	return { fixture, allFrames: frames(fixture), cursor: 0 };
}

export const operationReplayMachine = setup({
	types: {} as { context: ReplayContext; events: ReplayEvent },
	actions: {
		// AVANCER : +1 sur le curseur, borné à la dernière frame (jamais hors-limite).
		avancer: assign({
			cursor: ({ context }) =>
				Math.min(context.cursor + 1, context.allFrames.length - 1),
		}),
		// REJOUER_TOUT : sauter directement à la dernière frame.
		rejouerTout: assign({
			cursor: ({ context }) => context.allFrames.length - 1,
		}),
		// RECOMMENCER : revenir à l'état initial (idle).
		recommencer: assign({ cursor: () => 0 }),
	},
	guards: {
		// Reste-t-il un pas à jouer ? (le curseur n'a pas atteint la dernière frame).
		aUnPasSuivant: ({ context }) =>
			context.cursor < context.allFrames.length - 1,
	},
}).createMachine({
	id: "operationReplay",
	initial: "idle",
	// Le contexte est INJECTÉ par input (la fixture choisie par la route) — totalité.
	context: ({ input }) => input as ReplayContext,
	states: {
		// idle : le rejeu n'est pas terminé (au début ou en cours d'avancement).
		idle: {
			always: [
				// si le curseur est déjà au bout (fixture d'un seul pas, improbable) → finished.
				{
					target: "finished",
					guard: ({ context }) =>
						context.cursor >= context.allFrames.length - 1,
				},
			],
			on: {
				AVANCER: [
					{
						target: "finished",
						guard: ({ context }) =>
							context.cursor + 1 >= context.allFrames.length - 1,
						actions: "avancer",
					},
					{ actions: "avancer", guard: "aUnPasSuivant" },
				],
				REJOUER_TOUT: { target: "finished", actions: "rejouerTout" },
				RECOMMENCER: { actions: "recommencer" },
			},
		},
		// finished : la dernière frame est atteinte (l'opération est terminée ou refusée).
		finished: {
			on: {
				RECOMMENCER: { target: "idle", actions: "recommencer" },
			},
		},
	},
});
