package behavior

// library.go — S79's USER-FACING behavior LIBRARY (KRD §24.6, app-builder EPIC 7). It is the
// project-scoped catalogue UI/op layer ON TOP of S76 (record.go + behavior.go): the seven library
// gestures the user does over their reusable behaviours —
//
//   - BROWSE   — list a project's library records in canonical order (project-scoped, soft-deleted
//                rows hidden by default — the §24.6 "soft-deletable" applied to the library itself).
//   - SEARCH   — a DETERMINISTIC substring/word match over a record's owner + tags + FR/locale labels
//                (a `rg`-like matcher, NEVER an LLM — determinism-first, CLAUDE.md §6/§8). Same query
//                ⇒ same ordered hits.
//   - TAG      — add a free classification tag to a record (deduped, sorted — content-address stable).
//   - ATTACH   — PREVIEW the expansion of a record attached to an entity by calling the ONE S76
//                Expand/Propose (never a second expansion — the single-function law), then LAND it via
//                an APPROVED ChangeSet. The preview shows the scoped policies+fixtures; the landing is
//                changeset.Apply over the DRAFT Propose produced — gated by completeness, never a
//                direct kernel write (the wall, CLAUDE.md §2).
//   - SOFTDEL  — soft-delete a record (mark deleted, never destroy — append-only, KRD §44).
//   - PUBLISH  — publish a record (make it shared/visible beyond DRAFT) — a monotone status flip.
//   - COMMENT  — append a comment to a record (auditable discussion thread, append-only).
//
// EVERYTHING IS PROJECT-SCOPED. A library is keyed by ProjectID; browse/search/attach never leak
// across projects (S55 RLS in the persisted plane; here the in-memory Library is one project's).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Search, browse, tag, soft-delete, publish, comment are PURE,
// TOTAL functions of the library value + input — no DB, no clock (timestamps are arguments), no RNG,
// no I/O. Same input ⇒ byte-identical output. The matcher is a code substring/word match, NEVER an
// LLM. The reproducibility mirrors (library_property_test.go) pin search determinism + order-
// invariance; the worked-example fixture (library_fixture_test.go) pins the owner-scoping attach
// preview + approved-changeset landing.
//
// THE WALL. This package writes NO truth. Attach PREVIEWS (Propose → DRAFT) and LANDS via
// changeset.Apply, which is itself PURE (it computes the APPLIED envelope value; the actual kernel
// freeze is the `aidos` CLI's job downstream). A LandedAttachment carries the APPLIED ChangeSet
// VALUE — proof the expansion travelled the legal door (propose → approve), not a kernel write.

import (
	"sort"
	"strings"
	"time"

	"github.com/steph-frtech/aidos/back/archive/changeset"
)

// LibEntry is one record in a project's behavior library — the S76 Record plus the library-plane
// lifecycle the seven gestures act on (comments, published, soft-deleted). The Record stays the
// single owner of the behaviour identity (no fork); LibEntry only wraps the library lifecycle.
type LibEntry struct {
	// Record is the S76 catalogue record (ownable/versioned/taggable/localizable). Authoritative.
	Record Record `json:"record"`
	// Published is the publish flag (PUBLISH gesture) — a published behaviour is shared beyond DRAFT.
	Published bool `json:"published"`
	// Deleted is the soft-delete flag (SOFTDEL gesture) — hidden from Browse by default, never destroyed.
	Deleted bool `json:"deleted"`
	// Comments is the append-only discussion thread (COMMENT gesture).
	Comments []Comment `json:"comments,omitempty"`
}

// Comment is one append-only note on a library entry (the COMMENT gesture). At is an argument
// (purity); the library never reads the clock.
type Comment struct {
	Author string    `json:"author"`
	Body   string    `json:"body"`
	At     time.Time `json:"at"`
}

// Library is one PROJECT's behavior library — project-scoped by ProjectID. It is a value (no DB
// handle): the persisted plane (S55 RLS) materialises it; here every gesture is a pure transform of
// this value. Entries are keyed by RecordID so a gesture targets exactly one record.
type Library struct {
	ProjectID string              `json:"project_id"`
	Entries   map[string]LibEntry `json:"entries"`
}

// NewLibrary returns an empty library for a project. PURE.
func NewLibrary(projectID string) Library {
	return Library{ProjectID: projectID, Entries: map[string]LibEntry{}}
}

