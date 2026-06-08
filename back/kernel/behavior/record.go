package behavior

// record.go — S76's behavior-RECORD + PROPOSE (KRD §24.6, EPIC 7). It adds the two clauses the
// done-criteria stack on top of the GREEN Expand mirror, WITHOUT forking the single expander:
//
//   - Record: a behavior catalogue entry that is OWNABLE (owner), VERSIONED (a positive monotone
//     version), TAGGABLE (free tags) and LOCALIZABLE (per-locale labels, FR required — bilingue par
//     défaut, ADR 0011). It is content-addressed (RecordID) and validated by code (ValidateRecord).
//   - Propose: runs the ONE authoritative Expand (never a second expansion — the single-function law,
//     §24.6) and wraps its DRY-RUN into a DRAFT changeset.ChangeSet — spec_delta + mirror_delta,
//     project-scoped. It WRITES NOTHING: the changeset is `proposed` (DRAFT), never APPLIED; freezing
//     goes via the wall (idée → miroir → /goal → approbation humaine, CLAUDE.md §2). "L'expansion est
//     un ChangeSet proposé, jamais une vérité appliquée."
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). RecordID and Propose are PURE, TOTAL functions: no DB, no
// clock, no RNG, no I/O. Same record+attachment+parent ⇒ byte-identical DRAFT changeset (the content
// address pins it). The reproducibility mirrors (behavior_propose_property_test.go) prove it.

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Record is a behavior-macro catalogue ENTRY — the §24.6 reusable behaviour the user OWNS, VERSIONS,
// TAGS and LOCALISES. It is the metadata wrapper around a catalogue Kind; the EXPANSION it implies is
// still computed by the ONE Expand (a Record never carries its own expansion — no fork).
type Record struct {
	// Kind is the catalogue behavior this record describes (must be in Catalogue()).
	Kind Kind `json:"kind"`
	// Owner is the record's owner (OWNABLE — a behavior belongs to whoever authored it). Required.
	Owner string `json:"owner"`
	// Version is the record's monotone version (VERSIONED — a behavior evolves, append-only). >= 1.
	Version int `json:"version"`
	// Tags are free classification labels (TAGGABLE — "scoping", "security", …). Optional, deduped.
	Tags []string `json:"tags,omitempty"`
	// Labels are per-locale display strings (LOCALIZABLE — ADR 0011 bilingue par défaut; FR required).
	Labels map[string]string `json:"labels"`
}

// Errors specific to the record + propose surface.
var (
	// ErrNoOwner — an ownable record with no owner (the OWNABLE clause).
	ErrNoOwner = errors.New("behavior: record has no owner (a behavior is ownable, §24.6)")
	// ErrBadVersion — a record version < 1 (the VERSIONED clause; versions start at 1, monotone).
	ErrBadVersion = errors.New("behavior: record version must be >= 1 (versioned, §24.6)")
	// ErrNoFRLabel — a record without a French label (the LOCALIZABLE clause; FR required, ADR 0011).
	ErrNoFRLabel = errors.New("behavior: record has no FR label (localizable, bilingue par défaut, ADR 0011)")
	// ErrRecordKindMismatch — Propose's record kind differs from the attachment's behavior (no silent recast).
	ErrRecordKindMismatch = errors.New("behavior: record kind does not match the attachment behavior")
)

// ValidateRecord checks a record is well-formed against the four §24.6 clauses (ownable, versioned,
// taggable, localizable) and that its kind is in the declared catalogue. PURE; returns a typed error,
// never a guessed default (the honesty rule).
func ValidateRecord(r Record) error {
	if _, ok := catalogueExpansion[r.Kind]; !ok {
		return fmt.Errorf("%w: %q", ErrUnknownBehavior, r.Kind)
	}
	if r.Owner == "" {
		return ErrNoOwner
	}
	if r.Version < 1 {
		return ErrBadVersion
	}
	if r.Labels["fr"] == "" {
		return ErrNoFRLabel
	}
	return nil
}

