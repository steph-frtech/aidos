package project

// Registry is the pure, deterministic uniqueness gate over a set of project HEAD
// rows: it enforces that a slug is UNIQUE per owner (CLAUDE.md §6 determinism —
// the gate is code, never an LLM). It is an in-memory value used by the store path
// (the /projects server action) BEFORE it inserts a new project row; the projects
// schema mirrors the same rule with a UNIQUE (owner_ref, slug) WHERE lifecycle <>
// 'deleted' constraint (defense in depth — the migration).
//
// A `deleted` (soft-deleted) project frees its slug: re-creating the same owner/
// slug after a soft delete is allowed. An `archived` project still HOLDS its slug
// (it can be restored), so re-creating its slug is refused.
type Registry struct {
	// taken maps OwnerSlug(owner, slug) → true for every non-deleted head row.
	taken map[string]bool
}

// NewRegistry builds a Registry from the current HEAD project rows. Only
// non-deleted projects hold their slug. The function is pure and deterministic.
func NewRegistry(heads []Project) *Registry {
	r := &Registry{taken: make(map[string]bool, len(heads))}
	for _, p := range heads {
		if p.Lifecycle == LifecycleDeleted {
			continue
		}
		r.taken[OwnerSlug(p.OwnerRef, p.Slug)] = true
	}
	return r
}

// CanCreate reports whether (owner, slug) is free to create. It is the
// deterministic admission test.
func (r *Registry) CanCreate(ownerRef, slug string) bool {
	return !r.taken[OwnerSlug(ownerRef, slug)]
}

// Create validates the fields, checks slug-uniqueness-per-owner, and returns the
// new content-addressed active project — or ErrDuplicateSlug if the slug is taken
// for that owner. It does NOT mutate the registry's view of the world (the store
// path inserts the returned row, then rebuilds the registry on next read) — it is
// a pure admission function.
func (r *Registry) Create(slug, name, owner, createdAt string) (Project, error) {
	if err := validateFields(slug, name, owner, LifecycleActive); err != nil {
		return Project{}, err
	}
	if !r.CanCreate(owner, slug) {
		return Project{}, ErrDuplicateSlug
	}
	return New(slug, name, owner, createdAt)
}
