package main

import (
	"bytes"
	"strings"
	"testing"
)

// Unit mirror (N4): the contract registry shape + the dispatcher's exit-code and
// heading behaviour. These pin the stub's surface; the determinism invariant is in
// contract_property_test.go.

func TestContractsAreTheFiveCoreVerbs(t *testing.T) {
	want := []Verb{VerbCheck, VerbImpact, VerbStable, VerbDiff, VerbExplain}
	got := Contracts()
	if len(got) != len(want) {
		t.Fatalf("Contracts() returned %d entries, want %d", len(got), len(want))
	}
	for i, c := range got {
		if c.Verb != want[i] {
			t.Errorf("Contracts()[%d].Verb = %q, want %q", i, c.Verb, want[i])
		}
		if c.Purpose == "" || c.FutureInputs == "" || c.FutureOutputs == "" || c.OwnedBy == "" {
			t.Errorf("Contracts()[%d] (%q) has an empty contract field", i, c.Verb)
		}
		if c.Status != "stub" {
			t.Errorf("Contracts()[%d] (%q) status = %q, want \"stub\"", i, c.Verb, c.Status)
		}
	}
}

func TestContractsIsACopy(t *testing.T) {
	a := Contracts()
	if len(a) == 0 {
		t.Fatal("Contracts() is empty")
	}
	a[0].Purpose = "MUTATED"
	b := Contracts()
	if b[0].Purpose == "MUTATED" {
		t.Error("Contracts() leaked the backing array; callers can mutate the registry")
	}
}

func TestRunEachVerbPrintsHeadingAndExitsZero(t *testing.T) {
	for _, c := range Contracts() {
		var out bytes.Buffer
		code := Run([]string{string(c.Verb)}, &out)
		if code != exitOK {
			t.Errorf("Run(%q) exit = %d, want %d", c.Verb, code, exitOK)
		}
		heading := "aidos " + string(c.Verb)
		if !strings.Contains(out.String(), heading) {
			t.Errorf("Run(%q) stdout missing heading %q; got: %q", c.Verb, heading, out.String())
		}
		if !strings.Contains(out.String(), c.Purpose) {
			t.Errorf("Run(%q) stdout missing purpose; got: %q", c.Verb, out.String())
		}
	}
}

func TestRunBareAndHelpListAllVerbsExitZero(t *testing.T) {
	for _, args := range [][]string{nil, {"help"}, {"--help"}, {"-h"}} {
		var out bytes.Buffer
		code := Run(args, &out)
		if code != exitOK {
			t.Errorf("Run(%v) exit = %d, want %d", args, code, exitOK)
		}
		for _, c := range Contracts() {
			if !strings.Contains(out.String(), string(c.Verb)) {
				t.Errorf("Run(%v) help missing verb %q", args, c.Verb)
			}
		}
	}
}

func TestRunUnknownVerbExitsUsage(t *testing.T) {
	var out bytes.Buffer
	code := Run([]string{"frobnicate"}, &out)
	if code != exitUsage {
		t.Errorf("Run(unknown) exit = %d, want %d", code, exitUsage)
	}
	if !strings.Contains(out.String(), "unknown command") {
		t.Errorf("Run(unknown) should explain the unknown command; got: %q", out.String())
	}
}
