"use server";

import {
	cellPack,
	checkCrossCellAccess,
	type Federation,
	type Project,
	packHasNeighborInternal,
	partition,
	shippableCells,
} from "@/lib/cell-federation";
import type { AccessView, PackView, PartitionView } from "./view";

/**
 * Server Actions for the /cell-federation Workbench panel (S100 — cell federation, app-builder
 * EPIC 11).
 *
 * THE STEP: a project's Kernel is partitioned into per-cell sub-Kernels (KRD §43–§51), each
 * with its own ratchet, linked ONLY by contracts_with (S17). A cell's pack carries its OWN
 * Kernel + ONLY contracted neighbors' PUBLIC contracts (never internals); a cross-cell access
 * without a honored contract is refused.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): partition + cellPack + checkCrossCellAccess are PURE
 * functions (lib/cell-federation) — same input → byte-identical result, never an LLM. THE WALL
 * (§2/§9): /cell-federation projects + checks; the Context-Map (which cells, which contract)
 * persists via a ChangeSet (S101), never a direct write from the screen.
 */

// The canonical demo federation (the ubiquitous checkout slice): checkout ⇄ billing (honored),
// checkout ✗ catalog (none). billing RED; checkout & catalog GREEN.
function demoProject(projectId: string): Project {
	return {
		id: projectId || "shop",
		nodes: [
			{ id: "ck-op", cell: "checkout", kind: "layer" },
			{ id: "ck-mir", cell: "checkout", kind: "mirror" },
			{ id: "ck-pact", cell: "checkout", kind: "contract", public: true },
			{ id: "bl-op", cell: "billing", kind: "layer" },
			{ id: "bl-mir", cell: "billing", kind: "mirror" },
			{ id: "bl-pact", cell: "billing", kind: "contract", public: true },
			{ id: "cat-pact", cell: "catalog", kind: "contract", public: true },
		],
		ratchets: { checkout: "green", billing: "red", catalog: "green" },
	};
}

function demoFederation(): Federation {
	return { contracts: [{ a: "checkout", b: "billing", honored: true }] };
}

export async function partitionAction(
	_prev: PartitionView,
	formData: FormData,
): Promise<PartitionView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	try {
		const cells = partition(demoProject(projectId));
		return { ok: true, cells, shippable: shippableCells(cells) };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export async function packAction(
	_prev: PackView,
	formData: FormData,
): Promise<PackView> {
	const projectId = String(formData.get("projectId") ?? "shop");
	const target = String(formData.get("target") ?? "checkout");
	const p = demoProject(projectId);
	const pack = cellPack(p, target, demoFederation());
	return { ok: true, pack, leaked: packHasNeighborInternal(pack, p) };
}

export async function checkAccessAction(
	_prev: AccessView,
	formData: FormData,
): Promise<AccessView> {
	const from = String(formData.get("from") ?? "checkout");
	const to = String(formData.get("to") ?? "catalog");
	const block = checkCrossCellAccess(from, to, demoFederation());
	return { ok: true, allowed: block === null, block: block ?? undefined };
}
