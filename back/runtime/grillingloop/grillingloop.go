// Package grillingloop is the AIDOS Runtime engine of S65 — the IN-PRODUCT,
// conversational grilling loop. It is the surface a human drives to grill an
// intention (KRD §75/§118/§132; ROADMAP-app-builder S65) WITHOUT touching a prompt
// that jumps to the kernel. Where back/runtime/exploration (S28) owns the bare
// verdict routing over the ideas lifecycle, this package adds the genuinely-product
// concerns S65 demands:
//
//   - a GRILLING SESSION that bounds an intention to AT MOST five scenarios (KRD
//     §75 "≤ 5 scenarios" — the intention surface a human grills in one sitting) ;
//   - the DETERMINISTIC verdict routing that is AUTHORITATIVE — the human/LLM names
//     a verdict, the code routes it via exploration.Grill, never the reverse ;
//   - the SCHEMA RE-VERIFICATION gate for the barricaded LLM exception: a verdict
//     suggested by a dialogue model is ONLY accepted if it validates against the
//     closed verdict schema; an off-schema suggestion is refused, never coerced ;
//   - a recorded VerdictRecord carrying the routed idea + the verdict + provenance.
//
// REUSE, DON'T REINVENT (CLAUDE.md §6): the three-value verdict set and the routing
// stay owned by back/runtime/exploration (VerdictSharp/Fuzzy/Bad, Grill). This
// package CALLS them; it never re-declares a verdict or re-implements a transition.
//
// THE WALL (CLAUDE.md §2): this package writes NOTHING. Every function returns
// VALUES; persistence of the routed idea + the verdict + provenance rides the
// idea-intake MCP (the aidos CLI role on the `ideas` schema), never the agent.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every function here is PURE and TOTAL — no
// clock, no rng, no I/O, never panics. The routing is the authority; the LLM is the
// gated exception, re-checked against the schema. Same input → same output; the
// reproducibility mirror grillingloop_property_test.go pins it.
package grillingloop

import (
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/exploration"
)

// MaxScenarios is the declared upper bound on the scenarios an intention may carry
// in a single grilling session (KRD §75: "une intention ≤ 5 scénarios"). Declared,
// never discovered — a sixth scenario is refused, it is not silently truncated.
const MaxScenarios = 5

// Intention is the unit a human grills in the product surface: a prose intent plus
// AT MOST MaxScenarios candidate scenarios sketching the behaviour. It is the input
// to a grilling session; it is NOT a truth and carries no mirror.
type Intention struct {
	// Intent is the sketched behaviour in prose (the human utterance), verbatim.
	Intent string `json:"intent"`
	// Scenarios are the ≤ 5 candidate scenarios sketched for this intention. Each is
	// a free-text Given/When/Then sketch; none is a frozen mirror.
	Scenarios []string `json:"scenarios"`
}

// ErrIntentEmpty is returned when an intention carries no intent prose.
var ErrIntentEmpty = fmt.Errorf("grillingloop: intention has empty intent")

// ErrTooManyScenarios is returned when an intention exceeds MaxScenarios. The bound
// is enforced, not silently truncated.
var ErrTooManyScenarios = fmt.Errorf("grillingloop: intention exceeds %d scenarios", MaxScenarios)

// Validate enforces the intention surface contract: a non-empty intent and AT MOST
// MaxScenarios scenarios. PURE and TOTAL — same intention always yields the same
// verdict. The product surface calls it before routing; the routing refuses to run
// on an invalid intention.
func (in Intention) Validate() error {
	if strings.TrimSpace(in.Intent) == "" {
		return ErrIntentEmpty
	}
	if len(in.Scenarios) > MaxScenarios {
		return fmt.Errorf("%w: got %d", ErrTooManyScenarios, len(in.Scenarios))
	}
	return nil
}

// VerdictRecord is what a grilling session RECORDS once a verdict is routed: the
// routed idea (its new lifecycle status), the verdict that routed it, and the
// provenance carried forward. By type it has no frozen version and no mirror — it
// is a routed candidate, not a truth. The idea-intake MCP persists it in the
// `ideas` schema; this package only computes it.
type VerdictRecord struct {
	// Idea is the routed idea after the verdict (grilled | spiking | rejected).
	Idea ideas.Idea `json:"idea"`
	// Verdict is the closed three-value outcome that routed the idea.
	Verdict exploration.GrillVerdict `json:"verdict"`
	// Reason is the traced rejection reason — non-empty only for VerdictBad.
	Reason string `json:"reason,omitempty"`
}

