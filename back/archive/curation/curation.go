// Package curation is the Archive's CURATION-POLICY decision (KRD §44.4): the pure
// classification that keeps the version DAG a LIVING MEMORY rather than an infinite dump
// (a `décharge`) by sorting each DAG node into ONE of three DECLARED bands — keep /
// compress / tombstone. It is the curator of the archive, not a garbage collector: critical
// history is NEVER destroyed — a tombstone MARKS a node, it does not DELETE it (append-only,
// KRD §12); a compress SUMMARIZES/compacts, it does not DROP the node.
//
// THE LAW (KRD §44.4): the three bands are DECLARED, never learned (CLAUDE.md §8). A node's
// verdict is decided by evaluating DECLARED membership predicates over the node METADATA the
// prior steps already carry (flags / kind / created_at) — there is no learned threshold, no
// model, no clock read inside the decision:
//
//	keep      = stable_phases ∪ incident_related_branches ∪ pareto_elites ∪ high_novelty_variants
//	compress  = failed_variants_after_30d ∪ duplicate_behaviors
//	tombstone = unsafe_branches ∪ obsolete_experiments
//
// PRECEDENCE (the safety ordering): tombstone wins over keep wins over compress. An UNSAFE
// or OBSOLETE node is tombstoned even if it is otherwise keep-worthy (an unsafe branch is
// never silently kept); a keep-worthy node (a stable phase, a pareto élite, incident-related,
// high-novelty) is kept even if it is also old/failed/duplicate (critical history is never
// compressed away). Only what is neither tombstone nor keep falls to compress; the rest is
// kept by default (the conservative base case — when in doubt, KEEP — never drop).
//
// PURE (CLAUDE.md §6/§8 determinism-first): Curate is a TOTAL, deterministic function of
// (nodes, policy, now) — no DB, no clock (now is a PARAMETER, never time.Now()), no rng, no
// I/O, NO WRITE. Same input ⇒ same []CurationDecision, byte-for-byte, replayable. It NEVER
// PANICS on a malformed node (a nil flags slice, an unparseable created_at) — it yields a
// verdict, never a crash. The rapid property mirror pins determinism, any-unsafe⇒tombstone,
// keep-band⇒keep, no-node-ever-dropped, content-addressed id, and totality.
//
// REUSE, DON'T REINVENT (CLAUDE.md §6; the wall): the decision's content address is S01/S02's
// records.Canonicalize + records.Hash, ridden through a records.KindPhase body — NOT a forked
// hash scheme. The node metadata (flags / kind / created_at) is the shape the prior steps
// carry, handed in — never fetched.
//
// READ-ONLY against truth (the wall, CLAUDE.md §2): this package writes nothing. Curate
// returns the []CurationDecision VALUE; recording a decision into dag.curation_decision (a
// truth schema ABOVE the line) is done ONLY through the privileged `aidos` writer role inside
// an approved ChangeSet (S20) — never the agent role, never in passing. A tombstone/compress
// is a DECISION ROW, never a DELETE/DROP on a DAG node.
package curation

