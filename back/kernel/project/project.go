// Package project defines the `project` record — the first-rank Kernel concept
// that SCOPES every truth (AIDOS step S53, the multi-tenant foundation of the
// app-builder roadmap, EPIC 1).
//
// Until S53 the whole AIDOS truth-store is ONE undivided global graph: there is
// no project_id / tenant / owner column anywhere. A `project` is the root scope
// under which a single user's app is built: two users (or two apps) never collide
// in the singleton truth-store. Every later truth (kernel·mirrors·ideas·changesets·
// dag·brain·context, S54) gains a project_id pointing at one of these records.
//
// A project carries:
//
//	slug        — the stable, URL-safe handle, UNIQUE per owner (the human key);
//	name        — the human-readable title;
//	owner_ref   — the owning identity (a real user is wired in S62; here a free ref);
//	created_at   — the creation instant (passed in by the caller / DB, never a clock);
//	lifecycle   — active | archived | deleted (soft-delete, append-only — the hard
//	              GDPR delete is S116). A project is NEVER physically removed here:
//	              the lifecycle moves by writing a NEW content-addressed row.
//
// CONTENT-ADDRESSED (CLAUDE.md §1, KRD §12): a project's id == version ==
// records.Hash(records.Canonicalize(body)), REUSING the S01/S02 content-hash scheme
// (records.Hash/Canonicalize) — never a forked hashing path. Two byte-identical
// bodies land at the same address (idempotent); changing the lifecycle yields a new
// id (the version is "the licence to change").
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every function here is PURE and TOTAL — no
// clock, no rng, no I/O, never panics. Scoping is a PURE FUNCTION: Scope(projectID,
// rows) returns exactly the rows whose ProjectID equals projectID, so two disjoint
// project graphs can never cross-read. The reproducibility mirror
// project_property_test.go pins same-input→same-output.
//
// THE WALL (CLAUDE.md §2): this package is PURE — no DB calls. A project record is
// written BELOW the line via the store path (the projects schema is not kernel/
// mirrors/fitness), exactly like the Archive content-store: the /projects Workbench
// panel writes it directly (a server action), append-only. The agent never writes
// kernel/mirrors/fitness in passing.
package project

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Lifecycle is the closed three-value state of a project. There is no fourth
// state. The hard GDPR delete (S116) is a separate, human-gated destructive op;
// here `deleted` is a SOFT delete — the row stays, append-only.
type Lifecycle string

const (
	// LifecycleActive — the project is live and writable. The entry state.
	LifecycleActive Lifecycle = "active"
	// LifecycleArchived — the project is masked from the default list but kept
	// entirely (append-only); it can be restored back to active.
	LifecycleArchived Lifecycle = "archived"
	// LifecycleDeleted — soft delete: the project is logically removed but the row
	// is NEVER physically destroyed (the hard GDPR delete is S116).
	LifecycleDeleted Lifecycle = "deleted"
)

// Lifecycles returns the closed three lifecycle states in canonical order. Used
// by the validator and the Workbench so the set is never invented.
func Lifecycles() []Lifecycle {
	return []Lifecycle{LifecycleActive, LifecycleArchived, LifecycleDeleted}
}

func isKnownLifecycle(l Lifecycle) bool {
	for _, k := range Lifecycles() {
		if k == l {
			return true
		}
	}
	return false
}

// slugRe is the closed shape of a slug: lowercase alphanumerics and single
// hyphens, never leading/trailing/double hyphens. A slug is a stable, URL-safe
// handle — the human key, UNIQUE per owner.
var slugRe = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// Validation errors.
var (
	ErrEmptySlug        = errors.New("project: slug is empty")
	ErrInvalidSlug      = errors.New("project: slug is not a-z0-9 with single hyphens")
	ErrEmptyName        = errors.New("project: name is empty")
	ErrEmptyOwner       = errors.New("project: owner_ref is empty")
	ErrUnknownLifecycle = errors.New("project: unknown lifecycle")
	ErrContentAddress   = errors.New("project: id/version is not the content hash of the canonical body")
	ErrDuplicateSlug    = errors.New("project: slug already taken for this owner")
)

// Project is one content-addressed project record. The id and version are the
// content hash of the canonical body. The body fields are exactly slug, name,
// owner_ref, created_at, lifecycle (the kind discriminator is "project").
type Project struct {
	ID        string    `json:"id"`
	Slug      string    `json:"slug"`
	Name      string    `json:"name"`
	OwnerRef  string    `json:"owner_ref"`
	CreatedAt string    `json:"created_at"`
	Lifecycle Lifecycle `json:"lifecycle"`
	Version   string    `json:"version"`
}

// body is the canonical JSON shape that is hashed to produce the content address.
// "kind":"project" is the discriminator; the field order is irrelevant because
// records.Canonicalize sorts keys before hashing.
type body struct {
	Kind      string    `json:"kind"`
	Slug      string    `json:"slug"`
	Name      string    `json:"name"`
	OwnerRef  string    `json:"owner_ref"`
	CreatedAt string    `json:"created_at"`
	Lifecycle Lifecycle `json:"lifecycle"`
}

