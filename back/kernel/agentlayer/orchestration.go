package agentlayer

// BA24 — the OrchestrationPolicy made operative + a kind-aware Validate.
//
// An agent is NEVER an authority — it is a GOVERNED LAYER (KRD §21). An
// `orchestration` layer COORDINATES a team of agents; the coordination RULES are
// DECLARED here, above the line, proposed via idea→mirror→/goal (never a direct
// kernel write — Propose yields a `proposed` Proposal requiring the S16 authority).
//
// The policy declares, for a LayerKindOrchestration:
//   - claim arbitration (who passes first when two contend for the same target);
//   - fan-out / fan-in coordination (how the team spreads and rejoins work);
//   - the same-file conflict policy (SERIALISE one agent at a time on a target via
//     the lease, then MERGE via the `merge-semantic` gesture — never a course/coin-flip
//     that discards the loser's green work);
//   - MaxConcurrency + per-role caps (declared in BA01 on the spec, BORNE here by the
//     policy so the cap a run enforces is the DECLARED number, never a phantom — gap F1).
//
// IMMUTABILITY PER-RUN (gap F3): a run PINS a policy @version (RunPin), exactly as an
// AgentRun pins an Agent @version. Mid-run adaptation is FORBIDDEN; any change is a NEW
// proposal (idea→mirror→/goal), never a live-edit. PinForRun captures the version once;
// MutationIsForbidden is structurally true — there is no setter that mutates a pin.
//
// ZERO-LOST-UPDATE CONFLICT RESOLUTION (gap F2): two assignments on the SAME target
// SERIALISE (one lease at a time) and MERGE via merge-semantic (re-run every mirror on
// the merged cut — a red mirror blocks). ResolveConflict is ONLY the tie-break of WHO
// PASSES FIRST: by layer rank (mirror-first), then by content-hash — NEVER an LLM
// tie-break, NEVER a coin-flip. The loser WAITS (its work is never thrown away).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every function here is PURE, TOTAL and
// DETERMINISTIC — no DB, no clock, no rng, no I/O. The conflict is merged BY RULE, never
// by a race. The reproducibility mirror (orchestration_property_test.go) pins it.

