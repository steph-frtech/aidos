package selfcertsrv

import (
	"context"
	"testing"
)

// The self-cert MCP server is PURE computation (the wall): these tests prove each tool folds
// the per-sensor verdicts deterministically without any I/O. They mirror the S84 done-criterion
// at the MCP boundary — a diff breaking an arch boundary or a Pact contract reddens its sensor,
// the gate goes red, and BUILD_LOOP_SENSOR_RED fires (the iteration is blocked before green).

func allGreenIn() []sensorVerdictIn {
	return []sensorVerdictIn{
		{Kind: "types", Green: true},
		{Kind: "lint", Green: true},
		{Kind: "unit", Green: true},
		{Kind: "fixture", Green: true},
		{Kind: "property", Green: true},
		{Kind: "pact", Green: true},
		{Kind: "archfit", Green: true},
	}
}

func TestCertifyToolCleanBatteryIsGreen(t *testing.T) {
	_, out, err := certify(context.Background(), nil, certifyInput{RedSet: []string{"m1"}, Verdicts: allGreenIn()})
	if err != nil {
		t.Fatalf("certify: %v", err)
	}
	if !out.Green {
		t.Fatalf("clean battery must be green; sensors=%v", out.Sensors)
	}
	if out.BlockCode != "" {
		t.Fatalf("green battery carries no block code, got %q", out.BlockCode)
	}
	if out.StopSensors["m1"] != "green" {
		t.Fatalf("a green battery marks the red-set mirror green; got %q", out.StopSensors["m1"])
	}
}

func TestCertifyToolArchBoundaryBreakBlocksBeforeGreen(t *testing.T) {
	v := allGreenIn()
	for i := range v {
		if v[i].Kind == "archfit" {
			v[i].Green = false
			v[i].Detail = "dependency-cruiser: forbidden edge view→infra"
		}
	}
	_, out, err := certify(context.Background(), nil, certifyInput{RedSet: []string{"m1"}, Verdicts: v})
	if err != nil {
		t.Fatalf("certify: %v", err)
	}
	if out.Green {
		t.Fatal("a broken arch boundary must NOT certify green")
	}
	if out.BlockCode != "BUILD_LOOP_SENSOR_RED" {
		t.Fatalf("block code = %q, want BUILD_LOOP_SENSOR_RED", out.BlockCode)
	}
	if len(out.RedSensors) != 1 || out.RedSensors[0] != "archfit" {
		t.Fatalf("archfit must be the red sensor; got %v", out.RedSensors)
	}
	if out.StopSensors["m1"] != "red" {
		t.Fatalf("a red battery marks the red-set mirror red (fail-closed); got %q", out.StopSensors["m1"])
	}
}

func TestCertifyToolPactContractBreakBlocksBeforeGreen(t *testing.T) {
	v := allGreenIn()
	for i := range v {
		if v[i].Kind == "pact" {
			v[i].Green = false
			v[i].Detail = "pact: provider verification failed"
		}
	}
	_, out, err := certify(context.Background(), nil, certifyInput{Verdicts: v})
	if err != nil {
		t.Fatalf("certify: %v", err)
	}
	if out.Green || out.BlockCode != "BUILD_LOOP_SENSOR_RED" {
		t.Fatalf("a broken Pact contract must block: green=%v block=%q", out.Green, out.BlockCode)
	}
	if len(out.RedSensors) != 1 || out.RedSensors[0] != "pact" {
		t.Fatalf("pact must be the red sensor; got %v", out.RedSensors)
	}
}

func TestGateToolConjunction(t *testing.T) {
	_, out, err := gate(context.Background(), nil, gateInput{Verdicts: allGreenIn()})
	if err != nil {
		t.Fatalf("gate: %v", err)
	}
	if !out.Green {
		t.Fatal("a full green battery gates green")
	}
	// Drop one sensor entirely → not green (anti-passthrough).
	_, out2, _ := gate(context.Background(), nil, gateInput{Verdicts: allGreenIn()[:6]})
	if out2.Green {
		t.Fatal("a missing sensor must NOT gate green (anti-passthrough)")
	}
}

func TestKindsToolClosedSet(t *testing.T) {
	_, out, err := kinds(context.Background(), nil, struct{}{})
	if err != nil {
		t.Fatalf("kinds: %v", err)
	}
	want := []string{"types", "lint", "unit", "fixture", "property", "pact", "archfit"}
	if len(out.Kinds) != len(want) {
		t.Fatalf("kinds = %v, want %v", out.Kinds, want)
	}
	for i, k := range want {
		if out.Kinds[i] != k {
			t.Fatalf("kinds[%d] = %q, want %q", i, out.Kinds[i], k)
		}
	}
}

func TestServerBuildsAndRegisters(t *testing.T) {
	if NewServer() == nil {
		t.Fatal("NewServer returned nil")
	}
}
