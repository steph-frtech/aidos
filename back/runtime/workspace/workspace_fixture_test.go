// workspace_fixture_test.go — S82: the RED fixture mirror (state → cmd → events) for the
// per-project sandbox provisioning, the roadmap done-criteria verbatim:
//
//   - CROSS-PROJECT ISOLATION (SANDBOX_ESCAPE): the sandbox of project A can NOT read
//     project B's tree/build, nor the AIDOS truth-store;
//   - a hello-world build+test runs GREEN inside its own workspace;
//   - FAULT-INJECTION (anti noisy-neighbor): a runaway sandbox (CPU loop / fork-bomb / disk)
//     is KILLED by the resource limit (SANDBOX_RESOURCE_LIMIT) — proven RED.
//
// Written RED first against the workspace package contract.
package workspace

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// twoProjects provisions two distinct isolated workspaces (project A, project B), each rooted
// at its own WorkspacesRoot/<slug> tree — the canonical state of the isolation fixture.
func twoProjects() (a, b Workspace) {
	caps := Limits{MaxMemoryMB: 512, MaxCPUMillis: 2000, MaxWallSeconds: 60, MaxDiskMB: 1024}
	a = Provision(ProvisionRequest{ProjectID: "proj-a", VCS: VCSGit, Limits: caps})
	b = Provision(ProvisionRequest{ProjectID: "proj-b", VCS: VCSGit, Limits: caps})
	return a, b
}

// ── SANDBOX_ESCAPE: A cannot read B's tree/build nor the truth-store ──────────────────────

func TestWorkspace_CannotReadOtherProjectTree(t *testing.T) {
	a, b := twoProjects()

	// A reads INSIDE its own tree → allowed.
	if d := a.CanAccess(a.Root + "/src/main.go"); !d.Allowed {
		t.Fatalf("a workspace must read its own tree, got deny %v", d.BlockReason)
	}
	// A reads a path UNDER B's build tree → refused with SANDBOX_ESCAPE.
	d := a.CanAccess(b.Root + "/build/out.bin")
	if d.Allowed {
		t.Fatal("project A must NOT read project B's tree/build (cross-project isolation)")
	}
	if d.BlockReason == nil || d.BlockReason.Code != blockreason.CodeSandboxEscape {
		t.Fatalf("a cross-project read must carry SANDBOX_ESCAPE, got %v", d.BlockReason)
	}
	// Structural non-observability: A may not observe B (and vice-versa).
	if a.CanObserve(b) || b.CanObserve(a) {
		t.Fatal("two distinct project workspaces must be pairwise non-observable")
	}
}

func TestWorkspace_CannotReadTruthStore(t *testing.T) {
	a, _ := twoProjects()

	// The truth-store is OUTSIDE every workspace root (the wall) → refused.
	d := a.CanAccess(TruthStoreRoot + "/kernel/truth.jsonb")
	if d.Allowed {
		t.Fatal("a project workspace must NOT read the AIDOS truth-store (the wall)")
	}
	if d.BlockReason == nil || d.BlockReason.Code != blockreason.CodeSandboxEscape {
		t.Fatalf("a truth-store read must carry SANDBOX_ESCAPE, got %v", d.BlockReason)
	}
	if a.CanReachTruthStore() {
		t.Fatal("CanReachTruthStore must be false — the truth-store is outside every workspace")
	}
}

// A path-traversal escape attempt (../) out of the workspace root is refused too.
func TestWorkspace_TraversalEscapeRefused(t *testing.T) {
	a, b := twoProjects()
	// Try to climb out of A's root into B's via traversal.
	target := a.Root + "/../" + "proj-b/src/secret.go"
	d := a.CanAccess(target)
	if d.Allowed {
		t.Fatal("a ../ traversal that lands in another project must be refused (SANDBOX_ESCAPE)")
	}
	_ = b
}

// ── The hello-world build runs GREEN inside the workspace, confined to its own root ───────