import (
	"errors"
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// FanMode is the closed set of fan-out/fan-in coordination shapes. An orchestration
// declares how its team spreads work out and rejoins it. Closed taxonomy: an unknown
// mode makes the policy invalid (fail-closed).
type FanMode string

const (
	// FanModeSequential — one member at a time, in declared order (no fan-out).
	FanModeSequential FanMode = "sequential"
	// FanModeParallel — members fan out concurrently, bounded by MaxConcurrency.
	FanModeParallel FanMode = "parallel"
	// FanModePipeline — members hand off in a pipeline (fan-in at each stage).
	FanModePipeline FanMode = "pipeline"
)

var fanModeOrder = []FanMode{FanModeSequential, FanModeParallel, FanModePipeline}

// FanModes returns the closed fan-mode set in canonical declared order.
func FanModes() []FanMode {
	out := make([]FanMode, len(fanModeOrder))
	copy(out, fanModeOrder)
	return out
}

// IsKnownFanMode reports whether m is a member of the closed fan-mode set.
func IsKnownFanMode(m FanMode) bool {
	for _, mm := range fanModeOrder {
		if mm == m {
			return true
		}
	}
	return false
}

// SameFileConflictPolicy is the closed set of same-target conflict policies. The KRD
// rule (gap F2) is SERIALISE + MERGE: one agent at a time on a target (via the lease),
// then merge via merge-semantic. A coin-flip / discard-the-loser policy is NOT in the
// set — it would lose an update, which the property forbids.
type SameFileConflictPolicy string

const (
	// ConflictSerialiseThenMerge — one lease at a time, then merge-semantic re-runs every
	// mirror on the merged cut (a red mirror blocks). The ONLY zero-lost-update policy.
	ConflictSerialiseThenMerge SameFileConflictPolicy = "serialise_then_merge"
)

var conflictPolicyOrder = []SameFileConflictPolicy{ConflictSerialiseThenMerge}

// IsKnownConflictPolicy reports whether p is the (single) zero-lost-update policy.
func IsKnownConflictPolicy(p SameFileConflictPolicy) bool {
	for _, pp := range conflictPolicyOrder {
		if pp == p {
			return true
		}
	}
	return false
}

// RoleCap declares the max concurrent leases for ONE role inside an orchestration. It
// BORNE-S the BA01 spec knob per role (a phantom cap is a determinism gap, gap F1).
type RoleCap struct {
	Role string `json:"role"`
	Cap  int    `json:"cap"` // ≥ 0; 0 = that role may hold no lease
}

// OrchestrationPolicy declares the coordination rules of a LayerKindOrchestration. It
// is a SOURCE field above the line — proposed via idea→mirror→/goal, never live-edited.
// Pinned per-run (RunPin); any change is a NEW proposal.
type OrchestrationPolicy struct {
	ClaimArbitrage     SameFileConflictPolicy `json:"claim_arbitrage"`      // how a same-target claim is arbitrated (serialise+merge)
	FanOut             FanMode                `json:"fan_out"`              // how the team spreads work
	FanIn              FanMode                `json:"fan_in"`               // how the team rejoins work
	ConflitMemeFichier SameFileConflictPolicy `json:"conflit_meme_fichier"` // same-file conflict policy (serialise_then_merge)
	MaxConcurrency     int                    `json:"max_concurrency"`      // global cap; BORNE the BA01 spec knob, never a phantom (≥ 0)
	CapsParRole        []RoleCap              `json:"caps_par_role"`        // per-role caps (≥ 0 each)
}

// Validation errors for the orchestration model.
var (
	// ErrOrchestrationNeedsPolicy — an orchestration layer must carry a well-formed policy.
	ErrOrchestrationNeedsPolicy = errors.New("agentlayer: an orchestration layer REQUIRES an OrchestrationPolicy")
	// ErrOrchestrationNeedsTeam — an orchestration layer must coordinate a non-empty team.
	ErrOrchestrationNeedsTeam = errors.New("agentlayer: an orchestration layer REQUIRES a non-empty team (equipe)")
	// ErrNonOrchestrationCarriesPolicy — a non-orchestration layer must NOT carry an orchestration policy.
	ErrNonOrchestrationCarriesPolicy = errors.New("agentlayer: a non-orchestration layer must NOT carry an OrchestrationPolicy")
	// ErrNonOrchestrationCarriesTeam — only an orchestration layer coordinates a team.
	ErrNonOrchestrationCarriesTeam = errors.New("agentlayer: only an orchestration layer may carry a team (equipe)")
	// ErrUnknownFanMode — FanOut / FanIn is outside the closed fan-mode set.
	ErrUnknownFanMode = errors.New("agentlayer: unknown fan mode")
	// ErrUnknownConflictPolicy — a conflict policy is outside the closed (serialise_then_merge) set.
	ErrUnknownConflictPolicy = errors.New("agentlayer: unknown same-file conflict policy (only serialise_then_merge is zero-lost-update)")
	// ErrPolicyMaxConcurrencyRange — MaxConcurrency is negative.
	ErrPolicyMaxConcurrencyRange = errors.New("agentlayer: orchestration max_concurrency must be >= 0")
	// ErrRoleCapRange — a per-role cap is negative.
	ErrRoleCapRange = errors.New("agentlayer: a per-role cap must be >= 0")
	// ErrPolicyOverSpecConcurrency — the policy MaxConcurrency exceeds the spec's BA01 knob (a phantom cap).
	ErrPolicyOverSpecConcurrency = errors.New("agentlayer: orchestration max_concurrency exceeds the spec max_concurrency (phantom cap, gap F1)")
	// ErrRunPinEmpty — PinForRun was handed an empty policy version (cannot pin nothing).
	ErrRunPinEmpty = errors.New("agentlayer: cannot pin a run to an empty policy version")
)

// validatePolicy is the PURE, TOTAL guard of an OrchestrationPolicy. It is fail-closed:
// any unknown enum, negative cap, or phantom (over-spec) concurrency is invalid. It is
// kind-aware via its caller (Validate calls it ONLY for an orchestration layer).
//
// specMaxConcurrency is the BA01 spec knob: the policy MaxConcurrency may NOT exceed it
// (gap F1 — the enforced cap is the DECLARED number, never a phantom larger one). A spec
// knob of 0 means "unbounded by the spec", so the policy is then free to declare any
// non-negative cap.
func validatePolicy(p OrchestrationPolicy, specMaxConcurrency int) error {
	if !IsKnownConflictPolicy(p.ClaimArbitrage) {
		return fmt.Errorf("%w: claim_arbitrage %q", ErrUnknownConflictPolicy, p.ClaimArbitrage)
	}
	if !IsKnownConflictPolicy(p.ConflitMemeFichier) {
		return fmt.Errorf("%w: conflit_meme_fichier %q", ErrUnknownConflictPolicy, p.ConflitMemeFichier)
	}
	if !IsKnownFanMode(p.FanOut) {
		return fmt.Errorf("%w: fan_out %q", ErrUnknownFanMode, p.FanOut)
	}
	if !IsKnownFanMode(p.FanIn) {
		return fmt.Errorf("%w: fan_in %q", ErrUnknownFanMode, p.FanIn)
	}
	if p.MaxConcurrency < 0 {
		return fmt.Errorf("%w: got %d", ErrPolicyMaxConcurrencyRange, p.MaxConcurrency)
	}
	for _, rc := range p.CapsParRole {
		if rc.Cap < 0 {
			return fmt.Errorf("%w: role %q got %d", ErrRoleCapRange, rc.Role, rc.Cap)
		}
	}
	// Gap F1: the enforced cap is the DECLARED spec knob, never a phantom larger one. A
	// spec knob of 0 = "unbounded by the spec"; any non-negative policy cap is then valid.
	if specMaxConcurrency > 0 && p.MaxConcurrency > specMaxConcurrency {
		return fmt.Errorf("%w: policy %d > spec %d", ErrPolicyOverSpecConcurrency, p.MaxConcurrency, specMaxConcurrency)
	}
	return nil
}

// RunPin pins a run to a policy @version (gap F3 — immutability per-run). It is the
// twin of an AgentRun pinning an Agent @version: once captured, the version a run uses
// is FROZEN. There is NO setter that mutates a pin — mid-run adaptation is forbidden;
// any policy change is a NEW proposal (idea→mirror→/goal), never a live-edit.
type RunPin struct {
	RunID         string `json:"run_id"`
	PolicyVersion string `json:"policy_version"` // the @version frozen for the lifetime of the run
}

// PinForRun captures the orchestration's policy @version for a run. The version is the
// content-hash of the canonical policy body (records.Hash) — same policy ⇒ same pin
// (deterministic). It REFUSES an empty version (a run cannot pin nothing). Pure, total.
func PinForRun(runID string, policyVersion string) (RunPin, error) {
	if strings.TrimSpace(policyVersion) == "" {
		return RunPin{}, ErrRunPinEmpty
	}
	return RunPin{RunID: runID, PolicyVersion: policyVersion}, nil
}

// PolicyVersion is the content-address (@version) of an OrchestrationPolicy: the
// records.Hash of its canonical JSON body. Same policy ⇒ same version; ANY change yields
// a DIFFERENT version (so a pinned run can detect a live-edit attempt). Pure, total,
// deterministic — REUSES the S02 content-address (records.Hash), never an RNG.
func PolicyVersion(p OrchestrationPolicy) string {
	return records.Hash([]byte(canonicalPolicyBody(p)))
}

// canonicalPolicyBody renders the policy fields in a FIXED order into an unambiguous
// byte string for hashing. The unit separator (\x1f) cannot appear in a role/enum, so
// distinct policies never collide by concatenation. Deterministic field order — never
// map iteration.
func canonicalPolicyBody(p OrchestrationPolicy) string {
	var sb strings.Builder
	sb.WriteString(string(p.ClaimArbitrage))
	sb.WriteString("\x1f")
	sb.WriteString(string(p.FanOut))
	sb.WriteString("\x1f")
	sb.WriteString(string(p.FanIn))
	sb.WriteString("\x1f")
	sb.WriteString(string(p.ConflitMemeFichier))
	sb.WriteString("\x1f")
	fmt.Fprintf(&sb, "%d", p.MaxConcurrency)
	for _, rc := range p.CapsParRole {
		sb.WriteString("\x1f")
		sb.WriteString(rc.Role)
		sb.WriteString("=")
		fmt.Fprintf(&sb, "%d", rc.Cap)
	}
	return sb.String()
}

// MutationIsForbidden re-asserts gap F3 at the type level: a pinned run NEVER mutates its
// policy version. It compares the pin against a live policy version and reports whether a
// live-edit was attempted (true = the live policy diverged from the pinned one = a
// forbidden mid-run adaptation). It writes nothing; the orchestrator must REJECT the
// edit and require a NEW proposal. Pure, total, deterministic.
func MutationIsForbidden(pin RunPin, livePolicyVersion string) bool {
	return pin.PolicyVersion != livePolicyVersion
}

// MirrorRank is the canonical mirror-first rank of a render layer, re-stated here so the
// kernel conflict tie-break depends on NO runtime import (the same total order as the
// scheduler's LayerRank: mirror(0) < projection(1) < operation_action(2) < button(3);
// an unknown layer ranks LAST). DECLARED, never learned.
func MirrorRank(layer string) int {
	switch layer {
	case "mirror":
		return 0
	case "projection":
		return 1
	case "operation_action":
		return 2
	case "button":
		return 3
	default:
		return 4
	}
}

// ClaimContender is one agent's bid to claim a target. ResolveConflict decides WHO PASSES
// FIRST between two contenders for the SAME target — it is the tie-break of order, NEVER a
// discard of the loser's work (zero-lost-update). It carries only DECLARED data: the
// agent ref, the target, the render layer (for mirror-first ranking) and a content-hash
// (the second, total tie-break). BELOW the line — not a layer (no Version, no Mirror).
type ClaimContender struct {
	Agent       string `json:"agent"`        // the CoucheAgent @version bidding
	Target      string `json:"target"`       // the contended target (must match for a real conflict)
	Layer       string `json:"layer"`        // render layer — mirror-first ranking
	ContentHash string `json:"content_hash"` // content-address of the bid — the total tie-break
}

// ConflictResolution is the verdict of ResolveConflict: the winner (who passes first),
// the loser (who WAITS — its work is never thrown away), and the declared NextAction the
// orchestrator must take for the same target (serialise the loser, then merge-semantic).
// Same-target conflicts are NEVER resolved by a race or an LLM — only by this total rule.
type ConflictResolution struct {
	Winner     ClaimContender         `json:"winner"`
	Loser      ClaimContender         `json:"loser"`       // WAITS — zero lost update
	NextAction SameFileConflictPolicy `json:"next_action"` // serialise_then_merge (declared, never a race)
	SameTarget bool                   `json:"same_target"` // false ⇒ not a real conflict (the two may proceed in parallel)
}

// ResolveConflict is the PURE, TOTAL, DETERMINISTIC tie-break of WHO PASSES FIRST between
// two claim contenders for the SAME target (gap F2). It NEVER throws away the loser's
// work — the loser WAITS and the orchestrator then SERIALISES + MERGES (merge-semantic,
// the declared NextAction). The order is a total order:
//
//  1. lower MirrorRank wins (mirror-first — the source's mirror reddens first);
//  2. ties broken by content-hash (lexicographic, total — never an LLM, never a coin-flip);
//  3. a final tie (identical hash) keeps the lexicographically-smaller agent ref first
//     (still total — two identical bids are interchangeable, so no work is lost either way).
//
// If the targets DIFFER it is NOT a conflict: SameTarget=false and the two may proceed in
// parallel (the orchestrator does not serialise unrelated targets). The winner/loser are
// still assigned by the same total order so the function is total and symmetric:
// ResolveConflict(a,b) and ResolveConflict(b,a) name the SAME winner. No clock, no rng,
// no I/O — the reproducibility mirror pins same input ⇒ same output.
func ResolveConflict(a, b ClaimContender) ConflictResolution {
	same := a.Target == b.Target
	winner, loser := orderContenders(a, b)
	return ConflictResolution{
		Winner:     winner,
		Loser:      loser,
		NextAction: ConflictSerialiseThenMerge, // declared rule — NEVER a race
		SameTarget: same,
	}
}

// orderContenders applies the total order (MirrorRank, then content-hash, then agent ref)
// and returns (first, second). Total and SYMMETRIC: swapping the args yields the same
// (first, second) pair — so ResolveConflict cannot lose work by argument order.
func orderContenders(a, b ClaimContender) (ClaimContender, ClaimContender) {
	if aBeforeB(a, b) {
		return a, b
	}
	return b, a
}

// aBeforeB reports whether a strictly precedes b under the total order. Deterministic and
// antisymmetric: aBeforeB(a,b) and aBeforeB(b,a) are never both true.
func aBeforeB(a, b ClaimContender) bool {
	ra, rb := MirrorRank(a.Layer), MirrorRank(b.Layer)
	if ra != rb {
		return ra < rb
	}
	if a.ContentHash != b.ContentHash {
		return a.ContentHash < b.ContentHash
	}
	if a.Agent != b.Agent {
		return a.Agent < b.Agent
	}
	// Final tie-break on Target so the order is TOTAL over every field — two contenders
	// that differ only by target are still ordered identically regardless of argument
	// order (the symmetry invariant). Two fully-identical contenders are interchangeable,
	// so no work is lost either way.
	return a.Target < b.Target
}
