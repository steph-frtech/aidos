// Package agentimpl defines the PROJECTION TYPE AgentImplementation (BA02): the
// below-the-line, regenerable shape a CoucheAgent (the SOURCE, above the line —
// back/kernel/agentlayer) projects into for a runnable session. An
// AgentImplementation carries NO truth: no version-as-truth, no mirror reference. It
// is content-addressed BY its LayerRef (a plain string pointer back to
// CoucheAgent@version) — a reference is not a re-embedded SOURCE. It is
// UNREPRESENTABLE as a layer, mirroring the agentrun discipline ("a run is
// irrepresentable as a layer"): the type structurally lacks a Version and a Mirror
// field, so a projection can never be reconstructed into a CoucheAgent.
//
// SCOPE (BA02): TYPE + invariants ONLY. There is NO emitter here — Project(layer, cfg,
// pack) is BA03. Validate is the pure shape/wall guard; the confinement helpers
// (EgressAllowed/ExecAllowed) DEFER to the governed-layer knobs (BA01).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): Validate and every helper are PURE, TOTAL
// functions of their input — no DB, no clock, no rng, no I/O. Same input ⇒ same
// verdict (the reproducibility mirror agentimpl_property_test.go pins this).
//
// THE WALL (CLAUDE.md §2): a projection sits BELOW the line. ForbiddenPaths ALWAYS
// carry the truth zones (kernel/mirrors/fitness + the on-disk truth prefixes); a
// projection can NEVER grant a write above the waterline. The wall is single-sourced
// through agentlayer.MayWrite (the S52 published contract) — this package forks no
// waterline predicate.
package agentimpl

import (
	"errors"
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/hooks/pretooluse/wall"
	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
)

// ResolvedTool is a concrete MCP tool binding in the projection: a (server, tool)
// pair resolved from an enabled agentlayer.MCPBinding. BA05 fills the resolution
// rule; BA02 fixes the type only.
type ResolvedTool struct {
	Server string `json:"server"`
	Tool   string `json:"tool"`
}

// ResolvedHook is a concrete mandatory-hook binding in the projection, resolved from
// an agentlayer.AgentHookPolicy. It preserves the Mandatory flag (a mandatory hook
// survives projection — BA05 pins this; BA02 fixes the type).
type ResolvedHook struct {
	Phase     string `json:"phase"`
	Hook      string `json:"hook"`
	Mandatory bool   `json:"mandatory"`
}

// AgentImplementation is the PROJECTION of a CoucheAgent into a runnable session
// configuration. It is BELOW the line and carries NO truth (it is regenerable from
// the SOURCE). It deliberately has NO "Version" field and NO "Mirror" field — a
// projection is not a layer/truth, and the type makes that unrepresentable (the
// property mirror pins it). LayerRef is a plain string POINTER back to the
// CoucheAgent@version it was projected from (a reference, never a re-embedded SOURCE).
type AgentImplementation struct {
	LayerRef string `json:"layer_ref"` // CoucheAgent@version this projects (a ref, NOT a version-as-truth)

	// Declared identity/intent fields, copied DOWN from the SOURCE (BA01/BA04). They
	// are the DECLARED inputs of the deterministic SystemPrompt template
	// (AssembleSystemPrompt) — nothing else from the layer leaks into the prompt.
	// Role = what the agent is for; Objectif = its declared objective; StopConditions =
	// its declared halt rules. Projected, never authored here.
	Role           string   `json:"role"`
	Objectif       string   `json:"objectif"`
	StopConditions []string `json:"stop_conditions"`

	// Governed behaviour knobs, copied DOWN from the SOURCE (BA01). They are projected,
	// never authored here. Model == CoucheAgent.Spec.Modele; Temperature/MaxTurns/Seed
	// come from the governed layer (never a providerCfg — BA03 enforces that).
	Provider    agentlayer.Provider `json:"provider"`
	Model       string              `json:"model"`
	Temperature float64             `json:"temperature"`
	MaxTurns    int                 `json:"max_turns"`
	Seed        string              `json:"seed"`

	// Resolved capability surface (BA05 resolves; BA02 fixes the types).
	Tools  []ResolvedTool `json:"tools"`
	Skills []string       `json:"skills"`
	Hooks  []ResolvedHook `json:"hooks"`

	// Confinement: an allow-list of writable path prefixes and the wall's forbidden
	// zones. ForbiddenPaths ALWAYS carries the wall (WallForbiddenPaths).
	AllowedPaths   []string `json:"allowed_paths"`
	ForbiddenPaths []string `json:"forbidden_paths"`

	// Network/exec confinement — EMPTY ⇒ deny ALL (max confinement, fail-closed; the
	// EgressAllowed/ExecAllowed helpers enforce this, deferring to the BA01 knobs).
	AllowedNetworkHosts []string `json:"allowed_network_hosts"`
	AllowedExec         []string `json:"allowed_exec"`

	ResourceLimits agentlayer.ResourceLimits `json:"resource_limits"`
	MaxConcurrency int                       `json:"max_concurrency"`
}

// WallForbiddenPaths returns the closed set of truth zones a projection MUST forbid —
// the schemas above the line (kernel, mirrors, fitness) and the on-disk truth path
// prefixes (back/kernel/, back/migrations/). It is SINGLE-SOURCED through the extracted
// wall package (wall.ForbiddenZones — OQ-S52-wall, resolved at BA03): the hook, the
// agentlayer wall, and this emitter all read the SAME zone set. The returned slice is a
// fresh copy (the caller can never mutate the canonical set). Non-empty by construction.
func WallForbiddenPaths() []string {
	return wall.ForbiddenZones()
}

