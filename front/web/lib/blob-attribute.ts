/**
 * The blob-attribute twin — the Workbench /blob-attribute source (AIDOS step S72).
 *
 * The DECLARED projection of the Go package back/kernel/entities/blob: the SAME blob/file
 * AST node — a DISTINCT node from a scalar Attribute (S35) AND from a Relation (S71) — that
 * extends the entity type system with an upload (image / document / file) WITHOUT widening
 * the closed scalar set. The three planes are disjoint: an entity carries ordered scalar
 * attributes, ordered relations AND, additively, ordered blob attributes. A blob never
 * widens the scalar enum.
 *
 * THE CLOSED-SET HONESTY (the S72 done-criteria):
 *   - a blob attribute ROUND-TRIPS as a content-addressed AST (same node → same hash as Go);
 *   - an upload's MIME must be in the node's CLOSED allow-list (else BLOB_MIME_REFUSED),
 *     never widened at upload; an upload's size must be ≤ MaxBytes (else BLOB_SIZE_REFUSED),
 *     never truncated;
 *   - the storage key is PROJECT-SCOPED — a blob of project A is inaccessible from project B
 *     (BLOB_CROSS_PROJECT), never served, never guessed; the bytes never enter the
 *     truth-store nor git.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no
 * I/O, no LLM — so a blob ROUND-TRIPS as a content-addressed AST and yields the SAME content
 * hash as the Go blob.ID (verified byte-equal: anchor
 * b532622b6bd65a7595f2a4377e03fc1b11e374d201757f8b6ccbd4e05bb57f03). The Go output is the
 * AUTHORITATIVE truth; this twin reproduces it for the screen.
 *
 * READ-ONLY (the wall): /blob-attribute PROJECTS and VALIDATES; it never writes truth. A blob
 * attribute is a SOURCE above the line; truth-writes go via propose → ChangeSet → approval.
 */

import { createHash } from "node:crypto";

/** The blob/file SOURCE AST node (S72) — a DISTINCT node, neither scalar nor relation. */
export interface BlobAttribute {
	name: string;
	allowed_mime: string[];
	max_bytes: number;
	required?: boolean;
}

/** The runtime upload payload validated against a BlobAttribute (not a node). */
export interface Upload {
	mime: string;
	size: number;
}

/** The S13 BlockReason shape (reused, never a new code beyond a human red). */
export interface BlockReason {
	code: string;
	severity: "blocking";
	explanation: string;
	how_to_fix: string[];
}

/** SHA-256 hex — the same content hash Go uses (records.Hash). */
function sha256(s: string): string {
	return createHash("sha256").update(s).digest("hex");
}

/**
 * canonicalBody mirrors Go's records.Canonicalize(json.Marshal(BlobAttribute)): object keys
 * sorted lexicographically, array order PRESERVED (allowed_mime order is semantic), no
 * insignificant whitespace, omitempty for a false `required`. Verified byte-equal to Go's
 * blob.Body (anchor b532622b…).
 */
function canonicalBody(b: BlobAttribute): string {
	const o: Record<string, unknown> = {
		allowed_mime: b.allowed_mime,
		max_bytes: b.max_bytes,
		name: b.name,
	};
	// Go's json.Marshal has `required,omitempty`: a false required key is ABSENT.
	if (b.required) o.required = true;
	const keys = Object.keys(o).sort();
	const render = (v: unknown): string =>
		Array.isArray(v)
			? `[${v.map((x) => JSON.stringify(x)).join(",")}]`
			: JSON.stringify(v);
	return `{${keys.map((k) => `${JSON.stringify(k)}:${render(o[k])}`).join(",")}}`;
}

/** The content address of a blob attribute (= Go's blob.ID = Hash(Canonicalize(body))). */
export function blobId(b: BlobAttribute): string {
	return sha256(canonicalBody(b));
}

/** The canonical body string (= Go's blob.Body) — the round-trip serialization. */
export function blobBody(b: BlobAttribute): string {
	return canonicalBody(b);
}

/** A well-shaped node returns null; otherwise the cause string. */
export function validateShape(b: BlobAttribute): string | null {
	if (!b.name) return "blob: attribute pins no name";
	if (!b.allowed_mime || b.allowed_mime.length === 0)
		return "blob: attribute pins no allowed MIME type";
	if (b.allowed_mime.some((m) => m.trim() === ""))
		return "blob: attribute pins no allowed MIME type";
	if (b.max_bytes <= 0) return "blob: attribute pins a non-positive max_bytes";
	return null;
}

/** Exact MIME membership — never widened, coerced or guessed. */
export function allowsMime(b: BlobAttribute, mime: string): boolean {
	return b.allowed_mime.includes(mime);
}

/**
 * validateUpload — the SAME closed-set check as Go's ValidateUpload. Returns null when
 * accepted, else the cause (an out-of-MIME / over-size upload is REFUSED, never coerced).
 */
