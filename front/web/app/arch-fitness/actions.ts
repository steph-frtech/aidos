"use server";

import { type DepGraph, measure, propose, ratchet } from "@/lib/arch-fitness";
import type { GateView, MeasureView, ProposeView, RatchetView } from "./view";

/**
 * Server Actions for the /arch-fitness Workbench panel (S102 — the structural ratchet §47,
 * app-builder EPIC 11).
 *
 * THE STEP: the arch-fitness ratchet over the inter-cell dependency graph. Four "lower-is-better"
 * metrics (boundary violations, inter-cell cycles, inter-BC edges, max cell complexity) can only
 * HOLD or IMPROVE between two cuts. A new boundary violation OR a new inter-cell cycle REDDENS the
 * structural ratchet and BLOCKS THE CUT, INDEPENDENT of the (green) behavioural mirrors — it
 * prevents "tests verts, système pourri". The baseline moves ONLY via a DRAFT ChangeSet.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): measure + ratchet + propose are PURE functions
 * (lib/arch-fitness) — same input → byte-identical result, never an LLM. THE WALL (§2/§9):
 * /arch-fitness measures + ratchets + PROPOSES; propose returns a DRAFT envelope, it does not
 * persist truth from the screen.
 */

// The canonical CLEAN cut of the §46 checkout federation: checkout depends on billing across
// the HONORED contract; no violation, no cycle. The BASELINE the ratchet protects.
function cleanCut(projectId: string): DepGraph {
	return {
		project: projectId || "shop",
		cells: { checkout: 5, billing: 3, catalog: 4 },
		honored: [{ a: "checkout", b: "billing" }],
		edges: [
			{
				from: "checkout.place",
				fromCell: "checkout",
				to: "billing.charge",
				toCell: "billing",
			},
		],
	};
}

// A candidate cut carrying the injected fault: a NEW uncontracted edge (boundary violation) or a
// NEW back-edge (inter-cell cycle). Each must REDDEN the structural ratchet against the baseline.
function candidateCut(projectId: string, scenario: string): DepGraph {
	const g = cleanCut(projectId);
	if (scenario === "violation") {
		g.edges.push({
			from: "checkout.price",
			fromCell: "checkout",
			to: "catalog.lookup",
			toCell: "catalog", // catalog has NO honored pair → boundary violation
		});
	} else if (scenario === "cycle") {
		g.edges.push({
			from: "billing.refund",
			fromCell: "billing",
			to: "checkout.cancel",
			toCell: "checkout", // billing→checkout closes a cycle with checkout→billing
		});
	}
	return g;
}

export async function measureAction(
	_prev: MeasureView,
	formData: FormData,
): Promise<MeasureView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	return { ok: true, metric: measure(cleanCut(projectId)) };
}

export async function ratchetAction(
	_prev: RatchetView,
	formData: FormData,
): Promise<RatchetView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	const base = measure(cleanCut(projectId));
	// the candidate is the clean cut itself → HELD (the ratchet holds when nothing climbs).
	return { ok: true, verdict: ratchet(base, base) };
}

export async function gateAction(
	_prev: GateView,
	formData: FormData,
): Promise<GateView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	const scenario = String(formData.get("scenario") ?? "violation");
	const base = measure(cleanCut(projectId));
	const candidate = measure(candidateCut(projectId, scenario));
	return {
		ok: true,
		metric: candidate,
		verdict: ratchet(base, candidate),
		scenario,
	};
}

export async function proposeAction(
	_prev: ProposeView,
	formData: FormData,
): Promise<ProposeView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	const g = cleanCut(projectId);
	const base = measure(g);
	const cs = propose(
		g,
		base,
		`structural baseline ${projectId || "shop"}`,
		"phase-0",
	);
	return { ok: true, changeset: cs };
}
