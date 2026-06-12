/**
 * V3 — le TWIN PUR de la SESSION REJOUABLE (ADR 0060).
 *
 * L'HISTORY de la V3 n'est pas une fonctionnalité ajoutée : c'est une CONSÉQUENCE de
 * l'event-sourcing du builder (ADR 0057). La session est UN TRANSCRIPT (la liste des
 * messages) ; l'état n'est JAMAIS stocké, il est REJOUÉ — fold du réducteur pur
 * applyIntent sur le préfixe. « Revenir en arrière » = rejouer un préfixe ; brancher
 * une autre suite = un nouveau transcript à partir de ce préfixe. Déterministe par
 * construction (le miroir lib/v3/session.test.ts le prouve : rejeu ≡ fold, préfixe
 * indépendant du futur, totalité aux bornes).
 *
 * LE MUR (§2) : rejouer ne produit aucune écriture — le réducteur est pur, la loi ∀
 * du builder (aucune intention n'écrit une vérité) couvre chaque pas du rejeu.
 */

import {
	applyIntent,
	type BuilderEvent,
	type BuilderImpact,
	type BuilderState,
	initBuilderState,
	type ScreenRef,
	type Understanding,
	understand,
} from "../v2/builder";

/** Un TOUR annoté du transcript : le message + son verdict + ses effets. */
export interface SessionTurn {
	readonly index: number;
	readonly msg: string;
	readonly understanding: Understanding;
	readonly events: readonly BuilderEvent[];
	readonly impacts: readonly BuilderImpact[];
}

/**
 * REJOUE le transcript jusqu'au message n (exclu) — l'état « à ce moment-là ».
 * PURE & TOTALE : n est clampé aux bornes ; même (transcript, n) → même état.
 */
export function replayTo(
	messages: readonly string[],
	n: number,
	extraScreens: readonly ScreenRef[] = [],
	tree?: Parameters<typeof initBuilderState>[1],
): BuilderState {
	const upTo = Math.max(0, Math.min(Math.floor(n), messages.length));
	let state = initBuilderState(extraScreens, tree);
	for (let i = 0; i < upTo; i++) state = applyIntent(state, messages[i]).state;
	return state;
}

/**
 * ANNOTE le transcript entier : un SessionTurn par message (le verdict d'attente,
 * les événements, les impacts — exactement ceux du rejeu) + l'état final. PURE &
 * TOTALE & DÉTERMINISTE — la timeline de l'écran History EST cette projection.
 */
export function turnsOf(
	messages: readonly string[],
	extraScreens: readonly ScreenRef[] = [],
	tree?: Parameters<typeof initBuilderState>[1],
): { turns: SessionTurn[]; state: BuilderState } {
	const turns: SessionTurn[] = [];
	let state = initBuilderState(extraScreens, tree);
	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i];
		const understanding = understand(state, msg);
		const r = applyIntent(state, msg);
		turns.push({
			index: i,
			msg,
			understanding,
			events: r.events,
			impacts: r.impacts,
		});
		state = r.state;
	}
	return { turns, state };
}
