// Package agentlayer models an agent as a GOVERNED LAYER — a SOURCE in the kernel,
// above the waterline, versioned and content-addressed (S02 scheme). A modelled
// agent IS a layer; a single execution is NOT (that is an AgentRun, see
// back/runtime/agentrun). The agent proposes / executes / explores but NEVER
// declares alone what is true:
//
//	« en KRD un agent n'est jamais une autorité — c'est une couche gouvernée ;
//	  il propose, exécute, explore, mais ne déclare jamais seul ce qui est vrai. »
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): Validate, MayWrite and Propose are pure,
// total functions of their input — no DB, no clock, no rng, no I/O. MayWrite
// REUSES the S04 wall waterline predicate (a path/schema classifier, never an "LLM
// permission agent"); Propose always yields a `proposed` (never `admitted`)
// proposal. The reproducibility mirror (agentlayer_property_test.go) pins that.
//
// THE WALL (CLAUDE.md §2): PeutModifierNoyau and PeutModifierFitness are ALWAYS
// false — encoded as the zero value AND re-asserted by Validate; no agent, ever,
// writes the kernel or the fitness. This package reads the S04 Classify predicate
// and the S16/S15 qualifiers; it forks none of them and writes no truth.
package agentlayer

import (
	"errors"
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
)

// LayerKind extends the S02/S35 metamodel taxonomy with the agent triad. It is a
// NEW, CLOSED addition (a SemanticDiff `add`, never a replacement of the existing
// records.Kind / layer kinds). A modelled agent is one of exactly three kinds.
type LayerKind string

const (
	// LayerKindAgent — one modelled agent.
	LayerKindAgent LayerKind = "agent"
	// LayerKindEquipeAgents — a team of agents.
	LayerKindEquipeAgents LayerKind = "equipe_agents"
	// LayerKindOrchestration — an orchestration of agents/teams.
	LayerKindOrchestration LayerKind = "orchestration"
)

var layerKindOrder = []LayerKind{LayerKindAgent, LayerKindEquipeAgents, LayerKindOrchestration}

// LayerKinds returns the three agent layer-kinds in canonical order (declared,
// never derived from map iteration) so the Workbench card set is never invented.
func LayerKinds() []LayerKind {
	out := make([]LayerKind, len(layerKindOrder))
	copy(out, layerKindOrder)
	return out
}

// IsKnownLayerKind reports whether k is one of the three agent layer-kinds. The
// taxonomy is closed: any other kind makes Validate error.
func IsKnownLayerKind(k LayerKind) bool {
	for _, kk := range layerKindOrder {
		if kk == k {
			return true
		}
	}
	return false
}

// Provider is the closed set of model providers (no free-text — pinned here, never
// discovered at runtime).
type Provider string

const (
	// ProviderAnthropic — Anthropic (Claude).
	ProviderAnthropic Provider = "anthropic"
	// ProviderOpenAI — OpenAI.
	ProviderOpenAI Provider = "openai"
	// ProviderGoogle — Google (Gemini).
	ProviderGoogle Provider = "google"
)

var providerOrder = []Provider{ProviderAnthropic, ProviderOpenAI, ProviderGoogle}

// Providers returns the closed provider set in canonical order.
func Providers() []Provider {
	out := make([]Provider, len(providerOrder))
	copy(out, providerOrder)
	return out
}

// IsKnownProvider reports whether p is a member of the closed provider set.
func IsKnownProvider(p Provider) bool {
	for _, pp := range providerOrder {
		if pp == p {
			return true
		}
	}
	return false
}

// knownModelsByProvider is the CLOSED model set, keyed by provider — pinned here,
// never discovered at runtime. A model a step needs is ADDED to this declared set
// (above the line, via /goal); it is never inferred. A retired/non-existent model
// fails the gate at projection time (agentimpl.Project), never opaquely at the
// provider. Mirrors the closed-set discipline of providerOrder/IsKnownProvider.
var knownModelsByProvider = map[Provider][]string{
	ProviderAnthropic: {"claude-opus-4-8", "claude-sonnet-4-5", "claude-haiku-4-5"},
	ProviderOpenAI:    {"gpt-5", "gpt-5-mini", "o4"},
	ProviderGoogle:    {"gemini-3-pro", "gemini-3-flash"},
}

// ModelsFor returns a FRESH copy of the closed model set declared for provider p, in
// canonical order. An unknown provider yields an empty slice (fail-closed). The
// caller can never mutate the canonical set.
func ModelsFor(p Provider) []string {
	src := knownModelsByProvider[p]
	out := make([]string, len(src))
	copy(out, src)
	return out
}

