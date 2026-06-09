package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/truthlevel"
)

// TestComputeTool — the compute tool returns the transition's output.
func TestComputeTool(t *testing.T) {
	_, out, err := compute(context.Background(), nil, computeInput{
		Signals: truthlevel.Signals{HasRawSignal: true, HasIdea: true},
	})
	if err != nil || !out.OK {
		t.Fatalf("compute errored: %v ok=%v", err, out.OK)
	}
	if out.Level != int(truthlevel.LevelInterpreted) || out.Name != "interpreted" {
		t.Fatalf("compute = %d/%s, want 2/interpreted", out.Level, out.Name)
	}
}

// TestCheckParityTool — aligned and divergent both reported (divergence carries a reason).
func TestCheckParityTool(t *testing.T) {
	sig := truthlevel.Signals{HasRawSignal: true}
	_, ok, _ := checkParity(context.Background(), nil, parityInput{Stored: int(truthlevel.LevelRaw), Signals: sig})
	if !ok.Aligned || ok.Reason != "" {
		t.Fatalf("aligned parity mis-reported: %+v", ok)
	}
	_, bad, _ := checkParity(context.Background(), nil, parityInput{Stored: int(truthlevel.LevelAccepted), Signals: sig})
	if bad.Aligned || bad.Reason == "" {
		t.Fatalf("divergent parity must be RED with a reason: %+v", bad)
	}
}

// TestLevelsTool — the seven rungs in canonical order.
func TestLevelsTool(t *testing.T) {
	_, out, _ := levels(context.Background(), nil, levelsInput{})
	if len(out.Levels) != 7 || out.Levels[0].Name != "raw" || out.Levels[6].Name != "reconciled" {
		t.Fatalf("levels tool wrong set: %+v", out.Levels)
	}
}

// TestServerBuilds — the tool registration wires without panic.
func TestServerBuilds(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("newMCPServer returned nil")
	}
}
