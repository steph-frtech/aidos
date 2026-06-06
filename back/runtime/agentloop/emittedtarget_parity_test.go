// emittedtarget_parity_test.go — EL00's proof.
//
// EL00 is ADR-only (ADR 0040): it engraves the TARGET of the EMITTED app — Hono (front+back)
// + pure-functional TypeScript, with its own MCP + Skills, datastore = Postgres dialect via
// a TS client — and draws the constructrice≠construite frontier (AIDOS stays governable Go,
// never rewritten in TS; it never emits Go for the user app). ADR 0040 §44 states the proof
// of an ADR-only step is exactly this: "le property test de parité cible-déclarée ≡ config
// enforce-cée (gen/)".
//
// This file IS that proof. It pins three things, all DETERMINISTIC (same input → same
// verdict, never an LLM judging "is this Hono enough"):
//
//  1. PARITY — the declared EL00 target (EmittedTargetEL00, the single Go-source truth) and
//     the arch-fitness.json `emitted_target` block (the config FN04/S84 reads) are ONE
//     declared truth, never double-typed (CLAUDE.md §9 shared-source-schema spirit). Drift
//     between them would let the frontier rot silently.
//  2. LANGUAGE-NEUTRAL INVARIANTS — the three FN02/ADR 0036 emitted invariants
//     (EMITTED_FUNCTION_PURE / EMITTED_NO_GLOBAL_MUTABLE / EMITTED_CALL_GRAPH_ACYCLIC) are
//     the SAME set whether the emitted code is Go (today) or Hono/TS (the EL00 target): the
//     mandate is neutral to the server language (ADR 0040 Décision 3). The EL00 target
//     carries the exact list returned by EmittedInvariantCodes() — no fork, no new invariant.
//  3. THE FRONTIER IS TRENCHED — the declared target asserts constructrice=Go-governable and
//     construite=Hono/TS, that AIDOS is never rewritten in TS, that the datastore dialect
//     stays Postgres (ADR 0006 unchanged), and that EL00 writes NO truth (above-the-wall:
//     ADR only). A property test pins these are non-empty and self-consistent.
package agentloop

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// TestEmittedTarget_ParityWithConfig — the EL00 parity proof: the declared EL00 emission
// target (EmittedTargetEL00) ≡ the arch-fitness.json `emitted_target` block. One truth.
func TestEmittedTarget_ParityWithConfig(t *testing.T) {
	raw, err := os.ReadFile("arch-fitness.json")
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	var cfg struct {
		EmittedTarget EmittedTarget `json:"emitted_target"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatalf("parse config: %v", err)
	}
	want := EmittedTargetEL00()
	if !reflect.DeepEqual(cfg.EmittedTarget, want) {
		t.Fatalf("config emitted_target\n  %#v\n!= declared\n  %#v", cfg.EmittedTarget, want)
	}
}

// TestEmittedTarget_InvariantsAreLanguageNeutral — the FN02 invariants carried by the EL00
// target are EXACTLY EmittedInvariantCodes() (ADR 0040 Décision 3: the mandate is neutral to
// the server language; pivoting the emitted code Go→Hono/TS adds no invariant and forks none).
func TestEmittedTarget_InvariantsAreLanguageNeutral(t *testing.T) {
	target := EmittedTargetEL00()
	declared := EmittedInvariantCodes()
	if len(target.FunctionalInvariants) != len(declared) {
		t.Fatalf("EL00 target invariants %v != FN04 declared %v", target.FunctionalInvariants, declared)
	}
	for i := range declared {
		if target.FunctionalInvariants[i] != string(declared[i]) {
			t.Fatalf("invariant %d: target %q != FN04 declared %q", i, target.FunctionalInvariants[i], declared[i])
		}
	}
}

// TestEmittedTarget_FrontierIsTrenched — the constructrice≠construite frontier is decided and
// internally consistent (ADR 0040 Décision 1/2/5): AIDOS is governable Go, never rewritten in
// TS; the construite is Hono/TS; the datastore stays the Postgres dialect (ADR 0006); EL00
// writes no truth (above-the-wall). Pure assertions over the declared record.
func TestEmittedTarget_FrontierIsTrenched(t *testing.T) {
	tgt := EmittedTargetEL00()
	if tgt.Constructrice.Language != "go" {
		t.Fatalf("constructrice must stay Go (ADR 0040 Décision 1/B), got %q", tgt.Constructrice.Language)
	}
	if tgt.Constructrice.RewrittenInTS {
		t.Fatal("AIDOS la constructrice is NEVER rewritten in TS (ADR 0040 Décision 1)")
	}
	if tgt.Construite.Backend != "hono" || tgt.Construite.Frontend != "hono" {
		t.Fatalf("construite front+back must be Hono (ADR 0040 Décision 1), got back=%q front=%q", tgt.Construite.Backend, tgt.Construite.Frontend)
	}
	if tgt.Construite.Language != "typescript" {
		t.Fatalf("construite language must be pure-functional TypeScript, got %q", tgt.Construite.Language)
	}
	if tgt.Construite.DatastoreDialect != "postgres" {
		t.Fatalf("datastore dialect stays Postgres (ADR 0006 unchanged), got %q", tgt.Construite.DatastoreDialect)
	}
	if !tgt.Construite.OwnMCP || !tgt.Construite.OwnSkills {
		t.Fatal("the emitted app gets ITS OWN MCP + Skills (ADR 0040 Décision 4)")
	}
	// Above-the-wall: EL00 is ADR-only — it must declare it writes no truth.
	if tgt.WritesTruth {
		t.Fatal("EL00 is above-the-wall (ADR-only): it must declare WritesTruth=false (CLAUDE.md §2)")
	}
	if tgt.ADR != "0040" {
		t.Fatalf("EL00 target is engraved by ADR 0040, got %q", tgt.ADR)
	}
	// The interpreter decision (OQ-0040-interpréteur) is TRENCHED (ADR 0040 Décision 7):
	// callback to a Go interpreter service, never a TS re-emission of the Operation-DSL.
	if tgt.Construite.OperationInterpreter != "go-service-callback" {
		t.Fatalf("Operation-DSL execution is a callback to a Go interpreter service (ADR 0040 Décision 7), got %q", tgt.Construite.OperationInterpreter)
	}
}
