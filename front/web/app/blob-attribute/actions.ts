"use server";

import {
	type BlobAttribute,
	type BlockReason,
	blobBody,
	blobId,
	blockUpload,
	crossProjectAccess,
	DEMO_ENTITY,
	DEMO_PROJECT_A,
	DEMO_PROJECT_B,
	emitHandler,
	isBlocked,
	storageKey,
	validateUpload,
} from "@/lib/blob-attribute";

/**
 * Server Actions for the /blob-attribute Workbench panel (S72 — « le type blob/fichier
 * + stockage objet par projet »).
 *
 * THE STEP (ROADMAP-app-builder S72, EPIC 6): extend the entity type system with a
 * DISTINCT blob/file node (an upload — image/document/file) WITHOUT widening the closed
 * scalar set. A blob round-trips as a content-addressed AST and emits a DETERMINISTIC
 * upload/download handler (signed URLs); an upload out-of-MIME (BLOB_MIME_REFUSED) or
 * over-size (BLOB_SIZE_REFUSED) is refused; a blob of project A is inaccessible from
 * project B (BLOB_CROSS_PROJECT) — never served, never guessed.
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it validates, addresses,
 * scopes and emits as VALUES. The logic is PURE (lib/blob-attribute), never an LLM. A blob
 * attribute is a SOURCE above the line; the bytes never enter the truth-store nor git; a
 * truth-write would go via propose → ChangeSet → approval, never from this screen.
 */

/** The fixed demo blob node the panel addresses + emits a handler for. */
const demoBlob: BlobAttribute = {
	name: "avatar",
	allowed_mime: ["image/png", "image/jpeg"],
	max_bytes: 1 << 20,
	required: true,
};

export interface UploadCheckView {
	ok: boolean;
	/** the upload as submitted (echoed for display). */
	upload: { mime: string; size: number } | null;
	/** the blob node's content address (the round-trip). */
	blobId: string;
	/** the blob node's canonical body. */
	blobBody: string;
	/** the declared allow-list + ceiling. */
	allowedMime: string[];
	maxBytes: number;
	/** accepted: the project-scoped storage key minted for the upload. */
	key?: string;
	/** accepted: a snippet of the deterministic emitted handler (proves it emits). */
	handlerHead?: string;
	/** the cross-project probe verdicts (A reaches, B refused). */
	crossA?: boolean;
	crossB?: boolean;
	/** the refusal when the upload is out-of-MIME / over-size. */
	block?: BlockReason;
}

/**
 * checkUploadAction is the action-capable control behind the blob surface (CLAUDE.md §7
 * ui-completeness): the user pins an upload (MIME + size) against the declared blob node
 * and submits — the action VALIDATES it (MIME + size), and on acceptance mints the
 * PROJECT-SCOPED storage key, runs the cross-project probe (A reaches it, B is refused),
 * and emits the deterministic upload/download handler. A bad upload yields the
 * BLOB_MIME_REFUSED / BLOB_SIZE_REFUSED BlockReason. It WRITES NOTHING (the wall).
 */
export async function checkUploadAction(
	_prev: UploadCheckView,
	formData: FormData,
): Promise<UploadCheckView> {
	const mime = String(formData.get("mime") ?? "").trim();
	const size = Number.parseInt(String(formData.get("size") ?? "0"), 10) || 0;

	const id = blobId(demoBlob);
	const body = blobBody(demoBlob);
	const base: UploadCheckView = {
		ok: true,
		upload: { mime, size },
		blobId: id,
		blobBody: body,
		allowedMime: demoBlob.allowed_mime,
		maxBytes: demoBlob.max_bytes,
	};

	const cause = validateUpload(demoBlob, { mime, size });
	if (cause) {
		return { ...base, block: blockUpload(cause) };
	}

	// Accepted: mint the project-scoped key, probe cross-project, emit the handler.
	const contentHash = id.slice(0, 16); // a deterministic stand-in for the object SHA.
	const key =
		storageKey(DEMO_PROJECT_A, DEMO_ENTITY, demoBlob, contentHash) ?? "";
	const crossA = crossProjectAccess(key, DEMO_PROJECT_A) === null;
	const crossB = crossProjectAccess(key, DEMO_PROJECT_B) === null;
	const handler = emitHandler(DEMO_PROJECT_A, DEMO_ENTITY, demoBlob);
	const handlerHead = isBlocked(handler)
		? undefined
		: handler.split("\n").slice(0, 5).join("\n");

	return { ...base, key, crossA, crossB, handlerHead };
}
