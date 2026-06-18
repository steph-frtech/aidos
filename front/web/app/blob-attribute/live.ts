import { type Decoder, isObject, str } from "../../lib/gateway-sdk";

/**
 * /blob-attribute live decoders — les DÉCODEURS PURS sur les sorties des outils Go du serveur
 * MCP `blob-attribute` (cutover S59, ADR 0092 : le moteur Go est l'UNIQUE source vivante du
 * type blob/fichier S72). Gardés HORS de actions.ts (un module Next "use server" n'exporte que
 * des fonctions async) pour que le miroir de parité live.test.ts importe les décodeurs PURS
 * directement.
 *
 * LES SHAPES GO (back/mcp/blob-attribute/blobattributesrv) — chacun un OBJET scalaire (aucun
 * json.RawMessage, le scar S59 évité) :
 *   blob_address       → { ok, id, body, block? }       (le round-trip content-adressé)
 *   blob_validate_upload → { ok, block? }               (la validation MIME + taille fermée)
 *   blob_storage_key   → { ok, key, block? }            (la clé scopée project_id)
 *   blob_cross_project → { ok, block? }                 (le refus cross-projet)
 *   blob_emit_handler  → { ok, path, target, source_hash, code, block? }  (le handler émis)
 *
 * NEVER DOUBLE-TYPED (le done-criterion S59) : chaque décodeur est l'UNIQUE déclaration runtime
 * de son shape live ; le type statique est INFÉRÉ via Decoded<>. Le miroir épingle le décodeur
 * == le contrat Go blobattributesrv, PAS une seconde implémentation du calcul (blob.ID /
 * blob.StorageKey / blob.EmitHandler sont autoritatifs).
 *
 * DÉTERMINISME-FIRST (§6/§8) : même JSON → même verdict ; un payload mal formé renvoie null et
 * readVia retombe sur le repli-démo (le twin pur). LE MUR (§2) : lecture sous la ligne — aucune
 * écriture ; un attribut blob est une SOURCE au-dessus de la ligne, geler une vérité passe par
 * idée → miroir → /goal.
 */

/** Le résultat content-adressé de blob_address (le round-trip : id + body canonique). */
export interface AddressLive {
	id: string;
	body: string;
}

/**
 * addressDecoder décode la sortie de `blob_address` ({ ok, id, body, block? }). Un payload
 * accepté (ok ∧ id ∧ body présents) renvoie l'adresse ; un refus (ok:false / block) ou un
 * payload mal formé → null (→ repli démo). Le `block` est volontairement ignoré ici : le
 * round-trip d'un nœud bien-formé NE bloque jamais ; un nœud mal-formé n'est pas la voie live.
 */
export const addressDecoder: Decoder<AddressLive> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	const id = str(raw.id);
	const body = str(raw.body);
	if (id === null || body === null) return null;
	return { id, body };
};

/** Le résultat de blob_storage_key ({ ok, key, block? }) — la clé scopée project_id. */
export interface KeyLive {
	key: string;
}

/**
 * keyDecoder décode `blob_storage_key`. Un payload accepté (ok ∧ key non-vide) renvoie la clé ;
 * un refus / payload mal formé → null. La clé est PROJECT-SCOPÉE (<project>/<entity>/<attr>/<hash>),
 * byte-identique à blob.StorageKey (Go autoritatif).
 */
export const keyDecoder: Decoder<KeyLive> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	const key = str(raw.key);
	if (key === null || key.length === 0) return null;
	return { key };
};

/** Le verdict d'un read « ok | bloqué » (blob_validate_upload, blob_cross_project). */
export interface VerdictLive {
	ok: boolean;
}

/**
 * verdictDecoder décode un read binaire (`blob_validate_upload`, `blob_cross_project`) :
 * { ok, block? }. Le décodeur épingle le `ok` du moteur Go — un upload hors-MIME / hors-taille
 * (ok:false, BLOB_MIME_REFUSED / BLOB_SIZE_REFUSED) ou un accès cross-projet (BLOB_CROSS_PROJECT)
 * rend { ok:false }. Un payload sans `ok` booléen → null (→ repli démo).
 */
export const verdictDecoder: Decoder<VerdictLive> = (raw) => {
	if (!isObject(raw)) return null;
	if (typeof raw.ok !== "boolean") return null;
	return { ok: raw.ok };
};

/** Le résultat de blob_emit_handler ({ ok, path, target, source_hash, code, block? }). */
export interface HandlerLive {
	path: string;
	target: string;
	sourceHash: string;
	code: string;
}

/**
 * handlerDecoder décode `blob_emit_handler`. Un payload accepté (ok ∧ code non-vide) renvoie le
 * handler émis (chemin + cible + adresse-source + code byte-stable, mirror de blob.EmitHandler) ;
 * un refus / payload mal formé → null (→ repli démo). Le `code` est une STRING (pas un byte-array),
 * donc le round-trip HTTP survit (aucun json.RawMessage).
 */
export const handlerDecoder: Decoder<HandlerLive> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	const path = str(raw.path);
	const target = str(raw.target);
	const sourceHash = str(raw.source_hash);
	const code = str(raw.code);
	if (path === null || target === null || sourceHash === null || code === null)
		return null;
	if (code.length === 0) return null;
	return { path, target, sourceHash, code };
};
