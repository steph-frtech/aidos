// Command workspace is the AIDOS S82 PER-PROJECT SANDBOX MCP server (ADR 0009: every backend
// op is an MCP tool). It is the capability door over back/runtime/workspace — the isolated
// per-project workspace (container + git/jj repo + worktree + CPU/mem/disk/time limits) where a
// project's generated code lives, compiles and runs its mirrors. Four tools:
//
//	workspace_provision    — provision an isolated workspace for a project → its rooted descriptor
//	                         (ADR 0001 zones realized, private git/jj worktree, declared caps). PURE.
//	workspace_can_access   — the cross-project isolation verdict: may THIS workspace read/write a
//	                         path? A path under another project's root, or the truth-store, is
//	                         refused with SANDBOX_ESCAPE.
//	workspace_check_resources — the anti-noisy-neighbor kill check: a sampled usage vs the declared
//	                         caps → killed (SANDBOX_RESOURCE_LIMIT) when a positive cap is crossed.
//	workspace_build_hello  — confirm a confined hello-world builds+tests inside the workspace.
//
// STATELESS + DETERMINISTIC (CLAUDE.md §6/§8). Each tool is a PURE function of its input; the
// server holds no DB, no clock, no RNG, and never touches kernel/mirrors/fitness (the wall). A
// workspace writes NO truth: its root is below the line; the truth-store is OUTSIDE every
// workspace root (reaching it is exactly a SANDBOX_ESCAPE). Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/workspace"
)

// ── provision ──

type provisionInput struct {
	ProjectID      string `json:"project_id" jsonschema:"the project the workspace is provisioned for (non-empty)"`
	VCS            string `json:"vcs" jsonschema:"the version-control backend: git (default) or jj"`
	MaxMemoryMB    int    `json:"max_memory_mb" jsonschema:"memory cap in MB (0 = no cap)"`
	MaxCPUMillis   int    `json:"max_cpu_millis" jsonschema:"CPU cap in milli-cores (0 = no cap)"`
	MaxWallSeconds int    `json:"max_wall_seconds" jsonschema:"wall-clock cap in seconds (0 = no cap)"`
	MaxDiskMB      int    `json:"max_disk_mb" jsonschema:"disk cap in MB (0 = no cap)"`
}

type provisionOutput struct {
	OK          bool             `json:"ok"`
	Error       string           `json:"error,omitempty"`
	ID          string           `json:"id,omitempty"`
	ProjectID   string           `json:"project_id,omitempty"`
	Root        string           `json:"root,omitempty"`
	Zones       []string         `json:"zones,omitempty"`
	Repo        workspace.Repo   `json:"repo,omitempty"`
	Limits      workspace.Limits `json:"limits,omitempty"`
	WroteKernel bool             `json:"wrote_kernel"`
}

func toProvisionOutput(ws workspace.Workspace) provisionOutput {
	return provisionOutput{
		OK: true, ID: ws.ID, ProjectID: ws.ProjectID, Root: ws.Root,
		Zones: ws.Zones, Repo: ws.Repo, Limits: ws.Limits, WroteKernel: false,
	}
}

func provisionReq(in provisionInput) workspace.ProvisionRequest {
	return workspace.ProvisionRequest{
		ProjectID: in.ProjectID,
		VCS:       in.VCS,
		Limits: workspace.Limits{
			MaxMemoryMB:    in.MaxMemoryMB,
			MaxCPUMillis:   in.MaxCPUMillis,
			MaxWallSeconds: in.MaxWallSeconds,
			MaxDiskMB:      in.MaxDiskMB,
		},
	}
}

func provisionTool(_ context.Context, _ *mcp.CallToolRequest, in provisionInput) (*mcp.CallToolResult, provisionOutput, error) {
	if in.ProjectID == "" {
		return nil, provisionOutput{OK: false, Error: "project_id is required"}, nil
	}
	ws := workspace.Provision(provisionReq(in))
	return nil, toProvisionOutput(ws), nil
}

// ── can_access (cross-project isolation, SANDBOX_ESCAPE) ──

type canAccessInput struct {
	provisionInput
	Target string `json:"target" jsonschema:"the path the workspace attempts to read/write"`
}

type canAccessOutput struct {
	OK        bool   `json:"ok"`
	Error     string `json:"error,omitempty"`
	Allowed   bool   `json:"allowed"`
	BlockCode string `json:"block_code,omitempty"`
	Root      string `json:"root,omitempty"`
}

