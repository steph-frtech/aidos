// Command project is the AIDOS Kernel/Archive `project` MCP server (S53; ADR 0009).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool) over
// the `projects` schema — the first-rank multi-tenant root scope under which every
// later truth lives (app-builder EPIC 1). A project is BELOW the wall (CLAUDE.md §2):
// the projects schema is not kernel/mirrors/fitness, it is content-addressed and
// append-only, so this server writes it directly via the store path (like the
// Archive content-store). It NEVER writes kernel/mirrors/fitness, and it offers NO
// hard-delete tool — soft delete only, append-only (the hard GDPR delete is S116).
//
// Tools (one tool = one backend op):
//
//	project_create   — create a content-addressed active project + its DAG root
//	                    (refused if the slug is already taken for that owner)
//	project_list     — list the live (head) projects, optional lifecycle filter
//	project_get      — read one project by id
//	project_archive  — active → archived (append-only new row, head moves)
//	project_restore  — archived → active (append-only)
//	project_delete   — soft delete (lifecycle=deleted; the row is KEPT, never dropped)
//
// DETERMINISM-FIRST (CLAUDE.md §6): every decision (content-addressing, slug
// uniqueness, lifecycle transition, scoping) is the pure project.* functions; this
// server only persists an already-decided, content-addressed row. Transport: stdio.
// DSN comes from AIDOS_PROJECTS_DSN.
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/project"
)

// ── Tool I/O types ──

type createInput struct {
	Slug      string `json:"slug" jsonschema:"the stable URL-safe handle, a-z0-9 with single hyphens, UNIQUE per owner"`
	Name      string `json:"name" jsonschema:"the human-readable project title"`
	OwnerRef  string `json:"owner_ref" jsonschema:"the owning identity reference"`
	CreatedAt string `json:"created_at" jsonschema:"the creation instant (RFC3339), passed in — no clock in the engine"`
}

type idInput struct {
	ID string `json:"id" jsonschema:"the project content-hash id"`
}

type listInput struct {
	Lifecycle string `json:"lifecycle,omitempty" jsonschema:"optional filter: active|archived|deleted"`
}

type projectOutput struct {
	ID        string `json:"id"`
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	OwnerRef  string `json:"owner_ref"`
	CreatedAt string `json:"created_at"`
	Lifecycle string `json:"lifecycle"`
	// RootNodeID is the per-project DAG genesis node id (S53).
	RootNodeID string `json:"root_node_id"`
}

type listOutput struct {
	Projects []projectOutput `json:"projects"`
}

func toOutput(p project.Project) projectOutput {
	return projectOutput{
		ID:         p.ID,
		Slug:       p.Slug,
		Name:       p.Name,
		OwnerRef:   p.OwnerRef,
		CreatedAt:  p.CreatedAt,
		Lifecycle:  string(p.Lifecycle),
		RootNodeID: project.RootNode(p).ID,
	}
}

type server struct {
	store *Store
}

func (s *server) create(ctx context.Context, _ *mcp.CallToolRequest, in createInput) (*mcp.CallToolResult, projectOutput, error) {
	heads, err := s.store.Heads(ctx)
	if err != nil {
		return nil, projectOutput{}, err
	}
	// The deterministic uniqueness gate (slug unique per owner) — pure code, never an LLM.
	reg := project.NewRegistry(heads)
	p, err := reg.Create(in.Slug, in.Name, in.OwnerRef, in.CreatedAt)
	if err != nil {
		return nil, projectOutput{}, err
	}
	if err := s.store.Insert(ctx, p); err != nil {
		return nil, projectOutput{}, err
	}
	return nil, toOutput(p), nil
}

func (s *server) list(ctx context.Context, _ *mcp.CallToolRequest, in listInput) (*mcp.CallToolResult, listOutput, error) {
	heads, err := s.store.Heads(ctx)
	if err != nil {
		return nil, listOutput{}, err
	}
	out := listOutput{Projects: make([]projectOutput, 0, len(heads))}
	for _, p := range heads {
		if in.Lifecycle != "" && string(p.Lifecycle) != in.Lifecycle {
			continue
		}
		out.Projects = append(out.Projects, toOutput(p))
	}
	return nil, out, nil
}

func (s *server) get(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, projectOutput, error) {
	p, err := s.store.Get(ctx, in.ID)
	if err != nil {
		return nil, projectOutput{}, err
	}
	return nil, toOutput(p), nil
}

// transition loads a project head, applies a pure lifecycle gesture, and supersedes
// it with the new content-addressed row (append-only — the head moves, nothing dropped).
func (s *server) transition(ctx context.Context, id string, gesture func(project.Project) (project.Project, error)) (projectOutput, error) {
	p, err := s.store.Get(ctx, id)
	if err != nil {
		return projectOutput{}, err
	}
	next, err := gesture(p)
	if err != nil {
		return projectOutput{}, err
	}
	if err := s.store.Supersede(ctx, p, next); err != nil {
		return projectOutput{}, err
	}
	return toOutput(next), nil
}

func (s *server) archive(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, projectOutput, error) {
	out, err := s.transition(ctx, in.ID, project.Project.Archive)
	return nil, out, err
}

func (s *server) restore(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, projectOutput, error) {
	out, err := s.transition(ctx, in.ID, project.Project.Restore)
	return nil, out, err
}

func (s *server) softDelete(ctx context.Context, _ *mcp.CallToolRequest, in idInput) (*mcp.CallToolResult, projectOutput, error) {
	out, err := s.transition(ctx, in.ID, project.Project.SoftDelete)
	return nil, out, err
}

// newMCPServer builds the MCP server and registers the project tools. There is
// deliberately NO hard-delete tool: a project is soft-deleted (kept, append-only);
// the hard GDPR delete is S116.
func newMCPServer(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-project", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_create", Description: "Create a content-addressed active project + its per-project DAG root. Slug unique per owner. Below the wall (the store path); never writes the kernel."}, s.create)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_list", Description: "List the live (head) projects, optional lifecycle filter."}, s.list)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_get", Description: "Read one project by id (+ its DAG root node id)."}, s.get)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_archive", Description: "Archive a project (append-only; the row is kept, the head moves)."}, s.archive)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_restore", Description: "Restore an archived project to active (append-only)."}, s.restore)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_delete", Description: "Soft-delete a project (lifecycle=deleted; the row is KEPT, never dropped). Hard GDPR delete is S116."}, s.softDelete)
	return srv
}

func main() {
	dsn := os.Getenv("AIDOS_PROJECTS_DSN")
	if dsn == "" {
		log.Fatal("project: AIDOS_PROJECTS_DSN is required")
	}
	ctx := context.Background()
	st, err := NewStore(ctx, dsn)
	if err != nil {
		log.Fatal(fmt.Errorf("project: open store: %w", err))
	}
	defer st.Close()

	srv := newMCPServer(&server{store: st})
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("project: run: %v", err)
	}
}
