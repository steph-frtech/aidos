package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// Sensor-honesty mirror (CLAUDE.md §5, the MANDATORY fault-injection test, KRD §16
// "le test décisif"). reflects=runtime.sensors, test_kind=fault-injection,
// cert_language=go, liveness=live, authority=below.
//
// A sensor that never fires is dead. For each computational check we start from a
// GREEN workspace, inject ONE REAL fault into what the check watches, and assert
// the sensor goes red (Pass=false); then revert and assert it goes green
// (Pass=true). This proves each sensor fires on its own fault — not merely that
// the aggregator math holds.
//
// These tests shell out to the frozen tools (gofmt, go vet, go test) in a throwaway
// module on disk — the runner INVOKES the tools, it never reimplements them.

func requireGoTool(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("go"); err != nil {
		t.Skip("go toolchain not on PATH")
	}
}

// newGreenModule scaffolds a throwaway Go module with one clean package and a
// passing test, and returns its dir + the package import-relative dir.
func newGreenModule(t *testing.T) (dir string) {
	t.Helper()
	dir = t.TempDir()
	mustWrite(t, filepath.Join(dir, "go.mod"), "module sensorprobe\n\ngo 1.25\n")
	mustWrite(t, filepath.Join(dir, "calc.go"), greenSource)
	mustWrite(t, filepath.Join(dir, "calc_test.go"), greenTest)
	return dir
}

const greenSource = `package sensorprobe

// Add sums two ints.
func Add(a, b int) int {
	return a + b
}
`

const greenTest = `package sensorprobe

import "testing"

func TestAdd(t *testing.T) {
	if Add(2, 3) != 5 {
		t.Fatalf("Add wrong")
	}
}
`

func mustWrite(t *testing.T, path, body string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func ctxFor(dir string) CheckContext {
	return CheckContext{
		WorkDir:  dir,
		Files:    []string{"calc.go", "calc_test.go"},
		Packages: []string{"."},
	}
}

// gofmt: a clean file passes; unformatted Go reddens it.
func TestFaultInjection_Gofmt(t *testing.T) {
	requireGoTool(t)
	dir := newGreenModule(t)
	if r := RunCheck("gofmt", ctxFor(dir)); !r.Pass {
		t.Fatalf("green module should pass gofmt, got: %s", r.Output)
	}
	// Inject: mis-indented, unformatted Go.
	mustWrite(t, filepath.Join(dir, "calc.go"), "package sensorprobe\nfunc Add(a,b int)int{return a+b}\n")
	if r := RunCheck("gofmt", ctxFor(dir)); r.Pass {
		t.Fatalf("unformatted Go should fail gofmt")
	}
	// Revert.
	mustWrite(t, filepath.Join(dir, "calc.go"), greenSource)
	if r := RunCheck("gofmt", ctxFor(dir)); !r.Pass {
		t.Fatalf("reverted module should pass gofmt again, got: %s", r.Output)
	}
}

// vet: a clean file passes; a vet error reddens it.
func TestFaultInjection_Vet(t *testing.T) {
	requireGoTool(t)
	dir := newGreenModule(t)
	if r := RunCheck("vet", ctxFor(dir)); !r.Pass {
		t.Fatalf("green module should pass vet, got: %s", r.Output)
	}
	// Inject: a Printf with a format/arg mismatch — go vet flags it.
	mustWrite(t, filepath.Join(dir, "calc.go"),
		"package sensorprobe\n\nimport \"fmt\"\n\nfunc Add(a, b int) int {\n\tfmt.Printf(\"%d %d\\n\", a)\n\treturn a + b\n}\n")
	if r := RunCheck("vet", ctxFor(dir)); r.Pass {
		t.Fatalf("vet error should fail the vet sensor")
	}
	mustWrite(t, filepath.Join(dir, "calc.go"), greenSource)
	if r := RunCheck("vet", ctxFor(dir)); !r.Pass {
		t.Fatalf("reverted module should pass vet again, got: %s", r.Output)
	}
}

// lint: strict Go — a green module passes; code that does not build reddens it.
func TestFaultInjection_Lint(t *testing.T) {
	requireGoTool(t)
	dir := newGreenModule(t)
	if r := RunCheck("lint", ctxFor(dir)); !r.Pass {
		t.Fatalf("green module should pass lint, got: %s", r.Output)
	}
	// Inject: a build break (undefined symbol).
	mustWrite(t, filepath.Join(dir, "calc.go"),
		"package sensorprobe\n\nfunc Add(a, b int) int {\n\treturn Nope(a, b)\n}\n")
	if r := RunCheck("lint", ctxFor(dir)); r.Pass {
		t.Fatalf("build break should fail the lint sensor")
	}
	mustWrite(t, filepath.Join(dir, "calc.go"), greenSource)
	if r := RunCheck("lint", ctxFor(dir)); !r.Pass {
		t.Fatalf("reverted module should pass lint again, got: %s", r.Output)
	}
}

// archtest: a clean package passes; a forbidden boundary import reddens it.
func TestFaultInjection_Archtest(t *testing.T) {
	requireGoTool(t)
	dir := newGreenModule(t)
	// Green: archtest on a file outside the forbidden boundary passes.
	cleanCtx := CheckContext{WorkDir: dir, Files: []string{"back/gen/order.go"}}
	if r := RunCheck("archtest", cleanCtx); !r.Pass {
		t.Fatalf("a projection file with no forbidden import should pass archtest, got: %s", r.Output)
	}
	// Inject: a projection (below the waterline) that imports the kernel truth tree
	// — the one boundary ADR 0002 forbids.
	mustWrite(t, filepath.Join(dir, "bad.go"),
		"package sensorprobe\n\nimport _ \"github.com/steph-frtech/aidos/back/kernel/records\"\n")
	badCtx := CheckContext{WorkDir: dir, Files: []string{"back/gen/bad.go"}, ImportsByFile: map[string][]string{
		"back/gen/bad.go": {"github.com/steph-frtech/aidos/back/kernel/records"},
	}}
	if r := RunCheck("archtest", badCtx); r.Pass {
		t.Fatalf("a projection importing back/kernel/** should fail archtest")
	}
}

// affected: the affected tests pass on a green module; a broken test reddens it.
func TestFaultInjection_Affected(t *testing.T) {
	requireGoTool(t)
	dir := newGreenModule(t)
	if r := RunCheck("affected", ctxFor(dir)); !r.Pass {
		t.Fatalf("green module should pass affected tests, got: %s", r.Output)
	}
	// Inject: change Add so the affected test fails.
	mustWrite(t, filepath.Join(dir, "calc.go"),
		"package sensorprobe\n\nfunc Add(a, b int) int {\n\treturn a - b\n}\n")
	if r := RunCheck("affected", ctxFor(dir)); r.Pass {
		t.Fatalf("a failing affected test should fail the affected sensor")
	}
	mustWrite(t, filepath.Join(dir, "calc.go"), greenSource)
	if r := RunCheck("affected", ctxFor(dir)); !r.Pass {
		t.Fatalf("reverted module should pass affected tests again, got: %s", r.Output)
	}
}
