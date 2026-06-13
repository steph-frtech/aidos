package connectorinfra_test

// Invariant mirror (rapid property test, ∀ N1) — WRITTEN FIRST (RED→GREEN).
// reflects=dp23-connector-infra-fragments+tool-registry-routing · test_kind=property ·
// cert_language=rapid · liveness=live · authority=above-the-line-source(stack_manifest)
// projected below + reuse of the DP20 connector model + the S73/DP16 async outbox.
//
// DP23 — l'INFRA de l'app émise (services-substrat, profile connectors) : MCP-Gateway +
// Connector-Registry + Tool-Registry + Webhook-Gateway, calquée sur DP15/DP16/DP17/DP18.
// Les lois (déterminisme-first, mur §2) :
//
//   L1 byte-identique : ∀ (projectID, env) légaux, SubstrateConnectorInfraFragments rend
//      des fragments dont le body canonique (records.Canonicalize) est BYTE-IDENTIQUE à
//      chaque appel — même projectID + même env ⇒ mêmes octets (re-émission stable ×100).
//   L2 palette close : EXACTEMENT 4 fragments (mcp-gateway, connector-registry,
//      tool-registry, webhook-gateway), chacun portant image + port interne + volume bind
//      + healthcheck + profile connectors + project_id — jamais deviné, le jeu est clos.
//   L3 pas de gate env : aucun fragment d'infra connecteur n'est interdit par
//      environnement — seul un environnement HORS-ENSEMBLE échoue (UNKNOWN_ENVIRONMENT).
//   L4 isolation : project A ≠ project B ⇒ chaque fragment porte un project_id distinct ET
//      un nom de volume isolé ; A ne réutilise jamais l'octet de B (token DP15 partagé).
//   L5 token partagé : le token d'isolation est CELUI de DP15 (datafragments.Isolation
//      Token), pas un schéma forké — même seed ⇒ même token sur toutes les couches.
//   L6 routage Tool-Registry PUR : ∀ registre + nom d'outil, RouteTool est une appartenance
//      ensembliste FAIL-CLOSED, zéro LLM — un outil enregistré ⇒ route (Admitted) ; un
//      outil ABSENT ⇒ refus TOOL_NOT_REGISTERED ; un registre vide refuse TOUT outil.
//      Déterministe : même (registre, nom) ⇒ même verdict.
//   L7 le manifest émis est VALIDE (stackmanifest.Validate) une fois greffé sur un server —
//      DP23 ne fabrique aucune topologie illégale (ports uniques, profile connectors).
//   L8 le mur : aucun fragment d'infra connecteur n'écrit la vérité (WritesTruth==false) ;
//      les MCP de l'app émise sont DISTINCTS de ceux d'AIDOS (aucun GRANT de vérité).

import (
	"bytes"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/connectorinfra"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
	"pgregory.net/rapid"
)

func genProjectID(rt *rapid.T, label string) string {
	return rapid.StringMatching(`[a-z][a-z0-9-]{0,15}`).Draw(rt, label)
}

func genEnv(rt *rapid.T, label string) scope.Environment {
	envs := scope.Environments()
	return envs[rapid.IntRange(0, len(envs)-1).Draw(rt, label)]
}

func canonOf(t *rapid.T, f connectorinfra.ServiceFragment) []byte {
	t.Helper()
	b, err := connectorinfra.CanonicalFragment(f)
	if err != nil {
		t.Fatalf("CanonicalFragment: %v", err)
	}
	return b
}

// TestL1ByteIdentique — same (projectID, env) ⇒ byte-identical fragments, ×100.
func TestL1ByteIdentique(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")

		a, errA := connectorinfra.SubstrateConnectorInfraFragments(pid, env)
		b, errB := connectorinfra.SubstrateConnectorInfraFragments(pid, env)
		if errA != nil || errB != nil {
			t.Fatalf("legal (%q,%q) must not error: %v / %v", pid, env, errA, errB)
		}
		if len(a) != len(b) {
			t.Fatalf("non-deterministic count: %d vs %d", len(a), len(b))
		}
		for i := range a {
			if !bytes.Equal(canonOf(rt, a[i]), canonOf(rt, b[i])) {
				t.Fatalf("fragment %d (%q) not byte-identical across calls", i, a[i].Key)
			}
		}
	})
}

