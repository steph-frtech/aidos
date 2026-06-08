// Package workspace is the S82 Runtime layer that PROVISIONS an isolated per-project
// sandbox where a project's generated code lives, compiles and runs its mirrors
// (app-builder EPIC 8). It is the runtime realization of the ADR 0001 managed-project
// zones (`/ideas`, `/spike`, `/src`, `/kernel/spec`): those zones are NOT directories of
// THIS repo — they are created inside a SEPARATE, isolated runtime workspace per project
// (a container + a git/jj repo + a worktree + CPU/mem/disk/time limits).
//
// Two non-negotiable guarantees, both DETERMINISTIC and PURE here (the verdict is code;
// mounting the container/cgroup is a deployment concern):
//
//   - CROSS-PROJECT ISOLATION (SANDBOX_ESCAPE): the sandbox of project A can never read
//     project B's tree/build, nor the AIDOS truth-store. Every access path is judged
//     against the CURRENT workspace's root: a path under another project's root, or under
//     the truth-store, is refused (default-deny). A hello-world build+test confined to the
//     workspace's own root runs green inside.
//
//   - RESOURCE-LIMIT KILL (SANDBOX_RESOURCE_LIMIT, anti noisy-neighbor): a runaway sandbox
//     (CPU loop / fork-bomb / disk-filler) is KILLED the instant a declared cap is crossed.
//     ResourceUsage vs ResourceLimits is a pure predicate; the cgroup/ulimit enforces it at
//     mount time.
//
// This package REUSES the BA17 single-agent sandbox (back/runtime/agentimpl): a provisioned
// workspace BINDS one agentimpl.Sandbox over its OWN AllowedPaths root, so the four
// confinement axes (FS / egress / exec / resource caps) are the SAME pure verdicts. S82 adds
// the per-PROJECT dimension on top: many isolated workspaces, each rooted at its own tree,
// pairwise non-observable.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): Provision and every access/resource verdict are PURE,
// TOTAL functions — no DB, no clock, no rng, no real I/O. The same (project, root, limits) ⇒
// the same WorkspaceID and the same verdicts (workspace_property_test.go pins it). The
// content-addressed WorkspaceID reuses records.Hash (never a forked hashing path).
//
// THE WALL (CLAUDE.md §2): a workspace writes NO truth. Its root is BELOW the line (the
// project's own /ideas /spike /src). The truth-store (kernel/mirrors/fitness) is OUTSIDE
// every workspace root — reaching it is exactly a SANDBOX_ESCAPE. The agent inside runs
// under the aidos_agent Postgres role (SELECT-only above the line), inherited from BA17.
package workspace

