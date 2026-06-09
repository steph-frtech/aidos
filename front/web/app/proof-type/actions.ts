"use server";

import type { FacetLetter } from "@/lib/grid";
import {
	E_NAME,
	type ELevel,
	mapNToE,
	N_NAME,
	type NLevel,
	tag,
} from "@/lib/prooftype";

/**
 * Server Actions for the /proof-type Workbench panel (FK05 — l'expand E0-E7).
 *
 * THE STEP (ROADMAP-fke FK05): the N0-N5 → E0-E7 mapping declared as a pure function + the
 * additive, E-typed proof contract + the added types E4 (sécurité), E6 (runtime+rollback), E7
 * (formel). The *expand* step adds E-typing ALONGSIDE the N-levels (zéro miroir N existant
 * modifié); the schema switch is FK16.
 *
 * The panel is action-capable (CLAUDE.md §7 ui-completeness): a TAG-THE-KERNEL control bound to
 * the pure twin lib/prooftype — pick an N-level + the facets the kernel instantiates + the formal
 * flag, run the mapping, and watch the E-typed contract appear (E4 only via S, E6 via R/V, E7 via
 * the formal cap). THE WALL (§2): the action WRITES NOTHING — it derives the contract; the N is
 * preserved verbatim and the schema is untouched.
 */

export interface ELevelView {
	level: number;
	name: string;
}

export interface TagView {
	ok: boolean;
	error?: string;
	n?: string;
	nName?: string;
	fromN: ELevelView[];
	fromFacets: ELevelView[];
	required: ELevelView[];
	/** which required E-levels are the FK05-added types (E4/E6/E7) — surfaced for the screen. */
	added: ELevelView[];
}

const empty: TagView = {
	ok: false,
	fromN: [],
	fromFacets: [],
	required: [],
	added: [],
};

const VALID_N = new Set(["N0", "N1", "N2", "N3", "N4", "N5"]);
const VALID_FACETS = new Set(["F", "I", "S", "B", "R", "V", "M", "X"]);
const ADDED_TYPES = new Set<ELevel>([4, 6, 7]);

function toViews(es: ELevel[]): ELevelView[] {
	return es.map((e) => ({ level: e, name: E_NAME[e] }));
}

/**
 * tagAction is the action-capable control behind FK05 (CLAUDE.md §7 ui-completeness): it derives
 * a kernel's E-typed proof contract from a chosen N-level, the facets it instantiates, and the
 * formal-cap flag. The N is preserved verbatim (zéro miroir N modifié). PURE, WRITES NOTHING.
 */
export async function tagAction(
	_prev: TagView,
	formData: FormData,
): Promise<TagView> {
	const nLevel = String(formData.get("nLevel") ?? "");
	const requiresFormal = formData.get("requiresFormal") === "on";
	const rawFacets = formData.getAll("facets").map((f) => String(f));

	if (!VALID_N.has(nLevel)) {
		return { ...empty, error: `niveau N invalide : ${nLevel || "(vide)"}` };
	}
	const facets = rawFacets.filter((f) => VALID_FACETS.has(f)) as FacetLetter[];

	const t = tag({ nLevel: nLevel as NLevel, facets, requiresFormal });
	const required = t.e.required;

	return {
		ok: true,
		n: t.n,
		nName: N_NAME[t.n as NLevel] ?? t.n,
		fromN: toViews(t.e.fromN),
		fromFacets: toViews(t.e.fromFacets),
		required: toViews(required),
		added: toViews(required.filter((e) => ADDED_TYPES.has(e))),
	};
}

/** The full N→E mapping table (for the read-only reference panel). */
export async function mappingTable(): Promise<
	{ n: string; nName: string; e: ELevelView[] }[]
> {
	const rows: { n: string; nName: string; e: ELevelView[] }[] = [];
	for (const n of ["N0", "N1", "N2", "N3", "N4", "N5"] as NLevel[]) {
		rows.push({ n, nName: N_NAME[n], e: toViews(mapNToE(n)) });
	}
	return rows;
}
