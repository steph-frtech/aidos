/**
 * The semantic merge — the Workbench /semantic-merge source (AIDOS step S25).
 *
 * KRD §122/§130 + the `no_merge_without_semantic_green` KRDCore law (§82.2): merging two truth
 * branches of the version DAG is a SEMANTIC operation, not a textual one. The MIRROR decides the
 * conflict — RED on the MERGED CUT (the recursive aggregate, §109) — never a line-level three-way
 * diff. A merge git would call "clean" (disjoint deltas, a fast-forward / auto-merge) is BLOCKED
 * when its merged kernel-cut reddens a mirror; and two branches touching DISJOINT lines can break the
 * SAME emergent invariant of a shared parent — a conflict the text diff never sees.
 *
 * THE DONE CRITERION: a textually-clean merge WITH a red mirror on the merged cut is a `conflict` and
 * is BLOCKED. Text-cleanliness NEVER overrides a red mirror.
 *
 * This module is the DECLARED TWIN of the Go decider back/archive/merge/MergeSemantic — the SAME
 * union-selection merged cut, the SAME coherent-cut oracle (a merged cut is clean iff every sensor
 * passes AND every link resolves green, mirroring phases.IsStable / S17 Resolve / the S07 verdict),
 * the SAME closed status set {clean, conflict, unresolvable}. One semantics, no drift — so the
 * /semantic-merge panel renders EXACTLY the verdict the Go MergeSemantic / the /merge-semantic
 * gesture compute. (The merged_cut@hash shown here is a readable local digest mirroring the SHAPE of
 * the Go records.Hash body; the authoritative content address is the Go hash, surfaced when wired —
 * a by-design forward dependency, an OpenQuestion.)
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): pure functions over their input — no clock, no rng, no I/O —
 * so the same (base, left, right) always yields the same MergeResult. The reproducibility mirror
 * lib/semantic-merge.test.ts (fast-check) pins determinism, any-red⇒conflict, all-green⇒clean,
 * identity⇒clean-no-op, text-never-overrides-red, unresolvable⇒no-fabricated-clean, and totality.
 *
 * READ-ONLY (CLAUDE.md §7 ui-completeness, the wall): /semantic-merge PROJECTS the verdict; a `clean`
 * merged cut is a CANDIDATE stable phase whose recording rides the S20 ChangeSet path under the
 * `aidos` writer role — never a write from this screen. A `conflict` is BLOCKED; resolving it is an
 * override decision (human, ChangeSet + ADR + provenance), surfaced via requires_authority.
 */

/** A mirror verdict over the merged cut (S07 shape: id + pass), mirrors phases.SensorStatus. */
export interface SensorStatus {
	id: string;
	pass: boolean;
}

/** A selection: constraintId → version, mirrors phases.Cut. */
export type Cut = Record<string, string>;

/** The common-ancestor stable phase (S23), mirrors merge.Base. */
export interface Base {
	id: string;
	cut: Cut;
	sensors: SensorStatus[];
}

/** One side of the merge (left or right), a content-addressed branch head, mirrors merge.Branch. */
export interface Branch {
	/** The common-ancestor id this branch descends from. Must equal base.id for a mappable merge. */
	ancestor: string;
	/** The branch's selection deltas vs base (constraintId → version). */
	deltas: Cut;
	/** The mirror verdicts this branch adds over the merged cut (e.g. a reopened emergent invariant). */
	addedSensors: SensorStatus[];
}

/** The closed merged-cut verdict set KRD names (§122). There is no fourth status. */
export type MergeStatus = "clean" | "conflict" | "unresolvable";

/** The verdict, mirrors merge.MergeResult. */
export interface MergeResult {
	status: MergeStatus;
	/** The mirror ids that reddened the merged cut, sorted. Empty unless conflict. */
	conflictingMirrors: string[];
	/** The content address of the proposed merged cut. Present for clean/conflict; empty unresolvable. */
	mergedCutHash: string;
	/** True iff conflict — resolution is an override (human, S16), never an auto-merge. */
	requiresAuthority: boolean;
	/** The honest reason MergeSemantic could not decide (set iff unresolvable). */
	openQuestion?: string;
}

