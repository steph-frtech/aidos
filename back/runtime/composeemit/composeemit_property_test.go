// composeemit_property_test.go — the DP03 BDD mirror (property ∀ N1, rapid),
// WRITTEN FIRST and red ("no non-test Go files in back/runtime/composeemit"),
// then green. The laws it pins (ROADMAP-provisioning-deploy §DP03):
//
//  1. REPRODUCIBILITY — Emit(m, TargetDockerCompose) is a PURE function of
//     Canonicalize(manifest): the same manifest yields a byte-identical
//     docker-compose.yml N times (×100 on the pinned Example, ×2 under ∀).
//  2. SERVER ROUTER — a role=server service emits the Traefik HTTPS router
//     (websecure + tls + certresolver) AND the HTTP→HTTPS redirect middleware.
//  3. VOLUME BIND — every declared volume emits the /data/dockers named bind
//     (driver_opts type:none, device ${<DEVICE_VAR>}, o:bind) — env-var
//     reference, never a hardcoded path.
//  4. NETWORK — traefik_default is `external: true` … except the deployment
//     that OWNS it (manifest.network.external == false ⇒ no external line).
//  5. NO PUBLISHED PORTS — reverse-proxied services publish NO ports (the
//     `ports:` compose key never appears); exposure is Traefik labels only.
//  6. REFUSAL — an invalid manifest (the closed DP02 validation codes) yields
//     a BlockReason, never a guessed compose.
//  7. DRIFT — a hand-edited emitted file is detected: one flipped byte makes
//     Drifted(output_hash, bytes) true (the gen/ protection, CLAUDE.md §9).
//  8. CONTENT ADDRESS — artifact.SourceHash == stackmanifest.HashManifest(m)
//     (S02 reused, never forked); OutputHash == records.Hash(bytes); the
//     protected header carries the marker + source hash; the path lands
//     below the line (back/gen/<app>/docker-compose.yml).
//
// THE WALL: the emitter only READS the manifest AST and returns bytes — it
// writes no truth (no DB in this package at all).
package composeemit

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"pgregory.net/rapid"
)

// genValidManifest draws a VALID StackManifest: app name non-empty, 1..5
// uniquely-named services with unique internal ports, roles/profiles inside
// their closed sets, service[0] forced role=server (STACK_HAS_NO_SERVER never
// trips here), volumes with env-var device references, the external
// reverse-proxy network.
func genValidManifest(t *rapid.T) stackmanifest.StackManifest {
	app := rapid.StringMatching(`[a-z][a-z0-9-]{0,14}`).Draw(t, "app")
	n := rapid.IntRange(1, 5).Draw(t, "n_services")
	names := map[string]bool{}
	ports := map[int]bool{}
	roles := stackmanifest.Roles()
	profiles := stackmanifest.Profiles()
	services := make([]stackmanifest.Service, 0, n)
	for i := 0; i < n; i++ {
		name := rapid.StringMatching(`[a-z][a-z0-9]{0,9}`).
			Filter(func(s string) bool { return !names[s] }).
			Draw(t, fmt.Sprintf("svc_name_%d", i))
		names[name] = true
		port := rapid.IntRange(1024, 65535).
			Filter(func(p int) bool { return !ports[p] }).
			Draw(t, fmt.Sprintf("svc_port_%d", i))
		ports[port] = true
		role := roles[rapid.IntRange(0, len(roles)-1).Draw(t, fmt.Sprintf("svc_role_%d", i))]
		if i == 0 {
			role = stackmanifest.RoleServer
		}
		svc := stackmanifest.Service{
			Name:         name,
			Role:         role,
			Image:        rapid.SampledFrom([]string{"", "node:22-alpine", "postgres:17-alpine", "valkey:8-alpine"}).Draw(t, fmt.Sprintf("svc_image_%d", i)),
			InternalPort: port,
			Profile:      profiles[rapid.IntRange(0, len(profiles)-1).Draw(t, fmt.Sprintf("svc_profile_%d", i))],
			Healthcheck:  rapid.SampledFrom([]string{"", "wget -q --spider http://localhost/health", "pg_isready -U app"}).Draw(t, fmt.Sprintf("svc_hc_%d", i)),
		}
		services = append(services, svc)
	}
	nVol := rapid.IntRange(0, 2).Draw(t, "n_volumes")
	volNames := map[string]bool{}
	volumes := make([]stackmanifest.Volume, 0, nVol)
	for i := 0; i < nVol; i++ {
		vn := rapid.StringMatching(`[a-z][a-z0-9_]{0,9}`).
			Filter(func(s string) bool { return !volNames[s] }).
			Draw(t, fmt.Sprintf("vol_name_%d", i))
		volNames[vn] = true
		volumes = append(volumes, stackmanifest.Volume{
			Name:      vn,
			DeviceVar: rapid.StringMatching(`[A-Z][A-Z_]{0,14}`).Draw(t, fmt.Sprintf("vol_var_%d", i)),
		})
	}
	return stackmanifest.StackManifest{
		AppName:  app,
		Services: services,
		Volumes:  volumes,
		Network: stackmanifest.Network{
			Name:     "traefik_default",
			External: rapid.Bool().Draw(t, "net_external"),
		},
	}
}

