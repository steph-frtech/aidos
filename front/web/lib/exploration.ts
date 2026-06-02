/**
 * Exploration gestures — the Workbench /exploration source (AIDOS step S28).
 *
 * KRD §75/§84/§118/§132: the three exploration gestures of the idea entry-stage run OVER the S27
 * Idea lifecycle. /grill challenges an intention ABOVE the wall and ROUTES it on a closed
 * three-value verdict (sharp → grilled, skips spike ; fuzzy → spiking, the floue branch ; bad →
 * rejected, traced). /spike is the ratchet-OFF, T0, THROWAWAY zone whose writes are confined to
 * /spike (an escaping write ⇒ SPIKE_WRITE_ESCAPES_ZONE). /harvest extracts the discovered intention
 * and PROPOSES a DRAFT Truth — a kernel-delta candidate with NO frozen version and NO mirror (the
 * freeze is a separate later /goal; a direct kernel/mirror write by harvest ⇒ HARVEST_CANNOT_FREEZE).
 *
 * This module is the DECLARED TWIN of the Go package back/runtime/exploration — the SAME closed
 * verdict set, the SAME spike-confinement predicate, the SAME DRAFT-Truth proposal shape (no freeze,
 * no mirror). One semantics, no drift — so /exploration renders EXACTLY what the Go deciders compute.
 * The reproducibility mirror lib/exploration.test.ts (fast-check) pins it.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /exploration PROJECTS the gesture machine and
 * the confinement/harvest verdicts; recording an Idea transition rides the idea-intake MCP (ideas
 * schema, ABOVE the wall), and a PROMOTION of a DRAFT Truth writes a kernel truth via /goal under the
 * aidos writer role — never a write from this screen. The agent DB role is SELECT-only on
 * kernel/mirrors (the wall holds).
 */

import type { Idea, Proposes, Provenance, Status } from "@/lib/ideas";

/** The closed three-value grill verdict (KRD §75/§118) — no fourth value. */
export type GrillVerdict = "sharp" | "fuzzy" | "bad";

/** The closed verdict set, in canonical order (the twin of exploration.Verdicts). */
export function verdicts(): GrillVerdict[] {
	return ["sharp", "fuzzy", "bad"];
}

/** The actionable refusal shape (mirrors blockreason.BlockReason, KRD §44.5). */
export interface BlockReason {
	code: string;
	severity: string;
	explanation: string;
	howToFix: string[];
}

/** The only zone a spiking idea may write to (KRD §84) — the twin of exploration.SpikePrefix. */
export const SPIKE_PREFIX = "/spike";

/** The canonical SPIKE_WRITE_ESCAPES_ZONE BlockReason — the twin of blockreason.For (FR prose). */
export const SPIKE_WRITE_ESCAPES_ZONE: BlockReason = {
	code: "SPIKE_WRITE_ESCAPES_ZONE",
	severity: "blocking",
	explanation:
		"Refus du confinement : pendant qu'une idée est en spiking (cliquet OFF, T0, jetable), une écriture sort de la zone /spike. Le spike est jetable et ne doit JAMAIS fuir vers /kernel ni /src ; il ne gradue pas directement vers le noyau.",
	howToFix: [
		"confine_write_to_/spike : ramenez l'écriture sous le préfixe /spike — tout ce qu'un spike produit y reste, et reste jetable.",
		"run_/harvest_to_propose_a_kernel_delta : quand l'intention découverte est nette, récoltez-la pour PROPOSER un delta-noyau DRAFT.",
		"rerun aidos check : le blocage se lève dès que l'écriture est confinée à /spike.",
	],
};