// Route is the S65 grilling loop: it validates the intention, captures it as a draft
// idea (provenance forced human — the product surface is a human grilling), and
// routes it DETERMINISTICALLY on the verdict by DEFERRING to exploration.Grill:
//
//   - sharp → grilled (skips spike) ;
//   - fuzzy → spiking (the floue branch) ;
//   - bad   → rejected (traced with reason).
//
// The routing is the AUTHORITY: the verdict names the lane, the code performs the
// transition. It writes NOTHING; it returns the VerdictRecord the idea-intake MCP
// persists. proposes is the layer the intention would become; reason is the traced
// rejection reason (used only for the bad verdict).
//
// detail is the human utterance verbatim recorded as provenance; empty falls back
// to the intent (never invents one).
func Route(proposes ideas.Proposes, in Intention, verdict exploration.GrillVerdict, detail, reason string) (VerdictRecord, error) {
	if err := in.Validate(); err != nil {
		return VerdictRecord{}, err
	}
	if !KnownVerdict(verdict) {
		return VerdictRecord{}, fmt.Errorf("%w: %q", exploration.ErrUnknownVerdict, verdict)
	}
	prov := ideas.Provenance{Source: ideas.ProvenanceHuman, Detail: provenanceDetail(detail, in.Intent)}
	draft, err := ideas.Capture(proposes, in.Intent, prov)
	if err != nil {
		return VerdictRecord{}, err
	}
	routed, err := exploration.Grill(draft, verdict, reason)
	if err != nil {
		return VerdictRecord{}, err
	}
	rec := VerdictRecord{Idea: routed, Verdict: verdict}
	if verdict == exploration.VerdictBad {
		rec.Reason = reason
	}
	return rec, nil
}

// provenanceDetail returns the verbatim human utterance to record as provenance —
// the explicit detail if given, else the intent. Never invents one.
func provenanceDetail(detail, intent string) string {
	if strings.TrimSpace(detail) == "" {
		return intent
	}
	return detail
}

// KnownVerdict reports whether v is a member of the closed three-value verdict set
// (sharp | fuzzy | bad). PURE and TOTAL. It is the single authority on verdict
// membership; the schema re-verification gate DEFERS to it.
func KnownVerdict(v exploration.GrillVerdict) bool {
	for _, known := range exploration.Verdicts() {
		if v == known {
			return true
		}
	}
	return false
}

// ── The barricaded LLM exception (CLAUDE.md §6 determinism-first) ──
//
// The conversational dialogue MAY be drafted by an LLM, but its output is NEVER
// trusted: a verdict a model suggests is re-checked against the closed verdict
// schema before it can route anything. The code is the authority; the LLM defers.

// ErrOffSchemaVerdict is returned by VerifyLLMVerdict when a model-suggested verdict
// is not a member of the closed set. The suggestion is REFUSED, never coerced into
// the nearest valid verdict (that would be the LLM silently overriding the schema).
var ErrOffSchemaVerdict = fmt.Errorf("grillingloop: LLM-suggested verdict is off-schema")

// VerifyLLMVerdict is the re-verification gate for the barricaded LLM exception: it
// takes a RAW verdict string a dialogue model produced and returns the typed verdict
// ONLY if it validates against the closed schema, else ErrOffSchemaVerdict. The
// match is exact and case-sensitive — "Sharp", "approved", "yes" are all off-schema.
// PURE and TOTAL: same raw string → same outcome. This is what keeps the LLM from
// inventing a fourth verdict; the deterministic schema is authoritative.
func VerifyLLMVerdict(raw string) (exploration.GrillVerdict, error) {
	v := exploration.GrillVerdict(raw)
	if !KnownVerdict(v) {
		return "", fmt.Errorf("%w: %q", ErrOffSchemaVerdict, raw)
	}
	return v, nil
}