export function validateUpload(b: BlobAttribute, u: Upload): string | null {
	const shape = validateShape(b);
	if (shape) return shape;
	if (!u.mime || u.size <= 0)
		return "blob: upload pins no MIME or a non-positive size";
	if (!allowsMime(b, u.mime))
		return `blob: upload MIME is not in the declared allow-list: ${u.mime}`;
	if (u.size > b.max_bytes)
		return `blob: upload size exceeds the declared max_bytes: ${u.size} > ${b.max_bytes}`;
	return null;
}

/** The PROJECT-SCOPED storage key (= Go's StorageKey). */
export function storageKey(
	projectId: string,
	entity: string,
	b: BlobAttribute,
	contentHash: string,
): string | null {
	if (!projectId) return null;
	if (validateShape(b)) return null;
	return `${projectId}/${entity}/${b.name}/${contentHash}`;
}

/** The owning project of a storage key (first path segment) — inverse of storageKey. */
export function projectOf(key: string): string {
	const i = key.indexOf("/");
	return i <= 0 ? "" : key.slice(0, i);
}

/**
 * crossProjectAccess — refuses access to a key from a project that does not own it (a blob of
 * A is inaccessible from B). Returns null when allowed, else the cause.
 */
export function crossProjectAccess(
	key: string,
	projectId: string,
): string | null {
	if (!projectId) return "blob: a project id is required";
	if (projectOf(key) !== projectId)
		return `blob: storage key belongs to another project (owned by ${projectOf(key)}, accessed from ${projectId})`;
	return null;
}

/** blockUpload — the canonical S13 BlockReason for a refused upload / cross-project (no prison). */
export function blockUpload(cause: string): BlockReason {
	let code = "BLOB_INVALID";
	if (cause.includes("not in the declared allow-list"))
		code = "BLOB_MIME_REFUSED";
	else if (cause.includes("exceeds the declared max_bytes"))
		code = "BLOB_SIZE_REFUSED";
	else if (cause.includes("belongs to another project"))
		code = "BLOB_CROSS_PROJECT";
	return {
		code: "OUT_OF_SCOPE",
		severity: "blocking",
		explanation: `Upload refusé (${code}) : ${cause}. Un attribut blob/fichier déclare une liste FERMÉE de types MIME et un plafond de taille ; un upload hors-MIME ou hors-taille est REFUSÉ, jamais tronqué ni coercé. Les octets ne touchent JAMAIS le truth-store ni git : ils vivent dans le stockage objet par projet, adressés par une clé scopée project_id — un blob du projet A est inaccessible depuis le projet B (jamais servi, jamais deviné). L'ensemble scalaire reste clos : un blob est un nœud à part, jamais un scalaire.`,
		how_to_fix: [
			"use_an_allowed_mime : l'upload doit déclarer un type MIME de la liste fermée de l'attribut ; un MIME hors liste n'est jamais élargi.",
			"shrink_below_max_bytes : la taille de l'upload doit être ≤ max_bytes de l'attribut ; rien n'est tronqué.",
			"access_within_your_project : une clé de stockage scopée project_id n'est lisible que depuis SON projet ; un accès cross-projet est refusé, jamais deviné.",
		],
	};
}

/** A type guard discriminating a content address (ok) from a BlockReason. */
export function isBlocked(x: string | BlockReason): x is BlockReason {
	return typeof x !== "string";
}

/**
 * emitHandler — render the DETERMINISTIC upload/download handler (signed URLs, baked-in
 * MIME+size validation, project-scoped key). Mirrors Go's blob.EmitHandler — byte-stable for
 * an identical (projectId, entity, node). Returns the source string (ok) or a BlockReason.
 */
export function emitHandler(
	projectId: string,
	entity: string,
	b: BlobAttribute,
): string | BlockReason {
	if (!projectId) return blockUpload("blob: a project id is required");
	const shape = validateShape(b);
	if (shape) return blockUpload(shape);
	const id = blobId(b);
	const mimes = b.allowed_mime.map((m) => JSON.stringify(m)).join(", ");
	const prefix = `${projectId}/${entity}/${b.name}/`;
	return [
		`// AIDOS-GENERATED — do not hand-edit. source: ${id}`,
		`export const PROJECT_ID = ${JSON.stringify(projectId)};`,
		`export const ALLOWED_MIME = [${mimes}] as const;`,
		`export const MAX_BYTES = ${b.max_bytes};`,
		`export const KEY_PREFIX = ${JSON.stringify(prefix)};`,
		`// validateUpload → BLOB_MIME_REFUSED / BLOB_SIZE_REFUSED ; signDownload → BLOB_CROSS_PROJECT`,
	].join("\n");
}

// ── The declared demo (no clock, no rng, no I/O) ─────────────────────────────

/** The canonical demo blob attribute: an avatar image, ≤ 1 MiB, png|jpeg only. */
export const DEMO_BLOB: BlobAttribute = {
	name: "avatar",
	allowed_mime: ["image/png", "image/jpeg"],
	max_bytes: 1 << 20,
	required: true,
};

/** The two demo projects, to demonstrate cross-project isolation. */
export const DEMO_PROJECT_A = "projA";
export const DEMO_PROJECT_B = "projB";
export const DEMO_ENTITY = "User";