// Law 1a — ∀ valid manifest: Emit is byte-identical across runs (purity: no
// clock, no RNG, no map-order leak).
func TestProperty_EmitIsByteIdenticalForAllValidManifests(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		a1, br1 := Emit(m)
		a2, br2 := Emit(m)
		if br1 != nil || br2 != nil {
			t.Fatalf("valid manifest refused: %v %v", br1, br2)
		}
		if !bytes.Equal(a1.Bytes, a2.Bytes) {
			t.Fatalf("emission is not byte-identical")
		}
		if a1.OutputHash != a2.OutputHash {
			t.Fatalf("output hashes diverge: %s vs %s", a1.OutputHash, a2.OutputHash)
		}
	})
}

// Law 1b — the pinned Example manifest emits byte-identically 100 times out
// of 100 (the DP03 reproducibility mirror: 100 %, not 99 %).
func TestExample_EmitIsByteIdentical100Times(t *testing.T) {
	ref, br := Emit(stackmanifest.Example())
	if br != nil {
		t.Fatalf("Example refused: %+v", br)
	}
	for i := 0; i < 100; i++ {
		a, br := Emit(stackmanifest.Example())
		if br != nil {
			t.Fatalf("run %d refused: %+v", i, br)
		}
		if !bytes.Equal(a.Bytes, ref.Bytes) || a.OutputHash != ref.OutputHash {
			t.Fatalf("run %d diverged from the reference emission", i)
		}
	}
}

// Law 2 — ∀ manifest: every role=server service emits the Traefik HTTPS
// router (websecure entrypoint, tls, certresolver) and the HTTP→HTTPS
// redirect middleware; the primary router is named ${APP_NAME}.
func TestProperty_ServerEmitsHTTPSRouterAndRedirect(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		a, br := Emit(m)
		if br != nil {
			t.Fatalf("valid manifest refused: %+v", br)
		}
		out := string(a.Bytes)
		for _, want := range []string{
			"traefik.http.routers.${APP_NAME}.entrypoints=websecure",
			"traefik.http.routers.${APP_NAME}.tls=true",
			"traefik.http.routers.${APP_NAME}.tls.certresolver=${CERT_RESOLVER_NAME}",
			"traefik.http.routers.${APP_NAME}-http.entrypoints=web",
			"traefik.http.middlewares.${APP_NAME}-https-redirect.redirectscheme.scheme=https",
		} {
			if !strings.Contains(out, want) {
				t.Fatalf("server labels missing %q in:\n%s", want, out)
			}
		}
	})
}

// Law 3 — ∀ manifest: every declared volume emits the /data/dockers named
// bind: driver_opts {type: none, device: ${<DEVICE_VAR>}, o: bind}.
func TestProperty_VolumeEmitsEnvVarBind(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		a, br := Emit(m)
		if br != nil {
			t.Fatalf("valid manifest refused: %+v", br)
		}
		out := string(a.Bytes)
		for _, v := range m.Volumes {
			if !strings.Contains(out, "device: ${"+v.DeviceVar+"}") {
				t.Fatalf("volume %q: bind device ${%s} missing in:\n%s", v.Name, v.DeviceVar, out)
			}
		}
		if len(m.Volumes) > 0 {
			if !strings.Contains(out, "type: none") || !strings.Contains(out, "o: bind") {
				t.Fatalf("named-bind driver_opts missing")
			}
		}
	})
}

// Law 4 — ∀ manifest: the reverse-proxy network is external:true — EXCEPT
// the deployment that OWNS it (network.external == false), which declares it
// without the external flag.
func TestProperty_NetworkExternalUnlessOwned(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		a, br := Emit(m)
		if br != nil {
			t.Fatalf("valid manifest refused: %+v", br)
		}
		out := string(a.Bytes)
		hasExternal := strings.Contains(out, "external: true")
		if m.Network.External && !hasExternal {
			t.Fatalf("external network not emitted external: true")
		}
		if !m.Network.External && hasExternal {
			t.Fatalf("the owning deployment must NOT mark the network external")
		}
		if !strings.Contains(out, "name: ${TRAEFIK_NETWORK_NAME}") {
			t.Fatalf("network name must be the env-var reference, never hardcoded")
		}
	})
}

// Law 5 — ∀ manifest: no service publishes ports (reverse-proxied via
// traefik_default only — the /data/dockers convention).
func TestProperty_NoPublishedPorts(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		a, br := Emit(m)
		if br != nil {
			t.Fatalf("valid manifest refused: %+v", br)
		}
		for _, line := range strings.Split(string(a.Bytes), "\n") {
			if strings.TrimSpace(line) == "ports:" {
				t.Fatalf("a published-ports key leaked into the compose")
			}
		}
	})
}

