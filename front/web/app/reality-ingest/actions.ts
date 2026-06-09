"use server";

import {
	DEMO_DIVERGENT_REPORT,
	DEMO_EXPECTATION,
	DEMO_HEALTHY_REPORT,
	DEMO_PROJECT_ID,
	ingest,
} from "@/lib/reality-ingest";
import type { RealityIngestView } from "./view";

/**
 * Server Actions for the /reality-ingest Workbench panel (S106 — boucle de réalité, app-builder
 * EPIC 12 / E12).
 *
 * THE STEP: a DEPLOYED emitted app's production OpenTelemetry diverges from a mirror; the
 * divergence becomes a project-scoped RealityMirror (provenance=incident) → a DRAFT idea whose
 * TEXT is a DETERMINISTIC TEMPLATE projection, never an LLM summary (ROADMAP §S106). The
 * done-criterion (executable from the screen): a 30%-error createOrder telemetry produces an
 * incident-provenance draft idea whose template text names the gap verbatim; a healthy report
 * produces NO idea.
 *
 * One control with a toggle drives both scenarios:
 *   - healthy=off (default): feed the divergent out-of-stock report → a RealityMirror + draft idea.
 *   - healthy=on: feed the within-promise report → no divergence, no idea (reality never invents).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): ingest runs the PURE twin lib/reality-ingest — same input →
 * byte-identical draft, never an LLM. THE WALL (§2): reality WRITES NOTHING — the draft is a value
 * (wroteKernel=false; the direct Reality→Kernel edge is always refused); promotion stays idea →
 * mirror → /goal → approval.
 */
export async function ingestAction(
	_prev: RealityIngestView,
	formData: FormData,
): Promise<RealityIngestView> {
	const healthy = formData.get("healthy") === "on";
	try {
		const report = healthy ? DEMO_HEALTHY_REPORT : DEMO_DIVERGENT_REPORT;
		const draft = ingest(DEMO_PROJECT_ID, report, DEMO_EXPECTATION);
		return { ok: true, diverged: draft !== null, draft: draft ?? undefined };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
