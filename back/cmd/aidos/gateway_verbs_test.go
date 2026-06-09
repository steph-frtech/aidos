package main

import (
	"bytes"
	"strings"
	"testing"
)

// S117 mirror (N4 acceptance + N1 reproducibility) — the SIX new CLI verbs that
// complete the surface CLAUDE.md promises (goal/grill/spike/harvest/trim/init) as
// REAL sub-commands routed over the S58 passerelle (gateway). Each verb resolves a
// gateway tool, runs the SAME deterministic gateway.Route the HTTP edge runs, and
// renders the RouteDecision — never bypassing the wall.
//
// THE DONE-CRITERION (S117): "chaque nouveau verbe CLI a un miroir rouge + un vert".
// This file is that mirror. The verbs are: goal (changeset_open — the truth door),
// grill (idea_grill), spike (idea_spike), harvest (idea_harvest), trim (idea_capture
// — /trim proposes via an idea, never deletes), init (project_create).

func TestNewVerbsAreRegisteredContracts(t *testing.T) {
	want := []Verb{VerbGoal, VerbGrill, VerbSpike, VerbHarvest, VerbTrim, VerbInit}
	for _, v := range want {
		c, ok := lookup(string(v))
		if !ok {
			t.Fatalf("verb %q is not in the contract registry", v)
		}
		if c.Purpose == "" || c.OwnedBy == "" {
			t.Errorf("verb %q has an empty contract field", v)
		}
	}
}

func TestEachNewVerbResolvesAGatewayTool(t *testing.T) {
	want := map[Verb]string{
		VerbGoal:    "changeset_open",
		VerbGrill:   "idea_grill",
		VerbSpike:   "idea_spike",
		VerbHarvest: "idea_harvest",
		VerbTrim:    "idea_capture",
		VerbInit:    "project_create",
	}
	for v, tool := range want {
		got, ok := gatewayToolFor(v)
		if !ok {
			t.Fatalf("verb %q maps to no gateway tool", v)
		}
		if got != tool {
			t.Errorf("verb %q maps to tool %q, want %q", v, got, tool)
		}
	}
}

// Each new verb, run with no operand, prints its `aidos <verb>` heading, names the
// gateway tool it routes to, and exits 0 (the green half of the mirror).
func TestEachNewVerbRoutesThroughTheGatewayAndPrintsDecision(t *testing.T) {
	verbs := []Verb{VerbGoal, VerbGrill, VerbSpike, VerbHarvest, VerbTrim, VerbInit}
	for _, v := range verbs {
		var out bytes.Buffer
		code := Run([]string{string(v)}, &out)
		if code != exitOK {
			t.Errorf("Run(%q) exit = %d, want %d; out=%q", v, code, exitOK, out.String())
		}
		s := out.String()
		heading := "aidos " + string(v)
		if !strings.Contains(s, heading) {
			t.Errorf("Run(%q) missing heading %q; got %q", v, heading, s)
		}
		tool, _ := gatewayToolFor(v)
		if !strings.Contains(s, tool) {
			t.Errorf("Run(%q) does not name its gateway tool %q; got %q", v, tool, s)
		}
		// The route must report a deterministic OUTCOME (route or a wall refusal).
		if !strings.Contains(s, "route") && !strings.Contains(s, "refus") && !strings.Contains(s, "ChangeSet") {
			t.Errorf("Run(%q) does not report the gateway outcome; got %q", v, s)
		}
	}
}

// goal routes to changeset_open — a BELOW-the-line door (it proposes a ChangeSet,
// the legal path truth moves). It must ROUTE (the gateway honours it), never be
// refused as a direct truth-write: `goal` opens the door, it does not write truth.
func TestGoalRoutesThroughTheChangesetDoor(t *testing.T) {
	var out bytes.Buffer
	code := Run([]string{string(VerbGoal)}, &out)
	if code != exitOK {
		t.Fatalf("aidos goal exit = %d, want 0; out=%q", code, out.String())
	}
	s := out.String()
	if !strings.Contains(s, "changeset_open") {
		t.Errorf("aidos goal must route to changeset_open; got %q", s)
	}
	if !strings.Contains(strings.ToLower(s), "route") {
		t.Errorf("aidos goal must ROUTE (the changeset door is below the line); got %q", s)
	}
}

// A direct truth-write verb is REFUSED with the ChangeSet-pointing BlockReason —
// proving the CLI applies the SAME server-side wall the gateway does (the verb
// surface never widens what a caller may do).
func TestDirectTruthWriteVerbIsRefusedWithChangesetDoor(t *testing.T) {
	var out bytes.Buffer
	code := Run([]string{"kernel-write"}, &out)
	// The verb is wired but the gateway refuses the truth-write; the CLI surfaces the
	// refusal and exits with the usage/breach code (non-OK), never silently performs it.
	if code == exitOK {
		t.Fatalf("aidos kernel-write must NOT succeed (it is a direct truth-write); out=%q", out.String())
	}
	s := out.String()
	if !strings.Contains(s, "ChangeSet") {
		t.Errorf("the refusal must name the ChangeSet door; got %q", s)
	}
}

func TestNewVerbsAreDeterministic(t *testing.T) {
	verbs := []string{"goal", "grill", "spike", "harvest", "trim", "init", "kernel-write"}
	for _, v := range verbs {
		var a, b bytes.Buffer
		ca := Run([]string{v}, &a)
		cb := Run([]string{v}, &b)
		if ca != cb || a.String() != b.String() {
			t.Errorf("Run(%q) not deterministic: codes %d/%d, out diff", v, ca, cb)
		}
	}
}