import (
	"encoding/json"
	"sort"
	"time"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Verdict is the curation band a node is classified into — a CLOSED set KRD names (§44.4).
// There is no fourth verdict; the rapid invariant pins it.
type Verdict string

const (
	// VerdictKeep — the node is kept in the living memory: a stable phase, an incident-related
	// branch, a pareto élite, or a high-novelty variant (a stepping stone). The default when in
	// doubt (critical history is never dropped).
	VerdictKeep Verdict = "keep"
	// VerdictCompress — the node is summarized/compacted but STILL PRESENT (append-only): a
	// failed variant older than 30 days, or a duplicate behavior. compress yields the DECISION,
	// not the compacted artifact (that engine is a later step).
	VerdictCompress Verdict = "compress"
	// VerdictTombstone — the node is MARKED (not deleted) as unsafe or an obsolete experiment.
	// A tombstone is append-only — the node stays in the DAG, flagged, never destroyed (§12).
	VerdictTombstone Verdict = "tombstone"
)

// Flag is a piece of DECLARED node metadata the prior steps carry — the membership predicates
// read these, they are never learned. The example flags are the §44.4 band members.
type Flag string

const (
	// FlagUnsafe marks an unsafe branch (a safety violation) — a tombstone band member.
	FlagUnsafe Flag = "unsafe"
	// FlagObsolete marks an obsolete experiment — a tombstone band member.
	FlagObsolete Flag = "obsolete_experiment"
	// FlagParetoElite marks a pareto élite (a QD niche élite) — a keep band member.
	FlagParetoElite Flag = "pareto_elite"
	// FlagIncidentRelated marks an incident-related branch — a keep band member.
	FlagIncidentRelated Flag = "incident_related"
	// FlagHighNovelty marks a high-novelty variant (a stepping stone) — a keep band member.
	FlagHighNovelty Flag = "high_novelty"
	// FlagFailed marks a failed variant — a compress band member once older than 30 days.
	FlagFailed Flag = "failed"
	// FlagDuplicate marks a duplicate behavior — a compress band member.
	FlagDuplicate Flag = "duplicate_behavior"
)

// KindStablePhase is the node kind a recorded stable phase (S23) carries — a keep band
// member (a stable phase is the kernel's lockfile, never curated away).
const KindStablePhase = "stable_phase"

// CompressAge is the DECLARED age threshold for the compress band: a failed variant becomes a
// compress candidate only AFTER 30 days (KRD §44.4 `failed_variants_after_30d`). Declared,
// never learned.
const CompressAge = 30 * 24 * time.Hour

// Node is a DAG node handed to the curator: its id and the DECLARED metadata the prior steps
// carry. Curate reads ONLY this — it never fetches, never reads a clock. CreatedAt is the
// node's creation instant (used only for the age predicate, compared against the passed-in
// now); the zero value means "no age known" (never old enough to compress on age alone).
type Node struct {
	// ID is the node's content address / DAG id (S02). Echoed into the decision; never invented.
	ID string `json:"id"`
	// Kind is the node kind (e.g. "stable_phase"); a stable_phase is a keep band member.
	Kind string `json:"kind,omitempty"`
	// Flags is the DECLARED metadata the membership predicates read (unsafe, pareto_elite, …).
	Flags []Flag `json:"flags,omitempty"`
	// CreatedAt is the node's creation instant, for the `> 30d` age predicate. Zero = unknown.
	CreatedAt time.Time `json:"created_at,omitempty"`
}

// hasFlag reports whether the node carries the given declared flag (total on a nil slice).
func (n Node) hasFlag(f Flag) bool {
	for _, x := range n.Flags {
		if x == f {
			return true
		}
	}
	return false
}

// CurationDecision is the curator's verdict for ONE node (KRD §44.4): the node id, its band,
// and the human-readable reason naming the band that decided it. It is content-addressed by
// the hash of its canonical body (ID == Hash(Canonicalize(body))) — REUSING S01/S02, never a
// forked scheme. It is the value Curate returns; recording it rides the S20 ChangeSet path.
type CurationDecision struct {
	// ID is the content address of the decision body (S02). Computed by Hashed(), not stored raw.
	ID string `json:"id,omitempty"`
	// NodeID is the DAG node this decision is about — traces to a real input node, never invented.
	NodeID string `json:"node_id"`
	// Verdict is the band: keep | compress | tombstone.
	Verdict Verdict `json:"verdict"`
	// Reason names the band/predicate that decided the verdict (e.g. "unsafe_branches").
	Reason string `json:"reason"`
}

// Policy is the ArchiveCurationPolicy AST (KRD §44.4): the three DECLARED bands as membership
// predicate sets over the node metadata. It carries a Version (the policy's content address /
// label) recorded with each decision so a decision traces to the exact policy that produced
// it. The bands are FIXED by KRD — DefaultPolicy materializes them; a caller never coins a new
// band (anti-Goodhart, CLAUDE.md §8).
type Policy struct {
	// Version is the policy label/version stamped onto each decision (policy_version column).
	Version string `json:"version"`
	// TombstoneFlags are the flags that tombstone a node (unsafe_branches ∪ obsolete_experiments).
	TombstoneFlags []Flag `json:"tombstone_flags"`
	// KeepFlags are the flags that keep a node (pareto_elites ∪ incident_related ∪ high_novelty).
	KeepFlags []Flag `json:"keep_flags"`
	// KeepKinds are the node kinds that keep a node (stable_phases).
	KeepKinds []string `json:"keep_kinds"`
	// CompressFlags are the flags that compress a node when not kept/tombstoned (duplicate_behaviors).
	CompressFlags []Flag `json:"compress_flags"`
	// CompressAgedFlags are the flags that compress a node ONLY after CompressAge (failed_variants_after_30d).
	CompressAgedFlags []Flag `json:"compress_aged_flags"`
}

// DefaultPolicy is the KRD §44.4 ArchiveCurationPolicy with its bands materialized EXACTLY as
// the spec declares them — never an invented band. version is the policy's stable label.
func DefaultPolicy() Policy {
	return Policy{
		Version:           "krd-44.4",
		TombstoneFlags:    []Flag{FlagUnsafe, FlagObsolete},
		KeepFlags:         []Flag{FlagParetoElite, FlagIncidentRelated, FlagHighNovelty},
		KeepKinds:         []string{KindStablePhase},
		CompressFlags:     []Flag{FlagDuplicate},
		CompressAgedFlags: []Flag{FlagFailed},
	}
}

// classify is the pure per-node decision following the safety PRECEDENCE
// tombstone > keep > compress, with keep as the conservative default:
//
//   - any tombstone flag (unsafe_branches ∪ obsolete_experiments) ⇒ tombstone (wins over keep:
//     an unsafe branch is NEVER silently kept);
//   - else any keep flag (pareto_elites ∪ incident_related ∪ high_novelty) or keep kind
//     (stable_phases) ⇒ keep (critical history, never compressed away);
//   - else a duplicate_behavior, or a failed variant older than CompressAge (now - created_at
//     > 30d) ⇒ compress (summarized, still present);
//   - else keep (the conservative base case — when in doubt, KEEP, never drop).
//
// It returns the verdict + the reason naming the band/predicate. Total: a nil flags slice / a
// zero created_at yields a verdict, never a panic.
func classify(n Node, p Policy, now time.Time) (Verdict, string) {
	for _, f := range p.TombstoneFlags {
		if n.hasFlag(f) {
			return VerdictTombstone, "tombstone:" + string(f)
		}
	}
	for _, f := range p.KeepFlags {
		if n.hasFlag(f) {
			return VerdictKeep, "keep:" + string(f)
		}
	}
	for _, k := range p.KeepKinds {
		if n.Kind == k {
			return VerdictKeep, "keep:kind=" + k
		}
	}
	for _, f := range p.CompressFlags {
		if n.hasFlag(f) {
			return VerdictCompress, "compress:" + string(f)
		}
	}
	for _, f := range p.CompressAgedFlags {
		if n.hasFlag(f) && !n.CreatedAt.IsZero() && now.Sub(n.CreatedAt) > CompressAge {
			return VerdictCompress, "compress:" + string(f) + "_after_30d"
		}
	}
	// Conservative default: when no band claims the node, KEEP it — never drop (KRD §44.4: the
	// archive is a living memory; nothing is destroyed without an explicit tombstone/compress).
	return VerdictKeep, "keep:default"
}

// Curate is the PURE curation decision (KRD §44.4). It classifies EVERY input node into ONE
// band (keep / compress / tombstone) by the DECLARED policy predicates over the node metadata,
// and returns one CurationDecision per node IN INPUT ORDER. It is total and deterministic:
//
//   - now is a PARAMETER (never read from the clock) so the decision is replayable;
//   - EVERY input node id appears EXACTLY once in the output — tombstone/compress NEVER drop a
//     node (append-only, the wall, KRD §12): a tombstone/compress is a decision row, not a
//     deletion;
//   - it writes NOTHING and never panics (a nil nodes slice yields an empty result).
//
// The returned decisions carry no content-address (ID empty); call Hashed() to stamp the
// S01/S02 content hash before a decision is recorded (rides the S20 ChangeSet path).
func Curate(nodes []Node, p Policy, now time.Time) []CurationDecision {
	out := make([]CurationDecision, 0, len(nodes))
	for _, n := range nodes {
		v, reason := classify(n, p, now)
		out = append(out, CurationDecision{
			NodeID:  n.ID,
			Verdict: v,
			Reason:  reason,
		})
	}
	return out
}

// canonicalBody renders a decision as a records.KindPhase body so it rides INSIDE the
// content-addressed substrate (S02). The body carries the node id, verdict, reason and policy
// version — the full recorded fact. policyVersion is stamped so the decision traces to the
// exact policy that produced it (the policy_version column).
func canonicalBody(d CurationDecision, policyVersion string) ([]byte, error) {
	body := map[string]any{
		"kind":           string(records.KindPhase),
		"node_id":        d.NodeID,
		"verdict":        string(d.Verdict),
		"reason":         d.Reason,
		"policy_version": policyVersion,
	}
	return json.Marshal(body)
}

// Hashed returns the decision with its ID set to the content address of its canonical body
// (Hash(Canonicalize(body)), S01/S02 reused — never forked). The same decision body always
// lands under the same id; changing any field yields a new id (append-only, a new row, never
// an in-place edit). It writes NOTHING — the caller hands the body to the `aidos` writer role
// inside a ChangeSet to record the decision row in dag.curation_decision.
func (d CurationDecision) Hashed(policyVersion string) (CurationDecision, error) {
	body, err := canonicalBody(d, policyVersion)
	if err != nil {
		return CurationDecision{}, err
	}
	rec, err := records.NewRecord(records.KindPhase, body)
	if err != nil {
		return CurationDecision{}, err
	}
	d.ID = rec.ID
	return d, nil
}

// SortedByNode returns the decisions sorted by node id — a stable, byte-deterministic order
// for rendering/recording (the input order is preserved by Curate; this is for callers that
// want a canonical sort). It copies; it never mutates the input.
func SortedByNode(ds []CurationDecision) []CurationDecision {
	out := make([]CurationDecision, len(ds))
	copy(out, ds)
	sort.SliceStable(out, func(i, j int) bool { return out[i].NodeID < out[j].NodeID })
	return out
}
