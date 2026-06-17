"use server";

import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import type { Anatomy } from "@/lib/v2/anatomy";
import { syntheticPairStates } from "@/lib/v2/anatomy";
import { demoAnatomy } from "@/lib/v2/anatomy-data";
import { anatomyDecoder } from "./live";

/**
 * anatomyBuildArgs projette un kernelId vers l'objet d'arguments du tool `anatomy_build` (Go
 * buildInput = { kernel_id, states:[{kind, declared, proven}] }). PURE ; un objet SIMPLE (pas de
 * json.RawMessage — le garde du scar S59). Les états des six paires sont figés par le calcul pur (repli démo)
 * (syntheticPairStates) tant que le store de kernels n'expose pas ses voyants réels (OpenQuestion
 * documentée). Le value-import du twin (syntheticPairStates) est LÉGAL ici : ce module importe
 * AUSSI la frontière readVia (le calcul du twin reste derrière source:"demo" — le cliquet le
 * vérifie). Tenu HORS de live.ts (qui doit rester un décodeur PUR, type-only sur le twin).
 */
function anatomyBuildArgs(kernelId: string): Record<string, unknown> {
	return {
		kernel_id: kernelId,
		states: syntheticPairStates(kernelId).map((s) => ({
			kind: s.kind,
			declared: s.declared,
			proven: s.proven,
		})),
	};
}

/**
 * Server Action de la lentille /v3/anatomie (V3 — ADR 0092). L'ANATOMIE D'UN KERNEL LUE EN
 * DIRECT : la lentille lit, par la passerelle, les SIX PAIRES-MIROIR autour du mur computées
 * par le moteur Go (`anatomy_build` sur le serveur `anatomy` dispatché — back/kernel/mirror/
 * anatomy est la source unique). Une seule porte typée vers le moteur (lib/gateway-sdk.readVia) ;
 * le Go reste la source unique (le calcul des voyants n'est JAMAIS un twin TS live — la table de
 * vérité §8 « le juge est un calcul » est portée par le Go, le twin lib/v2/anatomy n'est plus que
 * le repli-démo honnête).
 *
 * LE CHEMIN LIVE. Pour le kernel inspecté, on `readVia(scope, "anatomy_build", {kernel_id, states},
 * anatomyDecoder, demo)`. Si le moteur répond → source:"live" ; sinon (pas d'endpoint, transport,
 * `ok:false`, payload malformé, store non dispatché) → l'anatomie-démo (source:"demo"). L'écran
 * n'est JAMAIS vide et l'e2e reste autonome (readVia ne lance jamais).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : le décodeur + l'anatomie-démo (le calcul pur (repli démo)) sont des
 * fonctions PURES ; même entrée → même verdict, zéro LLM. LE MUR (§2/§9) : `anatomy_build` est une
 * lecture sous la ligne — l'écran n'écrit AUCUNE vérité (un voyant rouge est un SIGNAL) ; geler /
 * réconcilier une vérité passe par idée → miroir → /goal → approbation, jamais depuis cette lentille.
 */

/** L'anatomie d'un kernel + d'où vient sa lecture (en direct ou repli-démo). */
export interface AnatomyView {
	/** l'anatomie computée (six paires ordonnées + overall + comptes), ou null si kernel vide. */
	anatomy: Anatomy | null;
	/** "live" si le moteur Go a répondu ; "demo" sinon (passerelle injoignable / store non dispatché). */
	source: Source;
}

/**
 * loadAnatomyAction lit l'anatomie du kernel inspecté via `anatomy_build`, avec repli-démo. NE
 * LANCE JAMAIS : readVia retombe sur l'anatomie-démo sur tout échec. Un kernelId vide → aucune
 * anatomie (l'écran invite à saisir un kernel), source:"demo" (rien lu en direct).
 */
export async function loadAnatomyAction(
	kernelId: string,
): Promise<AnatomyView> {
	const trimmed = kernelId.trim();
	if (trimmed === "") return { anatomy: null, source: "demo" };

	const scope = await panelScope();
	const demo = demoAnatomy(trimmed);
	// Sans repli (kernel invalide pour le twin) on ne tente même pas le live : honnête, source démo.
	if (demo === null) return { anatomy: null, source: "demo" };

	const { data, source } = await readVia(
		scope,
		"anatomy_build",
		anatomyBuildArgs(trimmed),
		anatomyDecoder,
		demo,
	);
	return { anatomy: data, source };
}
