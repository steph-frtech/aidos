package agentimpl_test

// Property mirror (∀) for the DETERMINISTIC EMITTER Project (BA03).
// reflects=runtime.agent_impl_emitter · test_kind=property · cert_language=rapid ·
// liveness=live · authority=below. Project is a PURE emitter: a CoucheAgent SOURCE
// (above the line) + a resolved ProviderCfg (credentials only) + a ContextPack ref →
// an AgentImplementation projection (below the line), content-addressed exactly like
// agentrun.Record (records.Canonicalize + records.Hash). No LLM, no clock.
//
// The invariants pinned here (the RED set BA03 must turn green):
//  1. BYTE-STABLE: Project(layer, cfg, pack) is hash-stable — same (layer, cfg, pack)
//     ⇒ byte-identical AgentImplementation AND identical content-hash (Hash). A
//     projection re-emitted from the same source addresses to the same id.
//  2. cfg CARRIES NO BEHAVIOUR KNOB: changing ANY non-credential field of cfg leaves
//     the projection byte-identical (the only fields Project reads from cfg are the
//     resolved endpoint/key). temperature/seed/maxturns come UNIQUELY from the layer.
//     Conversely the behaviour knobs in the projection equal the SOURCE's, never cfg.
//  3. FAIL-CLOSED GATE: Project refuses (typed error) a layer failing agentlayer.Validate,
//     a cfg whose Model != Spec.Modele, a non-IsKnownProvider, and a non-IsKnownModel.
//  4. THE WALL: every emitted projection carries the full wall in ForbiddenPaths and
//     itself passes agentimpl.Validate (the projection is always wall-holding).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"pgregory.net/rapid"
)

// drawLayer draws a valid CoucheAgent SOURCE (passing agentlayer.Validate) with a
// declared provider/model pair from the closed sets.
func drawLayer(rt *rapid.T) (agentlayer.CoucheAgent, agentlayer.Provider, string) {
	providers := agentlayer.Providers()
	p := providers[rapid.IntRange(0, len(providers)-1).Draw(rt, "provider")]
	models := agentlayer.ModelsFor(p)
	model := models[rapid.IntRange(0, len(models)-1).Draw(rt, "model")]

	c := agentlayer.CoucheAgent{
		Layer: records.AuthorityAbove,
		Kind:  agentlayer.LayerKindAgent,
		Spec: agentlayer.AgentSpec{
			Nom:                 "agent-" + rapid.StringMatching(`[a-z]{3,8}`).Draw(rt, "nom"),
			Role:                "executor",
			Objectif:            "drive a red work item to green",
			Modele:              model,
			Provider:            p,
			PeutProposerVerite:  true,
			Temperature:         rapid.Float64Range(0, 2).Draw(rt, "temp"),
			MaxTurns:            rapid.IntRange(0, 200).Draw(rt, "turns"),
			Seed:                rapid.StringN(0, 16, 16).Draw(rt, "seed"),
			MaxConcurrency:      rapid.IntRange(0, 32).Draw(rt, "conc"),
			ZonesEcriture:       []string{"back/gen", "front/web"},
			AllowedNetworkHosts: nil,
			AllowedExec:         nil,
		},
		PolitiqueEcriture: agentlayer.WritePolicy{AllowedWriteZones: []string{"back/gen"}, AboveWaterlineForbidden: true},
		Autorite: authority.AuthorityGraph{
			Domain:    "checkout",
			TruthKind: "behavioral",
			Approvers: []authority.Role{"product_owner"},
		},
		Scope: scope.TruthScope{Region: scope.RegionEU},
	}
	c.Version = c.Spec.Modele // a non-empty version ref (BA03 does not re-hash the SOURCE)
	return c, p, model
}

// validCfg is the resolved provider configuration: endpoint + key ONLY. The Model
// field is the gate-check input (must equal Spec.Modele); it is NOT a knob.
func validCfg(p agentlayer.Provider, model string) agentimpl.ProviderCfg {
	return agentimpl.ProviderCfg{
		Provider: p,
		Model:    model,
		Endpoint: "https://api.example.test/v1",
		APIKey:   "sk-resolved-secret",
	}
}

