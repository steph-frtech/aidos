package project_test

// Project invariants — the property mirror (mirrors schema · reflects:
// projects.project · test_kind: property · cert_language: rapid · authority: below).
//
// The done-criteria of S53, proven for ANY generated projects:
//
//   - id == version == content hash of the canonical body (content-addressing,
//     reusing S01/S02 records.Hash/Canonicalize) — and byte-identical bodies hash
//     to the same id (idempotent / reproducible);
//   - a slug is UNIQUE per owner: the Registry refuses a second non-deleted project
//     with the same (owner, slug), but ALLOWS the same slug under a different owner;
//   - two DISJOINT project graphs never cross-read: Scope(A, rows) and Scope(B, rows)
//     share no element, and Scope(A) returns ONLY rows whose ProjectID == A;
//   - scoping is a PURE function: same (projectID, rows) → same output (reproducible);
//   - lifecycle is the closed three {active, archived, deleted}; archive/restore/
//     softDelete are append-only (a NEW row, never a mutation; the soft delete keeps
//     the slug freed only when deleted);
//   - every function is deterministic, total and never panics.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/project"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"pgregory.net/rapid"
)

// scopedRow is a minimal Scopable for the scoping properties.
type scopedRow struct {
	pid string
	tag int
}

func (r scopedRow) GetProjectID() string { return r.pid }

func genSlug(t *rapid.T) string {
	return rapid.StringMatching(`[a-z0-9]+(-[a-z0-9]+)*`).Draw(t, "slug")
}

func genOwner(t *rapid.T) string {
	return rapid.StringMatching(`owner-[a-z0-9]+`).Draw(t, "owner")
}

func genName(t *rapid.T) string {
	return rapid.StringMatching(`[A-Za-z][A-Za-z0-9 ]{0,30}`).Draw(t, "name")
}

func genLifecycle(t *rapid.T) project.Lifecycle {
	ls := project.Lifecycles()
	return ls[rapid.IntRange(0, len(ls)-1).Draw(t, "lc")]
}

// TestContentAddressed: id == version == Hash(Canonicalize(body)), and the same
// logical project always produces the same id (idempotent / reproducible).
func TestContentAddressed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		slug, name, owner := genSlug(t), genName(t), genOwner(t)
		ts := rapid.StringMatching(`20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:00:00Z`).Draw(t, "ts")

		p, err := project.New(slug, name, owner, ts)
		if err != nil {
			t.Fatalf("New: %v", err)
		}
		if err := project.Validate(p); err != nil {
			t.Fatalf("Validate: %v", err)
		}
		canon, err := p.CanonicalBody()
		if err != nil {
			t.Fatalf("CanonicalBody: %v", err)
		}
		want := records.Hash(canon)
		if p.ID != want || p.Version != want {
			t.Fatalf("not content-addressed: id=%q version=%q want=%q", p.ID, p.Version, want)
		}
		// Reproducible: a second identical build hashes to the same id.
		p2, err := project.New(slug, name, owner, ts)
		if err != nil {
			t.Fatalf("New 2: %v", err)
		}
		if p2.ID != p.ID {
			t.Fatalf("not reproducible: %q != %q", p2.ID, p.ID)
		}
	})
}

// TestSlugUniquePerOwner: the Registry refuses a duplicate (owner, slug) but
// allows the same slug under a different owner.
func TestSlugUniquePerOwner(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		slug := genSlug(t)
		ownerA := "owner-aaa"
		ownerB := "owner-bbb"
		ts := "2026-06-07T09:00:00Z"

		first, err := project.New(slug, "First", ownerA, ts)
		if err != nil {
			t.Fatalf("New first: %v", err)
		}
		reg := project.NewRegistry([]project.Project{first})

		// Same owner + same slug → refused.
		if reg.CanCreate(ownerA, slug) {
			t.Fatalf("expected slug %q taken for owner %q", slug, ownerA)
		}
		if _, err := reg.Create(slug, "Dup", ownerA, ts); err != project.ErrDuplicateSlug {
			t.Fatalf("expected ErrDuplicateSlug, got %v", err)
		}
		// Different owner + same slug → allowed.
		if !reg.CanCreate(ownerB, slug) {
			t.Fatalf("expected slug %q free for owner %q", slug, ownerB)
		}
		if _, err := reg.Create(slug, "Other owner", ownerB, ts); err != nil {
			t.Fatalf("expected create for other owner, got %v", err)
		}
	})
}

