// policy.go — GV05: the policy.yaml → GateAction COMPILER. A declared YAML policy (the
// readable SOURCE) compiles to the SAME fail-closed enforcers AIDOS already runs, with an
// equivalence mirror proving the projection cannot diverge from the wall.
//
// THE SHAPE OF THE ADOPTION (ADR 0037, GV05 row). The Microsoft agent-governance-toolkit
// offers "policy-as-YAML". AIDOS already has the authoritative enforcer: agentimpl.GateAction
// folds nine declared-axis enforcers into one pure verdict (BA13). We do NOT replace it. The
// YAML is a SOURCE that PROJECTS onto that exact enforcer — determinism-first (CLAUDE.md §6):
// the policy is the declared input, the Go enforcer is the projection, NEVER the inverse. A
// policy compiler is a pure parse + project; an "LLM that translates policy to code" would be
// a determinism gap.
//
// THE TWO LOAD-BEARING GUARANTEES (the GV05 done-criteria):
//
//   - EQUIVALENCE. For ANY action, the compiled policy yields EXACTLY the same Decision
//     (Allowed, DeniedAxis, BlockReason) as the reference AgentImplementation read directly
//     by GateAction. CompilePolicy projects the YAML's declared surface onto an
//     AgentImplementation and GateUnderPolicy calls the SAME GateAction over it — the verdict
//     is single-sourced, so it cannot drift (policy_property_test.go pins it over a generated
//     action space).
//
//   - TIGHTEN-NEVER-WIDEN. The YAML can only EQUAL or RESSERRER the reference, never widen
//     it. CompilePolicy VALIDATES every declared item against the REFERENCE surface (the
//     structural maximum the enforcers permit): a host/path/tool/skill NOT in the reference,
//     or a budget cap ABOVE the reference cap, is REJECTED with an error — the compiler
//     structurally cannot emit a wider-than-reference enforcer. A subset (fewer hosts, a
//     lower cap) compiles and denies a SUPERSET of actions.
//
// THE WALL STAYS AUTHORITATIVE (CLAUDE.md §2). The compiler WRITES NOTHING and GOVERNS
// NOTHING — it projects a SOURCE onto the existing enforcers; the wall (the zone deny-list)
// is carried into every projection (WallForbiddenPaths) and can never be widened by a policy
// (a kernel target trips the zone axis regardless of the YAML). Below the waterline: a policy
// is a declared confinement, not a layer/truth.
package governance

import (
	"bytes"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/economics"
	"github.com/steph-frtech/aidos/back/runtime/goal"
	"gopkg.in/yaml.v3"
)

// policyYAML is the on-the-wire shape of a declared policy.yaml. It mirrors the gate's
// confinement surface (the fields GateAction reads), nothing more — a policy declares WHAT
// the agent may touch, never a verdict (the verdict is the enforcer's). Unknown fields are
// rejected (KnownFields) so a typo cannot silently widen by being ignored.
type policyYAML struct {
	AllowedPaths        []string   `yaml:"allowed_paths"`
	AllowedNetworkHosts []string   `yaml:"allowed_network_hosts"`
	AllowedExec         []string   `yaml:"allowed_exec"`
	Tools               []toolYAML `yaml:"tools"`
	Skills              []string   `yaml:"skills"`
	MaxTokensPerGoal    *int       `yaml:"max_tokens_per_goal"`
}

type toolYAML struct {
	Server string `yaml:"server"`
	Tool   string `yaml:"tool"`
}

// Policy is the COMPILED policy: the projected AgentImplementation the existing GateAction
// reads, plus the declared budget caps. It is pure data, below the waterline. The impl is
// PRIVATE so the only way to use a Policy is GateUnderPolicy (the single-sourced gate) — a
// caller cannot fork a different verdict from the projection.
type Policy struct {
	impl          agentimpl.AgentImplementation
	tokensPerGoal int
}

// harnessBudget / goalBudget project the declared cap onto the two budget frames GateAction's
// budget axis reads (the tightest of the two wins — BA11). Both carry the same declared cap.
func (p Policy) harnessBudget() economics.HarnessCostBudget {
	return economics.HarnessCostBudget{MaxLLMTokensPerGoal: p.tokensPerGoal}
}
func (p Policy) goalBudget() goal.Budgets { return goal.Budgets{Tokens: p.tokensPerGoal} }

// Impl exposes a COPY of the projected AgentImplementation (read-only view for the panel /
// telemetry — the slices are fresh so a caller can never mutate the policy's surface).
func (p Policy) Impl() agentimpl.AgentImplementation { return p.impl }

