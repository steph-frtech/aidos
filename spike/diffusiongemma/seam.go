// seam.go — THROWAWAY (DG01 spike). The INJECTABLE LLM seam. determinism-first (§8): the LLM is the
// gated exception being MEASURED, so it lives behind an interface with TWO impls:
//   - FixtureLLM: a deterministic, network-free stand-in (used by the reproducibility test);
//   - ClaudeCLI:  an OPTIONAL real impl that shells to the claude CLI with distinct prompts as A/B.
//
// The metric harness (metric.go) depends only on the interface, never on a concrete model — so the
// reproducibility mirror runs hermetically and the real call is opt-in for the verdict only.
package diffusiongemma

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

// Candidate is one comparable LLM output on a spec: its name (single/A/B) and its raw text. The
// metric never sees the model identity — only the text, which Extract re-judges deterministically.
type Candidate struct {
	Name string
	Text string
}

// LLM is the injectable seam. Generate returns a candidate output for a spec under a named "role"
// (single | A | B). Seeded/named, never ambient: the role is passed explicitly so the same role on
// the same spec is reproducible (the fixture impl is a pure lookup; the real impl pins temperature
// per role). NO ambient rand/clock crosses this boundary into the metric.
type LLM interface {
	Generate(role string, spec Spec) (Candidate, error)
}

// FixtureLLM is the deterministic, network-free impl. Generate is a pure lookup keyed by role — the
// SAME role + spec always yields the SAME text, so TestReproducible can replay the whole metric 100x
// with no network and assert same-input -> same-metric.
type FixtureLLM struct{}

func (FixtureLLM) Generate(role string, _ Spec) (Candidate, error) {
	outs := fixtureOutputs()
	text, ok := outs[role]
	if !ok {
		// Unknown role -> empty candidate (deterministic, never panics): keeps the metric total.
		return Candidate{Name: role, Text: ""}, nil
	}
	return Candidate{Name: role, Text: text}, nil
}

// ClaudeCLI is the OPTIONAL real impl. It shells to the claude CLI with a DISTINCT prompt per role so
// A and B are two genuinely-different elicitations of the same spec (the "differential" of >=2 LLM
// outputs). It is NEVER used by the reproducibility test (that uses FixtureLLM) — only by cmd/verdict
// with --real, to take a small honest real sample. If claude is unavailable/slow, the caller falls
// back to FixtureLLM and reports usedRealLLM=false honestly.
type ClaudeCLI struct {
	Bin     string        // path to the claude binary
	Model   string        // --model
	Timeout time.Duration // per-call timeout
}

// rolePrompt returns the role-specific instruction that turns ONE spec into a DIFFERENTIAL pair.
// Role A asks for the UX/behaviour requirements; role B asks for the formal/cross-cutting ones; the
// "single" role mimics a deterministic recompile (re-state literally, infer nothing). Two distinct
// prompts is the cheap stand-in for two distinct models/temperatures — the differential the spike
// measures. The instruction asks for the SAME closed marker vocabulary the extractor parses, so the
// output is deterministically re-judged (the LLM proposes lines; the pure Extract counts types).
func rolePrompt(role string, spec Spec) string {
	common := "You receive a terse app spec. List the concrete software REQUIREMENTS it implies, " +
		"one per line, each starting with one of these exact tags: 'view goal:', 'zone:', " +
		"'displays field:', 'empty state:', 'control:', 'visible_when:', 'enabled_when:', " +
		"'triggers action:', 'invoke operation', 'on_success:', 'on_error:', 'operation:', " +
		"'emits event:', 'guard:', 'entity:', 'field:', 'relation:', 'invariant:', 'policy:', " +
		"'budget:', 'error case:', 'edge case:'. Output ONLY the tagged lines, no prose.\n\n"
	var lens string
	switch role {
	case "single":
		lens = "Re-state ONLY what the spec LITERALLY declares. Do NOT infer implicit requirements.\n"
	case "A":
		lens = "Focus on the USER-FACING behaviour: screens, controls, visibility/enabled rules, " +
			"success/error effects, empty states, and the obvious error cases.\n"
	case "B":
		lens = "Focus on the FORMAL and cross-cutting structure: ∀ invariants, authorization " +
			"policies, operation guards/validations, emitted events, edge/boundary cases, perf budgets.\n"
	default:
		lens = ""
	}
	return common + lens + "\nSPEC:\n" + spec.SpecText
}

// Generate shells to the claude CLI: `claude --print --model <model>` with the role prompt on stdin.
// Deterministic plumbing around a non-deterministic core — which is EXACTLY why the verdict that uses
// it is reported as usedRealLLM=true (a sampled observation), while the reproducibility GUARANTEE
// rests on FixtureLLM. Errors (timeout, missing bin) are returned, never panicked, so the caller can
// fall back cleanly.
func (c ClaudeCLI) Generate(role string, spec Spec) (Candidate, error) {
	to := c.Timeout
	if to == 0 {
		to = 60 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), to)
	defer cancel()

	cmd := exec.CommandContext(ctx, c.Bin, "--print", "--model", c.Model)
	cmd.Stdin = strings.NewReader(rolePrompt(role, spec))
	out, err := cmd.Output()
	if err != nil {
		return Candidate{Name: role}, err
	}
	return Candidate{Name: role, Text: string(out)}, nil
}
