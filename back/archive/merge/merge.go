// Package merge is the Archive's SEMANTIC-MERGE decider (KRD §122/§130, the
// `no_merge_without_semantic_green` KRDCore law §82.2): merging two truth branches of the version
// DAG is a SEMANTIC operation, not a textual one. The MIRROR decides the conflict — RED on the
// MERGED CUT (the recursive aggregate, KRD §109) — never a line-level three-way diff. A merge git
// would call "clean" (no overlapping hunks, a fast-forward / auto-merge) is BLOCKED when its merged
// kernel-cut reddens a mirror; and two branches touching DISJOINT lines can break the SAME emergent
// invariant of a shared parent — a conflict the text diff never sees (KRD §122).
//
// THE DONE CRITERION: a textually-clean merge WITH a red mirror on the merged cut is a `conflict`
// and is BLOCKED. The text-cleanliness pre-check NEVER overrides a red mirror; it exists only to
// prove the "clean text yet blocked" case — the mirror, not the diff, is the oracle.
//
// REUSE, DON'T REINVENT (CLAUDE.md §6/§8; the wall):
//   - the merged-cut verdict is decided ONLY by S23's phases.IsStable (the coherent-cut oracle,
//     which itself reuses S17 links.Resolve + the S07 sensor verdict) — this package NEVER
//     re-implements or forks the aggregate (S18), the propagation (S19) or the red wave (S22); it
//     hands the merged cut to IsStable and reads back the verdict + reasons;
//   - the merged-cut content address is S02's records.Canonicalize + records.Hash, ridden through
//     phases.StablePhase.Version() (a records.KindPhase body) — NOT a forked hash scheme;
//   - the merged cut is the UNION SELECTION base + left's deltas + right's deltas, assembled here
//     deterministically (last-writer per constraint id, left before right) — the only logic this
//     package owns. Where the three DAG nodes come from (the SELECT-only role / the S23/S24 DAG
//     refs) is handed in, never fetched.
//
// PURE (CLAUDE.md §6 determinism-first): MergeSemantic is a TOTAL, deterministic function of
// (base, left, right, sensors) — no DB, no clock, no rng, no I/O, NO WRITE. Same input ⇒ same
// MergeResult (incl. a byte-identical merged_cut@hash). It NEVER PANICS: an input it cannot map
// (a missing common ancestor, an unevaluable cut) yields an explicit `unresolvable → OpenQuestion`,
// NEVER a guessed `clean` and NEVER an auto-merge of the unknown. The rapid property mirror pins
// determinism, totality, any-red⇒conflict, all-green⇒clean, identity⇒clean-no-op, text-never-
// overrides-red, no-panic and no-write.
//
// READ-ONLY against truth (the wall, CLAUDE.md §2): this package writes nothing. A `clean` merged
// cut is a CANDIDATE stable phase (S23) — recording it as a DAG node rides the existing S20
// ChangeSet path under the privileged `aidos` writer role, never the agent, never from here. A
// `conflict` is BLOCKED; resolving it is an OVERRIDE decision (human, above the waterline —
// ChangeSet + ADR + provenance, KRD §11/§12), surfaced via requires_authority (referenced from S16).
package merge

import (
	"sort"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/kernel/links"
)

// Status is the merged-cut verdict — a CLOSED set KRD names (§122). There is no fourth status; the
// rapid invariant pins it. Unresolvable is the honest "cannot decide" (an OpenQuestion), NEVER a
// guessed clean. A merge is exactly one of these three.
type Status string

const (
	// StatusClean — the merged cut's recursive aggregate is GREEN: every link resolves and every
	// mirror (own + composed) is green at once. The merge may proceed (a candidate stable phase, S23).
	StatusClean Status = "clean"
	// StatusConflict — the merged cut reddens AT LEAST one mirror (KRD §122). The merge is BLOCKED;
	// resolution is an override decision (human), never an auto-merge.
	StatusConflict Status = "conflict"
	// StatusUnresolvable — MergeSemantic cannot map the merge (no common ancestor, an unevaluable
	// cut). It is an explicit OpenQuestion — NEVER a fabricated clean, NEVER an auto-merge.
	StatusUnresolvable Status = "unresolvable"
)

