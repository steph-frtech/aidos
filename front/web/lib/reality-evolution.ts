/**
 * The reality-evolution twin — the Workbench /reality-evolution COCKPIT source
 * (AIDOS S109, app-builder EPIC 12 / E12, KRD §53/§62/§64/§66/§67/§98).
 *
 * S109 is the per-project COCKPIT that COMPOSES the three already-built deterministic engines
 * into ONE action-capable screen — it invents NO new truth-mechanic, it ORCHESTRATES:
 *
 *   1. INGEST an incident (S106, lib/reality-ingest.ingest): a deployed app's production
 *      telemetry DIVERGENCE → a project-scoped RealityMirror (provenance=incident) → a DRAFT idea
 *      whose intent is the DETERMINISTIC TEMPLATE text (never an LLM summary).
 *   2. APPROVE the learned mirror (S107, lib/learn.closeLoop): the human-approved NEW mirror
 *      (the /goal outcome over that incident) BUMPS the operation's content address and seeds a
 *      TARGETED red wave (mirror-first) — the worklist.
 *   3. The QD ELITES ARCHIVE (S108, lib/project-evolve.niches/promote): the per-project MAP-Elites
 *      niches of GREEN variants of an ALREADY-frozen truth, and the authority-gated promotion.
 *
 * The cockpit's load-bearing done-journey (the Playwright e2e, §S109): INGEST an incident →
 * APPROVE the learned mirror → SEE the red wave appear. closeReality below is the single pure
 * function that runs that journey end-to-end, so the e2e drives ONE control.
 *
 * THE WALL (CLAUDE.md §2): the cockpit WRITES NOTHING above the line. The ingestion emits a DRAFT
 * idea (wroteKernel=false), the loop-closure attaches a mirror the HUMAN authored at /goal
 * (wroteKernel=false), and a promotion is a PROPOSAL the /goal freezes (writesTruth=false). The
 * direct Reality→Kernel edge is always refused (REALITY_CANNOT_DECLARE_TRUTH). Nothing learns its
 * own fitness.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the cockpit is a PURE ORCHESTRATION over three pure twins —
 * no clock, no rng, no I/O, no LLM. The reproducibility mirror lib/reality-evolution.test.ts
 * (fast-check) pins same-input ⇒ same-output for the whole journey AND that the wall always holds.
 * The Go engines (realityingest, learn, projectevolve) are AUTHORITATIVE on the wire.
 */

import {
	closeLoop,
	DEMO_EDGES,
	DEMO_HEADS,
	DEMO_INCIDENT_REF,
	DEMO_MIRROR,
	DEMO_TARGET,
	type Outcome as LearnOutcome,
} from "./learn";
import {
	type FixedMirror,
	niches,
	type PromotionResult,
	promote,
	type Variant,
} from "./project-evolve";
import {
	DEMO_DIVERGENT_REPORT,
	DEMO_EXPECTATION,
	DEMO_HEALTHY_REPORT,
	DEMO_PROJECT_ID,
	type DraftFromDivergence,
	ingest,
	type TelemetryReport,
} from "./reality-ingest";

/** The wall refusal — reality never declares truth, the cockpit never writes above the line. */
export const WALL_CODE = "REALITY_CANNOT_DECLARE_TRUTH" as const;

/** The cockpit phase — which rung of the closed loop the screen is showing. */
export type CockpitPhase = "idle" | "ingested" | "learned" | "no_divergence";

/**
 * The full per-project reality→learn journey outcome — the value the cockpit renders. It carries
 * BOTH the S106 draft (the ingested incident) AND the S107 loop-closure (the approved mirror's
 * bump + red wave), so the e2e proves ingest → approve → red wave in one pass. `redWaveAppeared`
 * is the single boolean the done-criterion reads ("voir le red wave apparaître").
 */
export interface RealityClosure {
	phase: "learned";
	draft: DraftFromDivergence;
	learn: LearnOutcome;
	/** the worklist count — the red wave that appeared (§S109 done-criterion). */
	redWaveCount: number;
	redWaveAppeared: boolean;
	wallCode: typeof WALL_CODE;
	wroteKernel: false;
}

/** The verdict when production is within the mirror's promise — no incident, no learning. */
export interface NoDivergence {
	phase: "no_divergence";
	wallCode: typeof WALL_CODE;
	wroteKernel: false;
}

export type ClosureResult = RealityClosure | NoDivergence;

/**
 * closeReality runs the WHOLE per-project journey deterministically (S109): it INGESTS the
 * telemetry (S106), and IF a divergence is found, it CLOSES the loop over the human-approved
 * mirror (S107) — attaching the new mirror, bumping the operation hash and seeding the targeted
 * red wave. A healthy app (no divergence) yields a NoDivergence verdict: nothing is ingested,
 * nothing is learned (reality never invents a truth from a healthy app).
 *
 * It is a PURE COMPOSITION — the Go engines own the authoritative mechanics; this twin only wires
 * them in the §S109 order. wroteKernel is always false; the wall is re-asserted at the seam.
 */
