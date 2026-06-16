"use server";

import {
	compile,
	STOP_CONDITION,
	WALL_FORBIDDEN_PATHS,
} from "@/lib/context-pack";
import { CHECKOUT_GOAL, CHECKOUT_GRAPH } from "@/lib/context-pack-data";
import {
	arr,
	type Decoder,
	isObject,
	readVia,
	type Source,
	str,
} from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";

/**
 * /context-pack Server Actions (S59 cutover). It reads the LIVE compiled ContextPack of the
 * active project's checkout goal through the typed S58 gateway via the S59 SDK (the
 * below-the-line `context_pack_get` read of the context server — the minimal, branch-aware
 * pack the ContextRouter compiled), decoded with a PURE decoder into a compact summary, with
 * the deterministic demo pack (the pure twin compile) preserved as the fallback
 * (`source: "live" | "demo"`).
 *
 * THE WALL (CLAUDE.md §2): a READ only — the ContextRouter reads the ContextGraph view; the
 * emitted pack ALWAYS forbids /kernel/** /mirror/**. A truth-write never originates here; the
 * pack is below the line. context_pack_get is a below-the-line read of the `context` schema.
 *
 * DETERMINISM-FIRST (§6/§8): the decoder + the demo fallback (the same pure compile() the Go
 * router runs) are pure; a malformed / undispatched / refused answer yields the demo pack.
 */

/** A compact live ContextPack summary — the context_pack_get output, decoded ONCE. */
export interface LiveContextPackView {
	goal: string;
	branch: string;
	affectedLayers: string[];
	allowedPaths: string[];
	forbiddenPaths: string[];
	stopCondition: string;
	hash: string;
	source: Source;
}

// The decoder is the SINGLE declaration of the live pack summary shape (never double-typed).
const packDecoder: Decoder<{
	goal: string;
	branch: string;
	affectedLayers: string[];
	allowedPaths: string[];
	forbiddenPaths: string[];
	stopCondition: string;
	hash: string;
}> = (raw) => {
	if (!isObject(raw)) return null;
	const goal = str(raw.goal);
	const branch = str(raw.branch);
	const stopCondition = str(raw.stop_condition);
	const hash = str(raw.hash);
	const affectedLayers = arr(str)(raw.affected_layers);
	if (
		goal === null ||
		branch === null ||
		stopCondition === null ||
		hash === null ||
		affectedLayers === null
	) {
		return null;
	}
	// boundaries carries the wall paths; tolerate either a nested object or flat fields.
	const boundaries = isObject(raw.boundaries) ? raw.boundaries : raw;
	const allowedPaths = arr(str)(boundaries.allowed_paths);
	const forbiddenPaths = arr(str)(boundaries.forbidden_paths);
	if (allowedPaths === null || forbiddenPaths === null) return null;
	return {
		goal,
		branch,
		affectedLayers,
		allowedPaths,
		forbiddenPaths,
		stopCondition,
		hash,
	};
};

/** The deterministic demo pack — the same pure compile() the Go ContextRouter runs. */
function demoPack(): {
	goal: string;
	branch: string;
	affectedLayers: string[];
	allowedPaths: string[];
	forbiddenPaths: string[];
	stopCondition: string;
	hash: string;
} {
	const pack = compile(CHECKOUT_GOAL, "main", CHECKOUT_GRAPH);
	return {
		goal: pack.goal,
		branch: pack.branch,
		affectedLayers: pack.affectedLayers,
		allowedPaths: pack.boundaries.allowedPaths,
		forbiddenPaths: pack.boundaries.forbiddenPaths,
		stopCondition: pack.stopCondition,
		hash: pack.hash,
	};
}

/** liveContextPack reads the active project's compiled pack (live → demo fallback). */
export async function liveContextPack(): Promise<LiveContextPackView> {
	const scope = await panelScope();
	const { data, source } = await readVia(
		scope,
		"context_pack_get",
		{},
		packDecoder,
		demoPack(),
	);
	// The wall is rendered, never absent: even a live pack always forbids /kernel/** /mirror/**.
	const forbiddenPaths =
		data.forbiddenPaths.length === 0
			? [...WALL_FORBIDDEN_PATHS]
			: data.forbiddenPaths;
	const stopCondition =
		data.stopCondition === "" ? STOP_CONDITION : data.stopCondition;
	return { ...data, forbiddenPaths, stopCondition, source };
}
