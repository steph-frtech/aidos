package agentimpl

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// ProviderCfg is the RESOLVED provider configuration handed to Project (BA03). It
// carries ONLY the resolved endpoint and credential — the network coordinates the
// runtime needs to reach the model — plus the Provider/Model gate-check inputs. It
// carries NO behaviour knob: temperature, seed, max-turns, confinement live in the
// governed SOURCE (agentlayer.AgentSpec, BA01), never here. Smuggling a knob through
// the cfg would be a determinism gap (CLAUDE.md §6/§8) and a wall hole (an ungoverned
// behaviour change). Project deliberately reads only Provider/Model from cfg for the
// gate, and copies NEITHER Endpoint NOR APIKey into the AgentImplementation (a
// projection is content-addressed; a secret is not part of its identity — the
// reproducibility mirror pins that the projection is byte-identical when only
// Endpoint/APIKey change).
type ProviderCfg struct {
	Provider agentlayer.Provider `json:"provider"` // gate input: must equal Spec.Provider
	Model    string              `json:"model"`    // gate input: must equal Spec.Modele
	Endpoint string              `json:"-"`        // resolved endpoint (NOT part of the projection identity)
	APIKey   string              `json:"-"`        // resolved credential (NEVER in the projection)
}

// Project emitter errors (typed, fail-closed).
var (
	// ErrInvalidLayer — the SOURCE CoucheAgent fails agentlayer.Validate (the wall/shape).
	ErrInvalidLayer = errors.New("agentimpl: cannot project an invalid CoucheAgent (fails agentlayer.Validate)")
	// ErrCfgModelMismatch — cfg.Model != Spec.Modele (the cfg cannot re-pick the model).
	ErrCfgModelMismatch = errors.New("agentimpl: providerCfg.model must equal the layer's Spec.Modele (the cfg carries no model choice)")
	// ErrCfgProviderMismatch — cfg.Provider != Spec.Provider.
	ErrCfgProviderMismatch = errors.New("agentimpl: providerCfg.provider must equal the layer's Spec.Provider")
	// ErrUnknownModel — Spec.Modele is outside the closed model set declared for the provider.
	ErrUnknownModel = errors.New("agentimpl: unknown model for provider (not in the closed declared set)")
)

