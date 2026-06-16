import { createHash } from "node:crypto";
import postgres from "postgres";
import { arr, type Decoder, isObject, readVia, str } from "./gateway-sdk";
import type { Scope } from "./projectWall";

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

// ── The S59 gateway-backed read path (store_history + store_get via the passerelle) ──

/** The default head key the panel reconstructs through the gateway (the demo lineage). */
export const DEFAULT_HEAD_KEY = "doc";

interface MoveWire {
	key: string;
	hash: string;
	parentHash: string | null;
}

// store_history → { moves:[{key,hash,parent_hash}] }, decoded ONCE (never double-typed).
const moveDecoder: Decoder<MoveWire> = (raw) => {
	if (!isObject(raw)) return null;
	const key = str(raw.key);
	const hash = str(raw.hash);
	if (key === null || hash === null) return null;
	const parentHash =
		typeof raw.parent_hash === "string" ? raw.parent_hash : null;
	return { key, hash, parentHash };
};
const historyDecoder: Decoder<{ moves: MoveWire[] }> = (raw) => {
	if (!isObject(raw)) return null;
	const moves = arr(moveDecoder)(raw.moves);
	if (moves === null) return null;
	return { moves };
};

// store_get → { data_base64 } (the object bytes), decoded ONCE.
const getDecoder: Decoder<{ dataBase64: string }> = (raw) => {
	if (!isObject(raw)) return null;
	const dataBase64 = str(raw.data_base64);
	if (dataBase64 === null) return null;
	return { dataBase64 };
};

/**
 * snapshotViaGateway reconstructs the /store snapshot for the active project's default head
 * key through the S58 gateway (store_history for the head's lineage, store_get per hash for
 * the object bytes) — the S59 cutover read path. On ANY miss (no endpoint, transport error,
 * malformed / undispatched / refused answer, or an empty live lineage) it returns the
 * deterministic demo fixture tagged `source:"demo"`. THE WALL (§2): a read only.
 */
export async function snapshotViaGateway(
	scope: Scope,
	key: string = DEFAULT_HEAD_KEY,
): Promise<StoreSnapshot> {
	const demo = demoSnapshot();
	const hist = await readVia(scope, "store_history", { key }, historyDecoder, {
		moves: [],
	});
	if (hist.source !== "live" || hist.data.moves.length === 0) return demo;

	const history: Record<string, HeadMove[]> = { [key]: [] };
	const objects: ContentObject[] = [];
	const seen = new Set<string>();
	for (const m of hist.data.moves) {
		history[key].push({
			key: m.key,
			hash: m.hash,
			parentHash: m.parentHash,
			// The gateway move carries no instant; the content lineage is what matters here.
			createdAt: "",
		});
		if (seen.has(m.hash)) continue;
		seen.add(m.hash);
		const obj = await readVia(
			scope,
			"store_get",
			{ hash: m.hash },
			getDecoder,
			{ dataBase64: "" },
		);
		if (obj.source !== "live") return demo;
		const body = Buffer.from(obj.data.dataBase64, "base64").toString("utf8");
		objects.push({ hash: m.hash, byteSize: Buffer.byteLength(body), body });
	}
	const headHash = hist.data.moves[hist.data.moves.length - 1].hash;
	return {
		objects,
		heads: [{ key, hash: headHash }],
		history,
		source: "live",
	};
}
