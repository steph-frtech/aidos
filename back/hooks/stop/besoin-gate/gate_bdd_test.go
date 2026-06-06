package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/truthtyping"
	"github.com/steph-frtech/aidos/back/runtime/besoin"
)

// gate_bdd_test.go — the EL11 Stop:besoin-gate mirror, written RED FIRST (CLAUDE.md Mandat A).
// The behaviour proven (the ROADMAP EL11 done-criteria): fault-injection RED per disjunct of
// the OR (not the AND):
//
//	(1) suppress the truth_kind of a level being descended → the gate BLOCKS (¬enough disjunct);
//	(2) a not_enough level WITHOUT a monster STILL blocks (the OU, not the ET);
//	(3) a session WITHOUT a BesoinGraph is a NO-OP (no over-firing — §5);
//
// plus: a monster WITHOUT not_enough blocks (the second disjunct alone); a malformed event
// fails CLOSED; and the verdict is COMPUTED from EL07+EL09, never declared.

// --- fixture helpers (mirror the EL07 builders, local to the hook test package) -----------------

func fullMeta() besoin.Metadata {
	return besoin.Metadata{
		TruthKind:     truthtyping.KindBehavioral,
		Verifiability: truthtyping.LevelDeterministic,
		Scope:         scope.TruthScope{Region: scope.RegionGlobal},
	}
}

func mustBody(t *testing.T, m map[string]any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	return raw
}

// rightSizedProduct builds a resolved, right-sized product node (≤maxScenarios, intent, narrows
// the journey OptionSpace). With fullMeta it passes EL07.
func rightSizedProduct(t *testing.T) besoin.LevelNode {
	t.Helper()
	return besoin.LevelNode{
		Level: besoin.LevelProduct,
		Body: mustBody(t, map[string]any{
			"intent":    "Un suivi de tâches simple",
			"scenarios": []string{"créer une tâche", "cocher une tâche"},
			"selects":   []string{"onboarding", "core-task"},
		}),
		Refs:       []besoin.Ref{{Field: "journeys", To: besoin.LevelJourney}},
		Provenance: besoin.Provenance{Source: "human", Detail: "je veux suivre mes tâches"},
		Status:     besoin.NodeResolved,
	}
}

func graphWith(t *testing.T, n besoin.LevelNode) besoin.BesoinGraph {
	t.Helper()
	g, err := besoin.NewGraph("demo").AddNode(n)
	if err != nil {
		t.Fatalf("AddNode: %v", err)
	}
	return g
}

// productMirror is the declared need-side level-mirror that makes a resolved product monster-free
// (EL09): the right form for the product rung.
func productMirror(t *testing.T) besoin.BesoinLevelMirror {
	t.Helper()
	form, ok := besoin.LevelMirrorForm(besoin.LevelProduct)
	if !ok {
		t.Fatalf("LevelMirrorForm(product) must be total")
	}
	return besoin.BesoinLevelMirror{Reflects: besoin.LevelProduct, Form: form}
}

func decode(t *testing.T, b []byte) StopEvent {
	t.Helper()
	ev, err := DecodeEvent(bytes.NewReader(b))
	if err != nil {
		t.Fatalf("DecodeEvent: %v", err)
	}
	return ev
}

// --- DISJUNCT (1): suppress the truth_kind → ¬enough → BLOCK -------------------------------------

// Scenario: Given an open BesoinGraph at the product rung whose body is right-sized, When the
// node's truth_kind metadata is SUPPRESSED (fault injection), Then the gate BLOCKS (¬enough),
// because EL04 metadata is part of EL07's gate (b). This is the ROADMAP disjunct (1).
func TestGate_SuppressTruthKind_Blocks(t *testing.T) {
	g := graphWith(t, rightSizedProduct(t))

	meta := fullMeta()
	meta.TruthKind = "" // FAULT INJECTION: the truth_kind disappears.

	ev := StopEvent{Besoin: &BesoinSession{
		Project:  "demo",
		Level:    besoin.LevelProduct,
		Graph:    g,
		Metadata: meta,
		Mirrors:  []besoin.BesoinLevelMirror{productMirror(t)},
	}}

	d := Decide(ev)
	if d.Verdict != VerdictBlock {
		t.Fatalf("suppressing truth_kind must BLOCK (¬enough), got %q", d.Verdict)
	}
	if !d.NotEnough {
		t.Fatalf("the blocked disjunct must be ¬enough (EL07), got NotEnough=%v", d.NotEnough)
	}
	if ExitCode(d) != exitBlock {
		t.Fatalf("a block must exit %d, got %d", exitBlock, ExitCode(d))
	}
}

