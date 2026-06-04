package agentlayer

import (
	"errors"
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// BA01 — the GOVERNED BEHAVIOUR KNOBS made operative. Every function here is PURE,
// TOTAL and DETERMINISTIC (no DB, no clock, no rng, no I/O). The knobs live on the
// AgentSpec SOURCE (the governed layer), never in a providerCfg; the empty
// allow-list defaults are MAX confinement, fail-closed (no egress, no subprocess by
// default); the replay seed, when not pinned, is DERIVED deterministically from
// Hash(impl‖pack‖item) — NEVER an RNG (the reproducibility mirror pins this).
// Determinism-first (CLAUDE.md §6/§8): an undeclared knob is a determinism gap.

// Knob-range validation errors (fail-closed: out of range ⇒ invalid).
var (
	// ErrTemperatureRange — Temperature is outside [0, 2].
	ErrTemperatureRange = errors.New("agentlayer: temperature must be in [0, 2]")
	// ErrMaxTurnsRange — MaxTurns is negative.
	ErrMaxTurnsRange = errors.New("agentlayer: max_turns must be >= 0")
	// ErrMaxConcurrencyRange — MaxConcurrency is negative.
	ErrMaxConcurrencyRange = errors.New("agentlayer: max_concurrency must be >= 0")
	// ErrResourceLimitsNegative — a ResourceLimits axis is negative.
	ErrResourceLimitsNegative = errors.New("agentlayer: resource_limits axes must be >= 0")
)

// validateKnobs is the PURE, TOTAL range guard for the governed behaviour knobs. It is
// fail-closed: any out-of-range knob is invalid. Called by Validate (kind-aware: the
// knobs are valid on every layer-kind, but the ranges always hold).
func validateKnobs(s AgentSpec) error {
	if s.Temperature < 0 || s.Temperature > 2 {
		return fmt.Errorf("%w: got %v", ErrTemperatureRange, s.Temperature)
	}
	if s.MaxTurns < 0 {
		return fmt.Errorf("%w: got %d", ErrMaxTurnsRange, s.MaxTurns)
	}
	if s.MaxConcurrency < 0 {
		return fmt.Errorf("%w: got %d", ErrMaxConcurrencyRange, s.MaxConcurrency)
	}
	if s.ResourceLimits.MaxMemoryMB < 0 || s.ResourceLimits.MaxCPUMillis < 0 || s.ResourceLimits.MaxWallSeconds < 0 {
		return fmt.Errorf("%w: %+v", ErrResourceLimitsNegative, s.ResourceLimits)
	}
	return nil
}

// EgressAllowed reports whether the agent may reach host. It is a PURE allow-list
// check over Spec.AllowedNetworkHosts: an EMPTY allow-list denies EVERY host (no
// egress by default — fail-closed, max confinement). A host is matched exactly
// (case-insensitive). This is the network confinement axis declared in the governed
// layer; BA09 wires it into GateAction. Total, deterministic.
func EgressAllowed(s AgentSpec, host string) bool {
	want := strings.ToLower(strings.TrimSpace(host))
	if want == "" {
		return false
	}
	for _, h := range s.AllowedNetworkHosts {
		if strings.ToLower(strings.TrimSpace(h)) == want {
			return true
		}
	}
	return false
}

// ExecAllowed reports whether the agent may run the subprocess named cmd. It is a PURE
// allow-list check over Spec.AllowedExec: an EMPTY allow-list denies EVERY command (no
// subprocess by default — fail-closed, max confinement). The command is matched
// exactly against the declared executable name. This is the exec confinement axis
// declared in the governed layer; BA09 wires it into GateAction. Total, deterministic.
func ExecAllowed(s AgentSpec, cmd string) bool {
	want := strings.TrimSpace(cmd)
	if want == "" {
		return false
	}
	for _, c := range s.AllowedExec {
		if strings.TrimSpace(c) == want {
			return true
		}
	}
	return false
}

// seedSeparator is the unambiguous, non-printable component separator for DeriveSeed —
// it cannot appear in a content-hash / pack id, so (impl, pack, item) cannot collide by
// concatenation (e.g. ("ab","c") vs ("a","bc")).
const seedSeparator = "\x1f" // ASCII unit separator

// DeriveSeed derives the replay seed deterministically from (impl, pack, item) —
// Hash(impl‖pack‖item) — when no seed is pinned on the spec. It REUSES records.Hash
// (the S02 content-address) so the seed is the same 64-hex digest in either store. It
// is a PURE deterministic function: the SAME triple ALWAYS yields the SAME seed, and
// it depends on each component (the unit separator prevents concatenation collisions).
// It is NEVER an RNG — replay reproducibility depends on this (the reproducibility
// mirror pins it). Determinism-first (CLAUDE.md §6/§8).
func DeriveSeed(impl, pack, item string) string {
	return records.Hash([]byte(impl + seedSeparator + pack + seedSeparator + item))
}

// SeedFor resolves the EFFECTIVE seed for a run: the pinned Spec.Seed if set, else the
// derived Hash(impl‖pack‖item). Pure, total, deterministic — the single authoritative
// source of a run's seed (a behaviour knob, governed, never an RNG).
func SeedFor(s AgentSpec, impl, pack, item string) string {
	if strings.TrimSpace(s.Seed) != "" {
		return s.Seed
	}
	return DeriveSeed(impl, pack, item)
}
