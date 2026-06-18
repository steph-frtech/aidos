"use server";

import {
	FACET_NAME,
	type FacetLetter,
	type FacetMirror,
} from "@/lib/facetcomplete";
import {
	DEMO_LAYERS,
	DEMO_MIRRORS,
	demoCheck,
	gatewayCheckArgs,
} from "@/lib/facetcomplete-data";
import type { Source } from "@/lib/gateway-sdk";
import { readVia } from "@/lib/gateway-sdk";
import { panelScope } from "@/lib/panelScope";
import { checkDecoder, type LiveFacetMonster, type LiveResult } from "./live";

/**
 * Server Actions for the /facet-completeness Workbench panel (FK04 — la complétude facet-aware).
 *
 * THE STEP (ROADMAP-fke FK04): the completeness law made FACET-AWARE — for EVERY instantiated
 * facet of EVERY layer a living proof PAIR must exist. A required pair missing/divergent on ANY
 * instantiated facet is a MONSTER (a security hole, a perf regression, a lossy migration, an
 * unproven invariant), exactly like a missing functional test. X is soft (advisory).
 *
 * S59 CUTOVER (ADR 0092 — the Go engine is the SINGLE live source). `checkAction` now reads the
 * LIVE verdict from the Go facet-completeness MCP server through the passerelle
 * (`readVia(scope, "check", …)`, the dispatched below-the-line read), over the demo cut with the
 * optional fault-injected pair already removed from the mirrors. The twin
 * `lib/facetcomplete.computeFacetCompleteness()` is preserved ONLY as the deterministic demo
 * fallback (`demoCheck`, `source:"live"|"demo"`) in lib/facetcomplete-data.ts — never as the live
 * source. The `readVia` frontier import keeps the T5 cliquet (twin-as-live-fitness) GREEN.
 *
 * The panel is action-capable (CLAUDE.md §7 ui-completeness): a FAULT-INJECTION control — pick a
 * facet to REMOVE its pair from the demo cut, run the law, and watch the monster appear. THE WALL
 * (§2): the action WRITES NOTHING — `check` is a below-the-line read; the facet-set is set at the
 * legal FK02 door, never here. A monster is a SIGNAL → idea → mirror → /goal, never a write.
 *
 * DETERMINISM-FIRST (§6/§8): the decoder + the demo fallback (the same pure twin compute the Go
 * engine reproduces) are pure; a malformed / undispatched / refused answer yields the demo verdict.
 */

export interface MonsterView {
	layerId: string;
	facet: string;
	facetName: string;
	advisory: boolean;
}

export interface CompletenessView {
	ok: boolean;
	error?: string;
	verdict?: "COMPLETE" | "RED_MONSTER";
	/** whether the verdict came from the live gateway or the deterministic demo fallback. */
	source?: Source;
	/** the facet pair that was REMOVED (fault-injected), if any. */
	removed?: { layerId: string; facet: string; facetName: string };
	facetMonsters: MonsterView[];
	advisory: MonsterView[];
}

const empty: CompletenessView = { ok: false, facetMonsters: [], advisory: [] };

function toViews(result: LiveResult): {
	facetMonsters: MonsterView[];
	advisory: MonsterView[];
} {
	const map = (ms: LiveFacetMonster[]): MonsterView[] =>
		ms.map((m) => ({
			layerId: m.layerId,
			facet: m.facet,
			facetName: FACET_NAME[m.facet as FacetLetter] ?? m.facet,
			advisory: m.advisory,
		}));
	return {
		facetMonsters: map(result.facetMonsters),
		advisory: map(result.advisory),
	};
}

/**
 * checkAction is the action-capable control behind FK04 (CLAUDE.md §7 ui-completeness): it reads
 * the facet-aware completeness verdict over the demo cut from the LIVE Go engine (passerelle
 * `check` tool), falling back to the deterministic twin demo. The form may name ONE
 * (layerId, facet) pair to REMOVE (fault-injection) — its living mirror is dropped, so that facet
 * loses its pair and a monster appears. With nothing removed, the conformant demo cut PASSES
 * (COMPLETE). WRITES NOTHING (below-the-line read).
 */
export async function checkAction(
	_prev: CompletenessView,
	formData: FormData,
): Promise<CompletenessView> {
	const removeLayer = String(formData.get("removeLayer") ?? "");
	const removeFacet = String(formData.get("removeFacet") ?? "");

	let mirrors: FacetMirror[] = DEMO_MIRRORS;
	let removed: CompletenessView["removed"];

	if (removeLayer && removeFacet) {
		const before = mirrors.length;
		mirrors = DEMO_MIRRORS.filter(
			(m) =>
				!(
					m.reflectsId === removeLayer &&
					m.facet === removeFacet &&
					m.liveness === "alive"
				),
		);
		if (mirrors.length === before) {
			return {
				...empty,
				ok: false,
				error: `aucune paire vivante ${removeFacet} sur ${removeLayer} à retirer`,
			};
		}
		removed = {
			layerId: removeLayer,
			facet: removeFacet,
			facetName: FACET_NAME[removeFacet as FacetLetter] ?? removeFacet,
		};
	}

	const scope = await panelScope();
	// LIVE read through the passerelle (the dispatched facet-completeness `check` tool); the twin
	// demoCheck() over the (fault-injected) cut is the deterministic fallback — ADR 0092. The demo
	// fallback is the SAME cut, so the source flip never changes the verdict, only its provenance.
	const fallback = demoCheck(DEMO_LAYERS, mirrors);
	const { data, source } = await readVia(
		scope,
		"check",
		gatewayCheckArgs(DEMO_LAYERS, mirrors),
		checkDecoder,
		{
			verdict: fallback.verdict,
			facetMonsters: fallback.facetMonsters,
			advisory: fallback.advisory,
		},
	);
	const { facetMonsters, advisory } = toViews(data);
	return {
		ok: true,
		verdict: data.verdict,
		source,
		removed,
		facetMonsters,
		advisory,
	};
}