// CanonicalBody returns the canonical JSONB body of p (the bytes the id is the
// hash of). It is deterministic: same logical project → same bytes.
func (p Project) CanonicalBody() ([]byte, error) {
	raw, err := json.Marshal(body{
		Kind:      "project",
		Slug:      p.Slug,
		Name:      p.Name,
		OwnerRef:  p.OwnerRef,
		CreatedAt: p.CreatedAt,
		Lifecycle: p.Lifecycle,
	})
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// validateFields checks the human-supplied fields independent of the hash.
func validateFields(slug, name, owner string, lc Lifecycle) error {
	if slug == "" {
		return ErrEmptySlug
	}
	if !slugRe.MatchString(slug) {
		return fmt.Errorf("%w: %q", ErrInvalidSlug, slug)
	}
	if name == "" {
		return ErrEmptyName
	}
	if owner == "" {
		return ErrEmptyOwner
	}
	if !isKnownLifecycle(lc) {
		return fmt.Errorf("%w: %q", ErrUnknownLifecycle, lc)
	}
	return nil
}

// New builds a content-addressed active Project from its human fields. createdAt
// is passed in (no clock here — determinism). The returned project always passes
// Validate. New does NOT write to the DB (the wall: the projects schema is written
// below the line via the store path, never from this pure package).
func New(slug, name, owner, createdAt string) (Project, error) {
	return NewWithLifecycle(slug, name, owner, createdAt, LifecycleActive)
}

// NewWithLifecycle builds a content-addressed Project at a given lifecycle. Used
// by the lifecycle transitions (archive/restore/softDelete) which re-emit a NEW
// row at the new state — append-only, never an in-place mutation.
func NewWithLifecycle(slug, name, owner, createdAt string, lc Lifecycle) (Project, error) {
	if err := validateFields(slug, name, owner, lc); err != nil {
		return Project{}, err
	}
	p := Project{
		Slug:      slug,
		Name:      name,
		OwnerRef:  owner,
		CreatedAt: createdAt,
		Lifecycle: lc,
	}
	canon, err := p.CanonicalBody()
	if err != nil {
		return Project{}, err
	}
	h := records.Hash(canon)
	p.ID = h
	p.Version = h
	return p, nil
}

// Validate checks a project's fields and the content-address invariant:
// id == version == Hash(Canonicalize(body)). It never touches the DB and never
// writes truth; it is the pure check the property mirror exercises.
func Validate(p Project) error {
	if err := validateFields(p.Slug, p.Name, p.OwnerRef, p.Lifecycle); err != nil {
		return err
	}
	canon, err := p.CanonicalBody()
	if err != nil {
		return err
	}
	want := records.Hash(canon)
	if p.ID != want || p.Version != want {
		return fmt.Errorf("%w: id=%q version=%q want=%q", ErrContentAddress, p.ID, p.Version, want)
	}
	return nil
}

// Archive returns a NEW project row at lifecycle=archived (append-only). The id
// changes because the lifecycle is part of the content address. The prior row is
// NEVER destroyed; the head moves by inserting this new row.
func (p Project) Archive() (Project, error) {
	return NewWithLifecycle(p.Slug, p.Name, p.OwnerRef, p.CreatedAt, LifecycleArchived)
}

// Restore returns a NEW project row back at lifecycle=active (append-only).
func (p Project) Restore() (Project, error) {
	return NewWithLifecycle(p.Slug, p.Name, p.OwnerRef, p.CreatedAt, LifecycleActive)
}

// SoftDelete returns a NEW project row at lifecycle=deleted (append-only soft
// delete). The row stays in the store; the hard GDPR delete is S116.
func (p Project) SoftDelete() (Project, error) {
	return NewWithLifecycle(p.Slug, p.Name, p.OwnerRef, p.CreatedAt, LifecycleDeleted)
}

// OwnerSlug is the uniqueness key of a project: a slug is UNIQUE per owner. Two
// owners may hold the same slug; one owner may not. This is the deterministic key
// the registry de-duplicates on (and the projects schema enforces with a UNIQUE
// (owner_ref, slug) WHERE lifecycle <> 'deleted' constraint).
func OwnerSlug(ownerRef, slug string) string {
	return ownerRef + "/" + slug
}

// Scopable is anything that carries a ProjectID — a row that belongs to exactly
// one project. Every later truth row (S54) implements this. Scope filters over it.
type Scopable interface {
	GetProjectID() string
}

// Scope is the PURE scoping function (CLAUDE.md §6 determinism-first): given a
// project id and a set of rows, it returns exactly the rows whose ProjectID equals
// projectID — never a row from another project. Two disjoint project graphs can
// therefore never cross-read: Scope(A, rows) and Scope(B, rows) share no element.
// The order of the input is preserved; the function is total and never panics.
func Scope[T Scopable](projectID string, rows []T) []T {
	out := make([]T, 0, len(rows))
	for _, r := range rows {
		if r.GetProjectID() == projectID {
			out = append(out, r)
		}
	}
	return out
}

// Disjoint reports whether two project ids name DIFFERENT projects — the
// precondition under which Scope(a) and Scope(b) are guaranteed to share no row.
func Disjoint(a, b string) bool { return a != b }