// TestL2PaletteClose — EXACTLY four fragments, the closed connector-infra palette, each
// fully populated (image + port + healthcheck + bind volume + profile connectors).
func TestL2PaletteClose(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")
		frags, err := connectorinfra.SubstrateConnectorInfraFragments(pid, env)
		if err != nil {
			t.Fatalf("legal env must not error: %v", err)
		}
		if len(frags) != 4 {
			t.Fatalf("connector-infra palette = %d, want 4", len(frags))
		}
		wantKeys := map[string]bool{
			"mcp-gateway":        true,
			"connector-registry": true,
			"tool-registry":      true,
			"webhook-gateway":    true,
		}
		seen := map[string]bool{}
		for _, f := range frags {
			if !wantKeys[f.Key] {
				t.Fatalf("unknown connector-infra fragment key %q (palette must be closed)", f.Key)
			}
			seen[f.Key] = true
			if f.Service.Profile != stackmanifest.ProfileConnectors {
				t.Fatalf("%q: profile %q, want connectors", f.Key, f.Service.Profile)
			}
			if f.Service.InternalPort == 0 || f.Service.Healthcheck == "" {
				t.Fatalf("%q: must carry port+healthcheck", f.Key)
			}
			if len(f.Volumes) == 0 {
				t.Fatalf("%q: a stateful infra service must carry a bind volume", f.Key)
			}
			if f.WritesTruth() {
				t.Fatalf("%q: an emitted infra fragment must never write AIDOS truth (the wall §2)", f.Key)
			}
		}
		if len(seen) != 4 {
			t.Fatalf("the four keys must all appear once; got %v", seen)
		}
	})
}

// TestL3NoEnvGate — no connector-infra fragment is env-gated; only an out-of-set
// environment fails closed with UNKNOWN_ENVIRONMENT (never guessed).
func TestL3NoEnvGate(t *testing.T) {
	for _, env := range scope.Environments() {
		frags, err := connectorinfra.SubstrateConnectorInfraFragments("proj", env)
		if err != nil {
			t.Fatalf("env %q must not error (no infra fragment is env-gated): %v", env, err)
		}
		if len(frags) != 4 {
			t.Fatalf("env %q: want 4 fragments, got %d", env, len(frags))
		}
	}
	_, err := connectorinfra.SubstrateConnectorInfraFragments("proj", scope.Environment("mars"))
	if err == nil {
		t.Fatal("an unknown environment must fail closed (UNKNOWN_ENVIRONMENT)")
	}
	var ref *envbindings.Refusal
	if !envbindings.AsRefusal(err, &ref) || ref.Code != envbindings.CodeUnknownEnvironment {
		t.Fatalf("want UNKNOWN_ENVIRONMENT refusal, got %v", err)
	}
}

// TestL4Isolation — distinct projects ⇒ distinct project_id + distinct volume names; A
// never reuses B's bytes.
func TestL4Isolation(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		a := genProjectID(rt, "a")
		b := genProjectID(rt, "b")
		if a == b {
			return // distinctness is the premise; rapid will draw distinct pairs
		}
		env := genEnv(rt, "env")
		fa, err := connectorinfra.SubstrateConnectorInfraFragments(a, env)
		if err != nil {
			t.Fatalf("project a: %v", err)
		}
		fb, err := connectorinfra.SubstrateConnectorInfraFragments(b, env)
		if err != nil {
			t.Fatalf("project b: %v", err)
		}
		for i := range fa {
			if fa[i].ProjectID == fb[i].ProjectID {
				t.Fatalf("fragment %q: project_id must differ across projects", fa[i].Key)
			}
			if len(fa[i].Volumes) == 0 || len(fb[i].Volumes) == 0 {
				t.Fatalf("fragment %q: a volume is required for isolation", fa[i].Key)
			}
			if fa[i].Volumes[0].Name == fb[i].Volumes[0].Name {
				t.Fatalf("fragment %q: volume name must be isolated across projects", fa[i].Key)
			}
		}
	})
}