// --- DISJUNCT (2): not_enough WITHOUT a monster STILL blocks (the OU, not the ET) ----------------

// Scenario: Given an open product rung that is NOT right-sized (selects nothing → OptionSpace
// not narrowed, anti-vacuity) BUT carries NO monster (its declared level-mirror is present and
// well-formed), When the gate runs, Then it BLOCKS on the ¬enough disjunct ALONE — proving the
// OR, not the AND. This is the ROADMAP disjunct (2).
func TestGate_NotEnoughWithoutMonster_StillBlocks(t *testing.T) {
	// A product that parses but narrows nothing → not_enough, but with a NodeDrafting status so it
	// carries no completeness obligation (no monster). Anti-vacuity fails; completeness is clean.
	n := besoin.LevelNode{
		Level: besoin.LevelProduct,
		Body: mustBody(t, map[string]any{
			"intent":    "Un suivi de tâches simple",
			"scenarios": []string{"créer une tâche"},
			"selects":   []string{}, // narrows nothing → anti-vacuity fails.
		}),
		Refs:       []besoin.Ref{{Field: "journeys", To: besoin.LevelJourney}},
		Provenance: besoin.Provenance{Source: "human", Detail: "je veux suivre mes tâches"},
		Status:     besoin.NodeDrafting, // drafting → no completeness monster obligation.
	}
	g := graphWith(t, n)

	ev := StopEvent{Besoin: &BesoinSession{
		Project:  "demo",
		Level:    besoin.LevelProduct,
		Graph:    g,
		Metadata: fullMeta(),
		// No mirrors needed: a drafting node carries no monster obligation, so completeness is clean.
	}}

	d := Decide(ev)
	if d.Verdict != VerdictBlock {
		t.Fatalf("a not_enough level must BLOCK even without a monster (the OU), got %q", d.Verdict)
	}
	if !d.NotEnough {
		t.Fatalf("the ¬enough disjunct must be the one that fired, got NotEnough=%v", d.NotEnough)
	}
	if d.HasMonster {
		t.Fatalf("this scenario must have NO monster (proving the OU, not the ET), got HasMonster=true")
	}
}

// --- DISJUNCT (2b): a monster WITHOUT not_enough blocks (the second disjunct alone) --------------

// Scenario: Given a right-sized, resolved product rung (EL07 enough) whose declared level-mirror
// is MISSING (fault injection — a resolved need-truth without its mirror is a monster, EL09),
// When the gate runs, Then it BLOCKS on the monster disjunct ALONE — the OR's other half.
func TestGate_MonsterWithoutNotEnough_StillBlocks(t *testing.T) {
	g := graphWith(t, rightSizedProduct(t))

	ev := StopEvent{Besoin: &BesoinSession{
		Project:  "demo",
		Level:    besoin.LevelProduct,
		Graph:    g,
		Metadata: fullMeta(),
		Mirrors:  nil, // FAULT INJECTION: the resolved product has NO level-mirror → monster.
	}}

	d := Decide(ev)
	if d.Verdict != VerdictBlock {
		t.Fatalf("a monster at the current level must BLOCK, got %q", d.Verdict)
	}
	if !d.HasMonster {
		t.Fatalf("the monster disjunct must have fired, got HasMonster=%v", d.HasMonster)
	}
	if d.NotEnough {
		t.Fatalf("this scenario's rung is right-sized — only the monster disjunct should fire, got NotEnough=true")
	}
}

// --- DISJUNCT (3): no BesoinGraph → NO-OP (no over-firing) ---------------------------------------

