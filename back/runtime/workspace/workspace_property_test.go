// workspace_property_test.go — S82: the reproducibility mirror (rapid). It pins the
// determinism-first invariants of per-project workspace provisioning (CLAUDE.md §6/§8):
//
//   - Provision is a PURE function: same request ⇒ byte-identical Workspace ID (idempotent).
//   - DIFFERENT projects ⇒ DIFFERENT workspace IDs and DISJOINT, pairwise non-observable roots.
//   - cross-project isolation is total: for ANY two distinct projects, neither can access a
//     path under the other's root (SANDBOX_ESCAPE), and neither can reach the truth-store.
//   - the resource-kill predicate is monotone and deterministic: a usage over a positive cap
//     is ALWAYS killed; a usage under every cap is NEVER killed; same usage ⇒ same verdict.
package workspace

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

func genLimits(t *rapid.T) Limits {
	return Limits{
		MaxMemoryMB:    rapid.IntRange(0, 4096).Draw(t, "mem"),
		MaxCPUMillis:   rapid.IntRange(0, 8000).Draw(t, "cpu"),
		MaxWallSeconds: rapid.IntRange(0, 600).Draw(t, "wall"),
		MaxDiskMB:      rapid.IntRange(0, 8192).Draw(t, "disk"),
	}
}

func genProjectID(t *rapid.T) string {
	return rapid.StringMatching(`[a-z][a-z0-9-]{0,20}`).Draw(t, "project")
}

// Provision is deterministic: same request ⇒ same workspace ID.
func TestProp_Provision_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		req := ProvisionRequest{ProjectID: genProjectID(t), VCS: VCSGit, Limits: genLimits(t)}
		a := Provision(req)
		b := Provision(req)
		if a.ID != b.ID {
			t.Fatalf("Provision must be deterministic: %q vs %q", a.ID, b.ID)
		}
		if a.ID == "" {
			t.Fatal("workspace ID must be non-empty (content-addressed)")
		}
	})
}

// Different projects ⇒ different IDs and disjoint, non-observable roots (cross-project isolation).
func TestProp_DistinctProjects_Isolated(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		p1 := genProjectID(t)
		p2 := genProjectID(t)
		if slug(p1) == slug(p2) {
			return // same project — not the distinct case
		}
		caps := genLimits(t)
		a := Provision(ProvisionRequest{ProjectID: p1, VCS: VCSGit, Limits: caps})
		b := Provision(ProvisionRequest{ProjectID: p2, VCS: VCSGit, Limits: caps})
		if a.ID == b.ID {
			t.Fatalf("distinct projects must have distinct workspace IDs (%q == %q)", a.ID, b.ID)
		}
		// A cannot access B's tree, and vice-versa — always SANDBOX_ESCAPE.
		da := a.CanAccess(b.Root + "/src/x.go")
		if da.Allowed || da.BlockReason == nil || da.BlockReason.Code != blockreason.CodeSandboxEscape {
			t.Fatalf("A must not access B's tree (SANDBOX_ESCAPE), got %v", da)
		}
		db := b.CanAccess(a.Root + "/src/x.go")
		if db.Allowed {
			t.Fatal("B must not access A's tree (cross-project isolation)")
		}
		if a.CanObserve(b) || b.CanObserve(a) {
			t.Fatal("distinct workspaces must be pairwise non-observable")
		}
		// Neither can reach the truth-store (the wall).
		if a.CanReachTruthStore() || b.CanReachTruthStore() {
			t.Fatal("no workspace may reach the truth-store")
		}
	})
}

// The resource-kill predicate is deterministic and correctly classifies over/under the caps.
func TestProp_ResourceKill_Monotone(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		l := genLimits(t)
		u := ResourceUsage{
			MemoryMB:    rapid.IntRange(0, 8192).Draw(t, "u_mem"),
			CPUMillis:   rapid.IntRange(0, 16000).Draw(t, "u_cpu"),
			WallSeconds: rapid.IntRange(0, 1200).Draw(t, "u_wall"),
			DiskMB:      rapid.IntRange(0, 16384).Draw(t, "u_disk"),
		}
		v1 := l.ExceedsLimits(u)
		v2 := l.ExceedsLimits(u)
		if v1.Killed != v2.Killed || v1.Reason != v2.Reason {
			t.Fatalf("ExceedsLimits must be deterministic: %+v vs %+v", v1, v2)
		}
		// Whether ANY positive cap is crossed.
		over := (l.MaxMemoryMB > 0 && u.MemoryMB > l.MaxMemoryMB) ||
			(l.MaxCPUMillis > 0 && u.CPUMillis > l.MaxCPUMillis) ||
			(l.MaxWallSeconds > 0 && u.WallSeconds > l.MaxWallSeconds) ||
			(l.MaxDiskMB > 0 && u.DiskMB > l.MaxDiskMB)
		if over != v1.Killed {
			t.Fatalf("kill must hold iff a positive cap is crossed: over=%v killed=%v (limits %+v usage %+v)", over, v1.Killed, l, u)
		}
		if v1.Killed && (v1.BlockReason == nil || v1.BlockReason.Code != blockreason.CodeSandboxResourceLimit) {
			t.Fatalf("a kill must carry SANDBOX_RESOURCE_LIMIT, got %v", v1.BlockReason)
		}
	})
}

// A workspace never escapes its own root: any path under the root is accessible, any path that
// is NOT under the root is refused — the partition is exact.
func TestProp_OwnRoot_AlwaysAccessible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		ws := Provision(ProvisionRequest{ProjectID: genProjectID(t), VCS: VCSGit, Limits: genLimits(t)})
		seg := rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "seg")
		if !ws.CanAccess(ws.Root + "/" + seg).Allowed {
			t.Fatalf("a path under the workspace root must always be accessible: %s/%s", ws.Root, seg)
		}
		// The truth-store is never under a workspace root.
		if ws.CanAccess(TruthStoreRoot + "/x").Allowed {
			t.Fatal("the truth-store must never be accessible from a workspace")
		}
	})
}
