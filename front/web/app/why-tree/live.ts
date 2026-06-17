import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";
import type {
	BuildError,
	BuildInput,
	BuildResult,
	CauseNode,
} from "../../lib/why-tree";

/** The closed set of Build refusal codes (mirrors the Go classify + the twin BuildError). */
const BUILD_ERRORS: readonly BuildError[] = [
	"UNKNOWN_PROVENANCE",
	"CAUSED_BY_CYCLE",
	"WHYTREE_CAUSE_NOT_REPRODUCED",
	"WHYTREE_NO_MIRROR",
	"WHYTREE_TERMINAL_MISMATCH",
];

/** isBuildError narrows a string to one of the closed BuildError codes. */
function isBuildError(s: string): s is BuildError {
	return (BUILD_ERRORS as readonly string[]).includes(s);
}

/**
 * /why-tree live read — the decoder over the Go why-tree `build` tool output (FK13; the S59
 * cutover, ADR 0092). Kept OUT of actions.ts (a Next "use server" module may only export async
 * functions) so the parity mirror (live.test.ts) can import the PURE decoder directly.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): `buildDecoder` is the SINGLE runtime declaration of
 * the live `buildOut` shape; the static BuildResult is the front twin's type the decoder fills.
 * The parity mirror pins the decoder == the Go `whytreesrv.buildOut` contract (ok, symptom,
 * provenance, causes[{cause_id,depth,reproduced}], root_cause, is_leaf, mirror_id, error), NOT a
 * second implementation of the WhyTree-build logic (the Go whytree.Build — and its TS twin
 * lib/why-tree.build — is authoritative; the Go engine is the SINGLE live source). DETERMINISM-
 * FIRST (§6/§8): same JSON → same verdict; a malformed payload returns null and readVia falls back
 * to the demo build (source:"demo").
 *
 * THE WALL (CLAUDE.md §2): this only DECODES a below-the-line read — the build writes nothing,
 * freezing the terminal mirror goes idea → mirror → /goal → approval.
 */

// ── the Go args projection ──────────────────────────────────────────────────

/** refArg projects a front Ref to the Go `refIn` snake_case shape (id/version). */
function refArg(r: { id: string; version: string }): Record<string, unknown> {
	return { id: r.id, version: r.version };
}

/**
 * gatewayBuildArgs projects a front BuildInput to the Go `buildIn` arguments object the
 * passerelle dispatches to the why-tree `build` tool — the snake_case wire contract
 * (edges[{from,to}], reproductions[{cause_id,reproduced,detail}], terminal{mirror_id,
 * reflects_root_cause}). PURE; a plain object (no json.RawMessage) so the HTTP input schema
 * accepts it (the S59 RawMessage scar guard).
 */
export function gatewayBuildArgs(input: BuildInput): Record<string, unknown> {
	return {
		symptom: input.symptom,
		provenance: input.provenance,
		edges: input.edges.map((e) => ({ from: refArg(e.from), to: refArg(e.to) })),
		reproductions: input.reproductions.map((r) => ({
			cause_id: r.causeId,
			reproduced: r.reproduced,
			...(r.detail !== undefined ? { detail: r.detail } : {}),
		})),
		terminal: {
			mirror_id: input.terminal.mirrorId,
			reflects_root_cause: input.terminal.reflectsRootCause,
		},
	};
}

// ── the decoder ─────────────────────────────────────────────────────────────

/** decodeCause decodes one Go `causeOut` ({cause_id, depth, reproduced}) → CauseNode, or null. */
function decodeCause(raw: unknown): CauseNode | null {
	if (!isObject(raw)) return null;
	const causeId = str(raw.cause_id);
	const depth = num(raw.depth);
	if (causeId === null || depth === null) return null;
	return { causeId, depth, reproduced: raw.reproduced === true };
}

/**
 * buildDecoder decodes the Go `build` tool output (whytreesrv.buildOut) into the front
 * BuildResult discriminated union. The Go tool ALWAYS answers ok:true; a refusal is carried in
 * the `error` field (the closed BuildError code), a success carries the tree fields. So:
 *   - ok:true ∧ a non-empty `error` → a refusal (ok:false in the front union);
 *   - ok:true ∧ no `error` → the built tree (symptom/provenance/causes/root_cause/mirror_id).
 * A missing required tree field on a success → null (→ demo fallback). The terminal's
 * reflects_root_cause is the root (the Go gate already proved terminal.reflects == root).
 */
export const buildDecoder: Decoder<BuildResult> = (raw) => {
	if (!isObject(raw)) return null;
	if (raw.ok !== true) return null;

	// A refusal: the Go tool carries the closed BuildError code in `error`. An unknown
	// (non-closed) code → null so readVia falls back to the demo build (never a coerced value).
	const error = str(raw.error ?? "");
	if (error !== null && error !== "") {
		if (!isBuildError(error)) return null;
		const cause = str(raw.root_cause);
		return cause !== null && cause !== ""
			? { ok: false, error, cause }
			: { ok: false, error };
	}

	// A success: the built tree fields.
	const symptom = str(raw.symptom);
	const provenance = str(raw.provenance);
	const rootCause = str(raw.root_cause);
	const mirrorId = str(raw.mirror_id);
	if (
		symptom === null ||
		provenance === null ||
		rootCause === null ||
		mirrorId === null
	) {
		return null;
	}
	if (
		provenance !== "incident" &&
		provenance !== "mirror" &&
		provenance !== "human"
	) {
		return null;
	}
	const causes = arr(decodeCause)(raw.causes ?? []) ?? [];
	return {
		ok: true,
		tree: {
			symptom,
			provenance,
			causes,
			rootCause,
			terminal: { mirrorId, reflectsRootCause: rootCause },
		},
	};
};
