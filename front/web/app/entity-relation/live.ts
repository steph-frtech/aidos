import { type Decoder, isObject, str } from "../../lib/gateway-sdk";

/**
 * /entity-relation live read — the decoders over the Go entity-relation tools' output (S71;
 * S59 cutover, ADR 0092 — the Go engine is the SINGLE live source). Kept OUT of actions.ts (a
 * Next "use server" module may only export async functions) so the parity mirror (live.test.ts)
 * can import the PURE decoders directly.
 *
 * THE TWO DISPATCHED READS. The relation node is the S71 capability door over
 * back/kernel/entities/ref. The passerelle dispatches BOTH below-the-line reads of the
 * entity-relation MCP server (entityrelationsrv):
 *   - relation_resolve  — resolve a relation's TARGET against the declared entity set → the
 *                         verdict { ok, block? }; an undeclared target is the honesty core of
 *                         S71 (UNKNOWN_RELATION_TARGET, never a guessed mapping);
 *   - relation_address  — content-address the (shape-valid) relation → { ok, id, body } — the
 *                         content-addressed round-trip (id = Hash(Canonicalize(body)) == Go ref.ID).
 *
 * THE WALL (CLAUDE.md §2): both are PURE below-the-line reads — they validate, resolve and hash a
 * relation node as VALUES and write NOTHING. A relation is a SOURCE above the line; a truth-write
 * would go via propose → ChangeSet → approval, never from this screen.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): each `Decoder<T>` is the SINGLE runtime declaration
 * of its tool's output shape; the static type is INFERRED via Decoded<>. The parity mirror
 * (live.test.ts) pins these decoders == the Go entityrelationsrv resolveOutput / addressOutput
 * CONTRACT, NOT a second implementation of the resolve/hash logic (back/kernel/entities/ref is
 * authoritative). DETERMINISM-FIRST (§6/§8): same JSON → same verdict, zero LLM; a malformed
 * payload returns null and readVia falls back to the deterministic demo fixture.
 */

/** The S13 BlockReason shape as the Go blockreason.BlockReason serialises it (snake_case how_to_fix). */
export interface LiveBlock {
	code: string;
	severity: string;
	explanation: string;
	how_to_fix: string[];
}

/** The decoded `relation_resolve` verdict — the resolution of the target against the declared set. */
export interface ResolveVerdict {
	ok: boolean;
	block: LiveBlock | null;
}

/** The decoded `relation_address` round-trip — the content address + canonical body (when ok). */
export interface AddressVerdict {
	ok: boolean;
	id: string;
	body: string;
	block: LiveBlock | null;
}

/**
 * decodeBlock decodes the Go blockreason.BlockReason ({ code, severity, explanation, how_to_fix })
 * into the front LiveBlock. A malformed block (missing a required field, a non-string how_to_fix
 * element) → null, so the whole read falls back to the demo fixture. PURE.
 */
function decodeBlock(raw: unknown): LiveBlock | null {
	if (!isObject(raw)) return null;
	const code = str(raw.code);
	const severity = str(raw.severity);
	const explanation = str(raw.explanation);
	if (code === null || severity === null || explanation === null) return null;
	if (!Array.isArray(raw.how_to_fix)) return null;
	const fixes: string[] = [];
	for (const f of raw.how_to_fix) {
		const s = str(f);
		if (s === null) return null;
		fixes.push(s);
	}
	return { code, severity, explanation, how_to_fix: fixes };
}

/**
 * resolveDecoder decodes the Go `relation_resolve` tool output (entityrelationsrv.resolveOutput:
 * `{ ok: bool, block?: BlockReason }`). `ok` is required; on a refusal `ok:false` carries a block,
 * which MUST decode (else the whole read falls back to demo). On `ok:true` block is absent (null).
 */
export const resolveDecoder: Decoder<ResolveVerdict> = (raw) => {
	if (!isObject(raw)) return null;
	if (typeof raw.ok !== "boolean") return null;
	if (raw.ok) return { ok: true, block: null };
	// a refusal MUST carry a decodable block (the honesty of the closed set).
	const block = decodeBlock(raw.block);
	if (block === null) return null;
	return { ok: false, block };
};

/**
 * addressDecoder decodes the Go `relation_address` tool output (entityrelationsrv.addressOutput:
 * `{ ok: bool, id?: string, body?: string, block?: BlockReason }`). On `ok:true` id + body are
 * required (the round-trip is content-addressed); on `ok:false` a decodable block is required.
 */
export const addressDecoder: Decoder<AddressVerdict> = (raw) => {
	if (!isObject(raw)) return null;
	if (typeof raw.ok !== "boolean") return null;
	if (raw.ok) {
		const id = str(raw.id);
		const body = str(raw.body);
		if (id === null || body === null) return null;
		return { ok: true, id, body, block: null };
	}
	const block = decodeBlock(raw.block);
	if (block === null) return null;
	return { ok: false, id: "", body: "", block };
};