// Project is the DETERMINISTIC EMITTER (BA03): it projects a governed CoucheAgent
// SOURCE (above the line) into a runnable AgentImplementation (below the line), under
// a resolved ProviderCfg (credentials only) and a ContextPack ref. It is PURE — no
// LLM, no clock, no rng, no I/O — so the same (layer, cfg, pack) yields a
// BYTE-IDENTICAL projection (hash-stable via records.Canonicalize + records.Hash,
// exactly like agentrun.Record). The reproducibility mirror pins that.
//
// THE GATE is fail-closed; Project refuses (typed error):
//   - a layer failing agentlayer.Validate (the wall + shape — ErrInvalidLayer);
//   - cfg.Provider != Spec.Provider (ErrCfgProviderMismatch);
//   - cfg.Model != Spec.Modele (ErrCfgModelMismatch — the cfg never re-picks the model);
//   - a provider outside the closed set (agentlayer.IsKnownProvider — ErrUnknownProvider);
//   - a model outside the closed per-provider set (agentlayer.IsKnownModel — ErrUnknownModel:
//     a retired/inexistent model fails HERE, never opaquely at the provider).
//
// THE KNOBS come UNIQUELY from the SOURCE: Temperature/MaxTurns/Seed/MaxConcurrency/
// ResourceLimits and the confinement allow-lists are copied DOWN from the governed
// layer — never from cfg. THE WALL is always carried: ForbiddenPaths is the
// single-sourced WallForbiddenPaths (the projection can never grant a write above the
// line). The emitted projection always passes Validate.
func Project(layer agentlayer.CoucheAgent, cfg ProviderCfg, pack string) (AgentImplementation, error) {
	// Gate 1 — the SOURCE must be a valid governed layer (the wall + shape).
	if err := agentlayer.Validate(layer); err != nil {
		return AgentImplementation{}, fmt.Errorf("%w: %v", ErrInvalidLayer, err)
	}
	spec := layer.Spec
	// Gate 2 — the cfg may not re-pick provider/model (it carries credentials only).
	if cfg.Provider != spec.Provider {
		return AgentImplementation{}, fmt.Errorf("%w: cfg=%q spec=%q", ErrCfgProviderMismatch, cfg.Provider, spec.Provider)
	}
	if cfg.Model != spec.Modele {
		return AgentImplementation{}, fmt.Errorf("%w: cfg=%q spec=%q", ErrCfgModelMismatch, cfg.Model, spec.Modele)
	}
	// Gate 3 — provider is in the closed set (agentlayer.Validate already checks it,
	// but we re-assert at the emitter boundary, fail-closed).
	if !agentlayer.IsKnownProvider(spec.Provider) {
		return AgentImplementation{}, fmt.Errorf("%w: %q", ErrUnknownProvider, spec.Provider)
	}
	// Gate 4 — model is in the closed per-provider set (NEW at BA03): a retired or
	// inexistent model fails the gate here, never opaquely at the provider.
	if !agentlayer.IsKnownModel(spec.Provider, spec.Modele) {
		return AgentImplementation{}, fmt.Errorf("%w: provider=%q model=%q", ErrUnknownModel, spec.Provider, spec.Modele)
	}

	impl := AgentImplementation{
		// LayerRef is a plain string POINTER back to the SOURCE@version (a reference,
		// never a re-embedded layer). It binds the projection to the version it came from.
		LayerRef: layerRef(layer),

		// Declared identity/intent copied DOWN from the SOURCE — the DECLARED inputs of
		// the deterministic SystemPrompt template (BA04). StopConditions normalized for
		// byte-stable projection.
		Role:           spec.Role,
		Objectif:       spec.Objectif,
		StopConditions: normalizePaths(spec.StopConditions),

		// Behaviour knobs copied DOWN from the governed SOURCE — NEVER from cfg.
		Provider:    spec.Provider,
		Model:       spec.Modele,
		Temperature: spec.Temperature,
		MaxTurns:    spec.MaxTurns,
		Seed:        spec.Seed,

		// Resolved capability surface (deterministic resolution of the enabled bindings).
		// Delegated to the BA05 exported resolvers — there is ONE resolution, proven by
		// bindings_property_test.go to NARROW (subset), never widen, the governed surface.
		Tools:  ResolveTools(layer.OutilsMCPAutorises),
		Skills: ResolveSkills(layer.SkillsAutorises),
		Hooks:  ResolveHooks(layer.HooksObligatoires),

		// Confinement. AllowedPaths is the layer's declared write zones (sorted,
		// de-duplicated for byte-stability); ForbiddenPaths is ALWAYS the single-sourced
		// wall (WallForbiddenPaths). The projection can never grant a write above the line.
		AllowedPaths:   normalizePaths(spec.ZonesEcriture),
		ForbiddenPaths: WallForbiddenPaths(),

		// Network/exec confinement copied DOWN (empty ⇒ deny all, fail-closed).
		AllowedNetworkHosts: normalizePaths(spec.AllowedNetworkHosts),
		AllowedExec:         normalizePaths(spec.AllowedExec),

		ResourceLimits: spec.ResourceLimits,
		MaxConcurrency: spec.MaxConcurrency,
	}

	// The emitter always yields a wall-holding, Validate-clean projection (defence in
	// depth: an emitted projection that fails its own shape guard is a bug, not output).
	if err := Validate(impl); err != nil {
		return AgentImplementation{}, fmt.Errorf("agentimpl: emitted projection failed Validate (emitter bug): %w", err)
	}
	return impl, nil
}

// LayerRef builds the stable "CoucheAgent@version" pointer a projection carries — the
// exported door BA06 (the agentimpl MCP server, the Workbench) uses to address a governed
// layer without re-implementing the rule. It DELEGATES to the same internal layerRef the
// emitter uses (one resolution, never two), so the ref shown is byte-for-byte the ref the
// projection embeds. Pure, total, deterministic.
func LayerRef(layer agentlayer.CoucheAgent) string {
	return layerRef(layer)
}

// layerRef builds the stable "CoucheAgent@version" pointer the projection carries.
func layerRef(layer agentlayer.CoucheAgent) string {
	v := layer.Version
	if v == "" {
		v = layer.Spec.ID
	}
	return "agentlayer:" + v
}

// normalizePaths sorts + de-duplicates a string slice for byte-stable projection;
// an empty result is nil (the JSON canonical form is then `null`, stable).
func normalizePaths(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}

// CanonicalBytes returns the deterministic JSON encoding of an AgentImplementation —
// the byte form it is content-addressed over. It reuses records.Canonicalize (object
// keys sorted, no insignificant whitespace), exactly the S01/S02 scheme agentrun.Record
// uses. Endpoint/APIKey never appear (ProviderCfg is not part of the projection).
func CanonicalBytes(a AgentImplementation) ([]byte, error) {
	raw, err := json.Marshal(a)
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// Hash returns the content-address of an AgentImplementation = Hash(CanonicalBytes) —
// the SAME content-addressing scheme as agentrun.Record (records.Hash over the
// canonical body). Same projection ⇒ same hash (the reproducibility mirror pins it).
func Hash(a AgentImplementation) (string, error) {
	b, err := CanonicalBytes(a)
	if err != nil {
		return "", err
	}
	return records.Hash(b), nil
}
