package main

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/hooks/sessionstart/selftest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// stubHarness is a minimal Harness for the hook-level exit-code tests (the selftest
// package owns the exhaustive fixture/property mirrors; here we only prove the binary
// maps a verdict to the right exit code + BlockReason JSON).
type stubHarness struct {
	sensors  []string
	muted    map[string]bool
	breached map[string]bool
	rows     []byte
	baseline string
}

func (h stubHarness) SensorInventory() []string { return h.sensors }
func (h stubHarness) ProbeSensor(id string) (string, bool) {
	return "inject " + id, !h.muted[id]
}
func (h stubHarness) ProbeWall(s string) (string, bool) { return "write " + s, !h.breached[s] }
func (h stubHarness) FitnessRows() []byte               { return h.rows }
func (h stubHarness) BaselineHash() string              { return h.baseline }

const baselineRows = `{"def":"passed"}`

func healthyStub() stubHarness {
	return stubHarness{
		sensors:  selftest.CanonicalSensorInventory(),
		muted:    map[string]bool{},
		breached: map[string]bool{},
		rows:     []byte(baselineRows),
		baseline: hashOfRows(baselineRows),
	}
}

// hashOfRows derives the baseline hash by reading the current_hash a probe computes
// over the same rows (so the healthy stub's baseline == its current — fitness unchanged).
func hashOfRows(rows string) string {
	r, _ := selftest.Run(stubHarness{
		sensors: []string{"x"}, muted: map[string]bool{}, breached: map[string]bool{},
		rows: []byte(rows), baseline: "",
	}, "t")
	return r.FitnessProbe.CurrentHash
}

func TestHookGreenSessionStarts(t *testing.T) {
	var out bytes.Buffer
	code := Run(context.Background(), &out, healthyStub(), nil, "2026-06-01T00:00:00Z")
	if code != exitAllow {
		t.Fatalf("healthy harness must allow the session (exit 0), got %d; out=%s", code, out.String())
	}
	if out.Len() != 0 {
		t.Fatalf("green run must write nothing to stdout, got %s", out.String())
	}
}

func TestHookMutedSensorBlocks(t *testing.T) {
	h := healthyStub()
	h.muted["archtest"] = true
	var out bytes.Buffer
	code := Run(context.Background(), &out, h, nil, "2026-06-01T00:00:00Z")
	if code != exitBlock {
		t.Fatalf("a muted sensor must block the session (exit 2), got %d", code)
	}
	var br blockreason.BlockReason
	if err := json.Unmarshal(out.Bytes(), &br); err != nil {
		t.Fatalf("block must emit BlockReason JSON: %v\n%s", err, out.String())
	}
	if br.Code != selftest.CodeMutedSensor || len(br.HowToFix) == 0 {
		t.Fatalf("expected MUTED_SENSOR with a fix path, got %+v", br)
	}
}

func TestHookNilHarnessFailsClosed(t *testing.T) {
	var out bytes.Buffer
	code := Run(context.Background(), &out, nil, nil, "t")
	if code != exitBlock {
		t.Fatalf("a nil harness must fail closed (exit 2), got %d", code)
	}
	if out.Len() == 0 {
		t.Fatal("fail-closed must emit the unavailable BlockReason")
	}
}
