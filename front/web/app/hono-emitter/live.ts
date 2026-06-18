import { type Decoder, isObject, str } from "../../lib/gateway-sdk";
import type { EmitServerView } from "../../lib/hono-emitter-data";

/**
 * /hono-emitter live read — the PURE decoder over the Go `emit_server` tool's output (S87 cutover,
 * ADR 0092 kill-twins). Kept OUT of actions.ts (a Next "use server" module may only export async
 * functions) so the parity mirror (live.test.ts) imports the decoder directly.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): `serverDecoder` is the SINGLE runtime declaration of
 * the live shape; `EmitServerView` (lib/hono-emitter-data) is the front type it fills. The parity
 * mirror pins the decoder == the Go contract (honoemittersrv.artifactOutput — `ok` / the
 * `artifact` {path, source_hash, bytes} / the refusal `block`), NOT a second implementation of the
 * projection logic (the Go honoemit.EmitServer is authoritative). DETERMINISM-FIRST (§6/§8): same
 * JSON → same verdict; a malformed payload returns null and readVia falls back to the demo view.
 *
 * THE WIRE BYTES. honoemit.Artifact.Bytes is a Go []byte, which marshals to a BASE64 string over
 * JSON. The decoder base64-decodes it back to the rendered Hono/TS source the panel shows — the
 * same string the pure twin produces (the demo fallback), so the live and demo views are identical
 * in shape.
 */

export type { EmitServerView };

/** decodeBase64 turns the Go []byte wire string (base64) back into the rendered source text.
 * Pure + total: an invalid base64 input yields null (→ the decoder rejects → demo fallback). */
function decodeBase64(b64: string): string | null {
	try {
		// atob is available in the Edge/Node server runtime; Buffer is the Node fallback.
		if (typeof atob === "function") {
			const bin = atob(b64);
			const bytes = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
			return new TextDecoder().decode(bytes);
		}
		return Buffer.from(b64, "base64").toString("utf8");
	} catch {
		return null;
	}
}

/**
 * serverDecoder decodes the Go `emit_server` output (honoemittersrv.artifactOutput). When `ok` is
 * true the `artifact` must carry the bytes (base64) + the source_hash; when `ok` is false the
 * `block` carries the refusal explanation. A non-object payload, or an `ok:true` with no decodable
 * artifact bytes, → null (→ demo fallback). The `at`/`path` are advisory (omitempty).
 */
export const serverDecoder: Decoder<EmitServerView> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok === true) {
		const artifact = raw.artifact;
		if (!isObject(artifact)) return null;
		const b64 = str(artifact.bytes);
		if (b64 === null) return null;
		const output = decodeBase64(b64);
		if (output === null) return null;
		const hash = str(artifact.source_hash) ?? undefined;
		const path = str(artifact.path) ?? undefined;
		return { output, hash, path };
	}
	if (raw.ok === false) {
		const block = raw.block;
		if (!isObject(block)) return null;
		const explanation = str(block.explanation);
		if (explanation === null) return null;
		return { blockExplanation: explanation };
	}
	return null;
};
