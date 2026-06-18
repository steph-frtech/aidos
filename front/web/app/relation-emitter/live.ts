import { type Decoder, isObject, str } from "../../lib/gateway-sdk";
import type { EmitView } from "../../lib/relation-emitter-data";

/**
 * /relation-emitter live read — the PURE decoder over the Go `emit_ddl` / `emit_ts` tools' output
 * (S74 cutover, ADR 0092 kill-twins). Kept OUT of actions.ts (a Next "use server" module may only
 * export async functions) so the parity mirror (live.test.ts) imports the decoder directly.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): `emitDecoder` is the SINGLE runtime declaration of
 * the live shape; `EmitView` (lib/relation-emitter-data) is the front type it fills. The parity
 * mirror pins the decoder == the Go contract (relationemittersrv.artifactOutput — `ok` / the
 * `artifact` {path, target, source, source_hash, output_hash, protected} / the refusal `block`),
 * NOT a second implementation of the projection logic (the Go relemit.EmitDDL/EmitTS is
 * authoritative). DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns
 * null and readVia falls back to the demo view.
 *
 * THE WIRE BYTES. relationemittersrv.artifactOut.Source is a Go STRING (the dispatch-safe mirror of
 * relemit.Artifact.Bytes — exposed as a string, NOT a []byte/base64 number-array, to survive the
 * HTTP output-schema round-trip; the S59 byte-array transport scar). So `artifact.source` is the
 * rendered source text DIRECTLY — no base64 decode — the same string the pure twin produces (the
 * demo fallback), so the live and demo views are identical in shape.
 */

export type { EmitView };

/**
 * emitDecoder decodes the Go `emit_ddl` / `emit_ts` output (relationemittersrv.artifactOutput). When
 * `ok` is true the `artifact` must carry the `source` (the rendered text) + the `source_hash`; when
 * `ok` is false the `block` carries the refusal explanation. A non-object payload, or an `ok:true`
 * with no string `source`, → null (→ demo fallback). The `path` is advisory.
 */
export const emitDecoder: Decoder<EmitView> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok === true) {
		const artifact = raw.artifact;
		if (!isObject(artifact)) return null;
		const output = str(artifact.source);
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
