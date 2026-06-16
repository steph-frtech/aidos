/**
 * gateway-sdk.ts — the S59 typed client SDK over the S58 MCP-over-HTTP passerelle.
 *
 * THE ONE TYPED DOOR FROM THE WORKBENCH TO THE 13 MCP SERVERS. Until S59 every panel
 * read either touched Postgres directly (`/store`, `/records`) or served a static TS
 * fixture (`*-data.ts`). S59 routes the high-value read-only panels through this SDK:
 * a project-scoped JSON-RPC/HTTP call to the gateway front door
 * (back/mcp/gateway, served via the SDK's StreamableHTTPHandler), decoded into a typed
 * snapshot, with the deterministic demo fixture preserved as the fallback
 * (`source: "live" | "demo"`).
 *
 * ── NEVER DOUBLE-TYPED (the S59 done-criterion) ──────────────────────────────────────
 * The response shape of every gateway read is declared EXACTLY ONCE, as a `Decoder<T>`
 * (a pure runtime validator). The STATIC type `T` is INFERRED from that decoder via
 * `Decoded<typeof dec>` — the panel never re-declares the shape. There is no parallel
 * `interface Foo` hand-kept in sync with a `decodeFoo`: the decoder IS the single source
 * of truth, on BOTH planes (runtime validation + compile-time type). A drift is
 * impossible by construction (the type cannot disagree with the validator that produced
 * it).
 *
 * ── DETERMINISM-FIRST (CLAUDE.md §6/§8) ──────────────────────────────────────────────
 * The decoder is a PURE total function: same JSON → same verdict, zero LLM. A malformed
 * payload is REJECTED (decoder returns null) and the read falls back to the demo fixture
 * — NEVER a partial / coerced / hallucinated value. The transport is the only impure
 * surface; everything downstream of the wire bytes is reproducible (pinned by the
 * Vitest+fast-check mirror lib/gateway-sdk.test.ts).
 *
 * ── THE WALL (CLAUDE.md §2) ──────────────────────────────────────────────────────────
 * This SDK READS (below-the-line ops). It carries the active (identity, project) scope
 * on every call; the gateway applies the wall SERVER-SIDE (scope first, then truth-write,
 * then below-the-line routed). A truth-write never originates here — those go through
 * propose → ChangeSet. The SDK only ever calls below-the-line read tools.
 */

import { lookup } from "./gateway";
import type { Scope } from "./projectWall";

/** Source tells the panel whether the snapshot came from the live gateway or the demo fixture. */
export type Source = "live" | "demo";

/**
 * A Decoder<T> is a PURE validator: it takes an unknown JSON value (the gateway's
 * decoded result payload) and returns a typed T, or null if the payload is malformed.
 * It is the SINGLE declaration of T — the panel infers its type via Decoded<>.
 */
export type Decoder<T> = (raw: unknown) => T | null;

/** Decoded<D> infers the static type a decoder produces — the never-double-typed hinge. */
export type Decoded<D> = D extends Decoder<infer T> ? T : never;

// ── Small pure decoder combinators (the building blocks; no double-typing) ────────────

/** isObject narrows an unknown to a plain record without `any`. */
export function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** str decodes a required string field; null if absent or wrong type. */
export function str(v: unknown): string | null {
	return typeof v === "string" ? v : null;
}

