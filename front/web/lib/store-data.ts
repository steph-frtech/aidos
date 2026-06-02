import { createHash } from "node:crypto";
import postgres from "postgres";

/**
 * Read-only projection of the Archive content store for the /store Workbench
 * panel. It reads the LIVE Postgres truth-store (schema `archive`: content / head
 * / history) when POSTGRES_CONNECTION_STRING is reachable, and falls back to a
 * deterministic demo fixture (v1→v2 under head "doc") when it is not — so the
 * panel and its Playwright e2e stay autonomous if no DB is up.
 *
 * This module is the READ projection. The panel now also WRITES — but only the
 * Archive content store, which sits BELOW the wall (append-only content/history,
 * mutable head; never kernel/mirrors/fitness). Those writes live in
 * app/store/actions.ts (Server Actions). Truth above the line is still never
 * written from the Workbench (CLAUDE.md §2). The canonical single door for store
 * writes remains the `store` MCP server (ADR 0009); the direct server-action
 * write is reconciled via an HTTP/API gateway at a later step (S36).
 */

export interface ContentObject {
	hash: string;
	byteSize: number;
	body: string;
}

export interface HeadMove {
	key: string;
	hash: string;
	parentHash: string | null;
	createdAt: string;
}

export interface StoreSnapshot {
	objects: ContentObject[];
	heads: { key: string; hash: string }[];
	history: Record<string, HeadMove[]>;
	source: "live" | "demo";
}

/** hash returns the canonical SHA-256 hex digest, matching contentstore.Hash. */
export function hash(s: string): string {
	return createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
}

/** shortHash trims a hex digest for display. */
export function shortHash(h: string): string {
	return h.slice(0, 12);
}

/** demoSnapshot is the deterministic fallback dataset (no live DB required). */
function demoSnapshot(): StoreSnapshot {
	const v1 = "v1";
	const v2 = "v2";
	const h1 = hash(v1);
	const h2 = hash(v2);
	return {
		objects: [
			{ hash: h1, byteSize: Buffer.byteLength(v1), body: v1 },
			{ hash: h2, byteSize: Buffer.byteLength(v2), body: v2 },
		],
		heads: [{ key: "doc", hash: h2 }],
		history: {
			doc: [
				{
					key: "doc",
					hash: h1,
					parentHash: null,
					createdAt: "2026-05-30T00:00:00Z",
				},
				{
					key: "doc",
					hash: h2,
					parentHash: h1,
					createdAt: "2026-05-30T00:00:01Z",
				},
			],
		},
		source: "demo",
	};
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
 * snapshot reads the live Archive content store; on any failure (no DSN, DB
 * unreachable, empty store) it returns the demo fixture so the panel is never
 * blank and the e2e stays autonomous.
 */
export async function snapshot(): Promise<StoreSnapshot> {
	const c = client();
	if (!c) return demoSnapshot();
	try {
		const objs = await c<{ hash: string; byte_size: number; body: string }[]>`
			select hash, byte_size, convert_from(data, 'UTF8') as body
			from archive.content order by created_at, hash`;
		if (objs.length === 0) return demoSnapshot();
		const heads = await c<{ key: string; hash: string }[]>`
			select key, hash from archive.head order by key`;
		const hist = await c<
			{
				key: string;
				hash: string;
				parent_hash: string | null;
				created_at: Date;
			}[]
		>`select key, hash, parent_hash, created_at from archive.history order by key, id`;

		const history: Record<string, HeadMove[]> = {};
		for (const r of hist) {
			const moves = history[r.key] ?? [];
			moves.push({
				key: r.key,
				hash: r.hash,
				parentHash: r.parent_hash ?? null,
				createdAt: new Date(r.created_at).toISOString(),
			});
			history[r.key] = moves;
		}
		return {
			objects: objs.map((r) => ({
				hash: r.hash,
				byteSize: Number(r.byte_size),
				body: r.body ?? "",
			})),
			heads: heads.map((r) => ({ key: r.key, hash: r.hash })),
			history,
			source: "live",
		};
	} catch (err) {
		console.warn(
			"[/store] live read failed, using demo fixture:",
			(err as Error).message,
		);
		return demoSnapshot();
	}
}
