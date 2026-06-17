import { DSL_KINDS, type DslKind } from "../../lib/dsl-editor";
import type { ProposalOutput } from "../../lib/dsl-editor-data";
import { arr, type Decoder, isObject, str } from "../../lib/gateway-sdk";

/**
 * /dsl-editor live reads — the decoders over the Go dsl-editor MCP tools' output (S77; the ADR 0092
 * batch-3 flip). Kept OUT of actions.ts (a Next "use server" module may only export async functions)
 * so the parity mirror (live.test.ts) can import the PURE decoders directly.
 *
 * NEVER DOUBLE-TYPED (the flip done-criterion): each decoder is the SINGLE runtime declaration of the
 * live wire shape; the static DslKind[] / ProposalOutput are the front twin's types the decoders
 * fill. The parity mirror pins the decoders == the Go contract (dsleditorsrv.kindsOutput: { kinds:
 * string[] } ; proposeOutput: { ok, error?, kind?, name?, wrote_kernel, changeset_ref?,
 * changeset_status? }), NOT a second implementation of the DSL parser (the Go dsleditor.ParseDoc /
 * ProposeEdit is authoritative).
 *
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia
 * falls back to the demo proposal. THE WALL (§2): dsl_kinds / dsl_parse / dsl_propose are PURE reads —
 * dsl_propose returns a DRAFT ChangeSet VALUE (wrote_kernel always false), never applies; no truth is
 * written.
 */

/** The closed set of editable DSL kinds, the canonical order the Go `dsl_kinds` emits. */
function decodeKind(raw: unknown): DslKind | null {
	const s = str(raw);
	if (s === null) return null;
	return (DSL_KINDS as readonly string[]).includes(s) ? (s as DslKind) : null;
}

/**
 * kindsDecoder decodes the Go `dsl_kinds` kindsOutput ({ kinds: string[] }) into the front DslKind[].
 * Every kind must be one of the closed four (operation|policy|control|action); an unknown kind or a
 * missing list → null (→ demo fallback to the twin's DSL_KINDS).
 */
export const kindsDecoder: Decoder<DslKind[]> = (raw) => {
	if (!isObject(raw)) return null;
	return arr(decodeKind)(raw.kinds);
};

/**
 * proposalDecoder decodes the Go `dsl_propose` proposeOutput into the front ProposalOutput. The Go
 * server returns a FLAT projection — { ok, error?, kind?, name?, wrote_kernel, changeset_ref?,
 * changeset_status? } — never the rich spec_delta/mirror_delta (the authoritative ChangeSet lives in
 * the engine). On `ok:false` the verbatim error rides (never a guessed AST). On `ok:true` the DRAFT
 * ChangeSet handle (ref + status) and the always-false wrote_kernel ride. A non-boolean wrote_kernel
 * or an `ok` that is not a boolean → null (→ demo fallback).
 */
export const proposalDecoder: Decoder<ProposalOutput> = (raw) => {
	if (!isObject(raw)) return null;
	const ok = raw.ok;
	if (typeof ok !== "boolean") return null;
	// THE WALL: wrote_kernel is ALWAYS false. Accept only an explicit `false` or an absent flag (a
	// pure read defaults to false); a `true` (a forbidden truth write) OR a non-boolean is a
	// malformed / illegal payload → null (→ demo fallback). The decoder never renders a kernel write.
	const wroteKernel = raw.wrote_kernel;
	if (wroteKernel !== undefined && wroteKernel !== false) return null;
	if (ok === false) {
		const error = str(raw.error) ?? "";
		return { ok: false, error, wroteKernel: false };
	}
	const kind = decodeKind(raw.kind);
	const name = str(raw.name);
	if (kind === null || name === null) return null;
	const changesetRef = str(raw.changeset_ref) ?? undefined;
	const changesetStatus = str(raw.changeset_status) ?? undefined;
	return {
		ok: true,
		kind,
		name,
		changesetRef,
		changesetStatus,
		wroteKernel: false,
	};
};
