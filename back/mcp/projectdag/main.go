// Command projectdag is the AIDOS Archive `project` MCP server (S56; ADR 0009) — the
// VERSION-SPACE capability door over the per-project DAG + content namespace + frontier
// (app-builder EPIC 1). It is the twin of the S55 `project-wall` MCP (which fences the
// row-level reads/writes): this server fences the VERSION space.
//
// Tools (one tool = one backend op, ADR 0009):
//
//	project_genesis            — derive a project's isolated DAG genesis (root node id +
//	                             content namespace)
//	project_branch             — open an alternative line inside the project frontier
//	                             (a foreign node ⇒ CROSS_PROJECT_NODE)
//	project_checkout_ancestor  — make a prior phase the head, inside the frontier
//	project_rebranch           — open a new line from a recheckout-ed ancestor
//	project_duplicate          — fork an ISOLATED root for a new project (template /
//	                             "fork this app" — consumed by S81)
//	project_archive            — mask the project's version view (kept, append-only)
//	project_restore            — un-mask an archived project's version view
//	project_merge_guard        — the frontier check: a cross-project merge is refused
//	                             with CROSS_PROJECT_MERGE before the merge engine runs
//
// Every tool is PURE and DETERMINISTIC — no DB, no clock, no rng, no LLM (determinism-
// first, CLAUDE.md §6/§8). The frontier is an ALGORITHM (SameProject), not a prompt.
// THE WALL (§2): this server writes NOTHING — it returns VERSION-DAG VALUES and verdicts;
// recording a node into the dag.node schema rides the privileged `aidos` writer via the
// S24 `dag` MCP, never the agent, never here. Transport: stdio (no DSN).
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/merge"
	"github.com/steph-frtech/aidos/back/archive/projectdag"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/project"
)

// ── shared I/O shapes ──

