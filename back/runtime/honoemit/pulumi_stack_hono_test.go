// pulumi_stack_hono_test.go — le MIROIR du DÉPLOIEMENT 3-CONTENEURS CÂBLÉ (voie Hono/TS PROPRE).
//
// EmitPulumiStackHono(project, env, manifest, opts) déploie le HONO ÉMIS + le SIDECAR Go + postgres,
// câblés (serveur→sidecar via INTERPRETER_URL, sidecar→db via DATABASE_URL). Le miroir prouve :
//   - le CÂBLAGE : le serveur porte INTERPRETER_URL=http://<stack>-<interp>:<port> + les labels Traefik ;
//     le sidecar porte DATABASE_URL + PORT, AUCUN label (interne) ; le datastore porte POSTGRES_* +
//     healthcheck (+ schema mount si DataDir) ;
//   - le GOLD : priority 1000, certresolver le, réseau traefik_default external ;
//   - la reproductibilité (byte-stable sous permutation de services) + FN02-pur ;
//   - l'honnêteté : un manifest sans interpreter / sans datastore / malformé → BlockReason typé.
package honoemit

import (
	"strings"
	"testing"

	"pgregory.net/rapid"
)

// honoManifest is the canonical clean-Hono-path StackManifest: the emitted server + the Go interpreter
// sidecar + postgres, on the external Traefik network — exactly the 3-container wired topology.
func honoManifest() StackManifest {
	return StackManifest{
		App: "shop",
		Services: []Service{
			{Name: "server", Role: RoleServer, Image: "placeholder:server", InternalPort: 3000},
			{Name: "interpreter", Role: RoleInterpreter, Image: "placeholder:interp", InternalPort: 8080},
			{Name: "db", Role: RoleDatastore, Image: "postgres:16-alpine", InternalPort: 5432},
		},
		Volumes: []Volume{{Name: "pgdata", Path: "/var/lib/postgresql/data"}},
		Network: Network{Name: "traefik_default", External: true},
	}
}

// genHonoManifest draws an arbitrary projectable clean-Hono manifest: always a server + an interpreter
// + a datastore (the three wired roles), with distinct names + distinct ports.
func genHonoManifest(t *rapid.T) StackManifest {
	app := rapid.StringMatching(`[a-z][a-z0-9]{0,7}`).Draw(t, "app")
	return StackManifest{
		App: app,
		Services: []Service{
			{Name: "server", Role: RoleServer, Image: "ph:server", InternalPort: 3000},
			{Name: "interp", Role: RoleInterpreter, Image: "ph:interp", InternalPort: 8080},
			{Name: "db", Role: RoleDatastore, Image: "postgres:16", InternalPort: 5432},
		},
		Volumes: []Volume{{Name: "pgdata", Path: "/var/lib/postgresql/data"}},
		Network: Network{Name: "traefik_default", External: true},
	}
}

// TestStackHono_WiresThreeContainers — the wiring frontier: the emitted program carries the three
// CÂBLÉS containers with the per-role envs. The server points the sidecar by container name; the
// sidecar points the DB by container name; postgres carries POSTGRES_* + healthcheck.
func TestStackHono_WiresThreeContainers(t *testing.T) {
	arts, br := EmitPulumiStackHono("shop", "dev", honoManifest(), StackHonoOpts{})
	if br != nil {
		t.Fatalf("EmitPulumiStackHono refused the clean manifest: %s", br.Explanation)
	}
	s := string(artByPath(t, arts, "gen/shop/infra/index.ts").Bytes)

	for _, want := range []string{
		// the three wired containers (by their <stack>-<name> docker names).
		`name: "shop-dev-server"`,
		`name: "shop-dev-interpreter"`,
		`name: "shop-dev-db"`,
		// THE WIRING: the server → the sidecar by container name on its internal port.
		"INTERPRETER_URL=http://shop-dev-interpreter:8080",
		// the sidecar → the DB by container name, plus its own PORT.
		"DATABASE_URL=postgres://app:shop@shop-dev-db:5432/shop?sslmode=disable",
		"PORT=8080",
		// the clean-path images (the emitted Hono server + the Go sidecar) supersede the placeholders.
		"aidos-hono:latest",
		"aidos-interpreter:latest",
		// the GOLD topology: priority 1000, certle, external attach, healthcheck.
		`value: "1000"`,
		`.tls.certresolver", value: "le"`,
		`networksAdvanced: [{ name: "traefik_default" }]`,
		"pg_isready",
	} {
		mustContain(t, s, want, "clean Hono 3-container wiring")
	}
	// the placeholder images NEVER leak into the program (they are rewritten to the clean images).
	if strings.Contains(s, "placeholder:server") || strings.Contains(s, "placeholder:interp") {
		t.Fatalf("a placeholder image leaked into the clean Hono program:\n%s", s)
	}
}

