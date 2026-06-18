import { arr, type Decoder, isObject, str } from "../../lib/gateway-sdk";

/**
 * /facet-wire live read — the decoder over the Go facet-wire tool's output (FK08; S59 cutover,
 * ADR 0092 — the Go engine is the SINGLE live source). Kept OUT of actions.ts (a Next "use server"
 * module may only export async functions) so the parity mirror (live.test.ts) can import the PURE
 * decoder directly.
 *
 * THE DISPATCHED READ. FK08 (back/kernel/mirror/facetwire) is the pure STRUCTURAL judge wiring the
 * five non-functional facet columns (S/R/V/M/X) as parallel six-pair skeletons, each reusing an
 * existing sensor. The passerelle dispatches the `facet_skeleton` below-the-line read of the
 * facet-wire MCP server (facetwiresrv): a kernel's columns judged in parallel → a SkeletonReport
 * (per-column verdict green/red + the structural rung divergences + the overall verdict). Breaking
 * a declared-not-proven pair reddens its HARD column; the SOFT X column stays green and surfaces an
 * ADVISORY (§13.6 — it informs, never clicks the ratchet hard).
 *
 * THE WALL (CLAUDE.md §2): the read is PURE below-the-line — it judges the declared/proven rungs as
 * a VALUE and writes NOTHING. A red column is a SIGNAL → idea → mirror → /goal, never a write.
 *
 * NEVER DOUBLE-TYPED (the S59 done-criterion): the `Decoder<SkeletonVerdict>` is the SINGLE runtime
 * declaration of the tool's output shape; the static type is INFERRED via Decoded<>. The parity
 * mirror (live.test.ts) pins this decoder == the Go facetwiresrv skeletonReportOut CONTRACT, NOT a
 * second implementation of the wire logic (back/kernel/mirror/facetwire is authoritative).
 * DETERMINISM-FIRST (§6/§8): same JSON → same verdict, zero LLM; a malformed payload returns null
 * and readVia falls back to the deterministic demo fixture.
 */

/** The verdict of a single facet column, as facetwiresrv.columnReportOut serialises it. */
export interface LiveColumn {
	facet: string;
	sensor: string;
	soft: boolean;
	verdict: "green" | "red";
	divergences: LiveDivergence[];
	advisories: LiveDivergence[];
}

/** One structural rung divergence, as facetwiresrv.divergenceOut serialises it. */
export interface LiveDivergence {
	facet: string;
	rung: string;
	kind: "pair_broken" | "pair_undeclared";
	advisory: boolean;
}

/** The full FK08 skeleton verdict, as facetwiresrv.skeletonReportOut serialises it. */
export interface SkeletonVerdict {
	kernelId: string;
	verdict: "green" | "red";
	columns: LiveColumn[];
}

/** decodeVerdict narrows a string to the closed "green"|"red" set; null otherwise. PURE. */
function decodeVerdict(raw: unknown): "green" | "red" | null {
	return raw === "green" || raw === "red" ? raw : null;
}

/** decodeKind narrows a string to the closed divergence-kind set; null otherwise. PURE. */
function decodeKind(raw: unknown): "pair_broken" | "pair_undeclared" | null {
	return raw === "pair_broken" || raw === "pair_undeclared" ? raw : null;
}

/**
 * divergenceDecoder decodes one Go `divergenceOut` ({ facet, rung, kind, advisory }). Each field is
 * required and the kind is a closed-set membership — a malformed divergence → null, so the whole
 * read falls back to the demo fixture (binary verdict, never a coerced value). PURE.
 */
const divergenceDecoder: Decoder<LiveDivergence> = (raw) => {
	if (!isObject(raw)) return null;
	const facet = str(raw.facet);
	const rung = str(raw.rung);
	const kind = decodeKind(raw.kind);
	if (facet === null || rung === null || kind === null) return null;
	if (typeof raw.advisory !== "boolean") return null;
	return { facet, rung, kind, advisory: raw.advisory };
};

/**
 * columnDecoder decodes one Go `columnReportOut` ({ facet, sensor, soft, verdict, divergences,
 * advisories? }). `divergences` is required (possibly empty); `advisories` is omitempty so an
 * absent array decodes to []. PURE.
 */
const columnDecoder: Decoder<LiveColumn> = (raw) => {
	if (!isObject(raw)) return null;
	const facet = str(raw.facet);
	const sensor = str(raw.sensor);
	const verdict = decodeVerdict(raw.verdict);
	if (facet === null || sensor === null || verdict === null) return null;
	if (typeof raw.soft !== "boolean") return null;
	const divergences = arr(divergenceDecoder)(raw.divergences ?? []);
	if (divergences === null) return null;
	const advisories = arr(divergenceDecoder)(raw.advisories ?? []);
	if (advisories === null) return null;
	return { facet, sensor, soft: raw.soft, verdict, divergences, advisories };
};

/**
 * skeletonDecoder decodes the Go `facet_skeleton` tool output (facetwiresrv.skeletonReportOut:
 * `{ ok, kernel_id?, verdict, green, columns, hash }`). `verdict` is a closed-set membership and
 * `columns` is required (each column must decode). `kernel_id` is omitempty → "" when absent. PURE.
 */
export const skeletonDecoder: Decoder<SkeletonVerdict> = (raw) => {
	if (!isObject(raw)) return null;
	const verdict = decodeVerdict(raw.verdict);
	if (verdict === null) return null;
	const columns = arr(columnDecoder)(raw.columns ?? []);
	if (columns === null) return null;
	const kernelId = str(raw.kernel_id) ?? "";
	return { kernelId, verdict, columns };
};
