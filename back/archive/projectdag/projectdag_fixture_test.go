package projectdag_test

// N2 FIXTURE MIRROR — conceptually stored in the `mirrors` schema, materialized here for the Go
// runner (the mirrors Postgres schema is back-filled at S06; this is the executable red→green
// proof, CLAUDE.md §6 bootstrap exception).
//
//	# reflects: archive.projectdag (S56 per-project DAG + namespace + frontier) · test_kind: fixture
//	# cert_language: operation-dsl/go · authority: above
//
// Each case is the frozen N2 shape: state (the project genesis / two project DAGs) → command (a
// §121 move, a duplicate, an archive, or a merge) → events (the resulting heads / refusal). These
// ARE the spec's three done-criteria:
//   - a phase cut in A is INVISIBLE from B's heads (isolation);
//   - duplicate forks an ISOLATED root (a fresh genesis sharing no node id with the source);
//   - archive MASKS without ever destroying (append-only) — Restore brings the heads back.
// Plus the roadmap's named refusal: a merge across two projects is CROSS_PROJECT_MERGE.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/merge"
	"github.com/steph-frtech/aidos/back/archive/projectdag"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/project"
)

// proj is a valid content-addressed project fixture (the method's example, not invented truth).
func proj(t *testing.T, slug string) project.Project {
	t.Helper()
	p, err := project.New(slug, "App "+slug, "owner-1", "2026-06-07T00:00:00Z")
	if err != nil {
		t.Fatalf("project.New(%q): %v", slug, err)
	}
	return p
}

// TestFixture_PhaseInAInvisibleFromHeadsOfB is the FIRST done-criterion: a phase cut (a branch)
// inside project A is never visible from the heads of project B. Two projects own two disjoint
// version spaces.
func TestFixture_PhaseInAInvisibleFromHeadsOfB(t *testing.T) {
	a := projectdag.Genesis(proj(t, "alpha"))
	b := projectdag.Genesis(proj(t, "beta"))

	// State → command: cut a new phase (branch) inside A off its genesis.
	a2, ev, br := a.Branch(a.GenesisID(), "feature-x", "cs-1")
	if br != nil {
		t.Fatalf("Branch inside A refused: %v", br)
	}
	if ev == "" {
		t.Fatalf("expected a branch event")
	}

	// A now has a head that is NOT the genesis (the new phase).
	var newPhase string
	for _, h := range a2.Heads() {
		if h.ID != a2.GenesisID() {
			newPhase = h.ID
		}
	}
	if newPhase == "" {
		t.Fatalf("A's new phase did not appear as a head")
	}

	// Events: B's heads contain NONE of A's nodes. The phase cut in A is invisible from B.
	for _, h := range b.Heads() {
		if h.ID == newPhase || h.ID == a2.GenesisID() {
			t.Fatalf("B's heads leaked an A node: %s", h.ID)
		}
	}
	// And B cannot even navigate onto A's phase (a foreign node is refused).
	if _, _, br := b.Branch(newPhase, "steal", "cs-x"); br == nil || br.Code != projectdag.CodeCrossProjectNode {
		t.Fatalf("expected CROSS_PROJECT_NODE branching onto A's phase from B, got %v", br)
	}
	// Content namespaces are disjoint too.
	keyA := projectdag.NamespaceKey(a.ProjectID(), "head:order")
	if projectdag.SameNamespace(b.ProjectID(), keyA) {
		t.Fatalf("A's namespaced key %q resolved inside B's namespace", keyA)
	}
}

