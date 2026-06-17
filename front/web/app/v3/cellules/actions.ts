"use server";

import { measure } from "@/lib/arch-fitness";
import {
	assembleSnapshot,
	type CockpitSnapshot,
	DEMO_DEP_GRAPH,
	DEMO_FEDERATION,
	DEMO_PROJECT,
} from "@/lib/federation-cockpit";
import { demoWave, gatewayFanOutArgs } from "@/lib/federation-cockpit-data";
import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { fanOutDecoder } from "./live";

/**
 * Server Action de la lentille /v3/cellules (V3 — ADR 0060/0092). LA FÉDÉRATION DES CELLULES
 * RENDUE LISIBLE : la lentille lit, EN DIRECT par la passerelle, la VAGUE DE ROUGE transverse —
 * quelles cellules une policy globale rougit, et chaque cellule qui réconcilie localement (le
 * §51 fan-out). Une seule porte typée vers le moteur (lib/gateway-sdk.readVia → le tool Go
 * `fan_out` du serveur `federation` dispatché), le Go reste la source unique (jamais un twin TS
 * de la logique de fan-out).
 *
 * LE CHEMIN LIVE. On `readVia(scope, "fan_out", gatewayFanOutArgs(true), fanOutDecoder, demoWave)` :
 * une policy PII exprimée UNE FOIS sur la fédération `order ⇄ payment`. `payment` la viole → elle
 * rougit ; `order` ne la viole pas → elle reste VERTE et continue de livrer (le §51 : « le red
 * wave déploie globalement, chaque cellule réconcilie localement »). La vague lue est COMPOSÉE dans
 * l'instantané de fédération par la fonction PURE assembleSnapshot (le graphe des cellules, les
 * contrats, les deux cliquets, la stabilité locale vs globale). source:"live" si la vague vient du
 * moteur ; sinon la vague-démo déterministe (source:"demo").
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : le décodeur + assembleSnapshot + le repli-démo sont purs ;
 * même entrée → instantané byte-identique, zéro LLM. LE MUR (§2/§9) : `fan_out` est une lecture
 * sous la ligne (il renvoie les vagues par cellule comme une VALEUR) ; l'écran n'écrit AUCUNE
 * vérité — l'INSERT dans runtime.red_work_queue est le travail du hook S22, le déplacement de la
 * baseline structurelle passe par un ChangeSet, jamais depuis cette lentille.
 *
 * L'import de la frontière readVia garde le cliquet T5 (twin-as-live-fitness) VERT : le twin
 * (lib/federation-cockpit) ne sert qu'à BÂTIR le repli-démo, derrière la frontière source:"demo".
 */

/** La baseline structurelle contre laquelle la coupe candidate est cliquetée (la coupe stable). */
const BASELINE = measure(DEMO_DEP_GRAPH);

/** La vue de la lentille : l'instantané de fédération + d'où vient la vague de rouge lue. */
export interface CellulesView {
	ok: boolean;
	snapshot?: CockpitSnapshot;
	/** "live" si la vague de rouge vient du moteur Go ; "demo" sinon (ADR 0074). */
	source?: Source;
	error?: string;
}

/**
 * loadCellulesAction lit la vague de rouge transverse EN DIRECT (`fan_out`), puis compose
 * l'instantané de fédération. NE LANCE JAMAIS : readVia retombe sur la vague-démo déterministe sur
 * tout échec (pas d'endpoint, transport, payload malformé, serveur non dispatché, refus) — un écran
 * jamais vide, un e2e autonome.
 */
export async function loadCellulesAction(): Promise<CellulesView> {
	try {
		const scope = await panelScope();
		// LIVE : la vague de rouge §51 par la passerelle (le tool `fan_out` dispatché du serveur
		// `federation`) ; la vague-démo est le repli déterministe (source:"live"|"demo").
		const { data: wave, source } = await readVia(
			scope,
			"fan_out",
			gatewayFanOutArgs(true),
			fanOutDecoder,
			demoWave(true),
		);
		const snapshot = assembleSnapshot(
			DEMO_PROJECT,
			DEMO_DEP_GRAPH,
			BASELINE,
			DEMO_FEDERATION,
			wave,
		);
		return { ok: true, snapshot, source };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