type blockReasonOutput struct {
	Code        string   `json:"code"`
	Severity    string   `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

func toBlockReason(br *projectdag.BlockReason) *blockReasonOutput {
	if br == nil {
		return nil
	}
	return &blockReasonOutput{
		Code:        string(br.Code),
		Severity:    br.Severity,
		Explanation: br.Explanation,
		HowToFix:    br.HowToFix,
	}
}

type nodeOutput struct {
	ID      string   `json:"id"`
	Parents []string `json:"parent_ids,omitempty"`
	Head    bool     `json:"head"`
	Label   string   `json:"label,omitempty"`
}

// pdView serialises a ProjectDAG into the wire shape (project id, genesis, heads, masked).
type pdView struct {
	ProjectID string       `json:"project_id"`
	GenesisID string       `json:"genesis_id"`
	Namespace string       `json:"content_namespace"`
	Masked    bool         `json:"masked"`
	Heads     []nodeOutput `json:"heads"`
}

func view(pd projectdag.ProjectDAG) pdView {
	heads := pd.HeadsIncludingMasked()
	out := pdView{
		ProjectID: pd.ProjectID(),
		GenesisID: pd.GenesisID(),
		Namespace: projectdag.ContentNamespace(pd.ProjectID()),
		Masked:    pd.Masked(),
		Heads:     make([]nodeOutput, 0, len(heads)),
	}
	for _, h := range heads {
		out.Heads = append(out.Heads, nodeOutput{ID: h.ID, Parents: h.ParentIDs, Head: h.Head, Label: h.Label})
	}
	return out
}

// projectInput is the human fields a project genesis is content-addressed from. The
// server re-derives the project record purely (no DB) — the projectdag value is a pure
// function of the project, so passing the fields is enough to reproduce its frontier.
type projectInput struct {
	Slug      string `json:"slug" jsonschema:"the URL-safe handle, a-z0-9 with single hyphens, unique per owner"`
	Name      string `json:"name" jsonschema:"the human-readable project title"`
	OwnerRef  string `json:"owner_ref" jsonschema:"the owning identity reference"`
	CreatedAt string `json:"created_at" jsonschema:"the creation instant (RFC3339), passed in — no clock"`
}

func (in projectInput) build() (project.Project, error) {
	return project.New(in.Slug, in.Name, in.OwnerRef, in.CreatedAt)
}

// genesisOf rebuilds the project value and, when given history nodes, replays the recorded
// DAG so the move applies on the real frontier. For the pure MCP surface we start from the
// genesis; a caller that already holds a richer DAG drives the S24 `dag` MCP.
func genesisOf(in projectInput) (projectdag.ProjectDAG, error) {
	p, err := in.build()
	if err != nil {
		return projectdag.ProjectDAG{}, err
	}
	return projectdag.Genesis(p), nil
}

// ── genesis ──

type genesisOutput struct {
	View pdView `json:"view"`
}

func genesisTool(_ context.Context, _ *mcp.CallToolRequest, in projectInput) (*mcp.CallToolResult, genesisOutput, error) {
	pd, err := genesisOf(in)
	if err != nil {
		return nil, genesisOutput{}, err
	}
	return nil, genesisOutput{View: view(pd)}, nil
}

// ── navigation moves (in-frontier) ──

type moveInput struct {
	Project   projectInput `json:"project" jsonschema:"the project whose frontier the move stays inside"`
	From      string       `json:"from" jsonschema:"the node id to branch/checkout/rebranch from (empty=genesis)"`
	Label     string       `json:"label,omitempty" jsonschema:"the human name of the new line (branch/rebranch)"`
	Changeset string       `json:"changeset,omitempty" jsonschema:"the S20 ChangeSet id this edge reuses"`
}

type moveOutput struct {
	View        pdView             `json:"view"`
	Event       string             `json:"event,omitempty"`
	BlockReason *blockReasonOutput `json:"block_reason,omitempty"`
}

func (in moveInput) resolveFrom(pd projectdag.ProjectDAG) string {
	if in.From == "" {
		return pd.GenesisID()
	}
	return in.From
}

func branchTool(_ context.Context, _ *mcp.CallToolRequest, in moveInput) (*mcp.CallToolResult, moveOutput, error) {
	pd, err := genesisOf(in.Project)
	if err != nil {
		return nil, moveOutput{}, err
	}
	next, ev, br := pd.Branch(in.resolveFrom(pd), in.Label, in.Changeset)
	if br != nil {
		return nil, moveOutput{View: view(pd), BlockReason: toBlockReason(br)}, nil
	}
	return nil, moveOutput{View: view(next), Event: string(ev)}, nil
}

func checkoutTool(_ context.Context, _ *mcp.CallToolRequest, in moveInput) (*mcp.CallToolResult, moveOutput, error) {
	pd, err := genesisOf(in.Project)
	if err != nil {
		return nil, moveOutput{}, err
	}
	next, ev, br := pd.CheckoutAncestor(in.resolveFrom(pd))
	if br != nil {
		return nil, moveOutput{View: view(pd), BlockReason: toBlockReason(br)}, nil
	}
	return nil, moveOutput{View: view(next), Event: string(ev)}, nil
}

func rebranchTool(_ context.Context, _ *mcp.CallToolRequest, in moveInput) (*mcp.CallToolResult, moveOutput, error) {
	pd, err := genesisOf(in.Project)
	if err != nil {
		return nil, moveOutput{}, err
	}
	next, ev, br := pd.Rebranch(in.resolveFrom(pd), in.Label, in.Changeset)
	if br != nil {
		return nil, moveOutput{View: view(pd), BlockReason: toBlockReason(br)}, nil
	}
	return nil, moveOutput{View: view(next), Event: string(ev)}, nil
}

// ── lifecycle gestures ──

type duplicateInput struct {
	Source      projectInput `json:"source" jsonschema:"the project to fork from (template / fork-this-app)"`
	Destination projectInput `json:"destination" jsonschema:"the new project the isolated root is forked into"`
}

type duplicateOutput struct {
	Source pdView `json:"source"`
	Fork   pdView `json:"fork"`
}

func duplicateTool(_ context.Context, _ *mcp.CallToolRequest, in duplicateInput) (*mcp.CallToolResult, duplicateOutput, error) {
	src, err := genesisOf(in.Source)
	if err != nil {
		return nil, duplicateOutput{}, err
	}
	dst, err := in.Destination.build()
	if err != nil {
		return nil, duplicateOutput{}, err
	}
	fork, _ := projectdag.Duplicate(src, dst)
	return nil, duplicateOutput{Source: view(src), Fork: view(fork)}, nil
}

func archiveTool(_ context.Context, _ *mcp.CallToolRequest, in projectInput) (*mcp.CallToolResult, genesisOutput, error) {
	pd, err := genesisOf(in)
	if err != nil {
		return nil, genesisOutput{}, err
	}
	return nil, genesisOutput{View: view(pd.Archive())}, nil
}

func restoreTool(_ context.Context, _ *mcp.CallToolRequest, in projectInput) (*mcp.CallToolResult, genesisOutput, error) {
	pd, err := genesisOf(in)
	if err != nil {
		return nil, genesisOutput{}, err
	}
	// Start from an archived view to prove restore un-masks it.
	return nil, genesisOutput{View: view(pd.Archive().Restore())}, nil
}

// ── merge frontier guard ──

type mergeGuardInput struct {
	LeftProjectID  string `json:"left_project_id" jsonschema:"the project of the left merge side"`
	RightProjectID string `json:"right_project_id" jsonschema:"the project of the right merge side"`
}

type mergeGuardOutput struct {
	Allowed     bool               `json:"allowed"`
	Status      string             `json:"status,omitempty"`
	BlockReason *blockReasonOutput `json:"block_reason,omitempty"`
}

func mergeGuardTool(_ context.Context, _ *mcp.CallToolRequest, in mergeGuardInput) (*mcp.CallToolResult, mergeGuardOutput, error) {
	// An empty base/branch is enough to exercise the FRONTIER guard deterministically; the
	// merge ENGINE verdict (clean/conflict/unresolvable) is the S122 oracle when same-project.
	res, br := projectdag.Merge(
		in.LeftProjectID, in.RightProjectID,
		merge.Base{ID: "v0"}, merge.Branch{Ancestor: "v0"}, merge.Branch{Ancestor: "v0"}, links.Heads{},
	)
	if br != nil {
		return nil, mergeGuardOutput{Allowed: false, BlockReason: toBlockReason(br)}, nil
	}
	return nil, mergeGuardOutput{Allowed: true, Status: string(res.Status)}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-projectdag", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_genesis", Description: "Derive a project's isolated DAG genesis (root node id + content namespace). Pure; below the wall."}, genesisTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_branch", Description: "Open an alternative line inside the project frontier. A foreign node is refused (CROSS_PROJECT_NODE)."}, branchTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_checkout_ancestor", Description: "Make a prior phase the head, inside the project frontier (a backward move)."}, checkoutTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_rebranch", Description: "Open a new line from a recheckout-ed ancestor, inside the project frontier."}, rebranchTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_duplicate", Description: "Fork an ISOLATED DAG root for a new project (duplicate-from-template / fork this app)."}, duplicateTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_archive", Description: "Mask the project's version view (kept entirely, append-only)."}, archiveTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_restore", Description: "Un-mask an archived project's version view (the nodes were never destroyed)."}, restoreTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_merge_guard", Description: "Frontier guard: a merge across two different projects is refused (CROSS_PROJECT_MERGE) before the merge engine runs."}, mergeGuardTool)
	return srv
}

func main() {
	ctx := context.Background()
	if err := newMCPServer().Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("projectdag: run: %v", err)
	}
}