func TestWorkspace_HelloWorldBuildsGreenInside(t *testing.T) {
	a, _ := twoProjects()
	rel, content := HelloWorldSource(a)
	if content == "" {
		t.Fatal("hello-world source must be non-empty")
	}
	// The hello-world writes only under the workspace's own src zone → confined.
	if !a.CanBuildPath(rel) {
		t.Fatalf("the confined hello-world (%s) must build inside the workspace", rel)
	}
	// A build step that tries to write OUTSIDE the root is NOT confined (would escape).
	if a.CanBuildPath("../escape.go") {
		t.Fatal("a build writing outside the workspace root must NOT be confined")
	}
}

// ── The ADR 0001 zones are realized as real subdirs under the isolated root ───────────────

func TestWorkspace_RealizesADR0001Zones(t *testing.T) {
	a, _ := twoProjects()
	want := map[string]bool{"ideas": true, "spike": true, "src": true, "kernel/spec": true}
	if len(a.Zones) != len(want) {
		t.Fatalf("expected the ADR 0001 zones, got %v", a.Zones)
	}
	for _, z := range a.Zones {
		if !want[z] {
			t.Fatalf("unexpected zone %q (ADR 0001 zones are ideas/spike/src/kernel/spec)", z)
		}
		// Every zone lives UNDER the workspace root (not a repo directory).
		if !a.CanAccess(a.Root + "/" + z).Allowed {
			t.Fatalf("zone %q must be inside the workspace root", z)
		}
	}
	// The workspace provisions a private git repo + worktree at its root.
	if a.Repo.VCS != VCSGit || a.Repo.Worktree != a.Root {
		t.Fatalf("workspace must provision a private git worktree at its root, got %+v", a.Repo)
	}
}

// ── FAULT-INJECTION: a runaway is KILLED by the resource limit (SANDBOX_RESOURCE_LIMIT) ───

func TestWorkspace_RunawayKilledByResourceLimit(t *testing.T) {
	a, _ := twoProjects()

	// A well-behaved usage UNDER every cap → not killed (green inside).
	ok := a.CheckResources(ResourceUsage{MemoryMB: 100, CPUMillis: 500, WallSeconds: 10, DiskMB: 200})
	if ok.Killed {
		t.Fatalf("a usage under every cap must not be killed, got %v", ok.Reason)
	}

	// FAULT INJECTION — a CPU loop runaway crosses the CPU cap → KILLED.
	cpu := a.CheckResources(ResourceUsage{CPUMillis: 999_999})
	if !cpu.Killed || cpu.Reason != KillCPU {
		t.Fatalf("a CPU runaway must be killed on the cpu axis, got %+v", cpu)
	}
	if cpu.BlockReason == nil || cpu.BlockReason.Code != blockreason.CodeSandboxResourceLimit {
		t.Fatalf("the kill must carry SANDBOX_RESOURCE_LIMIT, got %v", cpu.BlockReason)
	}

	// A fork-bomb blows the memory cap → KILLED on memory.
	mem := a.CheckResources(ResourceUsage{MemoryMB: 4096})
	if !mem.Killed || mem.Reason != KillMemory {
		t.Fatalf("a fork-bomb must be killed on the memory axis, got %+v", mem)
	}

	// A disk-filler blows the disk cap → KILLED on disk.
	disk := a.CheckResources(ResourceUsage{DiskMB: 99_999})
	if !disk.Killed || disk.Reason != KillDisk {
		t.Fatalf("a disk-filler must be killed on the disk axis, got %+v", disk)
	}

	// An infinite loop blows the wall-clock cap → KILLED on wall.
	wall := a.CheckResources(ResourceUsage{WallSeconds: 3600})
	if !wall.Killed || wall.Reason != KillWall {
		t.Fatalf("an infinite loop must be killed on the wall axis, got %+v", wall)
	}
}

// A workspace provisioned with NO caps (all zero) never kills — a zero cap means "no cap".
func TestWorkspace_NoCapsNeverKills(t *testing.T) {
	uncapped := Provision(ProvisionRequest{ProjectID: "uncapped", VCS: VCSGit, Limits: Limits{}})
	v := uncapped.CheckResources(ResourceUsage{MemoryMB: 1 << 30, CPUMillis: 1 << 30, DiskMB: 1 << 30, WallSeconds: 1 << 30})
	if v.Killed {
		t.Fatalf("an uncapped workspace must never be killed, got %v", v.Reason)
	}
}