// Add inserts (or replaces) a validated record into the library, keyed by its content-addressed
// RecordID. A library NEVER auto-publishes or auto-deletes — a fresh entry is unpublished, live. It
// returns the new library VALUE (the source is not mutated — append-only semantics) plus the id.
// An invalid record is refused (ValidateRecord), never silently coerced (the honesty rule).
func (l Library) Add(r Record) (Library, string, error) {
	if err := ValidateRecord(r); err != nil {
		return l, "", err
	}
	id := RecordID(r)
	out := l.clone()
	out.Entries[id] = LibEntry{Record: r}
	return out, id, nil
}

// clone returns a deep-enough copy so a gesture never mutates the source library (append-only,
// CLAUDE.md §9 anti-overwrite). The Record/Comment values are themselves immutable here.
func (l Library) clone() Library {
	cp := Library{ProjectID: l.ProjectID, Entries: make(map[string]LibEntry, len(l.Entries))}
	for k, v := range l.Entries {
		cp.Entries[k] = v
	}
	return cp
}

// Browse lists the live (non-soft-deleted) entries in CANONICAL ORDER — by catalogue order, then
// owner, then version, then RecordID — so the listing is deterministic (no map-iteration leak). With
// includeDeleted, soft-deleted entries are included (the trash view). PURE.
func (l Library) Browse(includeDeleted bool) []LibEntry {
	out := make([]LibEntry, 0, len(l.Entries))
	for _, e := range l.Entries {
		if e.Deleted && !includeDeleted {
			continue
		}
		out = append(out, e)
	}
	sort.SliceStable(out, func(i, j int) bool { return lessEntry(out[i], out[j]) })
	return out
}

// catalogueRank maps a kind to its canonical index (unknown kinds sort last, stably).
func catalogueRank(k Kind) int {
	for i, c := range catalogueOrder {
		if c == k {
			return i
		}
	}
	return len(catalogueOrder)
}

// lessEntry is the total, deterministic order over entries: catalogue rank, owner, version, id.
func lessEntry(a, b LibEntry) bool {
	ra, rb := catalogueRank(a.Record.Kind), catalogueRank(b.Record.Kind)
	if ra != rb {
		return ra < rb
	}
	if a.Record.Owner != b.Record.Owner {
		return a.Record.Owner < b.Record.Owner
	}
	if a.Record.Version != b.Record.Version {
		return a.Record.Version < b.Record.Version
	}
	return RecordID(a.Record) < RecordID(b.Record)
}

// Search is the DETERMINISTIC `rg`-like matcher (NEVER an LLM, CLAUDE.md §6/§8). It returns the live
// entries whose searchable text (kind + owner + sorted tags + every locale label) contains the
// query as a case-folded substring, in the SAME canonical order Browse uses. An empty query matches
// every live entry (a browse). Soft-deleted entries are excluded (a search is over the live shelf).
// PURE: same library + query ⇒ byte-identical ordered hits.
func (l Library) Search(query string) []LibEntry {
	q := strings.ToLower(strings.TrimSpace(query))
	live := l.Browse(false)
	if q == "" {
		return live
	}
	out := make([]LibEntry, 0, len(live))
	for _, e := range live {
		if strings.Contains(searchableText(e.Record), q) {
			out = append(out, e)
		}
	}
	return out
}

// searchableText builds the case-folded haystack a Search matches against — kind, owner, sorted
// tags and every locale label, joined by a separator. Deterministic (sorted tags + sorted locales).
func searchableText(r Record) string {
	parts := []string{string(r.Kind), r.Owner}
	parts = append(parts, dedupSortTags(r.Tags)...)
	locales := make([]string, 0, len(r.Labels))
	for loc := range r.Labels {
		locales = append(locales, loc)
	}
	sort.Strings(locales)
	for _, loc := range locales {
		parts = append(parts, loc, r.Labels[loc])
	}
	return strings.ToLower(strings.Join(parts, "\x1f"))
}

// Tag adds a free classification tag to the record at recordID (TAG gesture). The tag set is deduped
// + sorted (content-address stable). Because the RecordID is content-addressed over the tags, the
// re-tagged record gets a NEW id; Tag re-keys the entry under it (the old id is removed — a record
// is its tags). Returns the new library + the new id. A missing record is a typed error.
func (l Library) Tag(recordID, tag string) (Library, string, error) {
	e, ok := l.Entries[recordID]
	if !ok {
		return l, "", ErrRecordNotInLibrary
	}
	nr := e.Record
	nr.Tags = dedupSortTags(append(append([]string(nil), nr.Tags...), tag))
	newID := RecordID(nr)
	out := l.clone()
	delete(out.Entries, recordID)
	ne := e
	ne.Record = nr
	out.Entries[newID] = ne
	return out, newID, nil
}

