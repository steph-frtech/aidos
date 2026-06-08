---
name: project-s82-workspace
description: S82 per-project sandbox workspace provisioning — verified GREEN zero corrections
metadata:
  type: project
---

S82 « bac à sable par projet » — per-project isolated runtime workspace (container + git/jj worktree + CPU/mem/disk/wall limits), runtime realization of ADR 0001 zones (/ideas /spike /src /kernel/spec) as REAL workspaces NOT repo dirs. REUSES BA17 agentimpl.BindSandbox over WallForbiddenPaths() — NO forked 2nd sandbox (single BindSandbox per project). PURE: Provision/CanAccess/CanObserve/ExceedsLimits total no-IO no-clock no-rng. WroteKernel always false (wall).

Two done-criteria guarantees, both deterministic verdicts (cgroup/ulimit is deploy-time): (1) CROSS-PROJECT ISOLATION SANDBOX_ESCAPE = pure underRoot prefix test, A can't read B's tree nor truth-store (TruthStoreRoot=.aidos/truth-store OUTSIDE every root), default-deny incl ../traversal; (2) RESOURCE-LIMIT KILL SANDBOX_RESOURCE_LIMIT = stable axis order mem/cpu/wall/disk, zero cap=no cap, fault-injection kills runaway/fork-bomb/disk-filler each axis. Two NEW blockreason codes added (additive change_type:refine, non-empty how_to_fix each, property mirror green).

CROSS-LANG: I recomputed Go workspaceID with the REAL idBody json tags (project_id/root/zones/vcs/limits) = proj-a 9143e3c8… proj-b 86922632… BYTE-IDENTICAL to TS test pin AND e2e pin. NOTE: standalone recompute MUST replicate the exact json struct tags — first attempt with default Go field names (capitalized) gave wrong hash; with json tags it matched.

Verification all-green: go test workspace+blockreason+mcp/workspace clean, vet clean, gofmt -l empty; vitest 13/13; tsc no workspace errors (only pre-existing S67 behavior-capture Kind err unrelated); biome 5 files clean; e2e 4/4 live :3000 /workspace 200 (byte-id + SANDBOX_ESCAPE + SANDBOX_RESOURCE_LIMIT proven from screen); i18n 4067==4067 workspace ns 7==7; all e2e testids present in panel (24 testids); nav:143 wired. Docs both pages exist (concept+internals 3 layers Implémentation·Méta·Méta-méta), docs.json:233-234, mint validate PASS, pushed 3b2d1e1 main in sync origin. Actions+MCP write NOTHING. OQ: Linear-unauth / hosted-mintlify-reindex-lag / cgroup-OS-enforcement=deploy-time-forward-dep — all by-design. verified-green ZERO corrections.
