"use server";

import { readVia, type Source } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import {
	DEMO_RECORDS,
	type DemoRecord,
	demoCompute,
	demoLevels,
	demoParity,
	gatewayComputeArgs,
	gatewayLevelsArgs,
	gatewayParityArgs,
	LEVELS,
	type LevelName,
} from "@/lib/truth-level-data";
import { computeDecoder, levelsDecoder, parityDecoder } from "./live";

/**
 * Server Actions for the /truth-level Workbench panel (FK01 — « les 7 niveaux de vérité »).
 *
 * THE STEP (ROADMAP-fke FK01): the seven KRD truth levels (Raw→Reconciled) are STORED on a
 * record and written ONLY by the deterministic transition (compute). The panel is
 * action-capable: a FILTER BY LEVEL control (the done-criterion "panel filtre par niveau")
 * and a PARITY check that recomputes the stored level and flags any divergence (RED).
 *
 * S59 CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). The level + parity are now
 * read LIVE from the Go truth-level MCP server (truthlevelsrv) through the passerelle:
 * `readVia(scope, "compute", …)` maps each record's signals to its rung (the SOLE legal writer of
 * a truth_level), `readVia(scope, "check_parity", …)` recomputes and compares against the stored
 * rung, and `readVia(scope, "levels", …)` reads the reference ladder. The pure TS twin
 * (lib/truth-level) is NO LONGER the live path — it survives only as the deterministic demo
 * fixture (lib/truth-level-data) the reads fall back to when the gateway is unreachable /
 * undispatched / refused (`source:"live"|"demo"`). The `readVia` frontier import keeps the T5
 * cliquet GREEN.
 *
 * THE WALL (CLAUDE.md §2/§7). Every action WRITES NOTHING — all reads are below-the-line (they
 * compute a level, check parity and list the rungs as VALUES; WroteKernel false). The transition
 * is PURE, never an LLM; the level is never hand-posed. Persisting a level onto a record stays the
 * aidos CLI's job at the legal door, never from this screen.
 */

export interface FilteredRecord {
	id: string;
	labelFr: string;
	labelEn: string;
	rung: number;
	levelName: string;
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
	/** whether the verdicts came from the live gateway or the deterministic demo fixture. */
	source?: Source;
}

/**
 * projectLive resolves one demo record's level + parity through the LIVE Go engine (the two
 * dispatched below-the-line reads), falling back per-read to the deterministic twin verdict.
 * Returns the projected row plus the worst-case source ("demo" iff any read fell back).
 */
async function projectLive(
	r: DemoRecord,
	scope: Awaited<ReturnType<typeof panelScope>>,
): Promise<{ row: FilteredRecord; source: Source }> {
	const { data: lvl, source: computeSource } = await readVia(
		scope,
		"compute",
		gatewayComputeArgs(r.signals),
		computeDecoder,
		demoCompute(r.signals),
	);
	const { data: parity, source: paritySource } = await readVia(
		scope,
		"check_parity",
		gatewayParityArgs(lvl.level, r.signals),
		parityDecoder,
		demoParity(lvl.level, r.signals),
	);
	const source: Source =
		computeSource === "live" && paritySource === "live" ? "live" : "demo";
	return {
		row: {
			id: r.id,
			labelFr: r.labelFr,
			labelEn: r.labelEn,
			rung: lvl.level,
			levelName: lvl.name,
			aligned: parity.aligned,
		},
		source,
	};
}

/**
 * filterAction is the action-capable control behind the truth-level surface (CLAUDE.md §7
 * ui-completeness): the user picks a level (or "all") and the action recomputes each
 * record's level via the LIVE transition (the dispatched `compute` + `check_parity` reads) and
 * returns the matching set. The stored level is the transition's output, so parity is always
 * GREEN here — but the parity field is surfaced so a hand-posed divergence (were one introduced)
 * would render RED. It WRITES NOTHING (the wall).
 */
export async function filterAction(
	_prev: FilterView,
	formData: FormData,
): Promise<FilterView> {
	const filter = String(formData.get("filter") ?? "all");

	const scope = await panelScope();

	const projected = await Promise.all(
		DEMO_RECORDS.map((r) => projectLive(r, scope)),
	);
	const all = projected.map((p) => p.row);
	// live iff EVERY read across EVERY record was live; any demo fallback degrades to demo.
	const source: Source = projected.every((p) => p.source === "live")
		? "live"
		: "demo";

	const validNames = new Set<string>([
		"all",
		...LEVELS.map((l) => l.name as LevelName as string),
	]);
	const chosen = validNames.has(filter) ? filter : "all";
	const records =
		chosen === "all" ? all : all.filter((r) => r.levelName === chosen);
	return { ok: true, filter: chosen, records, total: all.length, source };
}

/**
 * laddersAction reads the FKE-5 reference ladder LIVE from the Go engine (`levels` tool) for the
 * panel's reference scale, falling back to the deterministic twin ladder. Below-the-line, writes
 * nothing (the wall).
 */
export async function laddersAction(): Promise<{
	levels: { level: number; name: string }[];
	source: Source;
}> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"levels",
		gatewayLevelsArgs(),
		levelsDecoder,
		demoLevels(),
	);
	return { levels: data, source };
}
