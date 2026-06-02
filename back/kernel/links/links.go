// Package links is the pure AST + staleness check of the SIX versioned link types of
// KRD §41 — projects_to, derives_from, contracts_with, triggers, binds, mirrors.
//
// The whole point (KRD §41): a link points at a VERSION (id@version), never a bare
// identity. Every link PINS its target by a concrete version; an unpinned link cannot be
// resolved and is itself a monster (Validate rejects it). When the target's head moves, the
// consumer's pinned version no longer matches — the link is STALE (red). That staleness IS
// the seed of the red wave (KRD §42), and it must be DETERMINISTIC and replayable, so the
// staleness check is a PURE function.
//
// This package lands exactly that substrate: the typed Link AST (a CLOSED six-kind enum,
// pinned from/to refs), a pure Validate(link) guard, and a pure Resolve(link, heads) →
// LinkStatus that returns green | stale | absent. It does NOT redefine the per-kind
// behaviour (triggers control→action, binds action→operation, mirrors spec→mirror are owned
// by S11/S06 and only referenced here), and it does NOT compute the full red wave / impact
// set across the DAG (a later step). It is the link substrate + its staleness check.
//
// PURE (CLAUDE.md §6 determinism-first): no DB, no clock, no rng, no I/O. The `heads` map
// (targetId → headVersion) is READ from the argument handed in, never fetched — so the same
// (link, heads) always yields the same status, and the red wave is replayable. READ-ONLY
// against truth; it writes nothing (the wall, CLAUDE.md §2). Truth writes (a new kernel.link
// row) flow through the aidos CLI role via an approved ChangeSet, never here.
package links

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Kind enumerates the SIX versioned link types of KRD §41. It is a CLOSED set: an unknown
// kind is rejected at Validate (the agent invents no kind the Tome does not name).
type Kind string

const (
	// KindProjectsTo — a source projects to a projection (e.g. entity → Go/DDL/TS).
	KindProjectsTo Kind = "projects_to"
	// KindDerivesFrom — a layer derives from another (a refinement chain).
	KindDerivesFrom Kind = "derives_from"
	// KindContractsWith — a cell contracts with another across a bounded-context boundary.
	KindContractsWith Kind = "contracts_with"
	// KindTriggers — a control triggers an action (S11 semantics; referenced, not redefined).
	KindTriggers Kind = "triggers"
	// KindBinds — an action binds to an operation (S11 semantics; referenced, not redefined).
	KindBinds Kind = "binds"
	// KindMirrors — a mirror reflects a spec layer (KRD §28, "the sixth link"; S06).
	KindMirrors Kind = "mirrors"
)

// kindOrder is the canonical enumeration order of the six kinds.
var kindOrder = []Kind{
	KindProjectsTo, KindDerivesFrom, KindContractsWith, KindTriggers, KindBinds, KindMirrors,
}

// Kinds returns the six KRD §41 link kinds in canonical order. The Workbench renders the
// set of edges from this; the validator gates membership against it.
func Kinds() []Kind {
	out := make([]Kind, len(kindOrder))
	copy(out, kindOrder)
	return out
}

// IsKnownKind reports whether k is one of the six KRD §41 link kinds (the closed set).
func IsKnownKind(k Kind) bool {
	for _, kk := range kindOrder {
		if kk == k {
			return true
		}
	}
	return false
}

// Ref is a PINNED layer reference: an id plus the concrete version it points at (id@version).
// A bare identity (version == "") is NOT a valid link target — pinning is the whole point of
// KRD §41. IsPinned reports whether both id and version are non-empty.
type Ref struct {
	ID      string `json:"id"`
	Version string `json:"version"`
}

// IsPinned reports whether the ref is a well-formed pinned target: both id and version
// non-empty. An unpinned ref (no version) cannot be resolved against heads.
func (r Ref) IsPinned() bool {
	return r.ID != "" && r.Version != ""
}

// String renders the ref as the canonical "id@version" form.
func (r Ref) String() string { return r.ID + "@" + r.Version }

// Link is the KRD §41 versioned link AST: a kind plus a consuming `from` ref and a pinned
// `to` target ref. Both refs are version-pinned (id@version); the link is content-addressed
// inside its kernel.link body (S02 substrate), not a record of its own here.
type Link struct {
	// Kind is one of the six KRD §41 kinds (closed set).
	Kind Kind `json:"kind"`
	// From is the consuming layer ref (the link's source side), pinned id@version.
	From Ref `json:"from"`
	// To is the PINNED target ref (the link's destination), id@version — never a bare id.
	To Ref `json:"to"`
}

