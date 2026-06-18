/**
 * hono-emitter-data.ts — the deterministic DEMO fixture + the gateway-arg projection for the
 * /hono-emitter panel's LIVE server read (S87 — ADR 0092 kill-twins, batch « hono-emitter »).
 *
 * KILL-TWINS CUTOVER (the Go engine is the SINGLE live source). The /hono-emitter « émettre le
 * serveur » control now reads the LIVE Hono/TS server artifact from the Go hono-emitter MCP server
 * through the passerelle (the dispatched `emit_server` tool). This module carries the two pure
 * companions the cutover needs, kept OUT of the "use server" actions.ts (a Next "use server"
 * module may only export async functions) so the parity mirror (live.test.ts) imports them
 * directly:
 *   - gatewayServerArgs(spec) → the snake/cap-cased gateway args the Go emit_server unmarshals;
 *   - demoServerView(spec)    → the deterministic demo fallback (the SAME pure twin the Go engine
 *                               reproduces), tagged source:"demo" when the gateway is unavailable.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): every value here is a PURE function of its input — no clock,
 * no rng, no I/O, never an LLM. Same Kernel cut → byte-identical output. THE WALL (§2): the read is
 * below-the-line (a projection); it writes NOTHING.
 */

import { digest, emitServer, isBlocked, type ServerSpec } from "./hono-emitter";

/**
 * EmitServerView is the live shape the /hono-emitter server read returns — the decoded
 * `emit_server` artifact (or a refusal). It is declared ONCE here and re-exported by live.ts as the
 * decoder's inferred type's twin (never double-typed: the decoder fills exactly this shape).
 */
export interface EmitServerView {
	/** the rendered server bytes (the Hono/TS source), when emitted. */
	output?: string;
	/** the source content address (the Go SourceHash, or the FNV digest twin in demo). */
	hash?: string;
	/** the emitted file's relative path, when the live engine renders one. */
	path?: string;
	/** the refusal explanation when the source is malformed. */
	blockExplanation?: string;
}

/**
 * gatewayServerArgs projects a ServerSpec into the gateway args the Go `emit_server` tool
 * unmarshals: `{ spec }` where spec mirrors honoemit.ServerSpec. honoemit.ServerSpec / Op carry NO
 * json tags, so the keys are CAPITALISED (Project / Ops / Name / Async / Trigger); the nested
 * AsyncTrigger does carry `kind` / `at` (operation.AsyncTrigger). The args ride as a plain object
 * tree — NO json.RawMessage byte-array body (the S59 scar avoided: the ops ride as objects).
 */
export function gatewayServerArgs(spec: ServerSpec): Record<string, unknown> {
	return {
		spec: {
			Project: spec.project,
			Ops: spec.ops.map((op) => ({
				Name: op.name,
				Async: op.async === true,
				Trigger: {
					kind: op.async ? (op.trigger ?? "") : "",
					at: op.at ?? "",
				},
			})),
			Entities: [],
			WebDir: "",
		},
	};
}

/**
 * demoServerView renders the deterministic demo fallback for the server surface — the SAME pure
 * twin (lib/hono-emitter.emitServer) the Go engine reproduces byte-for-byte. A malformed spec
 * yields the refusal explanation; a well-formed spec yields the bytes + the FNV digest twin (the
 * Go content-hash is authoritative; the digest is the display twin). PURE.
 */
export function demoServerView(spec: ServerSpec): EmitServerView {
	const out = emitServer(spec);
	if (isBlocked(out)) return { blockExplanation: out.explanation };
	return { output: out, hash: digest(out) };
}