// (1) Byte-stable: same (layer, cfg, pack) ⇒ identical projection + identical hash.
func TestProp_Project_ByteStable(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		layer, p, model := drawLayer(rt)
		cfg := validCfg(p, model)
		pack := "pack-" + rapid.StringMatching(`[a-f0-9]{8}`).Draw(rt, "pack")

		a1, err1 := agentimpl.Project(layer, cfg, pack)
		a2, err2 := agentimpl.Project(layer, cfg, pack)
		if err1 != nil || err2 != nil {
			rt.Fatalf("a valid layer must project: %v / %v", err1, err2)
		}
		h1, e1 := agentimpl.Hash(a1)
		h2, e2 := agentimpl.Hash(a2)
		if e1 != nil || e2 != nil {
			rt.Fatalf("Hash must succeed: %v / %v", e1, e2)
		}
		if h1 != h2 {
			rt.Fatalf("Project is not hash-stable: %q != %q", h1, h2)
		}
		// And the canonical bytes themselves are identical.
		b1, _ := records.Canonicalize(mustJSON(rt, a1))
		b2, _ := records.Canonicalize(mustJSON(rt, a2))
		if string(b1) != string(b2) {
			rt.Fatalf("Project not byte-identical: %s != %s", b1, b2)
		}
	})
}

// (2a) cfg carries NO behaviour knob: mutating any non-credential field of cfg leaves
// the projection byte-identical. We perturb Endpoint/APIKey (the only legit fields) —
// since they are NOT copied into the projection, the projection is unchanged.
func TestProp_Project_CfgIgnoresNonCredential(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		layer, p, model := drawLayer(rt)
		pack := "pack-x"

		base := validCfg(p, model)
		perturbed := base
		perturbed.Endpoint = "https://OTHER.endpoint.test/v2"
		perturbed.APIKey = "sk-a-totally-different-key"

		a1, err1 := agentimpl.Project(layer, base, pack)
		a2, err2 := agentimpl.Project(layer, perturbed, pack)
		if err1 != nil || err2 != nil {
			rt.Fatalf("both must project: %v / %v", err1, err2)
		}
		h1, _ := agentimpl.Hash(a1)
		h2, _ := agentimpl.Hash(a2)
		if h1 != h2 {
			rt.Fatalf("endpoint/key (resolved credentials) must NOT change the projection: %q != %q", h1, h2)
		}
	})
}

// (2b) The behaviour knobs in the projection equal the SOURCE's, NEVER cfg.
func TestProp_Project_KnobsFromLayer(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		layer, p, model := drawLayer(rt)
		impl, err := agentimpl.Project(layer, validCfg(p, model), "pack-y")
		if err != nil {
			rt.Fatalf("valid layer must project: %v", err)
		}
		if impl.Temperature != layer.Spec.Temperature {
			rt.Fatalf("Temperature must come from the layer: %v != %v", impl.Temperature, layer.Spec.Temperature)
		}
		if impl.MaxTurns != layer.Spec.MaxTurns {
			rt.Fatalf("MaxTurns must come from the layer: %v != %v", impl.MaxTurns, layer.Spec.MaxTurns)
		}
		if impl.Seed != layer.Spec.Seed {
			rt.Fatalf("Seed must come from the layer: %q != %q", impl.Seed, layer.Spec.Seed)
		}
		if impl.Model != layer.Spec.Modele {
			rt.Fatalf("Model must equal Spec.Modele: %q != %q", impl.Model, layer.Spec.Modele)
		}
		if impl.Provider != layer.Spec.Provider {
			rt.Fatalf("Provider must equal Spec.Provider: %q != %q", impl.Provider, layer.Spec.Provider)
		}
	})
}

