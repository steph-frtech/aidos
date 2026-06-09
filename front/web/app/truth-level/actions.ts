"use server";

import {
	checkParity,
	compute,
	DEMO_RECORDS,
	type DemoRecord,
	LEVELS,
	type LevelName,
} from "@/lib/truth-level";

/**
 * Server Actions for the /truth-level Workbench panel (FK01 — « les 7 niveaux de vérité »).
 *
 * THE STEP (ROADMAP-fke FK01): the seven KRD truth levels (Raw→Reconciled) are STORED on a
 * record and written ONLY by the deterministic transition (compute). The panel is
 * action-capable: a FILTER BY LEVEL control (the done-criterion "panel filtre par niveau")
 * and a PARITY check that recomputes the stored level and flags any divergence (RED).
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — it COMPUTES values. The
 * transition is PURE (lib/truth-level), never an LLM; the level is never hand-posed.
 */

export interface FilteredRecord {
	id: string;
	labelFr: string;
	labelEn: string;
	rung: number;
	levelName: LevelName;
	/** parity verdict: the stored level (its own computed rung) is always aligned here. */
	aligned: boolean;
}

export interface FilterView {
	ok: boolean;
	/** the level filter chosen ("all" = every rung). */
	filter: string;
	/** the records matching the filter, each carrying its computed level + parity. */
	records: FilteredRecord[];
	/** how many records exist in total (before filtering). */
	total: number;
}

function project(r: DemoRecord): FilteredRecord {
	const lvl = compute(r.signals);
	const parity = checkParity(lvl.rung, r.signals);
	return {
		id: r.id,
		labelFr: r.labelFr,
		labelEn: r.labelEn,
		rung: lvl.rung,
		levelName: lvl.name,
		aligned: parity.aligned,
	};
}

/**
 * filterAction is the action-capable control behind the truth-level surface (CLAUDE.md §7
 * ui-completeness): the user picks a level (or "all") and the action recomputes each
 * record's level via the transition and returns the matching set. The stored level is the
 * transition's output, so parity is always GREEN here — but the parity field is surfaced so
 * a hand-posed divergence (were one introduced) would render RED. It WRITES NOTHING (the wall).
 */
export async function filterAction(
	_prev: FilterView,
	formData: FormData,
): Promise<FilterView> {
	const filter = String(formData.get("filter") ?? "all");
	const all = DEMO_RECORDS.map(project);
	const validNames = new Set<string>(["all", ...LEVELS.map((l) => l.name)]);
	const chosen = validNames.has(filter) ? filter : "all";
	const records =
		chosen === "all" ? all : all.filter((r) => r.levelName === chosen);
	return { ok: true, filter: chosen, records, total: all.length };
}