// IsKnownModel reports whether model is a member of the closed model set declared
// for provider p. It is the model-axis twin of IsKnownProvider: a closed, per-provider
// set, fail-closed (an unknown provider OR an undeclared model ⇒ false). Pure, total.
func IsKnownModel(p Provider, model string) bool {
	for _, m := range knownModelsByProvider[p] {
		if m == model {
			return true
		}
	}
	return false
}

// AgentSpec is the governed-rights core of a CoucheAgent. Rights are DECLARED,
// never learned (CLAUDE.md §8). PeutModifierNoyau and PeutModifierFitness are
// STRUCTURAL guarantees of the wall — they are not toggles a screen can flip; a
// spec that claims either is invalid (Validate rejects it).
type AgentSpec struct {
	ID       string   `json:"id"`       // content-hash of the canonical body (S02 scheme)
	Nom      string   `json:"nom"`      // the agent's name
	Role     string   `json:"role"`     // what it is for (e.g. "bdd-writer", "executor")
	Objectif string   `json:"objectif"` // its declared objective
	Modele   string   `json:"modele"`   // the model id (e.g. "claude-opus-4-8")
	Provider Provider `json:"provider"`

	// Rights above/below the waterline. PeutModifierNoyau and PeutModifierFitness
	// are ALWAYS false (the wall, §2; §8 anti-Goodhart). No agent, ever, writes the
	// kernel or the fitness.
	PeutProposerVerite  bool `json:"peut_proposer_verite"`  // may PROPOSE a candidate-truth (idea→mirror→/goal)
	PeutModifierNoyau   bool `json:"peut_modifier_noyau"`   // MUST be false (kernel is above the line)
	PeutModifierMiroir  bool `json:"peut_modifier_miroir"`  // may a mirror-writer agent PROPOSE a mirror? (still needs approval)
	PeutModifierFitness bool `json:"peut_modifier_fitness"` // MUST be false (NIVEAU 3 read-only)

	ZonesLecture   []string `json:"zones_lecture"`   // schemas/paths it may read
	ZonesEcriture  []string `json:"zones_ecriture"`  // schemas/paths it may write — NONE above the waterline
	StopConditions []string `json:"stop_conditions"` // declared halt rules (e.g. "red set still red")

	// BA01 — GOVERNED BEHAVIOUR KNOBS. Every knob projection and replay depend on
	// lives HERE, in the governed layer (above the line), NEVER in a providerCfg
	// (a providerCfg carries only the resolved endpoint/credential — BA03). A knob
	// not declared here is a determinism gap (CLAUDE.md §6/§8). Validate is
	// kind-aware and the empty defaults are MAX confinement, fail-closed.
	Temperature         float64        `json:"temperature"`           // sampling temperature, range [0,2]; 0 = most deterministic
	MaxTurns            int            `json:"max_turns"`             // hard cap on agent turns (≥ 0)
	Seed                string         `json:"seed"`                  // replay seed; if empty, derive deterministically via DeriveSeed(impl‖pack‖item) — NEVER an RNG
	AllowedNetworkHosts []string       `json:"allowed_network_hosts"` // egress allow-list; EMPTY ⇒ no egress (fail-closed)
	AllowedExec         []string       `json:"allowed_exec"`          // subprocess allow-list; EMPTY ⇒ no subprocess (fail-closed)
	ResourceLimits      ResourceLimits `json:"resource_limits"`       // cgroup/ulimit caps
	MaxConcurrency      int            `json:"max_concurrency"`       // max concurrent leases/agents (≥ 0; BA24/BA25 enforce it)
}

// ResourceLimits are the declared cgroup/ulimit caps for an agent run (BA01). They are
// DECLARED in the governed layer, never discovered at runtime. A zero value means
// "unbounded for that axis" only insofar as the runtime applies no extra cap — but a
// NEGATIVE value is always invalid (Validate rejects it, fail-closed).
type ResourceLimits struct {
	MaxMemoryMB    int `json:"max_memory_mb"`    // memory ceiling (MB, ≥ 0)
	MaxCPUMillis   int `json:"max_cpu_millis"`   // CPU quota (milli-cores, ≥ 0)
	MaxWallSeconds int `json:"max_wall_seconds"` // wall-clock budget (seconds, ≥ 0)
}

// SkillBinding — a Skill the agent may replay (S35 generic gesture). Enabled is the
// declared toggle.
type SkillBinding struct {
	SkillName string `json:"skill_name"`
	Enabled   bool   `json:"enabled"`
}

// MCPBinding — one backend op the agent may call (server + tool, ADR 0009).
type MCPBinding struct {
	Server  string `json:"server"`
	Tool    string `json:"tool"`
	Enabled bool   `json:"enabled"`
}