// Law 6 — ∀ broken manifest: the emitter refuses with a BlockReason (the
// DP02 closed validation codes), never a guessed compose.
func TestProperty_InvalidManifestIsRefused(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		switch rapid.IntRange(0, 2).Draw(t, "break_kind") {
		case 0: // UNKNOWN_SERVICE_ROLE
			m.Services[0].Role = stackmanifest.Role("teleporter")
			m.Services = append(m.Services, stackmanifest.Service{
				Name: "zzserver", Role: stackmanifest.RoleServer,
				InternalPort: 70000, Profile: stackmanifest.ProfileCore,
			})
		case 1: // DUPLICATE_INTERNAL_PORT
			m.Services = append(m.Services, stackmanifest.Service{
				Name: "zzdup", Role: stackmanifest.RoleCache,
				InternalPort: m.Services[0].InternalPort,
				Profile:      stackmanifest.ProfileCore,
			})
		case 2: // STACK_HAS_NO_SERVER
			for i := range m.Services {
				m.Services[i].Role = stackmanifest.RoleCache
			}
		}
		a, br := Emit(m)
		if br == nil {
			t.Fatalf("broken manifest was emitted anyway")
		}
		if len(a.Bytes) != 0 {
			t.Fatalf("a refused emission must carry no bytes")
		}
		if br.Explanation == "" || len(br.HowToFix) == 0 {
			t.Fatalf("BlockReason must be actionable (explanation + how_to_fix)")
		}
	})
}

// Law 7 — ∀ manifest: the emitted bytes match their output_hash; ONE flipped
// byte is detected as drift (a hand-edited gen/ file is rejected).
func TestProperty_HandEditIsDetectedAsDrift(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		a, br := Emit(m)
		if br != nil {
			t.Fatalf("valid manifest refused: %+v", br)
		}
		if Drifted(a.OutputHash, a.Bytes) {
			t.Fatalf("pristine emission flagged as drifted")
		}
		idx := rapid.IntRange(0, len(a.Bytes)-1).Draw(t, "flip_at")
		mutated := append([]byte(nil), a.Bytes...)
		mutated[idx] ^= 0x01
		if !Drifted(a.OutputHash, mutated) {
			t.Fatalf("hand-edit (one flipped byte) not detected as drift")
		}
	})
}

// Law 8 — ∀ manifest: the artifact is double content-addressed — SourceHash
// IS stackmanifest.HashManifest(m) (S02 reused, never forked), OutputHash IS
// records.Hash(bytes); the protected header carries the marker + source hash;
// the projection lands below the line under back/gen/<app>/; the target is
// the additive TargetDockerCompose of the closed set.
func TestProperty_ArtifactIsContentAddressedAndProtected(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		a, br := Emit(m)
		if br != nil {
			t.Fatalf("valid manifest refused: %+v", br)
		}
		wantSource, err := stackmanifest.HashManifest(m)
		if err != nil {
			t.Fatalf("HashManifest: %v", err)
		}
		if a.SourceHash != wantSource {
			t.Fatalf("source_hash %s != stackmanifest.HashManifest %s", a.SourceHash, wantSource)
		}
		if a.OutputHash != records.Hash(a.Bytes) {
			t.Fatalf("output_hash is not records.Hash(bytes)")
		}
		wantHeader := "# CODE GENERATED BY AIDOS — DO NOT EDIT. source: " + wantSource + "\n"
		if !strings.HasPrefix(string(a.Bytes), wantHeader) {
			t.Fatalf("protected header missing/incorrect; got %q", strings.SplitN(string(a.Bytes), "\n", 2)[0])
		}
		if a.Path != "back/gen/"+m.AppName+"/docker-compose.yml" {
			t.Fatalf("projection path %q is not below the line under back/gen/<app>/", a.Path)
		}
		if !a.Protected {
			t.Fatalf("the artifact must be protected (gen/ is never hand-edited)")
		}
		if a.Target != TargetDockerCompose {
			t.Fatalf("target %q is not the additive TargetDockerCompose", a.Target)
		}
		if len(Targets()) == 0 || Targets()[len(Targets())-1] != TargetDockerCompose {
			t.Fatalf("TargetDockerCompose must be registered in the closed targetOrder")
		}
	})
}

// Law 9 — ∀ manifest: the /data/dockers per-service conventions hold —
// container_name ${APP_NAME} (the primary server) / ${APP_NAME}-<svc>
// (the others), env_file .env and restart: unless-stopped on EVERY service.
func TestProperty_DataDockersServiceConventions(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		a, br := Emit(m)
		if br != nil {
			t.Fatalf("valid manifest refused: %+v", br)
		}
		out := string(a.Bytes)
		if !strings.Contains(out, "container_name: ${APP_NAME}\n") {
			t.Fatalf("primary server must be container_name ${APP_NAME}")
		}
		if got := strings.Count(out, "restart: unless-stopped"); got != len(m.Services) {
			t.Fatalf("restart: unless-stopped on %d services, want %d", got, len(m.Services))
		}
		if got := strings.Count(out, "- .env"); got != len(m.Services) {
			t.Fatalf("env_file .env on %d services, want %d", got, len(m.Services))
		}
	})
}