export function closeReality(
	report: TelemetryReport,
	healthy: boolean,
): ClosureResult {
	const draft = ingest(DEMO_PROJECT_ID, report, DEMO_EXPECTATION);
	if (draft === null) {
		return { phase: "no_divergence", wallCode: WALL_CODE, wroteKernel: false };
	}
	// The human's /goal has approved the NEW mirror over this incident; the loop attaches it.
	const learn = closeLoop(
		DEMO_INCIDENT_REF,
		DEMO_MIRROR,
		DEMO_TARGET,
		DEMO_EDGES,
		DEMO_HEADS,
	);
	// `healthy` is consumed at the ingest layer (the demo report carries the divergence); kept in
	// the signature so the panel's toggle drives BOTH the same control. A healthy report yields
	// draft===null above, so we never reach here with healthy intent.
	void healthy;
	const redWaveCount = learn.wave.items.length;
	return {
		phase: "learned",
		draft,
		learn,
		redWaveCount,
		redWaveAppeared: redWaveCount > 0,
		wallCode: WALL_CODE,
		wroteKernel: false,
	};
}

// ── The QD elites archive (S108) the cockpit also surfaces, project-scoped ──

/** The project's fixed mirror — the frozen truth the variants compete to implement better. */
export const COCKPIT_FIXED_MIRROR: FixedMirror = {
	projectId: DEMO_PROJECT_ID,
	mirrorId: "mir-createOrder-succeeds",
	behavior: "createOrder succeeds and never double-charges",
};

/**
 * The candidate variants the medium loop produced for the cockpit's fixed mirror — a mix of
 * GREEN survivors (fast/cheap/simple niches) and a mirror-BREAKER (red, higher fitness) that the
 * anti-Goodhart anchor must KILL whatever its score, plus an out-of-sample-red one.
 */
export const COCKPIT_VARIANTS: Variant[] = [
	{
		projectId: DEMO_PROJECT_ID,
		id: "var-fast-green",
		niche: "fast",
		mirror: "green",
		outOfSample: "green",
		fitness: 0.82,
	},
	{
		projectId: DEMO_PROJECT_ID,
		id: "var-cheap-green",
		niche: "cheap",
		mirror: "green",
		outOfSample: "green",
		fitness: 0.71,
	},
	{
		projectId: DEMO_PROJECT_ID,
		id: "var-fast-breaker",
		niche: "fast",
		mirror: "red",
		outOfSample: "green",
		fitness: 0.99,
	},
	{
		projectId: DEMO_PROJECT_ID,
		id: "var-simple-oos-red",
		niche: "simple",
		mirror: "green",
		outOfSample: "red",
		fitness: 0.6,
	},
];

/** One élite row the cockpit's QD archive renders. */
export interface EliteRow {
	niche: string;
	variantId: string;
	fitness: number;
	mirror: "green" | "red";
	outOfSample: "green" | "red";
}

/**
 * cockpitElites projects the QD niches (S108) into the per-niche élite rows the archive renders —
 * one green élite per project-scoped niche, the mirror-breaker NEVER among them (it is culled
 * whatever its fitness). Sorted by niche for a byte-stable render.
 */
export function cockpitElites(
	mirror: FixedMirror,
	variants: Variant[],
): EliteRow[] {
	const map = niches(mirror, variants);
	const rows: EliteRow[] = [];
	for (const [key, v] of map) {
		const niche = key.includes("::") ? key.slice(key.indexOf("::") + 2) : key;
		rows.push({
			niche,
			variantId: v.id,
			fitness: v.fitness,
			mirror: v.mirror,
			outOfSample: v.outOfSample,
		});
	}
	rows.sort((a, b) => a.niche.localeCompare(b.niche));
	return rows;
}

/**
 * promoteElite runs the S108 authority-gated promotion over a named élite of the cockpit's fixed
 * mirror — a PROPOSAL only when authority approves (writesTruth=false), refused (no truth) without
 * it or for a red/out-of-sample-red/foreign variant. Pure delegation to project-evolve.promote.
 */
export function promoteElite(
	variantId: string,
	authorityApproved: boolean,
): PromotionResult {
	const v = COCKPIT_VARIANTS.find((x) => x.id === variantId);
	if (!v) {
		return {
			verdict: "refused",
			proposal: false,
			writesTruth: false,
			blockCode: "NO_SUCH_VARIANT",
			reason: `aucune variante "${variantId}" dans l'archive QD du projet.`,
		};
	}
	return promote(COCKPIT_FIXED_MIRROR, v, authorityApproved);
}

// ── demo fixtures re-exported so the panel/e2e boot the canonical journey ──

export {
	DEMO_DIVERGENT_REPORT,
	DEMO_HEALTHY_REPORT,
	DEMO_INCIDENT_REF,
	DEMO_PROJECT_ID,
};