// AgentHookPolicy — a non-bypassable hook the agent MUST run under (Phase + Hook).
type AgentHookPolicy struct {
	Phase     string `json:"phase"`
	Hook      string `json:"hook"`
	Mandatory bool   `json:"mandatory"`
}

// AgentContextPolicy — the memory/context read policy; it DEFERS to the S30
// MemoryFirewall (the firewall, not this layer, gates the ContextPack).
type AgentContextPolicy struct {
	ReadZones           []string `json:"read_zones"`
	FirewallDefersToS30 bool     `json:"firewall_defers_to_s30"`
}

// EvolutionAgentPolicy — the /evolve self-play rights (S42): the medium loop writes
// only branches/reports/ideas, never truth.
type EvolutionAgentPolicy struct {
	MaySelfPlay                    bool `json:"may_self_play"`
	WritesOnlyBranchesReportsIdeas bool `json:"writes_only_branches_reports_ideas"`
}

// WritePolicy — what the agent may write; NONE above the line (AboveWaterlineForbidden
// is structurally true and re-asserted by Validate).
type WritePolicy struct {
	AllowedWriteZones       []string `json:"allowed_write_zones"`
	AboveWaterlineForbidden bool     `json:"above_waterline_forbidden"`
}

// CoucheAgent is the governed-layer SOURCE. It carries its bindings, policies,
// authority, scope and version. It REUSES S16 AuthorityGraph and S15 TruthScope
// verbatim — it does NOT fork them. The Layer base is the S02 metamodel record;
// authority is ALWAYS above the line (a CoucheAgent is a SOURCE/truth, KRD §21).
type CoucheAgent struct {
	Layer              records.Authority    `json:"layer"` // the S02 waterline placement (always "above")
	Kind               LayerKind            `json:"kind"`  // agent | equipe_agents | orchestration
	Spec               AgentSpec            `json:"spec"`
	SkillsAutorises    []SkillBinding       `json:"skills_autorises"`
	OutilsMCPAutorises []MCPBinding         `json:"outils_mcp_autorises"`
	HooksObligatoires  []AgentHookPolicy    `json:"hooks_obligatoires"` // non-bypassable hooks the agent MUST run under
	PolitiqueMemoire   AgentContextPolicy   `json:"politique_memoire"`  // memory read policy (defers to S30 firewall)
	PolitiqueContexte  AgentContextPolicy   `json:"politique_contexte"`
	PolitiqueEcriture  WritePolicy          `json:"politique_ecriture"` // what it may write — NONE above the line
	PolitiqueEvolution EvolutionAgentPolicy `json:"politique_evolution"`
	// BA24 — orchestration. A LayerKindOrchestration REQUIRES a non-empty Equipe AND a
	// well-formed OrchestrationPolicy; a non-orchestration layer must carry NEITHER
	// (Validate is kind-aware). The team is a list of member CoucheAgent @versions.
	Equipe        []string                 `json:"equipe,omitempty"`        // team member @versions (orchestration only)
	Orchestration *OrchestrationPolicy     `json:"orchestration,omitempty"` // coordination rules (orchestration only)
	Autorite      authority.AuthorityGraph `json:"autorite"`                // S16 — who approves the agent's proposals
	Scope         scope.TruthScope         `json:"scope"`                   // S15 — where/when the agent layer holds
	Version       string                   `json:"version"`                 // == Spec.ID (content-addressed, S02)
}

// Validation errors.
var (
	// ErrUnknownLayerKind — Kind is outside the closed {agent, equipe_agents, orchestration}.
	ErrUnknownLayerKind = errors.New("agentlayer: unknown layer kind (not agent|equipe_agents|orchestration)")
	// ErrUnknownProvider — Spec.Provider is outside the closed provider set.
	ErrUnknownProvider = errors.New("agentlayer: unknown provider")
	// ErrCanModifyKernel — a CoucheAgent claims PeutModifierNoyau: ALWAYS forbidden (the wall).
	ErrCanModifyKernel = errors.New("agentlayer: peut_modifier_noyau must be false — no agent writes the kernel (the wall)")
	// ErrCanModifyFitness — a CoucheAgent claims PeutModifierFitness: ALWAYS forbidden (NIVEAU 3 read-only).
	ErrCanModifyFitness = errors.New("agentlayer: peut_modifier_fitness must be false — the fitness is read-only (the wall)")
	// ErrWriteZoneAboveWaterline — a declared write zone resolves above the waterline.
	ErrWriteZoneAboveWaterline = errors.New("agentlayer: a write zone resolves above the waterline (forbidden)")
	// ErrEmptyName — Spec.Nom / Spec.Role is empty.
	ErrEmptyName = errors.New("agentlayer: spec nom and role must be non-empty")
	// ErrNotAboveTheLine — a CoucheAgent (a SOURCE/truth) must sit above the waterline.
	ErrNotAboveTheLine = errors.New("agentlayer: a CoucheAgent is a SOURCE and must be above the waterline")
)

