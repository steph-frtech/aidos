/**
 * docmirror — FK07 (ROADMAP-fke, FKE-1.3 décision (a)): the TS twin of the Go pure
 * comparator `Compare(human s2, derived s9)` (back/kernel/mirror/docmirror). It runs the
 * DOC-MIRROR — a STRUCTURAL set-comparison of the human-authored upper half of a doc (s2)
 * against the code-derived lower half (s9, from FK06) — and the DATA-MIRROR (s3 ↔ s7).
 *
 * THE JUDGE IS A CALCULATION (§8). Two planes, only one judges:
 *   - STRUCTURAL (the judge, BLOCKING): concepts/behaviour-IDs/errors as three sets; a
 *     symmetric set-difference is a blocking divergence. Same pair → same verdict.
 *   - PROSE (advisory, NEVER blocks): behaviour descriptions; a drift is an advisory only.
 *     The LLM may SIGNAL prose drift — it NEVER ARBITRATES. Editing only the prose stays
 *     GREEN.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8). compare is PURE + TOTAL: it sorts/dedupes both
 * sides, diffs the sets, and renders a canonical report — same pair ⇒ same verdict,
 * invariant under input ordering. The Go side is authoritative; this twin mirrors it for
 * the Workbench and carries its own reproducibility property (docmirror.test.ts). THE WALL
 * (§2): it reads two docs and writes nothing — the report is a projection, never a truth.
 */

import type { Behavior, S9 } from "./derivedoc";

export type Plane = "structural" | "prose";
export type Side = "human_missing" | "code_missing" | "";
export type Section = "concepts" | "behaviors" | "errors";

export interface HumanDoc {
	kernel_id: string;
	concepts?: string[];
	behaviors?: Behavior[];
	errors?: string[];
}

export interface Divergence {
	plane: Plane;
	section: Section;
	key: string;
	side?: Side;
	human_prose?: string;
	code_prose?: string;
}

export interface Report {
	kernel_id: string;
	pairing_mismatch: boolean;
	structural_divergences: Divergence[];
	prose_advisories: Divergence[];
	verdict: "green" | "red";
}

function toSet(xs: string[] | undefined): Set<string> {
	const s = new Set<string>();
	for (const x of xs ?? []) if (x) s.add(x);
	return s;
}

function behaviorIDs(bs: Behavior[] | undefined): Set<string> {
	const s = new Set<string>();
	for (const b of bs ?? []) if (b.id) s.add(b.id);
	return s;
}

/** diffSet renders the symmetric difference: in human-not-code → code_missing (doc ahead),
 *  in code-not-human → human_missing (code ahead). */
function diffSet(
	section: Section,
	human: Set<string>,
	code: Set<string>,
): Divergence[] {
	const out: Divergence[] = [];
	for (const k of human) {
		if (!code.has(k))
			out.push({ plane: "structural", section, key: k, side: "code_missing" });
	}
	for (const k of code) {
		if (!human.has(k))
			out.push({ plane: "structural", section, key: k, side: "human_missing" });
	}
	return out;
}

/** proseDrift: behaviours present on BOTH sides whose descriptions differ → advisory. */
function proseDrift(
	human: Behavior[] | undefined,
	code: Behavior[] | undefined,
): Divergence[] {
	const codeByID = new Map<string, string>();
	for (const b of code ?? []) codeByID.set(b.id, b.description);
	const out: Divergence[] = [];
	for (const hb of human ?? []) {
		const cd = codeByID.get(hb.id);
		if (cd === undefined) continue; // structural — handled by diffSet on the IDs.
		if (hb.description !== cd) {
			out.push({
				plane: "prose",
				section: "behaviors",
				key: hb.id,
				human_prose: hb.description,
				code_prose: cd,
			});
		}
	}
	return out;
}

function sortDivergences(ds: Divergence[]): Divergence[] {
	return [...ds].sort((a, b) => {
		if (a.section !== b.section) return a.section < b.section ? -1 : 1;
		if (a.key !== b.key) return a.key < b.key ? -1 : 1;
		const sa = a.side ?? "";
		const sb = b.side ?? "";
		if (sa !== sb) return sa < sb ? -1 : 1;
		return a.plane < b.plane ? -1 : a.plane > b.plane ? 1 : 0;
	});
}

/**
 * compare runs the doc-mirror (FK07 twin). PURE + TOTAL + deterministic. The structural
 * plane is the judge (BLOCKING); the prose plane is advisory (NEVER blocks).
 */
export function compare(human: HumanDoc, derived: S9): Report {
	const pairing_mismatch = human.kernel_id !== derived.kernel_id;
	const structural = sortDivergences([
		...diffSet("concepts", toSet(human.concepts), toSet(derived.concepts)),
		...diffSet("errors", toSet(human.errors), toSet(derived.errors)),
		...diffSet(
			"behaviors",
			behaviorIDs(human.behaviors),
			behaviorIDs(derived.behaviors),
		),
	]);
	const advisories = sortDivergences(
		proseDrift(human.behaviors, derived.behaviors),
	);
	const verdict: "green" | "red" =
		pairing_mismatch || structural.length > 0 ? "red" : "green";
	return {
		kernel_id: derived.kernel_id,
		pairing_mismatch,
		structural_divergences: structural,
		prose_advisories: advisories,
		verdict,
	};
}

/**
 * dataMirror DECLARES the s3 ↔ s7 comparator (FKE-1.3): the IDENTICAL structural engine
 * over entity/field sets. The s7 emitter is owned by a later entity/migration step; until
 * then it runs over the sets a caller supplies. Kind-prefixed strings ("entity:Order",
 * "field:Order.total").
 */
export function dataMirror(
	kernelId: string,
	s3: string[],
	s7: string[],
): Report {
	const structural = sortDivergences(diffSet("concepts", toSet(s3), toSet(s7)));
	return {
		kernel_id: kernelId,
		pairing_mismatch: false,
		structural_divergences: structural,
		prose_advisories: [],
		verdict: structural.length > 0 ? "red" : "green",
	};
}
