import { type Anatomy, buildAnatomy, syntheticPairStates } from "./anatomy";

/**
 * anatomy-data.ts — le REPLI-DÉMO DÉTERMINISTE de la lentille /v3/anatomie (le cutover
 * ADR 0092 : le moteur Go est l'UNIQUE source vivante de l'anatomie d'un kernel).
 *
 * POURQUOI CE FICHIER. La lentille V3 « anatomie » lit désormais le moteur Go LIVE par la
 * passerelle (`anatomy_build` sur le serveur `anatomy`, dispatché — back/kernel/mirror/anatomy
 * est la source unique). `anatomy_build` calcule, depuis l'état des six paires-miroir d'un
 * kernel, l'anatomie complète (les six paires ordonnées autour du mur + le voyant global = le
 * pire des six + les comptes), adressée par contenu. Quand la passerelle est injoignable ou
 * qu'aucun store n'est dispatché, l'écran retombe sur ce corps-démo (source:"demo").
 *
 * LE TWIN DEVIENT LE REPLI (jamais le chemin vivant). lib/v2/anatomy reste un calcul PUR &
 * TOTAL (buildAnatomy + syntheticPairStates), épinglé par lib/v2/anatomy.test.ts ; mais ce
 * calcul ne sert PLUS de source d'affichage live — il ne fait que produire le repli-démo
 * honnête. Ce fichier-data EST le témoin du cliquet (twin-as-live-fitness) : `lib/v2/anatomy.ts`
 * + `lib/v2/anatomy-data.ts` font de `v2/anatomy` un twin reconnu, donc tout import-valeur du
 * twin DOIT être derrière la frontière readVia (sinon le cliquet rougit).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : même kernelId → même anatomie-démo (syntheticPairStates
 * est une fonction pure d'un hash stable de l'id, zéro horloge/aléa/LLM). Le MUR (§2) : ceci ne
 * DÉCLARE qu'un repli de lecture sous la ligne — aucune écriture-vérité ; geler une vérité passe
 * par idée → miroir → /goal → approbation.
 */

/** Le kernel d'exemple par défaut (l'ancre canonique du parcours checkout — §93). */
export const DEFAULT_ANATOMY_KERNEL = "truth-checkout-authz";

/**
 * demoAnatomy compose l'anatomie-démo d'un kernel via le twin pur (l'image exacte que le Go
 * `anatomy_build` renverrait pour ces mêmes états). PURE & TOTALE : même id → même anatomie.
 * Le state des six paires est figé par syntheticPairStates tant que le store de kernels n'expose
 * pas ses voyants réels (OpenQuestion documentée — ne bloque pas).
 */
export function demoAnatomy(kernelId: string): Anatomy | null {
	const trimmed = kernelId.trim();
	if (trimmed === "") return null;
	const r = buildAnatomy(trimmed, syntheticPairStates(trimmed));
	return r.ok ? r.anatomy : null;
}
