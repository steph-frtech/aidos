"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import postgres from "postgres";

/**
 * Server Actions for the /store Workbench panel.
 *
 * The Archive content store sits BELOW the wall (CLAUDE.md §2): it is not
 * kernel/mirrors/fitness, and its writes are append-only, so the Workbench may
 * write it directly. These actions replicate the contentstore semantics exactly
 * (see back/archive/contentstore/store.go + sql/queries.sql):
 *
 *   put       — hash = SHA-256 hex of the bytes; INSERT INTO archive.content
 *               (hash, data) ON CONFLICT (hash) DO NOTHING (idempotent).
 *   set_head  — read the prior head hash (the parent), upsert archive.head
 *               (key → hash), and append an archive.history row
 *               (key, hash, parent_hash, created_at=now()), in one transaction.
 *
 * OpenQuestion (recorded): the canonical single door for store writes is the
 * store MCP server (ADR 0009). The Workbench here writes the archive directly
 * via a server action; reconcile via an HTTP/API gateway at a later step (e.g.
 * S36 api-projection).
 *
 * On a DB-unreachable / no-DSN situation, these return a friendly error rather
 * than crashing; the read path keeps its demo fallback.
 */

export interface ActionResult {
	ok: boolean;
	/** i18n key under the "store" namespace describing the outcome. */
	messageKey: string;
	/** The content hash produced/targeted (full hex), when relevant. */
	hash?: string;
	/** The head key targeted, when relevant. */
	key?: string;
}

/** hash returns the canonical SHA-256 hex digest, matching contentstore.Hash. */
function sha256Hex(s: string): string {
	return createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
}

let sql: ReturnType<typeof postgres> | null = null;
function client(): ReturnType<typeof postgres> | null {
	const dsn = process.env.POSTGRES_CONNECTION_STRING;
	if (!dsn) return null;
	if (!sql) {
		sql = postgres(dsn, { max: 2, idle_timeout: 20, connect_timeout: 8 });
	}
	return sql;
}

/**
 * putAction stores the textarea bytes under their SHA-256 content hash.
 * Idempotent (ON CONFLICT DO NOTHING) and append-only — re-storing the same
 * bytes returns the same hash and adds no row.
 */
export async function putAction(
	_prev: ActionResult,
	formData: FormData,
): Promise<ActionResult> {
	const content = String(formData.get("content") ?? "");
	if (content.length === 0) {
		return { ok: false, messageKey: "putEmpty" };
	}
	const h = sha256Hex(content);
	const c = client();
	if (!c) {
		return { ok: false, messageKey: "dbUnreachable", hash: h };
	}
	try {
		const bytes = Buffer.from(content, "utf8");
		await c`
			insert into archive.content (hash, data)
			values (${h}, ${bytes})
			on conflict (hash) do nothing`;
		revalidatePath("/store");
		return { ok: true, messageKey: "putOk", hash: h };
	} catch (err) {
		console.warn("[/store] put failed:", (err as Error).message);
		return { ok: false, messageKey: "dbUnreachable", hash: h };
	}
}

/**
 * setHeadAction points a head key at a content hash and appends a history row.
 * Replicates contentstore.SetHead: it reads the prior head hash (the parent —
 * null on the first set), upserts the head pointer, and inserts the history row
 * inside one transaction. The target hash must already exist in archive.content
 * (a foreign key) — the form is expected to use a hash returned by a prior put.
 */
export async function setHeadAction(
	_prev: ActionResult,
	formData: FormData,
): Promise<ActionResult> {
	const key = String(formData.get("key") ?? "").trim();
	const hash = String(formData.get("hash") ?? "").trim();
	if (key.length === 0 || hash.length === 0) {
		return { ok: false, messageKey: "setHeadEmpty" };
	}
	const c = client();
	if (!c) {
		return { ok: false, messageKey: "dbUnreachable", key, hash };
	}
	try {
		await c.begin(async (tx) => {
			// Prior head hash becomes the parent (null for the first move on a key).
			const prev = await tx<{ hash: string }[]>`
				select hash from archive.head where key = ${key}`;
			const parentHash = prev[0]?.hash ?? null;

			await tx`
				insert into archive.head (key, hash, updated_at)
				values (${key}, ${hash}, now())
				on conflict (key) do update set hash = excluded.hash, updated_at = now()`;

			await tx`
				insert into archive.history (key, hash, parent_hash, created_at)
				values (${key}, ${hash}, ${parentHash}, now())`;
		});
		revalidatePath("/store");
		return { ok: true, messageKey: "setHeadOk", key, hash };
	} catch (err) {
		console.warn("[/store] set_head failed:", (err as Error).message);
		return { ok: false, messageKey: "setHeadFailed", key, hash };
	}
}