// TestStackHono_ServerHasSubstrateEnv — the substrate-by-default frontier (the user intention « toute
// belle app … utilise le substrat gelé par défaut »): the EMITTED Hono server container carries, in its
// env, the four substrate handles to the SHARED instance services (telemetry/cache/bus), so the app is
// wired to observability + cache + bus out of the box. The %env% is substituted to the stack's env (the
// cache is per-env: valkey-<env>); the collector + bus are the shared instance-level containers reached
// by DNS name on the same external network. Deterministic, byte-stable.
func TestStackHono_ServerHasSubstrateEnv(t *testing.T) {
	arts, br := EmitPulumiStackHono("shop", "staging", honoManifest(), StackHonoOpts{})
	if br != nil {
		t.Fatalf("EmitPulumiStackHono refused: %s", br.Explanation)
	}
	s := string(artByPath(t, arts, "gen/shop/infra/index.ts").Bytes)
	for _, want := range []string{
		// telemetry: the OTLP/HTTP BASE endpoint of the shared collector (Task 1's exporter appends
		// /v1/traces). %env% irrelevant — the collector is instance-level (shared).
		"OTEL_EXPORTER_OTLP_ENDPOINT=http://opentelemetry-collector:4318",
		// telemetry: the OTel service.name defaults to the project namespace.
		"OTEL_SERVICE_NAME=shop",
		// cache: the SHARED Valkey, per-env (valkey-<env> — here staging).
		"REDIS_URL=redis://valkey-staging:6379",
		// bus: the SHARED NATS, instance-level (no %env%).
		"NATS_URL=nats://nats:4222",
	} {
		mustContain(t, s, want, "clean Hono server substrate env")
	}
}

// TestStackHono_CachePerEnv — the cache is the ONLY %env%-substituted substrate handle: dev/staging/prod
// each point at their own valkey-<env>; the collector + bus stay instance-level (no env in the host).
func TestStackHono_CachePerEnv(t *testing.T) {
	for _, env := range []string{"dev", "staging", "prod"} {
		arts, br := EmitPulumiStackHono("shop", env, honoManifest(), StackHonoOpts{})
		if br != nil {
			t.Fatalf("env %q refused: %s", env, br.Explanation)
		}
		s := string(artByPath(t, arts, "gen/shop/infra/index.ts").Bytes)
		mustContain(t, s, "REDIS_URL=redis://valkey-"+env+":6379", "per-env cache handle")
		// the bus + collector never carry the env (they are shared instance-level services).
		if strings.Contains(s, "nats-"+env) || strings.Contains(s, "opentelemetry-collector-"+env) {
			t.Fatalf("env %q: a shared substrate service was wrongly per-env'd:\n%s", env, s)
		}
	}
}

// TestStackHono_SidecarHasNoTraefikLabels — the sidecar is INTERNAL: only the server bears Traefik
// labels. The interpreter container must carry envs but NO `traefik.enable` route (never public).
func TestStackHono_SidecarHasNoTraefikLabels(t *testing.T) {
	arts, br := EmitPulumiStackHono("shop", "dev", honoManifest(), StackHonoOpts{})
	if br != nil {
		t.Fatalf("EmitPulumiStackHono refused: %s", br.Explanation)
	}
	s := string(artByPath(t, arts, "gen/shop/infra/index.ts").Bytes)
	// Exactly ONE traefik.enable (the server's). The interpreter never gets one.
	if n := strings.Count(s, "traefik.enable"); n != 1 {
		t.Fatalf("expected exactly one traefik.enable (the server); got %d\n%s", n, s)
	}
	// The router rule names the stack (the server), never the interpreter.
	if strings.Contains(s, "routers.shop-dev-interpreter") {
		t.Fatalf("the interpreter got a Traefik router (it must be internal):\n%s", s)
	}
}

// TestStackHono_ByteStable — same (project, env, manifest, opts) → byte-identical artifacts under
// service-order permutation. The reproducibility mirror for the clean Hono projection.
func TestStackHono_ByteStable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genHonoManifest(t)
		project := rapid.StringMatching(`[a-z][a-z0-9]{0,7}`).Draw(t, "project")
		env := rapid.SampledFrom([]string{"dev", "staging", "prod"}).Draw(t, "env")

		a1, br := EmitPulumiStackHono(project, env, m, StackHonoOpts{})
		if br != nil {
			t.Fatalf("EmitPulumiStackHono refused a projectable manifest: %s", br.Explanation)
		}
		// permute service order — the emitter is invariant (canonical name order owns bytes).
		sv := append([]Service(nil), m.Services...)
		sv[0], sv[len(sv)-1] = sv[len(sv)-1], sv[0]
		m2 := StackManifest{App: m.App, Services: sv, Volumes: m.Volumes, Network: m.Network}
		a2, _ := EmitPulumiStackHono(project, env, m2, StackHonoOpts{})
		if len(a1) != len(a2) {
			t.Fatalf("artifact count diverged: %d vs %d", len(a1), len(a2))
		}
		for i := range a1 {
			if a1[i].Path != a2[i].Path || string(a1[i].Bytes) != string(a2[i].Bytes) {
				t.Fatalf("artifact %q not byte-identical under permutation", a1[i].Path)
			}
		}
	})
}