// IsAboveWaterline reports whether a path/target resolves above the waterline (a truth
// zone). It is SINGLE-SOURCED through the extracted wall classifier (wall.IsAboveWaterline
// — the SAME predicate the S04 hook and agentlayer.MayWrite use; OQ-S52-wall resolved).
// This package forks no waterline predicate. Pure, total, deterministic.
func IsAboveWaterline(target string) bool {
	return wall.IsAboveWaterline(target)
}

// EgressAllowed reports whether the projection may reach host. It DEFERS to the
// governed-layer allow-list semantics (agentlayer.EgressAllowed): an EMPTY
// AllowedNetworkHosts denies EVERY host (no egress by default — fail-closed). Pure,
// total, deterministic.
func (a AgentImplementation) EgressAllowed(host string) bool {
	return agentlayer.EgressAllowed(agentlayer.AgentSpec{AllowedNetworkHosts: a.AllowedNetworkHosts}, host)
}

// ExecAllowed reports whether the projection may run the subprocess cmd. It DEFERS to
// agentlayer.ExecAllowed: an EMPTY AllowedExec denies EVERY command (no subprocess by
// default — fail-closed). Pure, total, deterministic.
func (a AgentImplementation) ExecAllowed(cmd string) bool {
	return agentlayer.ExecAllowed(agentlayer.AgentSpec{AllowedExec: a.AllowedExec}, cmd)
}

// Validation errors.
var (
	// ErrEmptyLayerRef — LayerRef is empty: a projection MUST point back to its SOURCE.
	ErrEmptyLayerRef = errors.New("agentimpl: layer_ref must be non-empty (a projection points back to CoucheAgent@version)")
	// ErrEmptyModel — Model is empty.
	ErrEmptyModel = errors.New("agentimpl: model must be non-empty")
	// ErrUnknownProvider — Provider is outside the closed agentlayer provider set.
	ErrUnknownProvider = errors.New("agentimpl: unknown provider")
	// ErrTemperatureRange — Temperature is outside [0, 2].
	ErrTemperatureRange = errors.New("agentimpl: temperature must be in [0, 2]")
	// ErrMaxTurnsRange — MaxTurns is negative.
	ErrMaxTurnsRange = errors.New("agentimpl: max_turns must be >= 0")
	// ErrMaxConcurrencyRange — MaxConcurrency is negative.
	ErrMaxConcurrencyRange = errors.New("agentimpl: max_concurrency must be >= 0")
	// ErrResourceLimitsNegative — a ResourceLimits axis is negative.
	ErrResourceLimitsNegative = errors.New("agentimpl: resource_limits axes must be >= 0")
	// ErrAllowedPathAboveWaterline — an AllowedPath resolves above the waterline (the wall).
	ErrAllowedPathAboveWaterline = errors.New("agentimpl: an allowed path resolves above the waterline (forbidden)")
	// ErrForbiddenMissingWall — ForbiddenPaths does not carry the full wall zone set.
	ErrForbiddenMissingWall = errors.New("agentimpl: forbidden_paths must carry the wall zones (kernel/mirrors/fitness + truth prefixes)")
)

// Validate is the PURE shape + wall guard of an AgentImplementation (BA02). It is
// fail-closed:
//   - LayerRef and Model are non-empty;
//   - Provider is a member of the closed agentlayer provider set;
//   - the behaviour knobs are in range (Temperature ∈ [0,2]; MaxTurns/MaxConcurrency ≥ 0;
//     ResourceLimits axes ≥ 0) — empty network/exec allow-lists are the valid
//     MAX-confinement default (NOT a range error);
//   - no AllowedPath resolves above the waterline (the wall);
//   - ForbiddenPaths carries the full wall zone set (the projection always carries the wall).
//
// Pure: no DB, no clock, no rng, no I/O. Same input ⇒ same verdict (the property
// mirror pins it). TYPE + invariants only — NO emitter (Project is BA03).
func Validate(a AgentImplementation) error {
	if strings.TrimSpace(a.LayerRef) == "" {
		return ErrEmptyLayerRef
	}
	if strings.TrimSpace(a.Model) == "" {
		return ErrEmptyModel
	}
	if !agentlayer.IsKnownProvider(a.Provider) {
		return fmt.Errorf("%w: %q", ErrUnknownProvider, a.Provider)
	}
	if a.Temperature < 0 || a.Temperature > 2 {
		return fmt.Errorf("%w: got %v", ErrTemperatureRange, a.Temperature)
	}
	if a.MaxTurns < 0 {
		return fmt.Errorf("%w: got %d", ErrMaxTurnsRange, a.MaxTurns)
	}
	if a.MaxConcurrency < 0 {
		return fmt.Errorf("%w: got %d", ErrMaxConcurrencyRange, a.MaxConcurrency)
	}
	if a.ResourceLimits.MaxMemoryMB < 0 || a.ResourceLimits.MaxCPUMillis < 0 || a.ResourceLimits.MaxWallSeconds < 0 {
		return fmt.Errorf("%w: %+v", ErrResourceLimitsNegative, a.ResourceLimits)
	}
	for _, p := range a.AllowedPaths {
		if IsAboveWaterline(p) {
			return fmt.Errorf("%w: %q", ErrAllowedPathAboveWaterline, p)
		}
	}
	// The projection always carries the wall: every canonical wall zone must be forbidden.
	for _, w := range WallForbiddenPaths() {
		found := false
		for _, fp := range a.ForbiddenPaths {
			if fp == w {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("%w: missing %q", ErrForbiddenMissingWall, w)
		}
	}
	return nil
}
