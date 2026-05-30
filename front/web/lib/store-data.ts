import { createHash } from "node:crypto";

/**
 * Read-only projection of the Archive content store for the /store Workbench
 * panel. This mirrors the semantics of the Go `contentstore` package and the
 * `store` MCP server (content-addressed by SHA-256 hex, mutable head, append-only
 * history) without writing truth. It seeds a deterministic demo dataset — v1
 * then v2 under head "doc" — so the panel and its Playwright e2e are autonomous
 * (they do not require a live Postgres). The MCP `store` server is the live door;
 * this shim is the read-side fixture until the Next route handler is wired to it.
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
}

/** hash returns the canonical SHA-256 hex digest, matching contentstore.Hash. */
export function hash(s: string): string {
	return createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
}

/**
 * snapshot builds the deterministic demo dataset: put "v1" then "v2" under head
 * "doc". Both content objects survive (append-only); the head points at v2; the
 * history lists both moves oldest-first.
 */
export function snapshot(): StoreSnapshot {
	const v1 = "v1";
	const v2 = "v2";
	const h1 = hash(v1);
	const h2 = hash(v2);

	const objects: ContentObject[] = [
		{ hash: h1, byteSize: Buffer.byteLength(v1), body: v1 },
		{ hash: h2, byteSize: Buffer.byteLength(v2), body: v2 },
	];

	const history: HeadMove[] = [
		{
			key: "doc",
			hash: h1,
			parentHash: null,
			createdAt: "2026-05-30T00:00:00Z",
		},
		{ key: "doc", hash: h2, parentHash: h1, createdAt: "2026-05-30T00:00:01Z" },
	];

	return {
		objects,
		heads: [{ key: "doc", hash: h2 }],
		history: { doc: history },
	};
}

/** shortHash trims a hex digest for display. */
export function shortHash(h: string): string {
	return h.slice(0, 12);
}
