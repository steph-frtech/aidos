"use server";

import {
	computeFacetCompleteness,
	DEMO_LAYERS,
	DEMO_MIRRORS,
	FACET_NAME,
	type FacetLetter,
	type FacetMirror,
	type Result,
} from "@/lib/facetcomplete";

/**
 * Server Actions for the /facet-completeness Workbench panel (FK04 — la complétude facet-aware).
 *
 * THE STEP (ROADMAP-fke FK04): the completeness law made FACET-AWARE — for EVERY instantiated
 * facet of EVERY layer a living proof PAIR must exist. A required pair missing/divergent on ANY
 * instantiated facet is a MONSTER (a security hole, a perf regression, a lossy migration, an
 * unproven invariant), exactly like a missing functional test. X is soft (advisory).
 *
 * The panel is action-capable (CLAUDE.md §7 ui-completeness): a FAULT-INJECTION control bound
 * to the pure twin lib/facetcomplete — pick a facet to REMOVE its pair from the demo cut, run
 * the law, and watch the monster appear. THE WALL (§2): the action WRITES NOTHING — it computes
 * the verdict over a projection; the facet-set is set at the legal FK02 door, never here.
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
	/** the facet pair that was REMOVED (fault-injected), if any. */
	removed?: { layerId: string; facet: string; facetName: string };
	facetMonsters: MonsterView[];
	advisory: MonsterView[];
}

const empty: CompletenessView = { ok: false, facetMonsters: [], advisory: [] };

function toViews(result: Result): {
	facetMonsters: MonsterView[];
	advisory: MonsterView[];
} {
	const map = (ms: Result["facetMonsters"]): MonsterView[] =>
		ms.map((m) => ({
			layerId: m.layerId,
			facet: m.facet,
			facetName: FACET_NAME[m.facet],
			advisory: m.advisory,
		}));
	return {
		facetMonsters: map(result.facetMonsters),
		advisory: map(result.advisory),
	};
}

/**
 * checkAction is the action-capable control behind FK04 (CLAUDE.md §7 ui-completeness): it runs
 * the facet-aware completeness law over the demo cut. The form may name ONE (layerId, facet)
 * pair to REMOVE (fault-injection) — its living mirror is dropped, so that facet loses its pair
 * and a monster appears. With nothing removed, the conformant demo cut PASSES (COMPLETE). PURE,
 * WRITES NOTHING.
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

	const result = computeFacetCompleteness(DEMO_LAYERS, mirrors);
	const { facetMonsters, advisory } = toViews(result);
	return {
		ok: true,
		verdict: result.verdict,
		removed,
		facetMonsters,
		advisory,
	};
}