// Validate is the PURE shape + wall guard of a CoucheAgent (KRD §21 + the wall §2):
//   - Kind is one of the three closed agent layer-kinds;
//   - Spec.Nom and Spec.Role are non-empty;
//   - Spec.Provider is a member of the closed provider set;
//   - Spec.PeutModifierNoyau == false AND Spec.PeutModifierFitness == false — ALWAYS
//     (the wall is structural, not a toggle; a spec claiming otherwise is invalid);
//   - no Spec.ZonesEcriture entry resolves above the waterline (REUSES the S04
//     waterline predicate via aboveWaterline — does not fork it);
//   - the layer placement is above the line (a CoucheAgent is a SOURCE/truth);
//   - Autorite and Scope are well-formed (S16/S15 Validate; an active layer needs a scope).
//
// Pure: no DB, no clock, no I/O. Same input ⇒ same verdict (the property mirror pins it).
func Validate(c CoucheAgent) error {
	if !IsKnownLayerKind(c.Kind) {
		return fmt.Errorf("%w: %q", ErrUnknownLayerKind, c.Kind)
	}
	if strings.TrimSpace(c.Spec.Nom) == "" || strings.TrimSpace(c.Spec.Role) == "" {
		return ErrEmptyName
	}
	if !IsKnownProvider(c.Spec.Provider) {
		return fmt.Errorf("%w: %q", ErrUnknownProvider, c.Spec.Provider)
	}
	// The two structural always-false rights (the wall). A CoucheAgent that claims
	// either is invalid — no toggle, no exception, no "trusted agent".
	if c.Spec.PeutModifierNoyau {
		return ErrCanModifyKernel
	}
	if c.Spec.PeutModifierFitness {
		return ErrCanModifyFitness
	}
	// No declared write zone may resolve above the waterline.
	for _, z := range c.Spec.ZonesEcriture {
		if aboveWaterline(z) {
			return fmt.Errorf("%w: %q", ErrWriteZoneAboveWaterline, z)
		}
	}
	for _, z := range c.PolitiqueEcriture.AllowedWriteZones {
		if aboveWaterline(z) {
			return fmt.Errorf("%w: %q", ErrWriteZoneAboveWaterline, z)
		}
	}
	// BA01 — the governed behaviour knobs are in range (fail-closed: out-of-range ⇒
	// invalid). Kind-aware: the ranges hold for every layer-kind; the empty
	// network/exec allow-lists are MAX confinement (enforced by EgressAllowed /
	// ExecAllowed, not a range — an empty list is the valid, most-confined default).
	if err := validateKnobs(c.Spec); err != nil {
		return err
	}
	// BA24 — KIND-AWARE orchestration guard. An `orchestration` layer REQUIRES a
	// non-empty team AND a well-formed OrchestrationPolicy (bounded by the spec's BA01
	// MaxConcurrency knob — gap F1); a non-orchestration layer must carry NEITHER.
	if c.Kind == LayerKindOrchestration {
		if c.Orchestration == nil {
			return ErrOrchestrationNeedsPolicy
		}
		if len(c.Equipe) == 0 {
			return ErrOrchestrationNeedsTeam
		}
		if err := validatePolicy(*c.Orchestration, c.Spec.MaxConcurrency); err != nil {
			return err
		}
	} else {
		if c.Orchestration != nil {
			return ErrNonOrchestrationCarriesPolicy
		}
		if len(c.Equipe) > 0 {
			return ErrNonOrchestrationCarriesTeam
		}
	}
	// A CoucheAgent is a SOURCE/truth — it must be above the waterline.
	if c.Layer != records.AuthorityAbove {
		return ErrNotAboveTheLine
	}
	// The S16 AuthorityGraph that admits the agent's proposals must be well-formed.
	if err := authority.Validate(c.Autorite); err != nil {
		return fmt.Errorf("agentlayer: autorite: %w", err)
	}
	// The S15 TruthScope must be well-formed (an active layer must carry a scope).
	if err := scope.Validate(scope.Record{Status: scope.StatusActive, Scope: c.Scope}); err != nil {
		return fmt.Errorf("agentlayer: scope: %w", err)
	}
	return nil
}
