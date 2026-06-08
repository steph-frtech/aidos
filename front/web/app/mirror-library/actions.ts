"use server";

import {
	type AppMirrors,
	DEMO_LIBRARY,
	hasMonster,
	listByApp,
	scopedCompleteness,
} from "@/lib/mirror-library";

/**
 * Server Actions for the /mirror-library Workbench panel (S70 — « la librairie de miroirs par projet
 * + la détection de monstre scopée au projet »).
 *
 * THE STEP (ROADMAP-app-builder S70, KRD §29/§33/§34): the user's mirrors listed BY APP with their
 * liveness, plus the completeness/monster detection SCOPED TO ONE PROJECT — a truth without a living
 * mirror, or an orphan mirror, WITHIN the project. Scope is not cosmetic: a cross-project mirror is an
 * orphan within the project (a monster the global cut would have hidden).
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it groups, scopes and computes the monster
 * set as VALUES over the declared demo library. The detector REUSES the completeness law verbatim; the
 * verdict is COMPUTED, never an LLM. Project isolation is the S55 RLS wall, made explicit as a scope.
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
}

/**
 * scopeAction is the action-capable control behind the library surface (CLAUDE.md §7 ui-completeness):
 * the user picks a project and submits — the action lists the user's mirrors BY APP and runs the
 * PROJECT-SCOPED completeness law over the chosen project, returning the monster set + verdict. It
 * WRITES NOTHING (the wall). The detector fires iff the scoped cut carries a monster.
 */
export async function scopeAction(
	_prev: ScopedHealthView,
	formData: FormData,
): Promise<ScopedHealthView> {
	const project = String(formData.get("project") ?? "").trim();
	const apps = listByApp(DEMO_LIBRARY);

	if (project === "") {
		return {
			ok: false,
			project: "",
			verdict: "",
			hasMonster: false,
			monsters: [],
			apps,
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
	};
}