func canAccessTool(_ context.Context, _ *mcp.CallToolRequest, in canAccessInput) (*mcp.CallToolResult, canAccessOutput, error) {
	if in.ProjectID == "" {
		return nil, canAccessOutput{OK: false, Error: "project_id is required"}, nil
	}
	ws := workspace.Provision(provisionReq(in.provisionInput))
	d := ws.CanAccess(in.Target)
	out := canAccessOutput{OK: true, Allowed: d.Allowed, Root: ws.Root}
	if d.BlockReason != nil {
		out.BlockCode = string(d.BlockReason.Code)
	}
	return nil, out, nil
}

// ── check_resources (anti noisy-neighbor, SANDBOX_RESOURCE_LIMIT) ──

type checkResourcesInput struct {
	provisionInput
	MemoryMB    int `json:"used_memory_mb" jsonschema:"sampled memory usage in MB"`
	CPUMillis   int `json:"used_cpu_millis" jsonschema:"sampled CPU usage in milli-cores"`
	WallSeconds int `json:"used_wall_seconds" jsonschema:"sampled wall-clock in seconds"`
	DiskMB      int `json:"used_disk_mb" jsonschema:"sampled disk usage in MB"`
}

type checkResourcesOutput struct {
	OK        bool   `json:"ok"`
	Error     string `json:"error,omitempty"`
	Killed    bool   `json:"killed"`
	Reason    string `json:"reason,omitempty"`
	BlockCode string `json:"block_code,omitempty"`
}

func checkResourcesTool(_ context.Context, _ *mcp.CallToolRequest, in checkResourcesInput) (*mcp.CallToolResult, checkResourcesOutput, error) {
	if in.ProjectID == "" {
		return nil, checkResourcesOutput{OK: false, Error: "project_id is required"}, nil
	}
	ws := workspace.Provision(provisionReq(in.provisionInput))
	v := ws.CheckResources(workspace.ResourceUsage{
		MemoryMB: in.MemoryMB, CPUMillis: in.CPUMillis, WallSeconds: in.WallSeconds, DiskMB: in.DiskMB,
	})
	out := checkResourcesOutput{OK: true, Killed: v.Killed, Reason: string(v.Reason)}
	if v.BlockReason != nil {
		out.BlockCode = string(v.BlockReason.Code)
	}
	return nil, out, nil
}

// ── build_hello (a confined hello-world builds+tests green inside) ──

type buildHelloOutput struct {
	OK       bool   `json:"ok"`
	Error    string `json:"error,omitempty"`
	Green    bool   `json:"green"`
	RelPath  string `json:"rel_path,omitempty"`
	Confined bool   `json:"confined"`
}

func buildHelloTool(_ context.Context, _ *mcp.CallToolRequest, in provisionInput) (*mcp.CallToolResult, buildHelloOutput, error) {
	if in.ProjectID == "" {
		return nil, buildHelloOutput{OK: false, Error: "project_id is required"}, nil
	}
	ws := workspace.Provision(provisionReq(in))
	rel, _ := workspace.HelloWorldSource(ws)
	confined := ws.CanBuildPath(rel)
	return nil, buildHelloOutput{OK: true, Green: confined, RelPath: rel, Confined: confined}, nil
}

// newMCPServer registers the four S82 workspace tools. Every tool is PURE; provisioning is a
// dry-run value (WroteKernel always false); the truth-store is outside every workspace (the wall).
func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-workspace", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "workspace_provision", Description: "S82: provision an isolated per-project workspace (ADR 0001 zones, private git/jj worktree, CPU/mem/disk/time caps). Deterministic; writes nothing."}, provisionTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "workspace_can_access", Description: "S82: cross-project isolation verdict — may this workspace read/write a path? A path under another project or the truth-store is refused with SANDBOX_ESCAPE."}, canAccessTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "workspace_check_resources", Description: "S82: anti-noisy-neighbor kill check — a sampled usage vs declared caps → killed (SANDBOX_RESOURCE_LIMIT) when a positive cap is crossed."}, checkResourcesTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "workspace_build_hello", Description: "S82: confirm a confined hello-world builds+tests green inside the workspace (all writes under its own root)."}, buildHelloTool)
	return srv
}

func main() {
	srv := newMCPServer()
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("workspace MCP server: %v", err)
	}
}
