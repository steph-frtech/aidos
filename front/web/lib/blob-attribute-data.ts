import {
	type BlobAttribute,
	type BlockReason,
	blobBody,
	blobId,
	blockUpload,
	crossProjectAccess,
	DEMO_BLOB,
	emitHandler,
	isBlocked,
	storageKey,
	type Upload,
	validateUpload,
} from "./blob-attribute";

/**
 * blob-attribute-data.ts — le REPLI-DÉMO DÉTERMINISTE de la lentille /blob-attribute (le
 * cutover ADR 0092 : le moteur Go est l'UNIQUE source vivante du type blob/fichier S72).
 *
 * POURQUOI CE FICHIER. Le panneau /blob-attribute lit désormais le moteur Go LIVE par la
 * passerelle (les outils `blob_address` / `blob_validate_upload` / `blob_storage_key` /
 * `blob_cross_project` / `blob_emit_handler` du serveur `blob-attribute`, dispatchés —
 * back/kernel/entities/blob est la source unique, content-adressée). Quand la passerelle est
 * injoignable, qu'aucun store n'est dispatché ou que le payload est mal formé, l'écran retombe
 * sur ce corps-démo (source:"demo").
 *
 * LE TWIN DEVIENT LE REPLI (jamais le chemin vivant). lib/blob-attribute reste un calcul PUR &
 * TOTAL (blobId/validateUpload/storageKey/crossProjectAccess/emitHandler, byte-équivalent au
 * Go — anchor b532622b…), épinglé par son test ; mais ce calcul ne sert PLUS de source
 * d'affichage live — il ne fait que produire le repli-démo honnête. Ce fichier-data EST le
 * témoin du cliquet (twin-as-live-fitness) : `lib/blob-attribute.ts` + `lib/blob-attribute-data.ts`
 * font de `blob-attribute` un twin reconnu, donc tout import-valeur du twin DOIT être derrière la
 * frontière readVia (sinon le cliquet rougit).
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : même upload → même repli-démo (toutes les fonctions du
 * twin sont pures, zéro horloge/aléa/LLM). LE MUR (§2) : ceci ne DÉCLARE qu'un repli de lecture
 * sous la ligne — aucune écriture-vérité ; geler une vérité passe par idée → miroir → /goal.
 */

/** Le nœud blob de la démo : un avatar image, ≤ 1 MiB, png|jpeg uniquement (= DEMO_BLOB). */
export const demoBlob: BlobAttribute = DEMO_BLOB;

/** Le projet possédant (et le projet pirate) pour la sonde d'isolation cross-projet. */
export { DEMO_ENTITY, DEMO_PROJECT_A, DEMO_PROJECT_B } from "./blob-attribute";

/**
 * addressArgs — l'argument de `blob_address` : le nœud blob à content-adresser. Pur :
 * même nœud → même payload. Le shape (champs scalaires + tableau de strings) survit au
 * round-trip HTTP (aucun json.RawMessage côté Go).
 */
export function addressArgs(b: BlobAttribute = demoBlob): {
	blob: BlobAttribute;
} {
	return { blob: b };
}

/** validateArgs — l'argument de `blob_validate_upload` : le nœud + l'upload candidat. */
export function validateArgs(
	upload: Upload,
	b: BlobAttribute = demoBlob,
): { blob: BlobAttribute; upload: Upload } {
	return { blob: b, upload };
}

/** keyArgs — l'argument de `blob_storage_key` : (project, entity, nœud, content_hash). */
export function keyArgs(
	projectId: string,
	entity: string,
	contentHash: string,
	b: BlobAttribute = demoBlob,
): {
	project_id: string;
	entity: string;
	blob: BlobAttribute;
	content_hash: string;
} {
	return { project_id: projectId, entity, blob: b, content_hash: contentHash };
}

/** crossArgs — l'argument de `blob_cross_project` : (clé scopée, projet accédant). */
export function crossArgs(
	key: string,
	projectId: string,
): { key: string; project_id: string } {
	return { key, project_id: projectId };
}

/** emitArgs — l'argument de `blob_emit_handler` : (project, entity, nœud). */
export function emitArgs(
	projectId: string,
	entity: string,
	b: BlobAttribute = demoBlob,
): { project_id: string; entity: string; blob: BlobAttribute } {
	return { project_id: projectId, entity, blob: b };
}

/**
 * demoAddress — le round-trip content-adressé via le twin pur (l'image exacte que le Go
 * `blob_address` renverrait pour ce nœud). PURE : même nœud → même (id, body). Le repli honnête
 * quand le live est injoignable.
 */
export function demoAddress(b: BlobAttribute = demoBlob): {
	id: string;
	body: string;
} {
	return { id: blobId(b), body: blobBody(b) };
}

/**
 * demoValidate — le verdict MIME + taille via le twin pur (= Go `blob_validate_upload.ok`).
 * PURE : même upload → même verdict. true = accepté, false = refusé (hors-MIME / hors-taille).
 */
export function demoValidate(
	upload: Upload,
	b: BlobAttribute = demoBlob,
): boolean {
	return validateUpload(b, upload) === null;
}

/**
 * demoBlockReason — le BlockReason S13 canonique d'un upload refusé via le twin pur (=
 * blob.BlockUpload côté Go). PURE : même upload → même refus. Renvoie undefined quand l'upload
 * est accepté (aucun refus à projeter). Le code S13 (BLOB_MIME_REFUSED / BLOB_SIZE_REFUSED) reste
 * une projection déterministe de la même cause fermée — jamais un nouveau code au-delà d'un rouge.
 */
export function demoBlockReason(
	upload: Upload,
	b: BlobAttribute = demoBlob,
): BlockReason | undefined {
	const cause = validateUpload(b, upload);
	return cause === null ? undefined : blockUpload(cause);
}

/**
 * blockFor — le BlockReason S13 pour une cause arbitraire (= blob.BlockUpload). Le repli quand
 * le moteur Go refuse un upload que le twin-démo accepterait (un désaccord live/démo) : on rend
 * un refus honnête plutôt qu'un faux-accepté. PURE, déterministe.
 */
export function blockFor(cause: string): BlockReason {
	return blockUpload(cause);
}

/**
 * demoKey — la clé scopée project_id via le twin pur (= Go `blob_storage_key.key`). PURE :
 * mêmes (project, entity, nœud, hash) → même clé. "" quand le nœud est mal-formé.
 */
export function demoKey(
	projectId: string,
	entity: string,
	contentHash: string,
	b: BlobAttribute = demoBlob,
): string {
	return storageKey(projectId, entity, b, contentHash) ?? "";
}

/**
 * demoCross — le verdict d'accès cross-projet via le twin pur (= Go `blob_cross_project.ok`).
 * PURE : mêmes (clé, projet) → même verdict. true = autorisé (le propriétaire), false = refusé.
 */
export function demoCross(key: string, projectId: string): boolean {
	return crossProjectAccess(key, projectId) === null;
}

/**
 * demoHandlerHead — les premières lignes du handler émis via le twin pur (= Go
 * `blob_emit_handler.code`, byte-stable). PURE : mêmes (project, entity, nœud) → même tête.
 * undefined quand l'émission est bloquée (nœud mal-formé).
 */
export function demoHandlerHead(
	projectId: string,
	entity: string,
	b: BlobAttribute = demoBlob,
): string | undefined {
	const h = emitHandler(projectId, entity, b);
	return isBlocked(h) ? undefined : h.split("\n").slice(0, 5).join("\n");
}