// TestL5SharedToken — the isolation token is the DP15 datafragments.IsolationToken (a
// shared seed, never a forked scheme): the volume name carries that exact token.
func TestL5SharedToken(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		token := datafragments.IsolationToken(pid)
		frags, err := connectorinfra.SubstrateConnectorInfraFragments(pid, scope.EnvProd)
		if err != nil {
			t.Fatalf("prod: %v", err)
		}
		for _, f := range frags {
			if len(f.Volumes) == 0 {
				t.Fatalf("%q: missing volume", f.Key)
			}
			want := f.Key + "-" + token
			if f.Volumes[0].Name != want {
				t.Fatalf("%q: volume name %q, want %q (DP15 token)", f.Key, f.Volumes[0].Name, want)
			}
		}
	})
}

// TestL6RouteToolIsPureSetMembership — RouteTool is a pure, fail-closed set-membership:
// a registered tool routes (Admitted), an unregistered one is refused
// TOOL_NOT_REGISTERED, an empty registry refuses every tool. Zero LLM, deterministic.
func TestL6RouteToolIsPureSetMembership(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		// Draw a registry of tool names and a probe.
		names := rapid.SliceOfNDistinct(
			rapid.StringMatching(`[a-z][a-z0-9_.]{0,20}`),
			0, 8,
			func(s string) string { return s },
		).Draw(rt, "names")
		registry := connectorinfra.NewToolRegistry("proj", names)
		probe := rapid.StringMatching(`[a-z][a-z0-9_.]{0,20}`).Draw(rt, "probe")

		dec, br := connectorinfra.RouteTool(registry, probe)

		registered := false
		for _, n := range names {
			if n == probe {
				registered = true
				break
			}
		}

		if registered {
			if !dec.Admitted {
				t.Fatalf("registered tool %q must route (Admitted)", probe)
			}
			if br != nil {
				t.Fatalf("registered tool %q must carry no BlockReason", probe)
			}
		} else {
			if dec.Admitted {
				t.Fatalf("unregistered tool %q must be refused (fail-closed)", probe)
			}
			if br == nil || br.Code != blockreason.CodeToolNotRegistered {
				t.Fatalf("unregistered tool %q must refuse TOOL_NOT_REGISTERED; got %+v", probe, br)
			}
		}

		// Determinism: same input ⇒ same verdict.
		dec2, _ := connectorinfra.RouteTool(registry, probe)
		if dec2.Admitted != dec.Admitted {
			t.Fatalf("RouteTool non-deterministic for %q", probe)
		}
	})
}

// TestL6EmptyRegistryRefusesEverything — an empty Tool-Registry refuses EVERY tool
// (fail-closed: nothing is exposed until it is registered).
func TestL6EmptyRegistryRefusesEverything(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		empty := connectorinfra.NewToolRegistry("proj", nil)
		probe := rapid.StringMatching(`[a-z][a-z0-9_.]{0,20}`).Draw(rt, "probe")
		dec, br := connectorinfra.RouteTool(empty, probe)
		if dec.Admitted {
			t.Fatalf("empty registry must refuse %q (fail-closed)", probe)
		}
		if br == nil || br.Code != blockreason.CodeToolNotRegistered {
			t.Fatalf("empty registry must refuse TOOL_NOT_REGISTERED; got %+v", br)
		}
	})
}

// TestL7ManifestRemainsValid — grafting the four infra fragments onto a minimal server
// manifest yields a VALID StackManifest (unique ports, known roles/profiles).
func TestL7ManifestRemainsValid(t *testing.T) {
	frags, err := connectorinfra.SubstrateConnectorInfraFragments("proj", scope.EnvProd)
	if err != nil {
		t.Fatalf("prod: %v", err)
	}
	services := []stackmanifest.Service{
		{Name: "app", Role: stackmanifest.RoleServer, InternalPort: 3000, Profile: stackmanifest.ProfileCore},
	}
	var volumes []stackmanifest.Volume
	for _, f := range frags {
		services = append(services, f.Service)
		volumes = append(volumes, f.Volumes...)
	}
	m := stackmanifest.StackManifest{
		AppName:  "proj",
		Services: services,
		Volumes:  volumes,
		Network:  stackmanifest.Network{Name: "traefik_default", External: true},
	}
	if err := stackmanifest.Validate(m); err != nil {
		t.Fatalf("the grafted manifest must be valid: %v", err)
	}
}
