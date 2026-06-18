import type {
	ControlModel,
	FrontFile,
	FrontSpec,
} from "../../lib/front-emitter";
import { arr, type Decoder, isObject, str } from "../../lib/gateway-sdk";

/**
 * /front-emitter live read — the decoders over the Go front-emitter MCP tools
 * `emit_front` / `emit_bundle` / `front_hash` (S93; the S59 cutover, ADR 0092). Kept OUT of
 * actions.ts (a Next "use server" module may only export async functions) so the parity mirror
 * (live.test.ts) can import the PURE decoders + the args projection directly.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): the decoders are the SINGLE runtime declaration
 * of the live tool-output shapes; the static FrontFile/ControlModel types are the front twin's
 * (lib/front-emitter), filled by the decoders — NOT a second emitter. The Go runtime/frontemit
 * (and its TS twin lib/front-emitter) is authoritative; the Go engine is the SINGLE live source.
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict, zero LLM. A malformed payload returns
 * null and readVia falls back to the demo emit (source:"demo").
 *
 * THE WALL (CLAUDE.md §2): these only DECODE below-the-line reads — the front emit is PURE
 * PROJECTION, it writes nothing (S78 owns regeneration).
 */

// ── the Go args projection ───────────────────────────────────────────────────

/**
 * gatewaySpecArgs projects the front FrontSpec to the Go `frontInput` arguments object the
 * passerelle dispatches to every front-emitter tool: `{ spec: frontemit.FrontSpec }`.
 *
 * WIRE SHAPE (the SCAR, memory 6215): frontemit.FrontSpec / EntityModel / ControlModel /
 * FixtureRow carry NO json tags, so Go marshals them by GO FIELD NAME (Project / Entities /
 * Controls / Entity / Blobs / Refs / Name / View / Label / Operation / Fixtures / Given /
 * Visible / Enabled). The INNER kernel structs DO carry snake_case json tags (entities.Entity:
 * name/attributes, entities.Attribute: name/type/required/identifier, blob.BlobAttribute:
 * name/allowed_mime/max_bytes/required, ref.Relation: name/target/cardinality/semantic/required).
 *
 * PURE; a plain object (no json.RawMessage) so the HTTP input schema accepts it (the S59
 * RawMessage scar guard). The front-emitter Artifact.Bytes is a Go []byte → an array-of-numbers
 * OUTPUT schema (NOT a base64 RawMessage), so the round-trip survives (the S93 DISPATCH NOTE).
 */
export function gatewaySpecArgs(spec: FrontSpec): Record<string, unknown> {
	return {
		spec: {
			Project: spec.project,
			Entities: spec.entities.map((e) => ({
				// EntityModel.Entity is the embedded entities.Entity (snake_case inner tags).
				Entity: {
					name: e.name,
					attributes: e.attributes.map((a) => ({
						name: a.name,
						type: a.type,
						required: a.required === true,
						...(a.identifier === true ? { identifier: true } : {}),
					})),
				},
				Blobs: (e.blobs ?? []).map((b) => ({
					name: b.name,
					allowed_mime: b.allowedMime,
					max_bytes: b.maxBytes,
					...(b.required === true ? { required: true } : {}),
				})),
				Refs: (e.refs ?? []).map((r) => ({
					name: r.name,
					target: r.target,
					cardinality: r.cardinality,
					// ref.Relation pins a Semantic; the emitted form does not branch on it but the
					// Go AST requires a member of the closed set — default to the plain FK.
					semantic: "fk",
					...(r.required === true ? { required: true } : {}),
				})),
			})),
			Controls: spec.controls.map((c) => ({
				Name: c.name,
				View: c.view,
				Label: c.label,
				Operation: c.operation,
				Fixtures: c.fixtures.map((f) => ({
					Given: f.given,
					Visible: f.visible,
					Enabled: f.enabled,
				})),
			})),
		},
	};
}

// ── the decoders ─────────────────────────────────────────────────────────────

/**
 * bytesToString decodes the Go Artifact.Bytes wire value into the file source. Go []byte
 * reflects to a JSON value that the go-sdk renders as a base64 STRING in structured output
 * (the json.Marshal default for []byte), OR — per the S93 DISPATCH NOTE — an array-of-numbers.
 * Both are decoded back to the UTF-8 source so the panel renders the same bytes either way.
 * A shape we don't recognise → null (the whole decode fails → demo fallback).
 */
function bytesToString(raw: unknown): string | null {
	// base64 string (json.Marshal []byte default).
	if (typeof raw === "string") {
		try {
			// atob is available in the Node/Edge server runtime; decode base64 → binary → utf-8.
			const bin = atob(raw);
			const codes = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) codes[i] = bin.charCodeAt(i);
			return new TextDecoder().decode(codes);
		} catch {
			return null;
		}
	}
	// array-of-numbers ([]byte rendered as a number array, the DISPATCH NOTE shape).
	if (Array.isArray(raw)) {
		const codes = new Uint8Array(raw.length);
		for (let i = 0; i < raw.length; i++) {
			const n = raw[i];
			if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 255)
				return null;
			codes[i] = n;
		}
		return new TextDecoder().decode(codes);
	}
	return null;
}

/** decodeArtifact decodes one Go frontemit.Artifact → the front FrontFile (path/target/bytes). */
function decodeArtifact(raw: unknown): FrontFile | null {
	if (!isObject(raw)) return null;
	const path = str(raw.path);
	const target = str(raw.target);
	const bytes = bytesToString(raw.bytes);
	if (path === null || target === null || bytes === null) return null;
	return { path, target, bytes };
}

/**
 * filesDecoder decodes the Go `emit_front` output (filesOutput: `{ ok, files:[Artifact],
 * block }`). A refusal (ok:false with a BlockReason) decodes to null → the demo fallback (the
 * panel surfaces the twin's own BlockReason there). A success → the emitted FrontFile[].
 */
export const filesDecoder: Decoder<FrontFile[]> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	return arr(decodeArtifact)(raw.files ?? []);
};

/**
 * bundleDecoder decodes the Go `emit_bundle` output (artifactOutput: `{ ok, artifact:Artifact,
 * block }`) into the concatenated bundle SOURCE (the byte-identity surface). A refusal → null.
 */
export const bundleDecoder: Decoder<string> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	const art = decodeArtifact(raw.artifact);
	return art === null ? null : art.bytes;
};

/** hashDecoder decodes the Go `front_hash` output (hashOutput: `{ ok, hash }`). A non-ok → null. */
export const hashDecoder: Decoder<string> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;
	const hash = str(raw.hash);
	return hash !== null && hash !== "" ? hash : null;
};

/** The controls echo straight back into the view (the panel renders them as real buttons). */
export type { ControlModel };
