// main_test.go — S82 workspace MCP server tests. Each tool is a PURE function of its input; the
// tests drive the tool handlers directly (no transport) and assert the deterministic verdicts:
// provisioning is dry-run (WroteKernel false), cross-project access is refused with SANDBOX_ESCAPE,
// a runaway is killed with SANDBOX_RESOURCE_LIMIT, a confined hello-world is green.
package main

import (
	"context"
	"testing"
)

func capsInput(project string) provisionInput {
	return provisionInput{
		ProjectID: project, VCS: "git",
		MaxMemoryMB: 512, MaxCPUMillis: 2000, MaxWallSeconds: 60, MaxDiskMB: 1024,
	}
}

func TestProvisionTool_DryRun(t *testing.T) {
	_, out, err := provisionTool(context.Background(), nil, capsInput("proj-a"))
	if err != nil {
		t.Fatalf("provision: %v", err)
	}
	if !out.OK || out.ID == "" || out.Root == "" {
		t.Fatalf("provision must succeed with an id+root, got %+v", out)
	}
	if out.WroteKernel {
		t.Fatal("provisioning must write NO kernel (the wall)")
	}
	if len(out.Zones) != 4 {
		t.Fatalf("expected the 4 ADR 0001 zones, got %v", out.Zones)
	}
	// Determinism: same request ⇒ same id.
	_, out2, _ := provisionTool(context.Background(), nil, capsInput("proj-a"))
	if out.ID != out2.ID {
		t.Fatalf("provision must be deterministic: %q vs %q", out.ID, out2.ID)
	}
	// Missing project id is refused.
	_, bad, _ := provisionTool(context.Background(), nil, provisionInput{})
	if bad.OK {
		t.Fatal("a missing project_id must be refused")
	}
}

func TestCanAccessTool_CrossProjectEscape(t *testing.T) {
	// Provision B to learn its root, then ask A whether it may access B's tree.
	_, bOut, _ := provisionTool(context.Background(), nil, capsInput("proj-b"))

	in := canAccessInput{provisionInput: capsInput("proj-a"), Target: bOut.Root + "/src/x.go"}
	_, out, err := canAccessTool(context.Background(), nil, in)
	if err != nil {
		t.Fatalf("can_access: %v", err)
	}
	if out.Allowed {
		t.Fatal("project A must NOT access project B's tree (cross-project isolation)")
	}
	if out.BlockCode != "SANDBOX_ESCAPE" {
		t.Fatalf("expected SANDBOX_ESCAPE, got %q", out.BlockCode)
	}

	// A accessing its OWN tree is allowed.
	ownTarget := out.Root + "/src/main.go"
	_, ok, _ := canAccessTool(context.Background(), nil, canAccessInput{provisionInput: capsInput("proj-a"), Target: ownTarget})
	if !ok.Allowed {
		t.Fatalf("A must access its own tree, got block %q", ok.BlockCode)
	}

	// The truth-store is refused.
	_, ts, _ := canAccessTool(context.Background(), nil, canAccessInput{provisionInput: capsInput("proj-a"), Target: ".aidos/truth-store/kernel/x"})
	if ts.Allowed || ts.BlockCode != "SANDBOX_ESCAPE" {
		t.Fatalf("the truth-store must be refused with SANDBOX_ESCAPE, got %+v", ts)
	}
}

func TestCheckResourcesTool_RunawayKilled(t *testing.T) {
	base := capsInput("proj-a")

	// Under every cap → not killed.
	_, ok, _ := checkResourcesTool(context.Background(), nil, checkResourcesInput{provisionInput: base, MemoryMB: 100, CPUMillis: 500, WallSeconds: 10, DiskMB: 200})
	if ok.Killed {
		t.Fatalf("a usage under every cap must not be killed, got %v", ok.Reason)
	}

	// CPU runaway → killed with SANDBOX_RESOURCE_LIMIT.
	_, cpu, _ := checkResourcesTool(context.Background(), nil, checkResourcesInput{provisionInput: base, CPUMillis: 999999})
	if !cpu.Killed || cpu.Reason != "cpu" || cpu.BlockCode != "SANDBOX_RESOURCE_LIMIT" {
		t.Fatalf("a CPU runaway must be killed with SANDBOX_RESOURCE_LIMIT, got %+v", cpu)
	}

	// Disk-filler → killed on disk.
	_, disk, _ := checkResourcesTool(context.Background(), nil, checkResourcesInput{provisionInput: base, DiskMB: 99999})
	if !disk.Killed || disk.Reason != "disk" {
		t.Fatalf("a disk-filler must be killed on disk, got %+v", disk)
	}
}

func TestBuildHelloTool_GreenInside(t *testing.T) {
	_, out, err := buildHelloTool(context.Background(), nil, capsInput("proj-a"))
	if err != nil {
		t.Fatalf("build_hello: %v", err)
	}
	if !out.OK || !out.Green || !out.Confined {
		t.Fatalf("a confined hello-world must build green inside, got %+v", out)
	}
	if out.RelPath == "" {
		t.Fatal("build_hello must name the relative source path")
	}
}

func TestNewMCPServer_Registers(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("server must be constructed")
	}
}