// Branch is one side of the merge (left or right): a content-addressed kernel-cut head from S23/S24,
// reduced to what MergeSemantic needs to assemble the merged cut and ask the oracle. It carries the
// branch's selection deltas (constraintId → version it changes/adds vs base), the links it
// introduces, and the sensors (mirror verdicts) it adds. Where it is loaded from (the SELECT-only
// role / the DAG-node refs) is handed in — MergeSemantic stays pure.
type Branch struct {
	// Ancestor is the id of the common-ancestor stable phase this branch descends from. A merge is
	// only mappable when left.Ancestor == right.Ancestor == base.ID (a shared base, KRD §120); a
	// mismatch is `unresolvable`, never a guessed clean.
	Ancestor string `json:"ancestor"`
	// Deltas is the branch's selection changes vs base: constraintId → the version it pins. Disjoint
	// keys across left/right are a textually-clean pair (git would auto-merge); overlapping keys are a
	// textual conflict. Either way the MIRROR — not this map — decides the merge (KRD §122).
	Deltas phases.Cut `json:"deltas"`
	// Links are the links this branch introduces over its cut (S17 shape). They join base's links in
	// the merged cut; a stale/absent link reddens the merged cut via phases.IsStable.
	Links []links.Link `json:"links,omitempty"`
	// AddedSensors are the mirror verdicts (S07 shape) this branch adds over the merged cut — e.g. the
	// emergent invariant a control change reopens (S18/§109). A red added sensor reddens the cut.
	AddedSensors []phases.SensorStatus `json:"added_sensors,omitempty"`
}

// Base is the common-ancestor stable phase (S23) the two branches diverged from: its id, its cut,
// the links and sensors already over it, and the heads map S17 links.Resolve reads. It is handed in
// (the SELECT-only role / a DAG-node ref), never fetched.
type Base struct {
	// ID is the base stable phase's content address (S02/S23). left/right must both descend from it.
	ID string `json:"id"`
	// Cut is the base selection (constraintId → version). The merged cut starts from this.
	Cut phases.Cut `json:"cut"`
	// Links are the links already over the base cut (S17 shape).
	Links []links.Link `json:"links,omitempty"`
	// Sensors are the mirror verdicts already over the base cut (S07 shape).
	Sensors []phases.SensorStatus `json:"sensors,omitempty"`
	// Heads is the head-of-target map S17 links.Resolve reads to decide staleness (handed in).
	Heads links.Heads `json:"heads,omitempty"`
}

// MergeResult is MergeSemantic's output (KRD §122/§130). status is the closed verdict;
// ConflictingMirrors names the mirror ids that go RED on the merged cut (empty unless conflict);
// MergedCutHash is the content address of the proposed coherent cut (S02; empty when unresolvable);
// RequiresAuthority is true on a conflict — its resolution is an override decision (referenced from
// S16). OpenQuestion carries the honest reason when unresolvable. It is the COMPUTED verdict, never
// a boolean the package then satisfies (anti-Goodhart, CLAUDE.md §8).
type MergeResult struct {
	// Status is the closed merged-cut verdict: clean | conflict | unresolvable.
	Status Status `json:"status"`
	// ConflictingMirrors names every mirror/link id that reddens the merged cut, sorted. Empty unless
	// Status == conflict (the reasons from phases.IsStable over the merged cut).
	ConflictingMirrors []string `json:"conflicting_mirrors"`
	// MergedCutHash is the content address (S02) of the proposed merged cut (records.KindPhase body).
	// Present for clean and conflict (the cut is well-formed); empty for unresolvable (no cut to map).
	MergedCutHash string `json:"merged_cut_hash"`
	// RequiresAuthority is true iff Status == conflict — resolution is an override (human, S16),
	// never an auto-merge.
	RequiresAuthority bool `json:"requires_authority"`
	// OpenQuestion is the honest reason MergeSemantic could not decide (set iff unresolvable).
	OpenQuestion string `json:"open_question,omitempty"`
}

// mergedCut assembles the UNION SELECTION base + left's deltas + right's deltas (KRD §122). It is
// deterministic: base first, then left's deltas, then right's deltas (a stable, declared order —
// last-writer-wins per constraint id, but overlapping keys are surfaced by the mirror regardless).
// It mutates nothing (a fresh map), so MergeSemantic stays pure.
func mergedCut(base Base, left, right Branch) phases.Cut {
	out := phases.Cut{}
	for k, v := range base.Cut {
		out[k] = v
	}
	for k, v := range left.Deltas {
		out[k] = v
	}
	for k, v := range right.Deltas {
		out[k] = v
	}
	return out
}

// mergedLinks concatenates the links over the merged cut: base's links + left's + right's. A
// stale/absent link reddens the merged cut through phases.IsStable (S17 Resolve), so a merge that
// dangles a link is a conflict — the mirror decides.
func mergedLinks(base Base, left, right Branch) []links.Link {
	out := make([]links.Link, 0, len(base.Links)+len(left.Links)+len(right.Links))
	out = append(out, base.Links...)
	out = append(out, left.Links...)
	out = append(out, right.Links...)
	return out
}

