"use server";

import type { BlockReason } from "@/lib/blob-attribute";
import {
	addressArgs,
	blockFor,
	crossArgs,
	DEMO_ENTITY,
	DEMO_PROJECT_A,
	DEMO_PROJECT_B,
	demoAddress,
	demoBlob,
	demoBlockReason,
	demoCross,
	demoHandlerHead,
	demoKey,
	demoValidate,
	emitArgs,
	keyArgs,
	validateArgs,
} from "@/lib/blob-attribute-data";
import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	addressDecoder,
	handlerDecoder,
	keyDecoder,
	verdictDecoder,
} from "./live";

/**
 * Server Actions for the /blob-attribute Workbench panel (S72 — « le type blob/fichier
 * + stockage objet par projet »).
 *
 * S59 CUTOVER (ADR 0092 — le moteur Go est l'UNIQUE source vivante). `checkUploadAction` lit
 * désormais le type blob LIVE depuis le serveur MCP `blob-attribute` du moteur Go par la
 * passerelle : `blob_address` (le round-trip content-adressé), `blob_validate_upload` (la
 * validation MIME + taille fermée), `blob_storage_key` (la clé scopée project_id),
 * `blob_cross_project` (le refus cross-projet), `blob_emit_handler` (le handler émis byte-stable)
 * — toutes des lectures below-the-line dispatchées (blob.* est autoritatif). Le twin
 * lib/blob-attribute est CONSERVÉ UNIQUEMENT comme repli démo déterministe (via
 * lib/blob-attribute-data, `source:"live"|"demo"`). L'import frontière readVia garde le cliquet
 * T5 (twin-as-live-fitness) VERT : le twin (importé via le fichier-data) reste DERRIÈRE le repli
 * source:"demo", jamais comme source vivante.
 *
 * THE STEP (ROADMAP-app-builder S72, EPIC 6): extend the entity type system with a
 * DISTINCT blob/file node (an upload — image/document/file) WITHOUT widening the closed
 * scalar set. A blob round-trips as a content-addressed AST and emits a DETERMINISTIC
 * upload/download handler (signed URLs); an upload out-of-MIME (BLOB_MIME_REFUSED) or
 * over-size (BLOB_SIZE_REFUSED) is refused; a blob of project A is inaccessible from
 * project B (BLOB_CROSS_PROJECT) — never served, never guessed.
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it validates, addresses,
 * scopes and emits as VALUES (the gateway routes below-the-line reads; the demo fallback is the
 * pure twin). A blob attribute is a SOURCE above the line; the bytes never enter the truth-store
 * nor git; a truth-write would go via propose → ChangeSet → approval, never from this screen.
 */

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
	/** whether the displayed snapshot came from the live gateway or the demo fixture. */
	source: Source;
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
 * and submits — the action reads the LIVE engine through the passerelle (address → validate →
 * key → cross-project → handler), each with the pure twin as the deterministic demo fallback.
 * On acceptance it mints the PROJECT-SCOPED storage key, runs the cross-project probe (A reaches
 * it, B is refused), and surfaces the deterministic upload/download handler. A bad upload yields
 * the BLOB_MIME_REFUSED / BLOB_SIZE_REFUSED BlockReason. It WRITES NOTHING (the wall).
 */
export async function checkUploadAction(
	_prev: UploadCheckView,
	formData: FormData,
): Promise<UploadCheckView> {
	const mime = String(formData.get("mime") ?? "").trim();
	const size = Number.parseInt(String(formData.get("size") ?? "0"), 10) || 0;
	const scope = await panelScope();

	// 1. The content-addressed round-trip (blob_address) — LIVE, twin demo fallback.
	const addr = await readVia(
		scope,
		"blob_address",
		addressArgs(demoBlob),
		addressDecoder,
		demoAddress(demoBlob),
	);
	const base: UploadCheckView = {
		ok: true,
		upload: { mime, size },
		blobId: addr.data.id,
		blobBody: addr.data.body,
		allowedMime: demoBlob.allowed_mime,
		maxBytes: demoBlob.max_bytes,
		source: addr.source,
	};

	// 2. Validate the upload (blob_validate_upload) — LIVE, twin demo fallback. The Go is
	//    authoritative for the verdict; on a refusal the BlockReason is the twin's canonical
	//    S13 reason (a deterministic projection of the same closed-set cause — never a new code).
	const valid = await readVia(
		scope,
		"blob_validate_upload",
		validateArgs({ mime, size }, demoBlob),
		verdictDecoder,
		{ ok: demoValidate({ mime, size }, demoBlob) },
	);
	if (!valid.data.ok) {
		const block =
			demoBlockReason({ mime, size }, demoBlob) ??
			blockFor("blob: upload refused by the engine");
		return {
			...base,
			source: valid.source,
			block,
		};
	}

	// 3. Accepted: mint the project-scoped key (blob_storage_key) — LIVE, twin fallback.
	const contentHash = addr.data.id.slice(0, 16); // a deterministic stand-in for the object SHA.
	const key = await readVia(
		scope,
		"blob_storage_key",
		keyArgs(DEMO_PROJECT_A, DEMO_ENTITY, contentHash, demoBlob),
		keyDecoder,
		{ key: demoKey(DEMO_PROJECT_A, DEMO_ENTITY, contentHash, demoBlob) },
	);

	// 4. The cross-project isolation probe (blob_cross_project) — LIVE, twin fallback.
	const crossA = await readVia(
		scope,
		"blob_cross_project",
		crossArgs(key.data.key, DEMO_PROJECT_A),
		verdictDecoder,
		{ ok: demoCross(key.data.key, DEMO_PROJECT_A) },
	);
	const crossB = await readVia(
		scope,
		"blob_cross_project",
		crossArgs(key.data.key, DEMO_PROJECT_B),
		verdictDecoder,
		{ ok: demoCross(key.data.key, DEMO_PROJECT_B) },
	);

	// 5. The deterministic emitted handler (blob_emit_handler) — LIVE, twin fallback.
	const handler = await readVia(
		scope,
		"blob_emit_handler",
		emitArgs(DEMO_PROJECT_A, DEMO_ENTITY, demoBlob),
		handlerDecoder,
		{
			path: "",
			target: "ts-next",
			sourceHash: addr.data.id,
			code: demoHandlerHead(DEMO_PROJECT_A, DEMO_ENTITY, demoBlob) ?? "",
		},
	);
	const handlerHead =
		handler.data.code.length === 0
			? undefined
			: handler.data.code.split("\n").slice(0, 5).join("\n");

	// The displayed source is honest: live only if EVERY read routed live; otherwise demo.
	const allLive =
		addr.source === "live" &&
		valid.source === "live" &&
		key.source === "live" &&
		crossA.source === "live" &&
		crossB.source === "live" &&
		handler.source === "live";

	return {
		...base,
		source: allLive ? "live" : "demo",
		key: key.data.key,
		crossA: crossA.data.ok,
		crossB: crossB.data.ok,
		handlerHead,
	};
}
