"use server";

import {
	closeReality,
	DEMO_DIVERGENT_REPORT,
	DEMO_HEALTHY_REPORT,
	promoteElite,
} from "@/lib/reality-evolution";
import type { ClosureView, PromotionView } from "./view";

/**
 * Server Actions for the /reality-evolution COCKPIT (S109 — Cockpit réalité & évolution par projet,
 * app-builder EPIC 12 / E12).
 *
 * THE STEP: ONE cockpit composing S106 (ingest incident → RealityMirror → draft idea) + S107
 * (approve the learned mirror → bump hash → targeted red wave) + S108 (QD elites archive +
 * authority-gated promotion). The done-criterion, executable from the screen: INGEST an incident →
 * APPROVE the learned mirror → SEE the red wave appear.
 *
 * Two controls:
 *   - closeRealityAction: the primary journey. healthy=off → the out-of-stock divergence is
 *     ingested, the approved mirror attached, the createOrder hash bumps, a targeted red wave
 *     appears. healthy=on → within-promise telemetry → NO divergence, nothing learned.
 *   - promoteEliteAction: promote a named QD élite — a PROPOSAL only with authority (writesTruth=
 *     false), refused (no truth) without it or for a mirror-breaker (anti-Goodhart).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): both actions run the PURE twin lib/reality-evolution — same
 * input → byte-identical outcome, never an LLM. THE WALL (§2): the cockpit WRITES NOTHING above the
 * line (wroteKernel/writesTruth always false; the direct Reality→Kernel edge always refused); the
 * human authors the approved mirror at /goal and freezes a promotion at /goal — nothing learns its
 * own fitness.
 */
export async function closeRealityAction(
	_prev: ClosureView,
	formData: FormData,
): Promise<ClosureView> {
	const healthy = formData.get("healthy") === "on";
	try {
		const report = healthy ? DEMO_HEALTHY_REPORT : DEMO_DIVERGENT_REPORT;
		const result = closeReality(report, healthy);
		return { ok: true, result };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export async function promoteEliteAction(
	_prev: PromotionView,
	formData: FormData,
): Promise<PromotionView> {
	const variantId = String(formData.get("variantId") ?? "");
	const authorityApproved = formData.get("authority") === "on";
	try {
		const result = promoteElite(variantId, authorityApproved);
		return { ok: true, variantId, result };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