// TestSoftDeleteFreesSlug: a soft-deleted project frees its slug; an archived one
// still holds it.
func TestSoftDeleteFreesSlug(t *testing.T) {
	ts := "2026-06-07T09:00:00Z"
	p, err := project.New("shop", "Shop", "owner-x", ts)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	archived, err := p.Archive()
	if err != nil {
		t.Fatalf("Archive: %v", err)
	}
	if project.NewRegistry([]project.Project{archived}).CanCreate("owner-x", "shop") {
		t.Fatalf("archived project must still hold its slug")
	}
	deleted, err := p.SoftDelete()
	if err != nil {
		t.Fatalf("SoftDelete: %v", err)
	}
	if !project.NewRegistry([]project.Project{deleted}).CanCreate("owner-x", "shop") {
		t.Fatalf("soft-deleted project must free its slug")
	}
	// Append-only: the soft delete produced a NEW id, never mutated the original.
	if deleted.ID == p.ID {
		t.Fatalf("soft delete must produce a new content address (append-only)")
	}
	if deleted.Lifecycle != project.LifecycleDeleted {
		t.Fatalf("soft delete lifecycle: %q", deleted.Lifecycle)
	}
}

// TestScopeDisjoint: two disjoint project graphs never cross-read. Scope(A) and
// Scope(B) share no element, and Scope(A) returns only rows with ProjectID == A.
func TestScopeDisjoint(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		a := "proj-A"
		b := "proj-B"
		n := rapid.IntRange(0, 12).Draw(t, "n")
		rows := make([]scopedRow, 0, n)
		for i := 0; i < n; i++ {
			pid := a
			if rapid.Bool().Draw(t, "side") {
				pid = b
			}
			rows = append(rows, scopedRow{pid: pid, tag: i})
		}

		ga := project.Scope(a, rows)
		gb := project.Scope(b, rows)

		// Each scoped view contains ONLY its project's rows.
		for _, r := range ga {
			if r.pid != a {
				t.Fatalf("Scope(A) leaked a B row: %+v", r)
			}
		}
		for _, r := range gb {
			if r.pid != b {
				t.Fatalf("Scope(B) leaked an A row: %+v", r)
			}
		}
		// Disjoint: no element appears in both views (tags are unique).
		inA := make(map[int]bool, len(ga))
		for _, r := range ga {
			inA[r.tag] = true
		}
		for _, r := range gb {
			if inA[r.tag] {
				t.Fatalf("cross-read: tag %d in both A and B", r.tag)
			}
		}
		// Partition: |A|+|B| == total (every row lands in exactly one project).
		if len(ga)+len(gb) != len(rows) {
			t.Fatalf("not a partition: %d + %d != %d", len(ga), len(gb), len(rows))
		}
		if !project.Disjoint(a, b) {
			t.Fatalf("A and B must be disjoint")
		}
	})
}

// TestScopePure: scoping is a pure function — same input → same output.
func TestScopePure(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		pid := rapid.SampledFrom([]string{"p1", "p2", "p3"}).Draw(t, "pid")
		n := rapid.IntRange(0, 10).Draw(t, "n")
		rows := make([]scopedRow, 0, n)
		for i := 0; i < n; i++ {
			rows = append(rows, scopedRow{
				pid: rapid.SampledFrom([]string{"p1", "p2", "p3"}).Draw(t, "rp"),
				tag: i,
			})
		}
		first := project.Scope(pid, rows)
		second := project.Scope(pid, rows)
		if len(first) != len(second) {
			t.Fatalf("not pure: lengths %d != %d", len(first), len(second))
		}
		for i := range first {
			if first[i] != second[i] {
				t.Fatalf("not pure at %d: %+v != %+v", i, first[i], second[i])
			}
		}
	})
}

// TestLifecycleClosed: the lifecycle set is exactly the closed three, and a built
// project at any of them validates.
func TestLifecycleClosed(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		lc := genLifecycle(t)
		p, err := project.NewWithLifecycle(genSlug(t), genName(t), genOwner(t), "2026-06-07T09:00:00Z", lc)
		if err != nil {
			t.Fatalf("NewWithLifecycle: %v", err)
		}
		if err := project.Validate(p); err != nil {
			t.Fatalf("Validate: %v", err)
		}
		ok := false
		for _, k := range project.Lifecycles() {
			if k == p.Lifecycle {
				ok = true
			}
		}
		if !ok {
			t.Fatalf("lifecycle %q not in closed set", p.Lifecycle)
		}
	})
}

// TestRejectsBadFields: empty/invalid slug, name, owner are refused — no silent
// acceptance, no guessed mapping.
func TestRejectsBadFields(t *testing.T) {
	ts := "2026-06-07T09:00:00Z"
	cases := []struct {
		slug, name, owner string
	}{
		{"", "n", "o"},
		{"Bad_Slug", "n", "o"},
		{"-lead", "n", "o"},
		{"trail-", "n", "o"},
		{"good", "", "o"},
		{"good", "n", ""},
	}
	for _, c := range cases {
		if _, err := project.New(c.slug, c.name, c.owner, ts); err == nil {
			t.Fatalf("expected rejection for %+v", c)
		}
	}
}