/** mergedCut assembles the UNION SELECTION base + left's deltas + right's deltas (KRD §122). */
function mergedCut(base: Base, left: Branch, right: Branch): Cut {
	return { ...base.cut, ...left.deltas, ...right.deltas };
}

/**
 * mergedSensors de-duplicates base + left + right verdicts by id, keeping the LAST in (base, left,
 * right) order — so a branch that reopens an emergent invariant (turns a base-green sensor RED) is
 * reflected. Sorted by id (the canonical, byte-stable order mirroring the Go decider).
 */
function mergedSensors(
	base: Base,
	left: Branch,
	right: Branch,
): SensorStatus[] {
	const byId = new Map<string, boolean>();
	for (const s of base.sensors) byId.set(s.id, s.pass);
	for (const s of left.addedSensors) byId.set(s.id, s.pass);
	for (const s of right.addedSensors) byId.set(s.id, s.pass);
	return [...byId.entries()]
		.map(([id, pass]) => ({ id, pass }))
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * mergedCutHash is a readable local digest over the canonical merged-cut body (mirroring the SHAPE
 * of the Go records.Hash body: kind + cut + sensor verdicts + stable + reasons). Deterministic. The
 * authoritative content address is the Go hash; this is the offline twin so the panel renders a
 * stable id.
 */
function mergedCutHash(
	cut: Cut,
	sensors: SensorStatus[],
	reasons: string[],
): string {
	const body = JSON.stringify({
		kind: "phase",
		cut: Object.fromEntries(
			Object.entries(cut).sort(([a], [b]) => (a < b ? -1 : 1)),
		),
		sensorStatus: sensors,
		stable: reasons.length === 0,
		reasons,
	});
	let h = 0;
	for (let i = 0; i < body.length; i++) {
		h = (Math.imul(31, h) + body.charCodeAt(i)) | 0;
	}
	return `cut-${(h >>> 0).toString(16)}`;
}

/**
 * mergeSemantic is the PURE semantic-merge decider — the deterministic twin of the Go
 * back/archive/merge/MergeSemantic (KRD §122/§130). It:
 *
 *   - checks the merge is MAPPABLE (left.ancestor == right.ancestor == base.id, KRD §120). A
 *     missing/mismatched ancestor is `unresolvable` + an OpenQuestion — NEVER a guessed `clean`.
 *   - assembles the merged cut (union selection) + the merged sensor verdicts, then applies the
 *     coherent-cut oracle (mirroring phases.IsStable): the cut is CLEAN iff every sensor passes (no
 *     red mirror). Any red sensor reddens the cut ⇒ `conflict`, named in conflictingMirrors, BLOCKED,
 *     requiresAuthority. THE done criterion: disjoint deltas (git would auto-merge) never override a
 *     red merged-cut mirror.
 */
export function mergeSemantic(
	base: Base,
	left: Branch,
	right: Branch,
): MergeResult {
	if (
		!base.id ||
		!left.ancestor ||
		!right.ancestor ||
		left.ancestor !== base.id ||
		right.ancestor !== base.id
	) {
		return {
			status: "unresolvable",
			conflictingMirrors: [],
			mergedCutHash: "",
			requiresAuthority: false,
			openQuestion:
				"no common ancestor: left and right must both descend from base (KRD §120) — refuses to guess `clean` for an unmappable merge",
		};
	}

	const cut = mergedCut(base, left, right);
	const sensors = mergedSensors(base, left, right);
	const reasons = sensors
		.filter((s) => !s.pass)
		.map((s) => s.id)
		.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
	const hash = mergedCutHash(cut, sensors, reasons);

	if (reasons.length === 0) {
		return {
			status: "clean",
			conflictingMirrors: [],
			mergedCutHash: hash,
			requiresAuthority: false,
		};
	}
	return {
		status: "conflict",
		conflictingMirrors: reasons,
		mergedCutHash: hash,
		requiresAuthority: true,
	};
}
