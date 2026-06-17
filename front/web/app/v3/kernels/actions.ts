"use server";

import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { KERNEL_TRUTHS, type KernelTruthView } from "@/lib/v3/kernels-data";
import { decodeBody, storeGetArgs, storeGetDecoder } from "./live";

/**
 * Server Action de la lentille /v3/kernels (V3 — ADR 0060/0092). LES KERNELS RENDUS LISIBLES :
 * la lentille lit, EN DIRECT par la passerelle, les vérités du noyau adressées par contenu — chaque
 * `kernel.truth` est rangée par hash dans le content-store (S02), lue par le tool Go `store_get`
 * (serveur `store` dispatché). Une seule porte typée vers le moteur (lib/gateway-sdk.readVia), le
 * Go reste la source unique (jamais un twin TS de la logique du noyau).
 *
 * LE CHEMIN LIVE. Pour chaque vérité connue (KERNEL_TRUTHS, leur hash calculé comme le content-store
 * Go), on `readVia(scope, "store_get", {hash}, …)`. Si les octets lus reviennent et se décodent en
 * un corps connu → source:"live" pour cette vérité ; sinon → le corps-démo (source:"demo"). La
 * SOURCE AGRÉGÉE de l'écran est "live" SEULEMENT si AU MOINS une vérité a été lue en direct — sinon
 * "demo" (honnête : aucun store dispatché, aucune vérité gelée dans ce projet).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : le décodeur + le repli-démo (les corps canoniques pinnés)
 * sont purs ; même entrée → même verdict, zéro LLM. LE MUR (§2/§9) : `store_get` est une lecture
 * sous la ligne — l'écran n'écrit AUCUNE vérité ; geler une nouvelle `kernel.truth` passe par
 * propose → ChangeSet → /goal → approbation, jamais depuis cette lentille.
 */

/** Une vérité du noyau projetée + d'où vient sa lecture (en direct ou repli-démo). */
export interface KernelTruthRow extends KernelTruthView {
	/** "live" si les octets ont été lus dans le store du projet ; "demo" sinon. */
	source: Source;
	/** vrai si les octets lus correspondent EXACTEMENT au corps connu (parité d'adressage). */
	bodyMatches: boolean;
}

export interface KernelsView {
	/** les vérités du noyau, chacune avec sa source de lecture. */
	rows: KernelTruthRow[];
	/** la source AGRÉGÉE de l'écran : "live" dès qu'une vérité a été lue en direct. */
	source: Source;
}

/**
 * loadKernelsAction lit l'ensemble des vérités connues, chacune par son hash via `store_get`, et
 * agrège leur source. NE LANCE JAMAIS : readVia retombe sur le corps-démo sur tout échec (pas
 * d'endpoint, transport, payload malformé, store non dispatché) — un écran jamais vide, un e2e
 * autonome. La parité d'adressage (les octets lus == le corps connu) est portée par bodyMatches.
 */
export async function loadKernelsAction(): Promise<KernelsView> {
	const scope = await panelScope();
	const rows: KernelTruthRow[] = [];
	let anyLive = false;
	for (const truth of KERNEL_TRUTHS) {
		// LIVE : on lit les octets rangés sous le hash de la vérité (le content-store, sous la
		// ligne). Le repli est la base64 du corps connu — readVia renvoie source:"demo" sur tout miss.
		const demoBytes = Buffer.from(truth.body, "utf8").toString("base64");
		const { data, source } = await readVia(
			scope,
			"store_get",
			storeGetArgs(truth.hash),
			storeGetDecoder,
			{ dataBase64: demoBytes },
		);
		const liveBody = decodeBody(data.dataBase64);
		// L'adressage par contenu PROUVE l'intégrité : les octets sous le hash doivent reproduire le
		// corps canonique. Une divergence reste rendue (honnête), marquée non-correspondante.
		const bodyMatches = liveBody === truth.body;
		if (source === "live") anyLive = true;
		rows.push({
			...truth,
			// On affiche les octets LIVE s'ils correspondent ; sinon le corps connu (lisible).
			body: bodyMatches ? liveBody : truth.body,
			source,
			bodyMatches,
		});
	}
	return { rows, source: anyLive ? "live" : "demo" };
}