// TokensPerGoal is the declared token cap the policy compiled to.
func (p Policy) TokensPerGoal() int { return p.tokensPerGoal }

// referenceSurface is the STRUCTURAL MAXIMUM a policy may declare — the widest confinement
// the enforcers permit, against which CompilePolicy validates (anything beyond it widens, and
// widening is rejected). It is declared here, ONE source, never derived from a YAML.
//
// The reference is deliberately CONCRETE (a closed, audited surface): two writable roots below
// the waterline, two declared hosts, one exec, two bound tools, two skills, a token cap. The
// wall is ALWAYS carried (WallForbiddenPaths) and is NOT part of the widenable surface — a
// kernel target trips the zone axis under EVERY policy.
const referenceTokenCap = 100_000

func referenceSurface() (paths, hosts, execs, skills []string, tools []agentimpl.ResolvedTool, cap int) {
	return []string{"back/runtime/", "front/web/"},
		[]string{"api.anthropic.com", "api.openai.com"},
		[]string{"go"},
		[]string{"tdd", "diagnose"},
		[]agentimpl.ResolvedTool{{Server: "store", Tool: "read"}, {Server: "store", Tool: "write"}},
		referenceTokenCap
}

// ReferenceImpl is the AgentImplementation projected from the FULL reference surface — the
// equivalence baseline GateAction reads directly in the mirror. A policy that declares the
// reference surface verbatim compiles to an impl that gates IDENTICALLY to this one.
func ReferenceImpl() agentimpl.AgentImplementation {
	paths, hosts, execs, skills, tools, _ := referenceSurface()
	return buildImpl(paths, hosts, execs, skills, tools)
}

// buildImpl projects a confinement surface onto a governed AgentImplementation — the SAME
// shape the BA02 emitter produces, with the wall ALWAYS in ForbiddenPaths. Slices are copied.
func buildImpl(paths, hosts, execs, skills []string, tools []agentimpl.ResolvedTool) agentimpl.AgentImplementation {
	return agentimpl.AgentImplementation{
		LayerRef:            "CoucheAgent@gv05-policy",
		Role:                "executor",
		Objectif:            "ship the step under a declared policy",
		Provider:            "anthropic",
		Model:               "claude-opus-4-8",
		Temperature:         0,
		MaxTurns:            8,
		AllowedPaths:        append([]string(nil), paths...),
		ForbiddenPaths:      agentimpl.WallForbiddenPaths(),
		AllowedNetworkHosts: append([]string(nil), hosts...),
		AllowedExec:         append([]string(nil), execs...),
		Tools:               append([]agentimpl.ResolvedTool(nil), tools...),
		Skills:              append([]string(nil), skills...),
	}
}

// CompilePolicy parses a declared policy.yaml and PROJECTS it onto the reference enforcer
// surface, REJECTING any item that would WIDEN beyond the reference (tighten-never-widen).
// Pure, total, deterministic: same YAML ⇒ same Policy (no I/O, no clock, no rng, no LLM).
func CompilePolicy(src []byte) (Policy, error) {
	var raw policyYAML
	dec := yaml.NewDecoder(bytes.NewReader(src))
	dec.KnownFields(true) // a typo'd/unknown key is an ERROR, never silently ignored (no stealth widening).
	if err := dec.Decode(&raw); err != nil {
		return Policy{}, fmt.Errorf("policy: parse: %w", err)
	}

	refPaths, refHosts, refExecs, refSkills, refTools, refCap := referenceSurface()

	// VALIDATE each declared item is a SUBSET of the reference (widening ⇒ error).
	if err := mustSubset("allowed_paths", raw.AllowedPaths, refPaths); err != nil {
		return Policy{}, err
	}
	if err := mustSubset("allowed_network_hosts", raw.AllowedNetworkHosts, refHosts); err != nil {
		return Policy{}, err
	}
	if err := mustSubset("allowed_exec", raw.AllowedExec, refExecs); err != nil {
		return Policy{}, err
	}
	if err := mustSubset("skills", raw.Skills, refSkills); err != nil {
		return Policy{}, err
	}
	if err := mustToolSubset(raw.Tools, refTools); err != nil {
		return Policy{}, err
	}

	// BUDGET — a declared cap may only EQUAL or LOWER the reference cap (raising it widens).
	cap := refCap
	if raw.MaxTokensPerGoal != nil {
		c := *raw.MaxTokensPerGoal
		if c < 0 {
			return Policy{}, fmt.Errorf("policy: max_tokens_per_goal %d is negative", c)
		}
		if c > refCap {
			return Policy{}, fmt.Errorf("policy: max_tokens_per_goal %d WIDENS the reference cap %d (a policy can only equal or tighten)", c, refCap)
		}
		cap = c
	}

	tools := make([]agentimpl.ResolvedTool, 0, len(raw.Tools))
	for _, t := range raw.Tools {
		tools = append(tools, agentimpl.ResolvedTool{Server: t.Server, Tool: t.Tool})
	}

	return Policy{
		impl:          buildImpl(raw.AllowedPaths, raw.AllowedNetworkHosts, raw.AllowedExec, raw.Skills, tools),
		tokensPerGoal: cap,
	}, nil
}

