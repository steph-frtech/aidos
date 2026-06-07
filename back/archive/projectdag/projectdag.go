// Package projectdag is the S56 PER-PROJECT version space (app-builder EPIC 1):
// each project owns its OWN DAG genesis and its OWN content-addressed namespace, and
// every §121 navigation move (branch / checkout-ancestor / rebranch) AND the §122
// semantic merge stay strictly INSIDE the project's frontier. A merge across two
// different projects is REFUSED with BlockReason CROSS_PROJECT_MERGE — the version-DAG
// twin of the S55 cross-project wall (which guards the row-level read/write).
//
// THE FRONTIER (CLAUDE.md §2, S53–S55). S53 gave every project a content-addressed
// `project` record + a per-project DAG genesis (project.RootNode). S54 added a
// project_id column to every truth row; S55 fenced the row-level reads/writes (hook +
// RLS keyed on (identity, project)). S56 closes the version-space side: the DAG nodes
// (stable phases) and the content namespace are partitioned by project, so a phase cut
// in project A is INVISIBLE from the heads of project B, and a merge can never join two
// projects' lines. The frontier is a PURE predicate — sameProject(a, b) — exactly as
// S55's wall is a pure predicate.
//
// THREE DONE-CRITERIA, all pure and mirror-proven (the spec's fixture line):
//   - a phase cut in A is invisible from B's heads — HeadsOf(scoped) never returns a
//     node from another project, and Branch/Checkout/Rebranch refuse a foreign node
//     (ErrCrossProjectNode);
//   - duplicate forks an ISOLATED root — Duplicate(src, dst) seeds a brand-new genesis
//     for dst that shares NO node id with src (a different project id ⇒ a different
//     content address), the template-instantiation primitive (consumed by S81);
//   - archive masks without ever destroying — Archive(pd) flips a lifecycle FLAG on the
//     project's view; the nodes and edges are kept entirely (append-only), Restore
//     un-masks them. Nothing is deleted, ever.
//
// REUSE, DON'T REINVENT (CLAUDE.md §6). The node id is S24 dag.NodeID (S01/S02
// records.Hash), NEVER forked; the moves delegate to S24 dag.Branch / dag.CheckoutAncestor
// / dag.Rebranch; the merge delegates to S122 merge.MergeSemantic — this package only
// adds the project FENCE around them. The genesis reuses S53 project.RootNode. The
// content namespace reuses the S01 content-store key scheme (a prefix, not a new hash).
//
// PURE / DETERMINISM-FIRST (CLAUDE.md §6/§8): every exported function is TOTAL and
// deterministic — no DB, no clock, no rng, no I/O, no LLM, NO WRITE. Same input ⇒ same
// output and it NEVER panics; a foreign node / a cross-project merge yields an explicit
// BlockReason refusal, never a guessed join. The rapid property mirror pins isolation,
// the frontier predicate, append-only growth and reproducibility. Recording a node into
// the dag.node schema rides the privileged `aidos` writer via the S24 dag MCP — never
// the agent, never from here (this package returns VALUES).
package projectdag

import (
	"strings"

	"github.com/steph-frtech/aidos/back/archive/dag"
	"github.com/steph-frtech/aidos/back/archive/merge"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/project"
)

// BlockCode is the stable, machine-readable code of a refusal (CLAUDE.md §2).
type BlockCode string

const (
	// CodeCrossProjectMerge — a merge whose left and right belong to different
	// projects (the roadmap's named refusal: "un merge inter-projets est refusé").
	CodeCrossProjectMerge BlockCode = "CROSS_PROJECT_MERGE"
	// CodeCrossProjectNode — a navigation move (branch/checkout/rebranch) targeting a
	// node outside the project's frontier.
	CodeCrossProjectNode BlockCode = "CROSS_PROJECT_NODE"
)

// BlockReason is the actionable refusal shape shared across AIDOS block sites
// (CLAUDE.md §2: code, severity, explanation, how_to_fix[]).
type BlockReason struct {
	Code        BlockCode `json:"code"`
	Severity    string    `json:"severity"`
	Explanation string    `json:"explanation"`
	HowToFix    []string  `json:"how_to_fix"`
}

func (b *BlockReason) Error() string {
	if b == nil {
		return ""
	}
	return string(b.Code) + ": " + b.Explanation
}

// ── content namespace ──

// ContentNamespace is the per-project PREFIX of every content-store key (S01) and DAG
// line label belonging to a project. It is NOT a new hash scheme — the content address
// is still S01 records.Hash; the namespace only KEYS the head pointer so two projects'
// content stores never collide on the same logical key. Deterministic and total.
func ContentNamespace(projectID string) string {
	return "project/" + projectID + "/"
}