// TestStackHono_FN02Pure — the program carries no module-scope mutable binding (FN02).
func TestStackHono_FN02Pure(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genHonoManifest(t)
		arts, br := EmitPulumiStackHono("shop", "dev", m, StackHonoOpts{DataDir: ".", SeedPresent: true})
		if br != nil {
			t.Fatalf("EmitPulumiStackHono refused: %s", br.Explanation)
		}
		for _, art := range arts {
			if !strings.HasSuffix(art.Path, ".ts") {
				continue
			}
			for _, line := range strings.Split(string(art.Bytes), "\n") {
				if strings.HasPrefix(line, "let ") || strings.HasPrefix(line, "var ") {
					t.Fatalf("module-scope mutable binding in %s: %q", art.Path, line)
				}
			}
		}
	})
}

// TestStackHono_DataMounts — with DataDir the datastore mounts the emitted schema (01) + seed (02) into
// the initdb dir (the GOLD form); without it, no schema mount (the DB boots empty).
func TestStackHono_DataMounts(t *testing.T) {
	with, br := EmitPulumiStackHono("shop", "dev", honoManifest(), StackHonoOpts{DataDir: ".", SeedPresent: true})
	if br != nil {
		t.Fatalf("EmitPulumiStackHono(data) refused: %s", br.Explanation)
	}
	s := string(artByPath(t, with, "gen/shop/infra/index.ts").Bytes)
	for _, want := range []string{
		"const here = process.cwd();",
		"${here}/schema.sql", "/docker-entrypoint-initdb.d/01-schema.sql",
		"${here}/seed.sql", "/docker-entrypoint-initdb.d/02-seed.sql",
	} {
		mustContain(t, s, want, "clean Hono data mount")
	}

	without, _ := EmitPulumiStackHono("shop", "dev", honoManifest(), StackHonoOpts{})
	s2 := string(artByPath(t, without, "gen/shop/infra/index.ts").Bytes)
	if strings.Contains(s2, "schema.sql") || strings.Contains(s2, "process.cwd()") {
		t.Fatalf("a schema mount appeared with no DataDir:\n%s", s2)
	}
}

// TestStackHono_ImageOverride — the opts override the per-role images (a per-project retag), and the
// override flows into both the RemoteImage and the server's INTERPRETER_URL stays intact.
func TestStackHono_ImageOverride(t *testing.T) {
	opts := StackHonoOpts{HonoImage: "reg/shop-hono:v2", InterpreterImage: "reg/shop-interp:v2"}
	arts, br := EmitPulumiStackHono("shop", "dev", honoManifest(), opts)
	if br != nil {
		t.Fatalf("EmitPulumiStackHono refused: %s", br.Explanation)
	}
	s := string(artByPath(t, arts, "gen/shop/infra/index.ts").Bytes)
	mustContain(t, s, "reg/shop-hono:v2", "Hono image override")
	mustContain(t, s, "reg/shop-interp:v2", "interpreter image override")
	if strings.Contains(s, "aidos-hono:latest") || strings.Contains(s, "aidos-interpreter:latest") {
		t.Fatalf("the default images leaked though overrides were set:\n%s", s)
	}
}

// TestStackHono_MalformedRefused — the honesty rule: an empty project/env, a manifest with no
// interpreter, or no datastore is a typed BlockReason, never a partial render (never silently fall
// back to the generic path).
func TestStackHono_MalformedRefused(t *testing.T) {
	good := honoManifest()
	noInterp := StackManifest{
		App: "shop",
		Services: []Service{
			{Name: "server", Role: RoleServer, Image: "i", InternalPort: 3000},
			{Name: "db", Role: RoleDatastore, Image: "postgres", InternalPort: 5432},
		},
		Network: Network{Name: "traefik_default", External: true},
	}
	noDB := StackManifest{
		App: "shop",
		Services: []Service{
			{Name: "server", Role: RoleServer, Image: "i", InternalPort: 3000},
			{Name: "interp", Role: RoleInterpreter, Image: "i", InternalPort: 8080},
		},
		Network: Network{Name: "traefik_default", External: true},
	}
	cases := []struct {
		project, env string
		m            StackManifest
	}{
		{"", "dev", good},
		{"p", "", good},
		{"p", "dev", noInterp},
		{"p", "dev", noDB},
	}
	for i, c := range cases {
		if _, br := EmitPulumiStackHono(c.project, c.env, c.m, StackHonoOpts{}); br == nil {
			t.Fatalf("case %d: malformed input was NOT refused", i)
		}
	}
}
