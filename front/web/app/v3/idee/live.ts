import {
	type BesoinGraphState,
	type LevelVerdict,
	stateDecoder,
} from "../../besoin-intake/live";

/**
 * /v3/idée (idea capture) live read — la lentille « idée » lit, EN DIRECT par la passerelle, la
 * VUE QU'A LE MOTEUR du besoin capturé dans le projet actif (le serveur Go `besoin-intake`, EL15,
 * déjà dispatché — ADR 0009/0092). C'est l'étage d'ENTRÉE de la verticale (§23) : au-dessus du
 * mur, un besoin devient une idée (un candidat-vérité, §115) rung par rung.
 *
 * AUCUN GO RÉ-IMPLÉMENTÉ (le critère du cutover ADR 0092). Le décodeur de l'état du graphe est
 * EXACTEMENT celui de /besoin-intake (`stateDecoder`, l'unique déclaration runtime de la forme
 * `besoinintakesrv.stateOutput`) — on le RÉEXPORTE, on ne le redéclare pas. Le moteur Go reste la
 * source unique : le niveau ENTRABLE (EL07) et les verdicts par rung sont CALCULÉS côté serveur sur
 * le BesoinGraph persisté (scopé par projet, RLS S55). Cette lentille ne fait que DÉCODER une
 * lecture.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : le décodeur est pur ; même JSON → même verdict, zéro LLM ;
 * un payload malformé → null → repli démo (source:"demo", ADR 0074 — jamais un faux « live »).
 * LE MUR (§2) : `besoin_graph_state` est une lecture sous la ligne — l'écran lit, il n'écrit aucune
 * vérité. Capturer une idée passe par la porte gouvernée (idea_capture, EL05) ; geler une vérité
 * passe par idée → miroir → /goal → approbation.
 */

export type { BesoinGraphState, LevelVerdict };
// Réexport pur du décodeur + des types de /besoin-intake : la forme du graphe est déclarée UNE
// SEULE FOIS (live.ts de /besoin-intake), jamais doublement typée ici.
export { stateDecoder };

/**
 * IdeeSchemaRow — la projection d'UN niveau de grammaire pour la lentille : le nom du niveau, les
 * champs requis (ce qu'un formulaire rendrait), et la décision EL05 « capturer ici émet-il une
 * idée ? » + le genre d'idée proposé. C'est une vue d'affichage PURE dérivée du schéma de niveau
 * (le twin `lib/besoin-intake` reproduit byte-à-byte le Go `besoin_level_schema`) — aucune logique
 * du moteur ré-implémentée, seulement un applatissement pour le rendu.
 */
export interface IdeeSchemaRow {
	level: string;
	requiredFields: string[];
	/** vrai si capturer à ce niveau ÉMET une idée (un rung MAPPING) ; faux pour un rung NoEmit. */
	emits: boolean;
	/** le genre d'idée proposé par un rung MAPPING (ex. "operation", "entity") ; null sinon. */
	proposes: string | null;
}
