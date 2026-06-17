import type { Level } from "../../lib/besoin-grammar";
import { isLevel } from "../../lib/besoin-grammar";
import { arr, type Decoder, isObject, num, str } from "../../lib/gateway-sdk";

/**
 * /besoin-intake live read — the decoder over the Go besoin-intake `besoin_graph_state` tool output
 * (EL15; the ADR 0092 batch-4A flip). Kept OUT of actions.ts (a Next "use server" module may only
 * export async functions) so the parity mirror (live.test.ts) can import the PURE decoder directly.
 *
 * NEVER DOUBLE-TYPED (the flip done-criterion): `stateDecoder` is the SINGLE runtime declaration of the
 * live graph-state shape; the static `BesoinGraphState` is the type the decoder PRODUCES (inferred via
 * Decoded<>, never re-declared). The parity mirror pins the decoder == the Go besoinintakesrv contract
 * (`stateOutput`: { project, graph_hash, node_row_count, enterable_level?, done, verdicts[] }), NOT a
 * second implementation of the besoin logic (the Go besoin-intake MCP is authoritative — the enterable
 * level + the per-level verdicts are COMPUTED server-side from the RLS-scoped persisted BesoinGraph).
 *
 * THE RLS DIMENSION (the point of this batch). The Go besoin Store is RLS-scoped to `project` (the SET
 * LOCAL `aidos.project` GUC, S55 — project A's rows are invisible to a B-scoped session). The decoder
 * therefore carries the `project` the state was scoped to; the panel ALWAYS sends the active project in
 * its gateway args (the scope IS the project boundary the wall enforces server-side).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): same JSON → same verdict; a malformed payload returns null and
 * readVia falls back to the demo snapshot (`source:"demo"`). THE WALL (§2): `besoin_graph_state` is a
 * pure below-the-line READ — the graph + the enterable level + the verdicts are a projection, no truth
 * is written (WroteKernel always false; a kernel write is refused by GRANT).
 */

/** A per-level resolution verdict the Go MCP computes (EL07 — enough? + the missing fields). */
export interface LevelVerdict {
	level: Level;
	enough: boolean;
	missing: string[];
	openQuestions: string[];
}

/** decodeVerdict decodes one Go `levelVerdict` (snake_case) into the front LevelVerdict. */
function decodeVerdict(raw: unknown): LevelVerdict | null {
	if (!isObject(raw)) return null;
	const level = str(raw.level);
	if (level === null || !isLevel(level)) return null;
	if (typeof raw.enough !== "boolean") return null;
	const missing = arr(str)(raw.missing ?? []) ?? [];
	const openQuestions = arr(str)(raw.open_questions ?? []) ?? [];
	return { level, enough: raw.enough, missing, openQuestions };
}

/**
 * BesoinGraphState — the decoded live graph-state the panel renders (the RLS-scoped projection): the
 * project boundary, the content-addressed graph hash, the persisted node row count, the COMPUTED
 * enterable level (EL07 — "" when the graph is complete), whether the whole need is resolved, and the
 * per-level verdicts. The type is INFERRED from `stateDecoder` (Decoded<>) — never double-typed.
 */
export interface BesoinGraphState {
	project: string;
	graphHash: string;
	nodeRowCount: number;
	enterableLevel: string;
	done: boolean;
	verdicts: LevelVerdict[];
}

/**
 * stateDecoder decodes the Go `besoin_graph_state` stateOutput into the front BesoinGraphState. The
 * `enterable_level` is omitempty on the Go side (a complete graph emits none) → decodes to "". A missing
 * required field (project / graph_hash / node_row_count / done) → null (→ demo fallback). The verdicts
 * list is advisory — an absent list decodes to []; a malformed verdict reds the whole decode (binary).
 */
export const stateDecoder: Decoder<BesoinGraphState> = (raw) => {
	if (!isObject(raw)) return null;
	const project = str(raw.project);
	const graphHash = str(raw.graph_hash);
	const nodeRowCount = num(raw.node_row_count);
	if (project === null || graphHash === null || nodeRowCount === null) {
		return null;
	}
	if (typeof raw.done !== "boolean") return null;
	const verdicts = arr(decodeVerdict)(raw.verdicts ?? []);
	if (verdicts === null) return null;
	const enterableLevel = str(raw.enterable_level) ?? "";
	return {
		project,
		graphHash,
		nodeRowCount,
		enterableLevel,
		done: raw.done,
		verdicts,
	};
};
