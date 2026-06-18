"use server";

import { readVia } from "@/lib/gateway-sdk";
import {
	type AppMirrors,
	DEMO_LIBRARY,
	hasMonster,
	scopedCompleteness,
} from "@/lib/mirror-library";
import { demoApps, demoLibraryArgs } from "@/lib/mirror-library-data";
import { panelScope } from "@/lib/panelScope";
import { appsDecoder } from "./live";

/**
 * Server Actions for the /mirror-library Workbench panel (S70 — « la librairie de miroirs par projet
 * + la détection de monstre scopée au projet »).
 *
 * THE STEP (ROADMAP-app-builder S70, KRD §29/§33/§34): the user's mirrors listed BY APP with their
 * liveness, plus the completeness/monster detection SCOPED TO ONE PROJECT — a truth without a living
 * mirror, or an orphan mirror, WITHIN the project. Scope is not cosmetic: a cross-project mirror is an
 * orphan within the project (a monster the global cut would have hidden).
 *
 * S59 CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). The per-app LISTING now reads
 * LIVE from the Go mirror-library MCP server through the passerelle
 * (`readVia(scope, "library_list_by_app", …)`, the dispatched below-the-line read); the twin
 * `lib/mirror-library.listByApp()` is preserved ONLY as the deterministic demo fallback (kept in the
 * `-data.ts` sibling, `source:"live"|"demo"`). The PROJECT-SCOPED completeness verdict
 * (scopedCompleteness / hasMonster) stays the twin demo compute over the declared DEMO_LIBRARY — a
 * monster detection the front shows locally; the `readVia` frontier import keeps the T5 cliquet
 * GREEN (the twin sits behind the demo fallback, never as the live source).
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it reads a projection (live or demo) and
 * computes the monster set as VALUES. The detector REUSES the completeness law verbatim; the verdict
 * is COMPUTED, never an LLM. Project isolation is the S55 RLS wall, made explicit as a scope.
 */

export interface MonsterView {
	reason: string;
	layerId?: string;
	version?: string;
	kind?: string;
	missingTestKind?: string;
	mirrorId?: string;
}

export interface ScopedHealthView {
	ok: boolean;
	project: string;
	verdict: string; // COMPLETE | RED_MONSTER
	hasMonster: boolean;
	monsters: MonsterView[];
	/** the per-app mirror listing (every app with its liveness tally). */
	apps: AppMirrors[];
	/** live | demo — whether the per-app listing came from the gateway or the demo fixture. */
	source: "live" | "demo";
}

/**
 * scopeAction is the action-capable control behind the library surface (CLAUDE.md §7 ui-completeness):
 * the user picks a project and submits — the action lists the user's mirrors BY APP (read LIVE through
 * the passerelle, the twin demo as fallback) and runs the PROJECT-SCOPED completeness law over the
 * chosen project, returning the monster set + verdict. It WRITES NOTHING (the wall). The detector
 * fires iff the scoped cut carries a monster.
 */
export async function scopeAction(
	_prev: ScopedHealthView,
	formData: FormData,
): Promise<ScopedHealthView> {
	const project = String(formData.get("project") ?? "").trim();
	const scope = await panelScope();
	// LIVE read through the passerelle (the dispatched mirror-library `library_list_by_app` tool);
	// the twin demoApps() is the deterministic fallback (source:"live"|"demo") — ADR 0092.
	const { data: apps, source } = await readVia(
		scope,
		"library_list_by_app",
		{ library: demoLibraryArgs() },
		appsDecoder,
		demoApps(),
	);

	if (project === "") {
		return {
			ok: false,
			project: "",
			verdict: "",
			hasMonster: false,
			monsters: [],
			apps,
			source,
		};
	}

	const c = scopedCompleteness(DEMO_LIBRARY, project);
	return {
		ok: true,
		project,
		verdict: c.verdict,
		hasMonster: hasMonster(DEMO_LIBRARY, project),
		monsters: c.monsters.map((m) => ({
			reason: m.reason,
			layerId: m.layerId,
			version: m.version,
			kind: m.kind,
			missingTestKind: m.missingTestKind,
			mirrorId: m.mirrorId,
		})),
		apps,
		source,
	};
}
