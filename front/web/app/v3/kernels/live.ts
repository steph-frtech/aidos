import { type Decoder, isObject, str } from "../../../lib/gateway-sdk";

/**
 * /v3/kernels live read — le décodeur PUR sur la sortie du tool Go `store_get` (le serveur
 * `store` dispatché par la passerelle — ADR 0092, le cutover S59).
 *
 * Gardé HORS de actions.ts (un module Next « use server » ne peut exporter que des fonctions
 * async) pour que le miroir de parité (live.test.ts) importe le décodeur PUR directement.
 *
 * JAMAIS DOUBLEMENT TYPÉ (le critère de S59) : `storeGetDecoder` est l'UNIQUE déclaration runtime
 * de la forme `getOutput` du Go (storesrv.getOutput = { data_base64 }) ; il ne RÉIMPLÉMENTE pas la
 * logique du content-store (contentstore.Get est la source unique). DÉTERMINISME-FIRST (§6/§8) :
 * même JSON → même verdict ; un payload malformé renvoie null et readVia retombe sur la démo.
 *
 * LE MUR (CLAUDE.md §2) : ceci ne fait que DÉCODER une lecture sous la ligne — `store_get` lit des
 * octets, il n'écrit rien ; geler une vérité passe par idée → miroir → /goal → approbation.
 */

/**
 * storeGetDecoder décode la sortie du tool `store_get` (storesrv.getOutput) en sa charge utile
 * minimale `{ dataBase64 }` (les octets base64 du corps rangé sous le hash). Un champ absent /
 * d'un mauvais type → null (→ repli démo). C'est l'unique déclaration runtime de la forme.
 */
export const storeGetDecoder: Decoder<{ dataBase64: string }> = (raw) => {
	if (!isObject(raw)) return null;
	const dataBase64 = str(raw.data_base64);
	if (dataBase64 === null) return null;
	return { dataBase64 };
};

/** storeGetArgs projette un hash de contenu vers l'objet d'arguments du tool `store_get` (Go
 * getInput = { hash }). PURE ; un objet simple (pas de json.RawMessage) — le garde du scar S59. */
export function storeGetArgs(hash: string): Record<string, unknown> {
	return { hash };
}

/**
 * decodeBody transforme les octets base64 lus en le corps JSONB texte (une chaîne UTF-8). PURE et
 * totale : des octets non-UTF8 restent une chaîne (le rendu reste honnête). Le hash a déjà prouvé
 * l'adressage par contenu ; on ne re-juge rien ici.
 */
export function decodeBody(dataBase64: string): string {
	return Buffer.from(dataBase64, "base64").toString("utf8");
}
