/**
 * facetwire-data — the DETERMINISTIC demo fixtures for the /facet-wire panel (S59 cutover, ADR
 * 0092). It holds the gateway-arg projection of a kernel's facet skeleton and the demo verdict the
 * panel falls back to when the gateway is unreachable / undispatched / refused (`source:"demo"`).
 *
 * THE TWIN IS NOW THE DEMO, NOT THE LIVE PATH (ADR 0092). Before the cutover /facet-wire computed
 * the FK08 verdict from the PURE TS twin (lib/facetwire `wireSkeleton`) as its live answer. The
 * cutover routes the read through the Go engine via the passerelle (`readVia(scope, "facet_skeleton",
 * …)`, the dispatched below-the-line read of the facet-wire MCP server facetwiresrv): the per-column
 * verdicts (green/red), the structural rung divergences, and the overall verdict are read LIVE.
 * These fixtures are KEPT only as the deterministic fallback, and they are DERIVED from the same
 * PURE twin (lib/facetwire) so the demo is byte-identical to what the Go engine reproduces (same
 * skeleton → same verdict, same columns). The presence of this `-data.ts` sibling is also what keeps
 * the T5 cliquet (twin-as-live-fitness) GREEN — it RECOGNISES lib/facetwire as a twin sitting behind
 * `source:"demo"`, witnessed by the `readVia` frontier import in actions.ts.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the demo verdict is the SAME shape the Go facetwiresrv
 * skeletonReportOut reproduces — no clock, no rng, no LLM. The parity mirror
 * app/facet-wire/live.test.ts pins the decoder == the Go tool's CONTRACT.
 *
 * THE WALL (CLAUDE.md §2): the read is BELOW the line — it returns the FK08 skeleton verdict as a
 * VALUE; a red column is a SIGNAL → idea → mirror → /goal, never a write from this screen.
 */

import type { SkeletonVerdict } from "../app/facet-wire/live";
import { type Column, wireSkeleton } from "./facetwire";

/** The gateway args for a `facet_skeleton` call — the kernel id + its non-functional facet columns. */
export function gatewaySkeletonArgs(
	kernelId: string,
	columns: Column[],
): Record<string, unknown> {
	return { kernel_id: kernelId, columns };
}

/**
 * demoSkeleton reproduces the Go `facet_skeleton` verdict from the PURE twin: it judges the five
 * non-functional columns in parallel (a broken HARD pair reddens its column; the soft X column stays
 * green and surfaces an advisory) and projects the SkeletonReport into the front SkeletonVerdict the
 * decoder accepts — byte-identical to the Go facetwiresrv skeletonReportOut shape.
 */
export function demoSkeleton(
	kernelId: string,
	columns: Column[],
): SkeletonVerdict {
	const rep = wireSkeleton({ kernel_id: kernelId, columns });
	return {
		kernelId: rep.kernel_id ?? "",
		verdict: rep.verdict,
		columns: rep.columns.map((c) => ({
			facet: c.facet,
			sensor: c.sensor,
			soft: c.soft,
			verdict: c.verdict,
			divergences: c.divergences.map((d) => ({
				facet: d.facet,
				rung: d.rung,
				kind: d.kind,
				advisory: d.advisory,
			})),
			advisories: c.advisories.map((d) => ({
				facet: d.facet,
				rung: d.rung,
				kind: d.kind,
				advisory: d.advisory,
			})),
		})),
	};
}