/** The canonical HARVEST_CANNOT_FREEZE BlockReason — the twin of blockreason.For (FR prose). */
export const HARVEST_CANNOT_FREEZE: BlockReason = {
	code: "HARVEST_CANNOT_FREEZE",
	severity: "blocking",
	explanation:
		"Refus du mur : /harvest tente d'écrire le noyau ou un miroir directement. Harvest PROPOSE une DRAFT Truth (un delta-noyau candidat sans gel ni miroir) ; il ne gèle JAMAIS. Le gel est un /goal ultérieur séparé : l'IA esquisse, l'humain gèle.",
	howToFix: [
		"harvest_proposes_only : /harvest s'arrête à la proposition DRAFT — aucune écriture du noyau ni d'un miroir.",
		"write_mirror_run_goal_freeze : pour figer la DRAFT Truth, ouvrez un /goal séparé qui écrit son miroir (le gel).",
		"rerun aidos check : le blocage se lève dès que harvest ne vise plus le noyau/un miroir.",
	],
};

/** The status /grill routes a draft idea to, per verdict (twin of exploration.Grill). */
export function routeVerdict(verdict: GrillVerdict): Status {
	switch (verdict) {
		case "sharp":
			return "grilled";
		case "fuzzy":
			return "spiking";
		case "bad":
			return "rejected";
	}
}

/** A single write a spiking session attempts (twin of exploration.SpikeWrite). */
export interface SpikeWrite {
	path: string;
}

/** confined: true iff the write path stays inside the /spike zone (twin of SpikeWrite.Confined). */
export function confined(w: SpikeWrite): boolean {
	return w.path === SPIKE_PREFIX || w.path.startsWith(`${SPIKE_PREFIX}/`);
}

/**
 * checkSpikeWrite — the confinement decision (twin of exploration.CheckSpikeWrite). null if the
 * write is confined to /spike, else the SPIKE_WRITE_ESCAPES_ZONE BlockReason. Pure.
 */
export function checkSpikeWrite(w: SpikeWrite): BlockReason | null {
	return confined(w) ? null : SPIKE_WRITE_ESCAPES_ZONE;
}

/** The truth schemas /harvest may never write directly (the freeze is a separate /goal). */
const TRUTH_SCHEMAS = new Set(["kernel", "mirrors", "fitness"]);

/**
 * checkHarvestWrite — the wall for harvest (twin of exploration.CheckHarvestWrite). null if the
 * target is not a truth schema, else HARVEST_CANNOT_FREEZE. Harvest proposes, it never freezes.
 */
export function checkHarvestWrite(schema: string): BlockReason | null {
	return TRUTH_SCHEMAS.has(schema) ? HARVEST_CANNOT_FREEZE : null;
}

/** The marker every harvest proposal carries (twin of exploration.KindDraftTruth). */
export const KIND_DRAFT_TRUTH = "draft-truth";

/**
 * A DRAFT-Truth proposal — a kernel-delta CANDIDATE (twin of exploration.DraftTruthProposal). It
 * carries the discovered intention but, BY TYPE, has no frozen version and no mirror: the two
 * booleans are CONSTANT false, just as ideas.Idea makes them unrepresentable.
 */
export interface DraftTruthProposal {
	kind: typeof KIND_DRAFT_TRUTH;
	ideaId: string;
	proposes: Proposes;
	intent: string;
	provenance: Provenance;
	/** Always false — a DRAFT Truth never carries a frozen version (the freeze is /goal). */
	hasFrozenVersion: false;
	/** Always false — a DRAFT Truth never carries a mirror (writing the mirror IS the freeze). */
	hasMirror: false;
}

/**
 * harvest — the /harvest gesture (twin of exploration.Harvest). It advances the idea to harvested
 * and PROPOSES a DRAFT Truth carrying the discovered intention. It writes NOTHING (the wall). The
 * proposal's hasFrozenVersion/hasMirror are constant false. discovered empty falls back to intent.
 */
export function harvest(
	idea: Idea,
	discovered: string,
): { harvested: Idea; proposal: DraftTruthProposal } {
	const intent = discovered.trim() === "" ? idea.intent : discovered.trim();
	const harvested: Idea = { ...idea, status: "harvested" };
	const proposal: DraftTruthProposal = {
		kind: KIND_DRAFT_TRUTH,
		ideaId: harvested.id,
		proposes: harvested.proposes,
		intent,
		provenance: harvested.provenance,
		hasFrozenVersion: false,
		hasMirror: false,
	};
	return { harvested, proposal };
}