// LinkStatus is Resolve's verdict — exactly one of three. green is the only healthy status;
// stale and absent are both RED (the link no longer resolves to a live head).
type LinkStatus string

const (
	// StatusGreen — the link is pinned exactly to the current head of its target.
	StatusGreen LinkStatus = "green"
	// StatusStale — the target exists but the link is pinned to a NON-head version (red).
	StatusStale LinkStatus = "stale"
	// StatusAbsent — the target has NO head at all: the link dangles loudly (red). THE done case.
	StatusAbsent LinkStatus = "absent"
)

// Heads maps a targetId to its current head version. It is the (pure) input Resolve reads;
// where the head comes from (the DAG head resolution) is owned by a later step and handed
// in here, so Resolve stays a pure function of (link, heads).
type Heads map[string]string

// Validation errors.
var (
	// ErrUnknownKind — the link's kind is not one of the six KRD §41 kinds (closed set).
	ErrUnknownKind = errors.New("links: unknown link kind (closed set)")
	// ErrUnpinnedFrom — the `from` ref is not a pinned id@version ref.
	ErrUnpinnedFrom = errors.New("links: from is not a pinned id@version ref")
	// ErrUnpinnedTo — the `to` target is not pinned (no version): an unpinned link is a monster.
	ErrUnpinnedTo = errors.New("links: to is not pinned (id@version required) — an unpinned link cannot be resolved")
)

// Validate is the PURE shape guard of a link (KRD §41):
//   - kind is one of the six closed kinds;
//   - from is a pinned id@version ref;
//   - to is a pinned id@version ref (an unpinned target is itself a monster — it can never
//     be resolved against heads).
//
// Pure: no DB, no clock, no I/O. A link that fails Validate is never handed to Resolve.
func Validate(l Link) error {
	if !IsKnownKind(l.Kind) {
		return fmt.Errorf("%w: %q", ErrUnknownKind, l.Kind)
	}
	if !l.From.IsPinned() {
		return fmt.Errorf("%w: %q", ErrUnpinnedFrom, l.From.String())
	}
	if !l.To.IsPinned() {
		return fmt.Errorf("%w: %q", ErrUnpinnedTo, l.To.String())
	}
	return nil
}

// Resolve is the PURE staleness check of a link against the current heads (KRD §41–§42):
//
//   - ABSENT (red) — heads has NO entry for the target id: the version is gone / never
//     existed, the link dangles loudly. THE done criterion — a link to an absent version is
//     ALWAYS red.
//   - GREEN — the target exists AND the link is pinned exactly to its head.
//   - STALE (red) — the target exists but the link is pinned to a NON-head version (the
//     consumer pinned to an outdated version — the seed of the red wave, KRD §42).
//
// Resolve is TOTAL (always one of the three statuses), DETERMINISTIC (same (link, heads) ⇒
// same status), and NEVER PANICS. Pure: no DB, no clock, no rng, no I/O. The rapid property
// mirror pins these. Resolve keys ONLY on the pinned `to` ref; the kind and `from` carry the
// link's meaning but do not change its staleness.
func Resolve(l Link, heads Heads) LinkStatus {
	head, present := heads[l.To.ID]
	if !present {
		return StatusAbsent
	}
	if head == l.To.Version {
		return StatusGreen
	}
	return StatusStale
}

// SerializeLinkBody renders a minimal kernel.link body carrying the link, so the link rides
// INSIDE the content-addressed body (S02 substrate): a body produced here round-trips through
// records.NewRecord as id == version == Hash(Canonicalize(body)), and changing the pinned
// `to` version yields a different version (a new row, never an in-place mutation — KRD §12).
// The pinned from/to refs live INSIDE the body (they are version-pinned refs, not foreign
// keys — a stale/absent link must remain inspectable so it can be shown red, KRD §42). The
// "kind":"link" discriminator matches records.Validate.
func SerializeLinkBody(l Link) ([]byte, error) {
	body := map[string]any{
		"kind":      string(records.KindLink),
		"link_kind": string(l.Kind),
		"from":      l.From,
		"to":        l.To,
	}
	return json.Marshal(body)
}
