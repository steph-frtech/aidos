"use server";

import {
	type Artifact,
	emitArtifacts,
	type LedgerEntry,
	type Plan,
	regenerate,
} from "@/lib/app-regenerator";
import {
	type BlockReason,
	DEMO_SCHEMA,
	isBlocked,
} from "@/lib/relation-emitter";

/**
 * Server Actions for the /app-regenerator Workbench panel (S78 — « Régénérer mon app »).
 *
 * THE STEP (ROADMAP-app-builder S78): a Runtime action, bound to the user's Kernel cut, runs
 * the deterministic emitters for ALL of a project's sources toward the emission target in ONE
 * pass, classifies staleness by source-hash, and REFUSES if any emitted file was hand-edited.
 *
 * THE WALL (CLAUDE.md §2/§7). The action WRITES NOTHING — gen/ is a projection, regenerable.
 * It returns a Plan as VALUES. The regen is PURE (lib/app-regenerator), never an LLM — same
 * project → byte-identical artifacts (byte-stable). The drift verdict is a pure hash inequality.
 */

export interface RegenView {
	ok: boolean;
	/** the scenario the user ran (clean | handedit). */
	scenario: "clean" | "handedit" | null;
	plan?: Plan;
	block?: BlockReason;
}

/** A faithful ledger of a clean emission — the prior content addresses the emitter recorded. */
function faithfulLedger(arts: Artifact[]): LedgerEntry[] {
	return arts.map((a) => ({
		path: a.path,
		sourceHash: a.sourceHash,
		outputHash: a.outputHash,
	}));
}

/** A faithful on-disk tree — the emitted bytes verbatim. */
function faithfulDisk(arts: Artifact[]): { path: string; bytes: string }[] {
	return arts.map((a) => ({ path: a.path, bytes: a.bytes }));
}

/**
 * regenAction is the action-capable control behind « Régénérer mon app » (CLAUDE.md §7
 * ui-completeness): the user runs a regeneration over the demo project, choosing whether the
 * emitted tree on disk is FAITHFUL (a clean run → a Plan with stale/fresh/unchanged) or has a
 * HAND-EDIT (one file mutated → the regeneration is REFUSED with GEN_FILE_HAND_EDITED, proving
 * the tree is never silently overwritten). It WRITES NOTHING (the wall).
 */
export async function regenAction(
	_prev: RegenView,
	formData: FormData,
): Promise<RegenView> {
	const scenario = (
		String(formData.get("scenario") ?? "clean") === "handedit"
			? "handedit"
			: "clean"
	) as "clean" | "handedit";

	// Emit a clean tree first to build the faithful ledger + disk.
	const arts = emitArtifacts(DEMO_SCHEMA);
	if (isBlocked(arts)) {
		return { ok: true, scenario, block: arts };
	}
	const ledger = faithfulLedger(arts);
	const disk = faithfulDisk(arts);

	if (scenario === "handedit" && disk.length > 0) {
		// Someone hand-edited the first emitted file.
		disk[0] = { path: disk[0].path, bytes: `${disk[0].bytes}\n// hand edit` };
	}

	const result = regenerate(DEMO_SCHEMA, ledger, disk);
	if (!result.ok) {
		return { ok: true, scenario, block: result.block };
	}
	return { ok: true, scenario, plan: result.plan };
}