// Publish flips a record's library entry to published (PUBLISH gesture) — monotone, idempotent.
// A missing record is a typed error.
func (l Library) Publish(recordID string) (Library, error) {
	e, ok := l.Entries[recordID]
	if !ok {
		return l, ErrRecordNotInLibrary
	}
	out := l.clone()
	e.Published = true
	out.Entries[recordID] = e
	return out, nil
}

// SoftDelete marks a record's library entry deleted (SOFTDEL gesture) — hidden from Browse by
// default, NEVER destroyed (append-only, KRD §44). Idempotent. A missing record is a typed error.
func (l Library) SoftDelete(recordID string) (Library, error) {
	e, ok := l.Entries[recordID]
	if !ok {
		return l, ErrRecordNotInLibrary
	}
	out := l.clone()
	e.Deleted = true
	out.Entries[recordID] = e
	return out, nil
}

// Comment appends a note to a record's entry (COMMENT gesture) — append-only. `at` is an argument
// (purity). A missing record is a typed error.
func (l Library) Comment(recordID, author, body string, at time.Time) (Library, error) {
	e, ok := l.Entries[recordID]
	if !ok {
		return l, ErrRecordNotInLibrary
	}
	out := l.clone()
	e.Comments = append(append([]Comment(nil), e.Comments...), Comment{Author: author, Body: body, At: at})
	out.Entries[recordID] = e
	return out, nil
}

// LandedAttachment is the result of ATTACHing a library record to an entity: the dry-run Proposal
// (preview — the scoped policies+fixtures the user sees), PLUS the APPROVED ChangeSet (the landing —
// changeset.Apply over the DRAFT proposal). The Applied envelope's status is APPLIED, proving the
// expansion travelled the legal door (propose → approve), never a direct kernel write.
type LandedAttachment struct {
	// Preview is the dry-run Proposal (Expansion + the DRAFT ChangeSet) — what the screen shows.
	Preview Proposal `json:"preview"`
	// Applied is the APPROVED ChangeSet (status APPLIED) — the landing.
	Applied changeset.ChangeSet `json:"applied"`
}

// PreviewAttach runs the ONE S76 Propose for a library record attached to an entity (NEVER a second
// Expand — the single-function law, §24.6) and returns its dry-run Proposal (the preview: the scoped
// policies+fixtures + the DRAFT ChangeSet). It WRITES NOTHING. The record's kind must match the
// attachment behavior (no silent recast, surfaced by Propose). A record not in the library is a
// typed error.
func (l Library) PreviewAttach(recordID, entity string, existing Shape, parentPhase string) (Proposal, error) {
	e, ok := l.Entries[recordID]
	if !ok {
		return Proposal{}, ErrRecordNotInLibrary
	}
	a := Attachment{Behavior: e.Record.Kind, Entity: entity, Existing: existing}
	return Propose(a, e.Record, parentPhase)
}

// LandAttach previews the attachment (PreviewAttach) AND lands it via an APPROVED ChangeSet — it
// drives changeset.Apply over the DRAFT proposal with the project's completeness predicate. The
// landing is gated: an incomplete proposal (a spec_delta without its mirror_delta) is REFUSED with
// the changeset BlockReason — NEVER a direct kernel write. On success it returns a LandedAttachment
// carrying the preview + the APPLIED envelope. `approvedAt` is an argument (purity — no clock).
//
// This is the §24.6 promise made real: "attacher prévisualise l'expansion (ses policies+fixtures) en
// appelant l'unique Expand de S76 et l'atterrit via ChangeSet approuvé."
func (l Library) LandAttach(recordID, entity string, existing Shape, parentPhase string, approvedAt time.Time) (LandedAttachment, *changeset.BlockReason, error) {
	prop, err := l.PreviewAttach(recordID, entity, existing, parentPhase)
	if err != nil {
		return LandedAttachment{}, nil, err
	}
	applied, br := changeset.Apply(prop.ChangeSet, approvedAt, changeset.SpecHasMirror)
	if br != nil {
		return LandedAttachment{}, br, nil
	}
	return LandedAttachment{Preview: prop, Applied: applied}, nil, nil
}

// errors for the library surface.
var ErrRecordNotInLibrary = libErr("behavior: record id is not in the project library")

type libErr string

func (e libErr) Error() string { return string(e) }
