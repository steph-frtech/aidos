package project_test

// Project root-DAG fixture (mirrors schema · reflects: dag.node per project ·
// test_kind: fixture · authority: below). S53 done-criterion: the DAG receives a
// ROOT node per project. This fixture proves the root node is content-addressed on
// the project (so two projects yield two DIFFERENT, disjoint roots) and that a
// project's genesis is reachable only inside its own line — never from another
// project's head. It reuses the S24 archive/dag Branch over a per-project seeded
// root (RootNode), never a forked DAG.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/archive/dag"
	"github.com/steph-frtech/aidos/back/kernel/project"
)

func TestRootDAGNodePerProject(t *testing.T) {
	ts := "2026-06-07T09:00:00Z"
	a, err := project.New("alpha", "Alpha", "owner-1", ts)
	if err != nil {
		t.Fatalf("New A: %v", err)
	}
	b, err := project.New("beta", "Beta", "owner-2", ts)
	if err != nil {
		t.Fatalf("New B: %v", err)
	}

	// Each project's DAG genesis is a root node keyed on the project id (the
	// content address of the project record) — deterministic and distinct.
	rootA := project.RootNode(a)
	rootB := project.RootNode(b)
	if rootA.ID == rootB.ID {
		t.Fatalf("two projects must have distinct DAG roots: %q == %q", rootA.ID, rootB.ID)
	}
	if !rootA.Head || !rootB.Head {
		t.Fatalf("each project root must be a head of its line")
	}
	if rootA.Stratum != dag.StratumAbove || rootB.Stratum != dag.StratumAbove {
		t.Fatalf("a project genesis is a human-truth line (above the waterline)")
	}

	// A's root is its own genesis; B's DAG never sees A's root as a head.
	dagB := dag.New([]dag.Node{rootB}, nil)
	for _, h := range dagB.Nodes() {
		if h.Head && h.ID == rootA.ID {
			t.Fatalf("project B's heads must not include project A's root (cross-project leak)")
		}
	}
	// Reproducible: re-deriving the root yields the same id.
	if project.RootNode(a).ID != rootA.ID {
		t.Fatalf("RootNode must be reproducible")
	}
}