// mergedSensors concatenates the mirror verdicts over the merged cut: base's + left's added +
// right's added, de-duplicated by id keeping the LAST verdict in (base, left, right) order so a
// branch that reopens an emergent invariant (turns a base-green sensor RED) is reflected. A red
// sensor here is a red mirror on the merged cut (KRD §109/§122).
func mergedSensors(base Base, left, right Branch) []phases.SensorStatus {
	byID := map[string]phases.SensorStatus{}
	var order []string
	add := func(s phases.SensorStatus) {
		if _, seen := byID[s.ID]; !seen {
			order = append(order, s.ID)
		}
		byID[s.ID] = s
	}
	for _, s := range base.Sensors {
		add(s)
	}
	for _, s := range left.AddedSensors {
		add(s)
	}
	for _, s := range right.AddedSensors {
		add(s)
	}
	sort.Strings(order)
	out := make([]phases.SensorStatus, 0, len(order))
	for _, id := range order {
		out = append(out, byID[id])
	}
	return out
}

// MergeSemantic is the PURE semantic-merge decider (KRD §122/§130). It is total, deterministic and
// never writes:
//
//   - it first checks the merge is MAPPABLE — left and right must share the same common ancestor as
//     base (KRD §120). A missing/mismatched ancestor is `unresolvable → OpenQuestion`, NEVER a
//     guessed clean and NEVER an auto-merge of the unknown (CLAUDE.md honesty rule).
//   - it assembles the MERGED CUT (union selection base + left + right deltas; links + sensors
//     concatenated) and hands it to S23's phases.IsStable — the SAME coherent-cut oracle a stable
//     phase uses (which reuses S17 Resolve + the S07 verdict). It does NOT re-implement the aggregate
//     (S18), the propagation (S19) or the red wave (S22).
//   - GREEN merged-cut aggregate ⇒ `clean`, conflicting_mirrors == [] (a candidate stable phase, S23).
//   - ANY red mirror on the merged cut ⇒ `conflict` (the mirror decides, never the text diff): the
//     red ids are phases.IsStable's reasons; the merge is BLOCKED; RequiresAuthority is true
//     (resolution is an override, S16). THE DONE CRITERION: a textually-clean pair (disjoint deltas,
//     git would auto-merge) with a red merged-cut mirror is `conflict` — text-cleanliness never
//     overrides a red mirror.
//
// The merged_cut@hash is the content address (S02) of the proposed cut, present for clean/conflict.
// MergeSemantic never panics (a nil cut/links/sensors yields a verdict; phases.IsStable is total).
func MergeSemantic(base Base, left, right Branch, heads links.Heads) MergeResult {
	// Mappability (KRD §120): both branches must descend from the same base. A missing common
	// ancestor is the honest unresolvable — never a fabricated clean.
	if base.ID == "" || left.Ancestor == "" || right.Ancestor == "" ||
		left.Ancestor != base.ID || right.Ancestor != base.ID {
		return MergeResult{
			Status:             StatusUnresolvable,
			ConflictingMirrors: []string{},
			OpenQuestion: "no common ancestor: left and right must both descend from base " +
				"(KRD §120) — MergeSemantic refuses to guess `clean` for an unmappable merge",
		}
	}

	cut := mergedCut(base, left, right)
	ls := mergedLinks(base, left, right)
	sensors := mergedSensors(base, left, right)

	// The base's heads map drives S17 link staleness; the caller may also hand a merged heads map.
	h := heads
	if h == nil {
		h = base.Heads
	}

	// The ORACLE: the same coherent-cut decision a stable phase uses (S23 → S17 Resolve + S07
	// verdict + the recursive aggregate referenced from S18). The mirror, not the text, decides.
	phase := phases.IsStable(cut, h, ls, sensors)

	// The merged-cut content address (S02), via the phase's records.KindPhase body — never a forked
	// hash. A malformed body would error; that is itself unresolvable (we never fabricate a clean).
	hash, err := phase.Version()
	if err != nil {
		return MergeResult{
			Status:             StatusUnresolvable,
			ConflictingMirrors: []string{},
			OpenQuestion: "unevaluable merged cut: the content address could not be computed (" +
				err.Error() + ") — MergeSemantic refuses to guess `clean`",
		}
	}

	if phase.Stable {
		return MergeResult{
			Status:             StatusClean,
			ConflictingMirrors: []string{},
			MergedCutHash:      hash,
			RequiresAuthority:  false,
		}
	}

	// At least one mirror reddens the merged cut (KRD §122): BLOCKED, an override decision (S16).
	reasons := phase.Reasons
	if reasons == nil {
		reasons = []string{}
	}
	return MergeResult{
		Status:             StatusConflict,
		ConflictingMirrors: reasons,
		MergedCutHash:      hash,
		RequiresAuthority:  true,
	}
}