// NamespaceKey scopes a logical content-store key under a project's namespace, so a
// "head:order" key in project A and the same key in project B address different rows.
// Reuses the S01 content-store key path (a prefix), never a forked store.
func NamespaceKey(projectID, key string) string {
	return ContentNamespace(projectID) + key
}

// SameNamespace reports whether a namespaced key belongs to the given project — the
// pure read-side fence (a key of project B is invisible when reading project A).
func SameNamespace(projectID, namespacedKey string) bool {
	return strings.HasPrefix(namespacedKey, ContentNamespace(projectID))
}

// ── per-project DAG value ──

// ProjectDAG is a project's slice of the version space: the project's content-addressed
// id, its DAG value (genesis + branches), and whether the project's version view is
// masked (archived). It is immutable by convention — the moves return a NEW ProjectDAG
// (append-only), never mutate the receiver.
type ProjectDAG struct {
	projectID string
	genesisID string
	d         dag.DAG
	masked    bool
}

// ProjectID returns the project this DAG belongs to.
func (pd ProjectDAG) ProjectID() string { return pd.projectID }

// GenesisID returns the project's DAG genesis (root) node id (S53 project.RootNode).
func (pd ProjectDAG) GenesisID() string { return pd.genesisID }

// DAG returns the underlying S24 DAG value (a copy; the caller cannot mutate the
// project's DAG through it).
func (pd ProjectDAG) DAG() dag.DAG { return dag.New(pd.d.Nodes(), pd.d.Edges()) }

// Masked reports whether the project's version view is archived (masked but kept).
func (pd ProjectDAG) Masked() bool { return pd.masked }

// Genesis derives a project's isolated version space: a single genesis node (S53
// project.RootNode — content-addressed on the project, so two projects yield two
// DIFFERENT, disjoint roots) and an empty edge set. PURE; the project must be valid.
func Genesis(p project.Project) ProjectDAG {
	root := project.RootNode(p)
	return ProjectDAG{
		projectID: p.ID,
		genesisID: root.ID,
		d:         dag.New([]dag.Node{root}, nil),
		// A project's version view is masked iff the project is archived (S53 lifecycle).
		masked: p.Lifecycle == project.LifecycleArchived,
	}
}

// Heads returns the current heads of the project's DAG — NEVER a node from another
// project (a project's DAG only ever contains its own nodes; this is the isolation
// done-criterion read-side). When the project is masked (archived) the heads are hidden
// from the default view but the nodes are kept (append-only); HeadsIncludingMasked
// always returns them.
func (pd ProjectDAG) Heads() []dag.Node {
	if pd.masked {
		return nil
	}
	return dag.Heads(pd.d)
}

// HeadsIncludingMasked returns the heads even when the project is archived — proving
// archive MASKS without destroying (the nodes are still there).
func (pd ProjectDAG) HeadsIncludingMasked() []dag.Node {
	return dag.Heads(pd.d)
}

// Contains reports whether a node id is inside this project's frontier.
func (pd ProjectDAG) Contains(nodeID string) bool {
	_, ok := pd.d.Node(nodeID)
	return ok
}

// Branch opens an alternative line from `from` INSIDE the project's frontier. If `from`
// is not a node of THIS project's DAG it is refused with CROSS_PROJECT_NODE — a phase of
// another project is invisible here. PURE; append-only.
func (pd ProjectDAG) Branch(from, label, changeset string) (ProjectDAG, dag.MovementEvent, *BlockReason) {
	if !pd.Contains(from) {
		return pd, "", crossProjectNodeReason(pd.projectID, from)
	}
	nd, ev, err := dag.Branch(pd.d, from, label, changeset)
	if err != nil {
		return pd, "", crossProjectNodeReason(pd.projectID, from)
	}
	return ProjectDAG{projectID: pd.projectID, genesisID: pd.genesisID, d: nd, masked: pd.masked}, ev, nil
}

// CheckoutAncestor makes a prior stable phase the head INSIDE the frontier. A foreign
// ancestor is refused. PURE; only moves the head flag (append-only).
func (pd ProjectDAG) CheckoutAncestor(ancestor string) (ProjectDAG, dag.MovementEvent, *BlockReason) {
	if !pd.Contains(ancestor) {
		return pd, "", crossProjectNodeReason(pd.projectID, ancestor)
	}
	nd, ev, err := dag.CheckoutAncestor(pd.d, ancestor)
	if err != nil {
		return pd, "", crossProjectNodeReason(pd.projectID, ancestor)
	}
	return ProjectDAG{projectID: pd.projectID, genesisID: pd.genesisID, d: nd, masked: pd.masked}, ev, nil
}