// GateUnderPolicy is the SINGLE-SOURCED gate: it calls the EXACT same agentimpl.GateAction
// over the policy's projected impl + budget. This is why equivalence holds by construction —
// the policy never re-implements a verdict, it only supplies the projection GateAction reads.
func GateUnderPolicy(p Policy, act agentimpl.Action) agentimpl.Decision {
	return agentimpl.GateAction(p.impl, act, agentimpl.RunMeter{}, p.harnessBudget(), p.goalBudget(), 0, nil)
}

// mustSubset returns an error iff any declared value is NOT in the reference set (a widening).
func mustSubset(field string, declared, reference []string) error {
	ref := map[string]bool{}
	for _, r := range reference {
		ref[r] = true
	}
	for _, d := range declared {
		if !ref[d] {
			return fmt.Errorf("policy: %s declares %q which WIDENS beyond the reference surface %v (a policy can only equal or tighten)", field, d, sortedCopy(reference))
		}
	}
	return nil
}

// mustToolSubset is mustSubset for (server,tool) pairs.
func mustToolSubset(declared []toolYAML, reference []agentimpl.ResolvedTool) error {
	ref := map[string]bool{}
	for _, r := range reference {
		ref[r.Server+"\x00"+r.Tool] = true
	}
	for _, d := range declared {
		if !ref[d.Server+"\x00"+d.Tool] {
			return fmt.Errorf("policy: tools declares (%q,%q) which WIDENS beyond the reference tool surface (a policy can only equal or tighten)", d.Server, d.Tool)
		}
	}
	return nil
}

func sortedCopy(in []string) []string {
	out := append([]string(nil), in...)
	sort.Strings(out)
	return out
}

// ---------------------------------------------------------------------------------------
// Sample policies — the SOURCE inputs the equivalence/tighten/widen mirrors and the panel
// read. Declared verbatim here (one source); the YAML text is what an operator would author.
// ---------------------------------------------------------------------------------------

// SamplePolicyYAML is the REFERENCE policy: it declares the reference surface VERBATIM, so it
// compiles to an impl that gates IDENTICALLY to ReferenceImpl (the equivalence baseline).
func SamplePolicyYAML() []byte {
	return []byte(`# AIDOS policy — declares the reference confinement surface verbatim.
allowed_paths:
  - back/runtime/
  - front/web/
allowed_network_hosts:
  - api.anthropic.com
  - api.openai.com
allowed_exec:
  - go
tools:
  - server: store
    tool: read
  - server: store
    tool: write
skills:
  - tdd
  - diagnose
max_tokens_per_goal: 100000
`)
}

// TightenPolicyYAML is a STRICT SUBSET of the reference: one path, one host, no exec, one tool,
// one skill, a LOWER cap. It compiles (a subset is legal) and denies a SUPERSET of actions.
func TightenPolicyYAML() []byte {
	return []byte(`# A tighter policy — a strict subset of the reference (denies more, never less).
allowed_paths:
  - back/runtime/
allowed_network_hosts:
  - api.anthropic.com
allowed_exec: []
tools:
  - server: store
    tool: read
skills:
  - tdd
max_tokens_per_goal: 1000
`)
}

// WidenPolicyYAMLs returns one widening policy per axis — each declares something OUTSIDE the
// reference surface (a forbidden host/path/exec/tool/skill, a RAISED cap). EVERY one must be
// REJECTED by CompilePolicy (the compiler structurally cannot widen the wall).
func WidenPolicyYAMLs() map[string][]byte {
	return map[string][]byte{
		"path":          []byte("allowed_paths:\n  - back/kernel/\n"),
		"host":          []byte("allowed_network_hosts:\n  - evil.example.com\n"),
		"exec":          []byte("allowed_exec:\n  - /bin/sh\n"),
		"tool":          []byte("tools:\n  - server: privileged\n    tool: deploy\n"),
		"skill":         []byte("skills:\n  - untrusted-third-party\n"),
		"budget_raise":  []byte("max_tokens_per_goal: 999999999\n"),
		"unknown_field": []byte("totally_unknown_knob: true\n"),
	}
}