// (3a) Refuses a layer failing agentlayer.Validate (e.g. PeutModifierNoyau true).
func TestProp_Project_RefusesInvalidLayer(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		layer, p, model := drawLayer(rt)
		layer.Spec.PeutModifierNoyau = true // the wall: ALWAYS invalid
		if _, err := agentimpl.Project(layer, validCfg(p, model), "pack-z"); err == nil {
			rt.Fatalf("Project must refuse a layer failing agentlayer.Validate")
		}
	})
}

// (3b) Refuses a cfg whose Model != Spec.Modele.
func TestProp_Project_RefusesModelMismatch(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		layer, p, model := drawLayer(rt)
		cfg := validCfg(p, model)
		cfg.Model = model + "-MUTATED"
		if _, err := agentimpl.Project(layer, cfg, "pack"); err == nil {
			rt.Fatalf("Project must refuse cfg.Model != Spec.Modele")
		}
	})
}

// (3c) Refuses a non-IsKnownProvider (set on the SOURCE, then projected).
func TestProp_Project_RefusesUnknownProvider(t *testing.T) {
	layer, _, _ := drawLayerStatic()
	layer.Spec.Provider = agentlayer.Provider("megacorp-ai")
	cfg := agentimpl.ProviderCfg{Provider: "megacorp-ai", Model: layer.Spec.Modele}
	if _, err := agentimpl.Project(layer, cfg, "pack"); err == nil {
		t.Fatalf("Project must refuse an unknown provider")
	}
}

// (3d) Refuses a non-IsKnownModel (a retired/inexistent model never reaches the provider).
func TestProp_Project_RefusesUnknownModel(t *testing.T) {
	layer, p, _ := drawLayerStatic()
	layer.Spec.Modele = "claude-opus-RETIRED"
	cfg := agentimpl.ProviderCfg{Provider: p, Model: "claude-opus-RETIRED"}
	if _, err := agentimpl.Project(layer, cfg, "pack"); err == nil {
		t.Fatalf("Project must refuse an unknown model (closed set per provider)")
	}
}

// (4) Every emitted projection passes agentimpl.Validate and carries the full wall.
func TestProp_Project_AlwaysWallHolding(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		layer, p, model := drawLayer(rt)
		impl, err := agentimpl.Project(layer, validCfg(p, model), "pack")
		if err != nil {
			rt.Fatalf("valid layer must project: %v", err)
		}
		if verr := agentimpl.Validate(impl); verr != nil {
			rt.Fatalf("an emitted projection must always be Validate-clean (wall-holding): %v", verr)
		}
		for _, w := range agentimpl.WallForbiddenPaths() {
			found := false
			for _, fp := range impl.ForbiddenPaths {
				if fp == w {
					found = true
				}
			}
			if !found {
				rt.Fatalf("emitted ForbiddenPaths missing wall zone %q", w)
			}
		}
	})
}

// drawLayerStatic is a deterministic non-rapid helper for the single-shot negative tests.
func drawLayerStatic() (agentlayer.CoucheAgent, agentlayer.Provider, string) {
	c := agentlayer.CoucheAgent{
		Layer: records.AuthorityAbove,
		Kind:  agentlayer.LayerKindAgent,
		Spec: agentlayer.AgentSpec{
			Nom:                "agent-static",
			Role:               "executor",
			Objectif:           "static",
			Modele:             "claude-fable-5",
			Provider:           agentlayer.ProviderAnthropic,
			PeutProposerVerite: true,
			ZonesEcriture:      []string{"back/gen"},
		},
		Autorite: authority.AuthorityGraph{
			Domain:    "checkout",
			TruthKind: "behavioral",
			Approvers: []authority.Role{"product_owner"},
		},
		Scope: scope.TruthScope{Region: scope.RegionEU},
	}
	c.Version = c.Spec.Modele
	return c, agentlayer.ProviderAnthropic, "claude-fable-5"
}

func mustJSON(rt *rapid.T, a agentimpl.AgentImplementation) []byte {
	b, err := agentimpl.CanonicalBytes(a)
	if err != nil {
		rt.Fatalf("CanonicalBytes: %v", err)
	}
	return b
}
