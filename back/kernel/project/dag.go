package project

import "github.com/steph-frtech/aidos/back/archive/dag"

// RootNode derives the per-project DAG GENESIS node (S53 done-criterion: the DAG
// receives a root node per project). It REUSES the S24 archive/dag node scheme —
// the id is dag.NodeID over the project's content address as the label, so two
// projects yield two DIFFERENT, disjoint roots, and the same project always yields
// the same root (content-addressed, reproducible). The genesis is a human-truth
// line (StratumAbove). It is a PURE function — no DB, no clock; recording the node
// into the dag.node schema is done below the line via the store path, never here.
//
// On the (impossible-for-a-valid-project) marshal error, RootNode falls back to the
// project id itself as the node id so the function is total and never panics; a
// valid project always takes the NodeID path.
func RootNode(p Project) dag.Node {
	id, err := dag.NodeID(nil, dag.StratumAbove, projectLabel(p))
	if err != nil {
		id = p.ID
	}
	return dag.Node{
		ID:      id,
		Head:    true,
		Stratum: dag.StratumAbove,
		Label:   projectLabel(p),
	}
}

// projectLabel is the deterministic line name of a project's genesis — its slug
// keyed by its content address, so the label (and thus the root node id) is unique
// per project.
func projectLabel(p Project) string {
	return "project:" + p.Slug + "@" + p.ID
}