// Scenario: Given a Stop event with NO `besoin` block (a plain kernel session), When the gate
// runs, Then it is a NO-OP — it allows the Stop and writes nothing (a hook that fired on every
// session would be the dead/over-firing hook, §5). This is the ROADMAP disjunct (3).
func TestGate_NoBesoinGraph_NoOp(t *testing.T) {
	ev := decode(t, []byte(`{"ref":"turn-42"}`)) // a kernel session, no besoin block.
	d := Decide(ev)
	if d.Verdict != VerdictNoOp {
		t.Fatalf("a session without a BesoinGraph must be a NO-OP, got %q", d.Verdict)
	}
	if ExitCode(d) != exitAllow {
		t.Fatalf("a no-op must allow the Stop (exit %d), got %d", exitAllow, ExitCode(d))
	}

	// And an empty body is equally a no-op.
	d2 := Decide(decode(t, nil))
	if d2.Verdict != VerdictNoOp {
		t.Fatalf("an empty event must be a NO-OP, got %q", d2.Verdict)
	}
}

// --- the happy path: right-sized + monster-free → ALLOW ------------------------------------------

// Scenario: Given a right-sized, resolved product rung WITH its well-formed level-mirror and full
// metadata, When the gate runs, Then NEITHER disjunct fires and the Stop is ALLOWED.
func TestGate_RightSizedAndComplete_Allows(t *testing.T) {
	g := graphWith(t, rightSizedProduct(t))
	ev := StopEvent{Besoin: &BesoinSession{
		Project:  "demo",
		Level:    besoin.LevelProduct,
		Graph:    g,
		Metadata: fullMeta(),
		Mirrors:  []besoin.BesoinLevelMirror{productMirror(t)},
	}}
	d := Decide(ev)
	if d.Verdict != VerdictAllow {
		t.Fatalf("a right-sized, monster-free rung must ALLOW; reasons=%v", d.BlockReasons)
	}
	if d.NotEnough || d.HasMonster {
		t.Fatalf("neither disjunct should fire on the happy path, got NotEnough=%v HasMonster=%v", d.NotEnough, d.HasMonster)
	}
}

// --- fail-closed: a malformed besoin event blocks (KRD §82 .passthrough()) -----------------------

// Scenario: Given a malformed event body, When Run decodes it, Then the gate fails CLOSED (block)
// and surfaces an actionable BlockReason — an unverifiable gate never silently passes.
func TestRun_MalformedEvent_FailsClosed(t *testing.T) {
	var out bytes.Buffer
	code := Run(strings.NewReader(`{"besoin": "not-an-object"}`), &out)
	if code != exitBlock {
		t.Fatalf("a malformed event must fail closed (exit %d), got %d", exitBlock, code)
	}
	if out.Len() == 0 {
		t.Fatalf("a fail-closed block must surface a BlockReason on stdout")
	}
}

// --- Run wires Decide: the happy path writes nothing and allows ----------------------------------

func TestRun_NoOp_AllowsSilently(t *testing.T) {
	var out bytes.Buffer
	code := Run(strings.NewReader(``), &out)
	if code != exitAllow {
		t.Fatalf("an empty event must allow (exit %d), got %d", exitAllow, code)
	}
	if out.Len() != 0 {
		t.Fatalf("a no-op must write nothing, got %q", out.String())
	}
}

// --- the verdict is COMPUTED from EL07+EL09, the umbrella how_to_fix is the declared EL11 path ---

func TestGate_BlockCarriesEL11HowToFix(t *testing.T) {
	g := graphWith(t, rightSizedProduct(t))
	meta := fullMeta()
	meta.TruthKind = ""
	d := Decide(StopEvent{Besoin: &BesoinSession{Project: "demo", Level: besoin.LevelProduct, Graph: g, Metadata: meta, Mirrors: []besoin.BesoinLevelMirror{productMirror(t)}}})

	var sawUmbrella bool
	for _, r := range d.BlockReasons {
		if strings.Contains(strings.Join(r.HowToFix, ","), "narrow_option_space") &&
			strings.Contains(strings.Join(r.HowToFix, ","), "state_invariant_as_forall") {
			sawUmbrella = true
		}
	}
	if !sawUmbrella {
		t.Fatalf("a block must carry the declared EL11 how_to_fix path (narrow_option_space, state_invariant_as_forall, …)")
	}
}