// TestFixture_DuplicateForksIsolatedRoot is the SECOND done-criterion: duplicate forks an isolated
// DAG root for a new project — a fresh genesis that shares NO node id with the source, and starts
// with exactly one head (its own genesis).
func TestFixture_DuplicateForksIsolatedRoot(t *testing.T) {
	src := projectdag.Genesis(proj(t, "template-shop"))
	// Give the source some history so we prove the fork does NOT inherit it.
	src2, _, br := src.Branch(src.GenesisID(), "seeded", "cs-seed")
	if br != nil {
		t.Fatalf("seed branch refused: %v", br)
	}

	dstProject := proj(t, "my-new-shop")
	fork, br := projectdag.Duplicate(src2, dstProject)
	if br != nil {
		t.Fatalf("Duplicate refused: %v", br)
	}

	// Isolated root: the fork's genesis is a DIFFERENT node id from the source's.
	if fork.GenesisID() == src2.GenesisID() {
		t.Fatalf("fork shares the source genesis id %q — not isolated", fork.GenesisID())
	}
	// The fork shares NO node with the source.
	if fork.Contains(src2.GenesisID()) {
		t.Fatalf("fork contains the source genesis — not isolated")
	}
	for _, h := range src2.HeadsIncludingMasked() {
		if fork.Contains(h.ID) {
			t.Fatalf("fork contains a source node %q — not isolated", h.ID)
		}
	}
	// The fork starts at exactly one head: its own genesis (a fresh start).
	heads := fork.Heads()
	if len(heads) != 1 || heads[0].ID != fork.GenesisID() {
		t.Fatalf("fork did not start at a single genesis head: %+v", heads)
	}
	// The fork belongs to the destination project.
	if fork.ProjectID() != dstProject.ID {
		t.Fatalf("fork project = %q, want %q", fork.ProjectID(), dstProject.ID)
	}
}

// TestFixture_ArchiveMasksWithoutDestroying is the THIRD done-criterion: archive masks the
// project's version view (heads hidden) but keeps every node (append-only); restore brings the
// exact same heads back — nothing was destroyed.
func TestFixture_ArchiveMasksWithoutDestroying(t *testing.T) {
	pd := projectdag.Genesis(proj(t, "to-archive"))
	pd2, _, br := pd.Branch(pd.GenesisID(), "work", "cs-1")
	if br != nil {
		t.Fatalf("branch refused: %v", br)
	}
	headsBefore := pd2.Heads()
	if len(headsBefore) == 0 {
		t.Fatalf("expected heads before archive")
	}

	// Command: archive.
	archived := pd2.Archive()

	// Events: the default heads view is masked …
	if len(archived.Heads()) != 0 {
		t.Fatalf("archived project still exposed heads in the default view: %+v", archived.Heads())
	}
	// … but the nodes are KEPT (append-only) — the masked view still has them.
	if len(archived.HeadsIncludingMasked()) != len(headsBefore) {
		t.Fatalf("archive DESTROYED nodes: kept %d, had %d", len(archived.HeadsIncludingMasked()), len(headsBefore))
	}
	if !archived.Masked() {
		t.Fatalf("archived project not masked")
	}

	// Command: restore → the exact same heads come back (nothing was lost).
	restored := archived.Restore()
	if restored.Masked() {
		t.Fatalf("restored project still masked")
	}
	if len(restored.Heads()) != len(headsBefore) {
		t.Fatalf("restore did not bring back the heads: got %d, want %d", len(restored.Heads()), len(headsBefore))
	}
	for i, h := range restored.Heads() {
		if h.ID != headsBefore[i].ID {
			t.Fatalf("restored head %d = %q, want %q", i, h.ID, headsBefore[i].ID)
		}
	}
}

// TestFixture_CrossProjectMergeRefused is the roadmap's named refusal: a merge whose two sides
// belong to different projects is blocked with CROSS_PROJECT_MERGE before the merge engine runs.
func TestFixture_CrossProjectMergeRefused(t *testing.T) {
	a := proj(t, "alpha")
	b := proj(t, "beta")

	base := merge.Base{ID: "v0", Cut: nil}
	left := merge.Branch{Ancestor: "v0"}
	right := merge.Branch{Ancestor: "v0"}

	// Cross-project: refused.
	_, br := projectdag.Merge(a.ID, b.ID, base, left, right, links.Heads{})
	if br == nil || br.Code != projectdag.CodeCrossProjectMerge {
		t.Fatalf("expected CROSS_PROJECT_MERGE, got %v", br)
	}
	if len(br.HowToFix) == 0 {
		t.Fatalf("CROSS_PROJECT_MERGE must carry an actionable how_to_fix")
	}

	// Same project: the merge engine runs (no frontier refusal) and returns a verdict.
	res, br := projectdag.Merge(a.ID, a.ID, base, left, right, links.Heads{})
	if br != nil {
		t.Fatalf("same-project merge refused by the frontier: %v", br)
	}
	if res.Status == "" {
		t.Fatalf("same-project merge produced no verdict")
	}
}