/** num decodes a required finite number field; null otherwise. */
export function num(v: unknown): number | null {
	return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** arr decodes a homogeneous array via an element decoder; null if any element fails. */
export function arr<T>(el: Decoder<T>): Decoder<T[]> {
	return (raw) => {
		if (!Array.isArray(raw)) return null;
		const out: T[] = [];
		for (const item of raw) {
			const d = el(item);
			if (d === null) return null;
			out.push(d);
		}
		return out;
	};
}

// ── The transport: a project-scoped JSON-RPC/HTTP call to the gateway front door ──────

/**
 * GatewayCallResult is the raw decoded MCP result payload for a tool call, or an error
 * marker. Kept minimal — the per-tool Decoder<T> validates the structured content.
 */
export interface GatewayCallResult {
	ok: boolean;
	/** the structured content of the MCP CallToolResult (the tool's typed output), if ok. */
	content?: unknown;
	/** a transport / wall error, if not ok (e.g. a refusal BlockReason code). */
	error?: string;
}

/** gatewayEndpoint resolves the gateway HTTP base URL (server env), or null when unset. */
export function gatewayEndpoint(): string | null {
	return process.env.AIDOS_GATEWAY_HTTP_URL ?? null;
}

/**
 * callGateway issues ONE project-scoped MCP-over-HTTP `tools/call` to the gateway. It is
 * the only impure surface of this module. Returns {ok:false} on any transport failure or
 * non-2xx — the caller then falls back to the demo fixture (deterministic, never throws).
 *
 * ── THE gateway_call ENVELOPE (S59 cutover) ──────────────────────────────────────────
 * The passerelle exposes ONLY its own surface tools (gateway_route/tools/servers and
 * gateway_call) — NOT each fronted backend tool. So a backend read (changeset_list,
 * store_history, dag_heads, project_list, …) is NOT a `tools/call` on that tool name; it is
 * a `tools/call` on `gateway_call` with the real tool nested in the arguments:
 *
 *   params.name = "gateway_call"
 *   params.arguments = { scope:{identity, active_project}, tool, args }
 *
 * The server routes (the wall FIRST) THEN dispatches, answering with a `callOutput`:
 *   { outcome, result?, block_reason? }
 *
 * callGateway UNWRAPS that outcome so its public contract is UNCHANGED for callers:
 *   - outcome === "route"  → ok:true, content = the backend tool's real result;
 *   - any OTHER outcome (route_undispatched when no store is wired; refused_truth_write /
 *     refused_scope / unknown_tool) → ok:false → the decoder falls back to demo. The seam
 *     is the source; an unavailable / refused backend deterministically yields the demo
 *     projection (ADR 0074: no silent broken-live, an honest source:"demo").
 *
 * The gateway applies the wall server-side; an unknown INNER tool is also rejected
 * client-side first (the closed registry, lib/gateway) so we never wrap a call the gateway
 * can only refuse — the SDK is faithful to the same closed surface as the router.
 */
export async function callGateway(
	scope: Scope,
	tool: string,
	args: Record<string, unknown>,
	endpoint: string | null = gatewayEndpoint(),
	fetchImpl: typeof fetch = fetch,
): Promise<GatewayCallResult> {
	if (!endpoint) return { ok: false, error: "no_endpoint" };
	// Faithful to the closed registry: never wrap an unexposed inner tool name.
	if (!lookup(tool)) return { ok: false, error: "unknown_tool" };
	try {
		const res = await fetchImpl(endpoint, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
				// the propagated scope — the gateway keys the RLS / wall on these (S55/S57/S61).
				"x-aidos-identity": scope.identity,
				"x-aidos-project": scope.activeProject,
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				// The ONLY tool the passerelle exposes for a backend op is gateway_call; the
				// real tool + its args ride NESTED, with the scope keyed on (identity, project).
				params: {
					name: "gateway_call",
					arguments: {
						scope: {
							identity: scope.identity,
							active_project: scope.activeProject,
						},
						tool,
						args,
					},
				},
			}),
		});
		if (!res.ok) return { ok: false, error: `http_${res.status}` };
		const body: unknown = await res.json();
		if (!isObject(body)) return { ok: false, error: "malformed_envelope" };
		const result = body.result;
		if (!isObject(result)) return { ok: false, error: "malformed_result" };
		if (result.isError === true) return { ok: false, error: "tool_error" };
		// The MCP CallToolResult carries gateway_call's callOutput in structuredContent.
		const out = result.structuredContent;
		if (!isObject(out)) return { ok: false, error: "malformed_result" };
		// The wall + dispatch verdict: only "route" carries a dispatched backend result.
		// Anything else (route_undispatched / refused_* / unknown_tool) is UNAVAILABLE →
		// the caller's decoder falls back to the demo projection (source:"demo").
		if (out.outcome !== "route") {
			return { ok: false, error: `outcome_${str(out.outcome) ?? "unknown"}` };
		}
		// Unwrap: hand the caller the backend tool's real typed output, not the envelope.
		return { ok: true, content: out.result };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}

/**
 * readVia is the SINGLE generic read helper every cutover panel uses. It:
 *   1. calls the gateway (project-scoped, below-the-line);
 *   2. DECODES the payload with the supplied PURE decoder (the single type source);
 *   3. on success → returns the typed snapshot tagged `source:"live"`;
 *   4. on ANY failure (no endpoint, transport error, malformed/rejected payload) →
 *      returns the deterministic demo fixture tagged `source:"demo"`.
 *
 * It NEVER throws and NEVER returns a half-decoded value — the decoder's verdict is
 * binary, so a malformed payload deterministically yields the demo fallback. The return
 * type is INFERRED from the decoder (Decoded<>): the panel does not double-type.
 */
/**
 * callMeta issues a `tools/call` to one of the gateway's OWN meta-tools (gateway_servers,
 * gateway_tools, gateway_route) — NOT a fronted MCP tool, so it skips the fronted-registry
 * faithfulness check (those meta-tools are the gateway's surface, not the 13 servers').
 * Same impure transport contract as callGateway; never throws.
 */
export async function callMeta(
	tool: "gateway_servers" | "gateway_tools" | "gateway_route",
	args: Record<string, unknown>,
	endpoint: string | null = gatewayEndpoint(),
	fetchImpl: typeof fetch = fetch,
): Promise<GatewayCallResult> {
	if (!endpoint) return { ok: false, error: "no_endpoint" };
	try {
		const res = await fetchImpl(endpoint, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name: tool, arguments: args },
			}),
		});
		if (!res.ok) return { ok: false, error: `http_${res.status}` };
		const body: unknown = await res.json();
		if (!isObject(body)) return { ok: false, error: "malformed_envelope" };
		const result = body.result;
		if (!isObject(result)) return { ok: false, error: "malformed_result" };
		if (result.isError === true) return { ok: false, error: "tool_error" };
		return { ok: true, content: result.structuredContent };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}

/**
 * decodeVia decodes a meta-tool result with the supplied decoder, falling back to the demo
 * fixture (deterministic) on any failure — the same binary verdict + `source` tagging as
 * readVia, for the gateway's own surface meta-tools.
 */
export async function decodeVia<T>(
	res: GatewayCallResult,
	decoder: Decoder<T>,
	demo: T,
): Promise<{ data: T; source: Source }> {
	if (!res.ok) return { data: demo, source: "demo" };
	const decoded = decoder(res.content);
	if (decoded === null) return { data: demo, source: "demo" };
	return { data: decoded, source: "live" };
}

export async function readVia<T>(
	scope: Scope,
	tool: string,
	args: Record<string, unknown>,
	decoder: Decoder<T>,
	demo: T,
	opts: { endpoint?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<{ data: T; source: Source }> {
	const endpoint = opts.endpoint ?? gatewayEndpoint();
	const fetchImpl = opts.fetchImpl ?? fetch;
	const res = await callGateway(scope, tool, args, endpoint, fetchImpl);
	if (!res.ok) return { data: demo, source: "demo" };
	const decoded = decoder(res.content);
	if (decoded === null) return { data: demo, source: "demo" };
	return { data: decoded, source: "live" };
}