// Rebranch opens a new line from a recheckout-ed ancestor INSIDE the frontier. A foreign
// ancestor is refused. PURE; append-only.
func (pd ProjectDAG) Rebranch(ancestor, label, changeset string) (ProjectDAG, dag.MovementEvent, *BlockReason) {
	if !pd.Contains(ancestor) {
		return pd, "", crossProjectNodeReason(pd.projectID, ancestor)
	}
	nd, ev, err := dag.Rebranch(pd.d, ancestor, label, changeset)
	if err != nil {
		return pd, "", crossProjectNodeReason(pd.projectID, ancestor)
	}
	return ProjectDAG{projectID: pd.projectID, genesisID: pd.genesisID, d: nd, masked: pd.masked}, ev, nil
}

// Archive masks the project's version view (lifecycle archived) WITHOUT touching its
// nodes/edges — append-only. The heads disappear from the default view; the DAG is kept
// entirely and Restore un-masks it. PURE.
func (pd ProjectDAG) Archive() ProjectDAG {
	return ProjectDAG{projectID: pd.projectID, genesisID: pd.genesisID, d: pd.d, masked: true}
}

// Restore un-masks an archived project's version view — the nodes were never destroyed,
// so the heads reappear exactly as they were. PURE.
func (pd ProjectDAG) Restore() ProjectDAG {
	return ProjectDAG{projectID: pd.projectID, genesisID: pd.genesisID, d: pd.d, masked: false}
}

// Duplicate FORKS an isolated root for a NEW project from a source project's DAG — the
// template-instantiation / "fork this app" primitive (consumed by S81's catalogue and
// S56's duplicate-from-template gesture). The destination project gets a brand-new
// genesis (project.RootNode(dst) — content-addressed on dst, so it shares NO node id with
// src) and an EMPTY line: a fork is a fresh start under a new frontier, never an aliased
// reference into the source's DAG (which would break isolation). PURE; src is unchanged.
//
// (Copying the source's structure into the fork is a later, richer template step — S81 —
// done by re-emitting under the new frontier through the privileged writer; S56's
// contract is the ISOLATED root, proven by genesisID disjointness.)
func Duplicate(src ProjectDAG, dst project.Project) (ProjectDAG, *BlockReason) {
	_ = src // src is read-only; a fork never reaches back into it.
	return Genesis(dst), nil
}

// SameProject is the pure frontier predicate — two projects are mergeable IFF they are
// the SAME project. The version-DAG twin of S55's cross-project wall predicate.
func SameProject(a, b string) bool { return a == b && strings.TrimSpace(a) != "" }

// Merge runs the S122 semantic merge ONLY when left and right belong to the SAME
// project. A cross-project merge is REFUSED with CROSS_PROJECT_MERGE before the merge
// engine is ever consulted — the version space of two tenants can never be joined. PURE;
// the merge itself stays the unforked S122 oracle (the mirror, not the diff, decides).
func Merge(
	leftProjectID, rightProjectID string,
	base merge.Base, left, right merge.Branch, heads links.Heads,
) (merge.MergeResult, *BlockReason) {
	if !SameProject(leftProjectID, rightProjectID) {
		return merge.MergeResult{}, crossProjectMergeReason(leftProjectID, rightProjectID)
	}
	return merge.MergeSemantic(base, left, right, heads), nil
}

// ── refusals ──

func crossProjectMergeReason(left, right string) *BlockReason {
	return &BlockReason{
		Code:     CodeCrossProjectMerge,
		Severity: "error",
		Explanation: "Refus du mur de version : tentative de merge entre le projet « " + left +
			" » et le projet « " + right + " ». La frontière du projet est inviolable — deux espaces " +
			"de version distincts ne se joignent jamais.",
		HowToFix: []string{
			"Un merge ne s'opère qu'à l'INTÉRIEUR d'un même projet (branch/checkout/rebranch/merge dans sa frontière).",
			"Pour réutiliser une app comme base, utilisez duplicate-from-template (S56) — il forke une racine DAG isolée, il ne joint pas les projets.",
		},
	}
}

func crossProjectNodeReason(projectID, nodeID string) *BlockReason {
	return &BlockReason{
		Code:     CodeCrossProjectNode,
		Severity: "error",
		Explanation: "Refus du mur de version : le nœud « " + nodeID + " » n'appartient pas au projet « " +
			projectID + " ». Une phase d'un autre projet est invisible depuis les heads de celui-ci.",
		HowToFix: []string{
			"Naviguez uniquement sur des phases du projet courant — chaque projet a sa propre genèse DAG.",
			"Basculez sur le projet visé (project switcher, S57) pour travailler dans sa frontière.",
		},
	}
}