// dedupSortTags returns the record's tags deduplicated and sorted — so two records that differ only
// in tag ORDER or DUPLICATES content-address identically (determinism, order-invariant). PURE.
func dedupSortTags(tags []string) []string {
	seen := make(map[string]bool, len(tags))
	out := make([]string, 0, len(tags))
	for _, t := range tags {
		if !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	sort.Strings(out)
	return out
}

// RecordID content-addresses a record over its full identity (kind + owner + version + canonical
// tags + labels), reusing records.Canonicalize/Hash (S02) — same identity ⇒ same id, key-order- and
// tag-order-stable. PURE.
func RecordID(r Record) string {
	body := struct {
		Kind    Kind              `json:"kind"`
		Owner   string            `json:"owner"`
		Version int               `json:"version"`
		Tags    []string          `json:"tags"`
		Labels  map[string]string `json:"labels"`
	}{
		Kind:    r.Kind,
		Owner:   r.Owner,
		Version: r.Version,
		Tags:    dedupSortTags(r.Tags),
		Labels:  r.Labels,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return ""
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return ""
	}
	return records.Hash(canon)
}

// Proposal is the result of proposing a behavior attachment: the DRY-RUN Expansion (echoed for the
// Workbench preview) plus a DRAFT ChangeSet carrying it — never APPLIED. The changeset's spec_delta
// carries the canonical expansion body, project-scoped; its mirror_delta declares the proof
// obligation (completeness — a spec needs a mirror). Approval (apply) is the `aidos` CLI's job, gated
// by the AuthorityGraph (S110) — Propose only proposes.
type Proposal struct {
	Expansion Expansion           `json:"expansion"`
	ChangeSet changeset.ChangeSet `json:"changeset"`
	RecordID  string              `json:"record_id"`
}

// Propose runs the ONE authoritative Expand for an attachment and wraps its dry-run into a DRAFT
// changeset.ChangeSet — the single legal way a behavior-macro reaches truth. It WRITES NOTHING:
// changeset.Open is PURE (it computes the content-addressed id of a DRAFT envelope). The returned
// changeset is `proposed` (DRAFT); a human approves (applies) or rejects (discards) it downstream —
// a reject leaves the kernel intact because Propose never touched it.
//
//   - The record's kind MUST match the attachment's behavior (no silent recast → ErrRecordKindMismatch).
//   - The expansion is the SAME ONE Expand (the single-function law, §24.6) — never a second emit.
//   - parentPhase is the stable phase the proposal moves from (the project's current head).
//   - The spec_delta target is "behavior-expansion@<entity>" so a reject/approve is project-scoped.
func Propose(a Attachment, r Record, parentPhase string) (Proposal, error) {
	if err := ValidateRecord(r); err != nil {
		return Proposal{}, err
	}
	if r.Kind != a.Behavior {
		return Proposal{}, fmt.Errorf("%w: record %q vs attachment %q", ErrRecordKindMismatch, r.Kind, a.Behavior)
	}
	exp, err := Expand(a) // the ONE expander — never a second expansion.
	if err != nil {
		return Proposal{}, err
	}
	body, err := json.Marshal(exp)
	if err != nil {
		return Proposal{}, fmt.Errorf("behavior: marshal expansion: %w", err)
	}
	target := fmt.Sprintf("behavior-expansion@%s", a.Entity)
	label := fmt.Sprintf("behavior: propose %s expansion on %s (v%d, %s)",
		a.Behavior, a.Entity, r.Version, short(RecordID(r)))
	spec := &changeset.Delta{Kind: "add", Target: target, Body: json.RawMessage(body)}
	mirror := &changeset.Delta{Kind: "add", Target: target + "#mirror"}
	cs, err := changeset.Open(label, parentPhase, spec, mirror)
	if err != nil {
		return Proposal{}, err
	}
	return Proposal{Expansion: exp, ChangeSet: cs, RecordID: RecordID(r)}, nil
}

// short returns the first 8 chars of a content hash (for human labels). Never used for identity.
func short(h string) string {
	if len(h) <= 8 {
		return h
	}
	return h[:8]
}
