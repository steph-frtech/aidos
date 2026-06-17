import type {
	Anatomy,
	DeclaredState,
	MirrorPair,
	PairKind,
	ProvenState,
	Voyant,
	WallSide,
} from "@/lib/v2/anatomy";
import {
	arr,
	type Decoder,
	isObject,
	num,
	str,
} from "../../../lib/gateway-sdk";

/**
 * /v3/anatomie lecture live — le DÉCODEUR PUR sur la sortie de l'outil Go `anatomy_build`
 * (le serveur `anatomy` dispatché par la passerelle — ADR 0092, le cutover S59).
 *
 * Tenu HORS de actions.ts (un module Next « use server » ne peut exporter que des fonctions
 * async) pour que le miroir de parité (live.test.ts) importe le décodeur PUR directement.
 *
 * JAMAIS DOUBLEMENT TYPÉ (la done-criterion S59) : `anatomyDecoder` est l'UNIQUE déclaration
 * runtime de la forme `buildOutput` du Go (anatomysrv.buildOutput : { ok, kernel_id, pairs[{kind,
 * declared:{side,state}, proven:{side,state}, voyant}], overall, counts:{green,red,amber}, hash,
 * error }, snake_case) ; il REMPLIT le type `Anatomy` du twin (lib/v2/anatomy, importé en TYPE
 * SEULEMENT — aucun runtime du twin tiré ici : le cliquet l'exige, le décodeur n'est pas derrière
 * la frontière readVia). Il ne RÉIMPLÉMENTE pas la logique du noyau (back/kernel/mirror/anatomy
 * reste la source unique) : il VALIDE/transpose le contrat du tool. La liste EXPECTED_PAIR_ORDER
 * est le jeu CLOS canonique des six paires (la même image que anatomy.PairKinds() du Go), DÉCLARÉ
 * ici pour vérifier l'ordre — un contrôle de décodage, pas une logique d'anatomie. DÉTERMINISME-
 * FIRST (§6/§8) : même JSON → même verdict ; un payload malformé / un `ok:false` / des paires
 * désordonnées → null, et readVia retombe sur l'anatomie-démo.
 *
 * LE MUR (CLAUDE.md §2) : ceci ne fait que DÉCODER une lecture sous la ligne — `anatomy_build`
 * calcule un voyant, il n'écrit rien (un rouge est un SIGNAL) ; geler une vérité passe par idée →
 * miroir → /goal → approbation.
 */

/** Le jeu CLOS des six paires, dans l'ORDRE canonique — l'image de anatomy.PairKinds() du Go,
 * DÉCLARÉE ici pour valider l'ordre/complétude du payload décodé (un contrôle, pas une logique). */
const EXPECTED_PAIR_ORDER: readonly PairKind[] = [
	"spec_doc",
	"behavior_results",
	"scenarios_tests",
	"model_projection",
	"contract_code",
	"evidence",
];
const PAIR_KIND_SET = new Set<string>(EXPECTED_PAIR_ORDER);

const DECLARED_STATES: readonly DeclaredState[] = ["declared", "absent"];
const PROVEN_STATES: readonly ProvenState[] = [
	"pass",
	"fail",
	"pending",
	"absent",
];
const VOYANTS: readonly Voyant[] = ["green", "red", "amber"];

/** decodeFace décode une face (above|below × declared/absent/pass/fail/pending) ; null si invalide. */
function decodeFace<S extends string>(
	raw: unknown,
	valid: readonly S[],
): { side: WallSide; state: S } | null {
	if (!isObject(raw)) return null;
	const side = str(raw.side);
	const state = str(raw.state);
	if (side !== "above" && side !== "below") return null;
	if (state === null || !(valid as readonly string[]).includes(state)) {
		return null;
	}
	return { side, state: state as S };
}

/** decodePair décode une paire-miroir du Go vers le MirrorPair du twin ; null si invalide. */
function decodePair(raw: unknown): MirrorPair | null {
	if (!isObject(raw)) return null;
	const kind = str(raw.kind);
	if (kind === null || !PAIR_KIND_SET.has(kind)) return null;
	const declared = decodeFace(raw.declared, DECLARED_STATES);
	const proven = decodeFace(raw.proven, PROVEN_STATES);
	const voyant = str(raw.voyant);
	if (
		declared === null ||
		proven === null ||
		voyant === null ||
		!(VOYANTS as readonly string[]).includes(voyant)
	) {
		return null;
	}
	// La face déclarée est toujours au-dessus du mur, la prouvée toujours en dessous (l'invariant
	// d'anatomie). Un payload qui inverserait les côtés est rejeté (→ repli-démo).
	if (declared.side !== "above" || proven.side !== "below") return null;
	return {
		kind: kind as PairKind,
		declared,
		proven,
		voyant: voyant as Voyant,
	};
}

/**
 * anatomyDecoder décode la sortie de l'outil Go `anatomy_build` (buildOutput) vers le type
 * `Anatomy` du twin. Un `ok:false` (état incomplet/invalide refusé par le moteur), un kernel_id
 * absent, des paires hors du jeu clos / dans le désordre, ou un overall invalide → null (→ repli
 * démo). L'UNIQUE déclaration runtime de la forme.
 */
export const anatomyDecoder: Decoder<Anatomy> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	const kernelId = str(raw.kernel_id);
	if (kernelId === null || kernelId.trim() === "") return null;
	const pairs = arr(decodePair)(raw.pairs);
	if (pairs === null) return null;
	// Le jeu CLOS, dans l'ORDRE canonique (1-pour-1, aucune perdue ni dupliquée ni désordonnée).
	if (pairs.length !== EXPECTED_PAIR_ORDER.length) return null;
	for (let i = 0; i < EXPECTED_PAIR_ORDER.length; i++) {
		if (pairs[i]?.kind !== EXPECTED_PAIR_ORDER[i]) return null;
	}
	const overall = str(raw.overall);
	if (overall === null || !(VOYANTS as readonly string[]).includes(overall)) {
		return null;
	}
	const c = isObject(raw.counts) ? raw.counts : {};
	const green = num(c.green) ?? 0;
	const red = num(c.red) ?? 0;
	const amber = num(c.amber) ?? 0;
	return {
		kernelId,
		pairs,
		overall: overall as Voyant,
		counts: { green, red, amber },
	};
};