import (
	"encoding/json"
	"path"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// TruthStoreRoot is the canonical prefix of the AIDOS truth-store on the OS boundary — the
// kernel/mirrors/fitness home. NO project workspace may read or write under it; an access
// here is always a SANDBOX_ESCAPE (the wall, CLAUDE.md §2). Declared (never discovered) so
// the isolation check single-sources the forbidden zone.
const TruthStoreRoot = ".aidos/truth-store"

// WorkspacesRoot is the canonical parent under which every per-project workspace is mounted.
// Each project's root is WorkspacesRoot + "/" + project-slug; this layout makes cross-project
// isolation a pure prefix test (a path under sibling B's root is not under A's root).
const WorkspacesRoot = ".aidos/workspaces"

// Zones are the ADR 0001 managed-project zones, realized as real subdirectories INSIDE each
// project's isolated workspace root (never directories of this repo). The order is declared.
var Zones = []string{"ideas", "spike", "src", "kernel/spec"}

// Limits is the declared resource envelope a workspace is provisioned with — the cgroup/ulimit
// caps the OS enforces against runaway/fork-bomb/disk-filler. It EXTENDS the BA17 three axes
// (memory / CPU / wall) with the per-project DISK cap (the fourth axis the roadmap names). A
// zero axis means "no cap declared on that axis". Declared above the line, never a knob.
type Limits struct {
	MaxMemoryMB    int `json:"max_memory_mb"`
	MaxCPUMillis   int `json:"max_cpu_millis"`
	MaxWallSeconds int `json:"max_wall_seconds"`
	MaxDiskMB      int `json:"max_disk_mb"`
}

// ResourceUsage is a sampled snapshot of a running workspace's consumption — what the cgroup
// reports. Compared against Limits by ExceedsLimits to decide the kill. Pure data.
type ResourceUsage struct {
	MemoryMB    int `json:"memory_mb"`
	CPUMillis   int `json:"cpu_millis"`
	WallSeconds int `json:"wall_seconds"`
	DiskMB      int `json:"disk_mb"`
}

// Repo is the version-control shape provisioned inside the workspace: an isolated git (or jj)
// repository with a single worktree at the workspace root. It carries no remote — a project's
// history is private to its workspace (cross-project isolation). Pure descriptor.
type Repo struct {
	VCS      string `json:"vcs"`      // "git" or "jj"
	Worktree string `json:"worktree"` // the worktree path == the workspace root
}

// VCSGit / VCSJJ are the two declared version-control backends (frozen stack: git/jj for code
// branches, CLAUDE.md §3). Default is git.
const (
	VCSGit = "git"
	VCSJJ  = "jj"
)

// Workspace is a provisioned, isolated per-project sandbox. It is a PURE descriptor: the
// project it serves, its filesystem Root (the only tree it may touch), the ADR 0001 Zones
// realized under that root, the version-control Repo, the resource Limits, and the bound BA17
// Sandbox (the four confinement axes + the aidos_agent role). The content-addressed ID makes
// two identical provisionings collapse to the same workspace (idempotent), and two different
// projects/roots/limits yield DIFFERENT IDs.
type Workspace struct {
	ID        string            `json:"id"`
	ProjectID string            `json:"project_id"`
	Root      string            `json:"root"`
	Zones     []string          `json:"zones"`
	Repo      Repo              `json:"repo"`
	Limits    Limits            `json:"limits"`
	Sandbox   agentimpl.Sandbox `json:"-"`
	impl      agentimpl.AgentImplementation
}

// ProvisionRequest is the declared input to Provision: which project, which VCS, and the
// resource envelope. The Root is DERIVED (WorkspacesRoot/project) so two projects can never
// collide on a root and the isolation is structural, not configured.
type ProvisionRequest struct {
	ProjectID string `json:"project_id"`
	VCS       string `json:"vcs"`
	Limits    Limits `json:"limits"`
}

// rootFor derives the canonical, cleaned workspace root of a project — WorkspacesRoot/project.
// path.Clean + a slug guard make it a stable prefix the isolation test keys on.
func rootFor(projectID string) string {
	return path.Clean(WorkspacesRoot + "/" + slug(projectID))
}

// slug normalizes a project id into a single safe path segment (no separators, no traversal),
// so a malicious project id can never escape WorkspacesRoot. Pure, total.
func slug(projectID string) string {
	s := strings.TrimSpace(projectID)
	s = strings.ReplaceAll(s, "/", "-")
	s = strings.ReplaceAll(s, "\\", "-")
	s = strings.ReplaceAll(s, "..", "-")
	s = strings.Trim(s, ".")
	if s == "" {
		s = "unknown"
	}
	return s
}

// Provision builds the isolated workspace for a project: it roots the tree at
// WorkspacesRoot/project, realizes the ADR 0001 Zones under that root, provisions the private
// git/jj repo + worktree, BINDS a BA17 sandbox whose ONLY writable root is this workspace's
// tree (with the declared Limits as its cgroup/ulimit caps), and content-addresses the whole
// descriptor. Pure, total, deterministic: same request ⇒ same Workspace (idempotent).
func Provision(req ProvisionRequest) Workspace {
	root := rootFor(req.ProjectID)
	vcs := req.VCS
	if vcs != VCSJJ {
		vcs = VCSGit
	}
	// The BA17 governed projection: the workspace root is the ONLY writable path; the wall's
	// forbidden paths always travel; the resource caps mirror the declared Limits. No egress,
	// no exec beyond the build toolchain (Node/Bun + go for AIDOS's own mirrors).
	impl := agentimpl.AgentImplementation{
		LayerRef:       "workspace:" + slug(req.ProjectID) + "@v1",
		Role:           "executor",
		Model:          "claude",
		Provider:       agentlayer.ProviderAnthropic,
		Temperature:    0,
		AllowedPaths:   []string{root + "/"},
		ForbiddenPaths: agentimpl.WallForbiddenPaths(),
		AllowedExec:    []string{"go", "node", "bun", "tsc", "vitest"},
		ResourceLimits: agentlayer.ResourceLimits{
			MaxMemoryMB:    req.Limits.MaxMemoryMB,
			MaxCPUMillis:   req.Limits.MaxCPUMillis,
			MaxWallSeconds: req.Limits.MaxWallSeconds,
		},
		MaxConcurrency: 1,
	}
	ws := Workspace{
		ProjectID: req.ProjectID,
		Root:      root,
		Zones:     append([]string(nil), Zones...),
		Repo:      Repo{VCS: vcs, Worktree: root},
		Limits:    req.Limits,
		Sandbox:   agentimpl.BindSandbox(impl),
		impl:      impl,
	}
	ws.ID = workspaceID(ws)
	return ws
}

// idBody is the canonical, content-addressed body of a workspace identity — the fields that
// MAKE it that workspace. Different project / root / vcs / limits ⇒ different body ⇒ different
// ID. The bound sandbox is derived from these, so it is not re-hashed.
type idBody struct {
	ProjectID string   `json:"project_id"`
	Root      string   `json:"root"`
	Zones     []string `json:"zones"`
	VCS       string   `json:"vcs"`
	Limits    Limits   `json:"limits"`
}

// workspaceID content-addresses a workspace via the SAME records.Hash scheme used across the
// kernel (never a forked hashing path). Pure, total, deterministic.
func workspaceID(ws Workspace) string {
	b, _ := json.Marshal(idBody{
		ProjectID: ws.ProjectID,
		Root:      ws.Root,
		Zones:     ws.Zones,
		VCS:       ws.Repo.VCS,
		Limits:    ws.Limits,
	})
	canon, err := records.Canonicalize(b)
	if err != nil {
		canon = b
	}
	return records.Hash(canon)
}

// ── Cross-project isolation (SANDBOX_ESCAPE) ─────────────────────────────────────────────

// AccessDecision is the verdict of an access (read or write) a workspace attempts against a
// path. Allowed only when the path is confined to THIS workspace's root; a deny carries the
// actionable SANDBOX_ESCAPE BlockReason. Same fail-closed shape as the BA17 boundaries.
type AccessDecision struct {
	Allowed     bool                     `json:"allowed"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// underRoot is the PURE prefix test at the heart of cross-project isolation: is target inside
// root? It cleans both sides and requires target == root or target under root + "/", so a
// sibling project's root (a different prefix) and the truth-store can never match. No I/O.
func underRoot(root, target string) bool {
	r := path.Clean(root)
	t := path.Clean(target)
	if t == r {
		return true
	}
	return strings.HasPrefix(t, r+"/")
}

// CanAccess is the cross-project isolation verdict: may THIS workspace read/write target? It
// is allowed ONLY when target is confined to the workspace's own root. A path under another
// project's workspace root, or under the truth-store, is REFUSED with SANDBOX_ESCAPE. Pure,
// total, deterministic, default-deny.
func (ws Workspace) CanAccess(target string) AccessDecision {
	if underRoot(ws.Root, target) {
		return AccessDecision{Allowed: true}
	}
	br := blockreason.For(blockreason.CodeSandboxEscape)
	return AccessDecision{Allowed: false, BlockReason: &br}
}

// CanObserve reports whether THIS workspace may observe OTHER's tree/build. Two distinct
// workspaces are pairwise non-observable (cross-project isolation): A may observe only its own
// root. Pure, total — the structural proof behind the SANDBOX_ESCAPE fixture.
func (ws Workspace) CanObserve(other Workspace) bool {
	if ws.ID == other.ID {
		return true
	}
	// A may observe B only if B's root is under A's root — which the WorkspacesRoot/<slug>
	// layout makes impossible for two distinct projects (sibling roots, disjoint prefixes).
	return underRoot(ws.Root, other.Root)
}

// CanReachTruthStore is always false for a project workspace: the truth-store is OUTSIDE every
// workspace root (the wall). Reaching it is a SANDBOX_ESCAPE. Pure, total.
func (ws Workspace) CanReachTruthStore() bool {
	return underRoot(ws.Root, TruthStoreRoot)
}

// ── Resource-limit kill (SANDBOX_RESOURCE_LIMIT, anti noisy-neighbor) ────────────────────

// KillReason names which cap a runaway crossed (stable, declared — determinism-first).
type KillReason string

const (
	KillNone   KillReason = ""
	KillMemory KillReason = "memory"
	KillCPU    KillReason = "cpu"
	KillWall   KillReason = "wall"
	KillDisk   KillReason = "disk"
)

// ResourceVerdict is the kill decision for a sampled usage against the declared Limits: Killed
// when ANY capped axis is exceeded, naming the first axis that crossed and the actionable
// SANDBOX_RESOURCE_LIMIT BlockReason. A zero cap on an axis means "no cap" (never kills there).
type ResourceVerdict struct {
	Killed      bool                     `json:"killed"`
	Reason      KillReason               `json:"reason,omitempty"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// exceeds reports whether usage exceeds a cap, treating a zero (or negative) cap as "no cap".
func exceeds(used, cap int) bool {
	return cap > 0 && used > cap
}

// ExceedsLimits is the PURE anti-noisy-neighbor predicate: does a sampled usage cross any
// declared cap of these Limits? The axes are checked in a STABLE declared order (memory, cpu,
// wall, disk) so the named reason is deterministic. A workspace whose build/test stays under
// every cap is never killed; a runaway/fork-bomb/disk-filler is. Pure, total, deterministic.
func (l Limits) ExceedsLimits(u ResourceUsage) ResourceVerdict {
	switch {
	case exceeds(u.MemoryMB, l.MaxMemoryMB):
		return killVerdict(KillMemory)
	case exceeds(u.CPUMillis, l.MaxCPUMillis):
		return killVerdict(KillCPU)
	case exceeds(u.WallSeconds, l.MaxWallSeconds):
		return killVerdict(KillWall)
	case exceeds(u.DiskMB, l.MaxDiskMB):
		return killVerdict(KillDisk)
	default:
		return ResourceVerdict{Killed: false, Reason: KillNone}
	}
}

func killVerdict(r KillReason) ResourceVerdict {
	br := blockreason.For(blockreason.CodeSandboxResourceLimit)
	return ResourceVerdict{Killed: true, Reason: r, BlockReason: &br}
}

// CheckResources is the workspace-level kill check: sample a usage, get the verdict against
// THIS workspace's declared Limits. Pure, total — the cgroup/ulimit enforces it at runtime.
func (ws Workspace) CheckResources(u ResourceUsage) ResourceVerdict {
	return ws.Limits.ExceedsLimits(u)
}

// ── Build inside the workspace ───────────────────────────────────────────────────────────

// BuildResult is the outcome of running a project's build+test (its mirrors) INSIDE the
// workspace: green when it compiled and its mirrors passed, all confined to the workspace root.
type BuildResult struct {
	Green   bool   `json:"green"`
	Output  string `json:"output"`
	Escaped bool   `json:"escaped"` // true if the build touched a path outside the workspace root
}

// HelloWorldSource is the canonical confined hello-world a freshly provisioned workspace can
// build+test green inside (the fixture's positive arm). It writes only under the workspace's
// own src zone. Pure data — WHAT it contains is declared, never an LLM.
func HelloWorldSource(ws Workspace) (relPath string, content string) {
	return "src/main.go", "package main\nfunc main() { println(\"hello, world\") }\n"
}

// CanBuildPath reports whether a build step writing relPath (relative to the workspace root)
// stays confined — the build's own isolation guard. Pure, total.
func (ws Workspace) CanBuildPath(relPath string) bool {
	return ws.CanAccess(path.Join(ws.Root, relPath)).Allowed
}
