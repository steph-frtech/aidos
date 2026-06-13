// pulumi_stack_test.go — the GENERALISED per-project×env Pulumi emitter mirror (the GOLD form).
//
// The intention (utilisatrice, 2026-06-13): « du Pulumi qui fait les docker par projet » —
// chaque projet = sa propre full-stack, déployée POUR DE VRAI par Pulumi (@pulumi/docker),
// un stack par projet×env. The hand-proven GOLD is .deploy-pulumi/demoshop-dev/index.ts (a
// real demoshop-dev stack: postgres healthy + whoami, on the EXTERNAL traefik_default net,
// https://demoshop-dev.sagedesk.fr with a real Let's-Encrypt cert). EmitPulumiStack must
// produce EXACTLY that form, plus the Pulumi scaffold (Pulumi.yaml + package.json).
//
// DETERMINISM-FIRST (§2/§6/§8). EmitPulumiStack is a PURE, TOTAL, byte-stable function of
// (project, env, Canonicalize(manifest)) — same input → byte-identical artifacts (the
// reproducibility mirror). The EXECUTOR (pulumi up/destroy) is the gated side-effecting
// gesture, never here. The emitter writes NO truth (a below-the-line projection).
package honoemit

import (
	"strings"
	"testing"

	"pgregory.net/rapid"
)

// goldManifest is the GOLD topology (the demoshop-dev proof): a whoami server + a postgres
// datastore, a pgdata volume on the datastore, on the EXTERNAL traefik_default network.
func goldManifest() StackManifest {
	return StackManifest{
		App: "demoshop",
		Services: []Service{
			{Name: "app", Role: RoleServer, Image: "traefik/whoami:latest", InternalPort: 80},
			{Name: "db", Role: RoleDatastore, Image: "postgres:16-alpine", InternalPort: 5432},
		},
		Volumes: []Volume{{Name: "pgdata", Path: "/var/lib/postgresql/data"}},
		Network: Network{Name: "traefik_default", External: true},
	}
}

// TestStack_ByteIdentical — same (project, env, manifest) → byte-identical artifacts (program
// + scaffold), twice and under service-order permutation. The reproducibility mirror.
func TestStack_ByteIdentical(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genManifest(t)
		project := rapid.StringMatching(`[a-z][a-z0-9]{0,7}`).Draw(t, "project")
		env := rapid.SampledFrom([]string{"dev", "staging", "prod"}).Draw(t, "env")

		a1, br := EmitPulumiStack(project, env, m)
		if br != nil {
			t.Fatalf("EmitPulumiStack refused a projectable manifest: %s", br.Explanation)
		}
		// permute service order — the emitter is invariant (canonical name order owns bytes).
		m2 := m
		if len(m.Services) >= 2 {
			sv := append([]Service(nil), m.Services...)
			sv[0], sv[len(sv)-1] = sv[len(sv)-1], sv[0]
			m2 = StackManifest{App: m.App, Services: sv, Volumes: m.Volumes, Network: m.Network}
		}
		a2, br := EmitPulumiStack(project, env, m2)
		if br != nil {
			t.Fatalf("EmitPulumiStack refused the permuted manifest: %s", br.Explanation)
		}
		if len(a1) != len(a2) {
			t.Fatalf("artifact COUNT diverged: %d vs %d", len(a1), len(a2))
		}
		for i := range a1 {
			if a1[i].Path != a2[i].Path {
				t.Fatalf("artifact %d path diverged: %q vs %q", i, a1[i].Path, a2[i].Path)
			}
			if string(a1[i].Bytes) != string(a2[i].Bytes) {
				t.Fatalf("artifact %q not byte-identical under service-order permutation", a1[i].Path)
			}
			if a1[i].OutputHash != a2[i].OutputHash || a1[i].SourceHash != a2[i].SourceHash {
				t.Fatalf("artifact %q hashes diverged", a1[i].Path)
			}
		}
	})
}

// TestStack_GoldForm — the emitted program carries EXACTLY the gold-proven mechanism the
// hand-written demoshop-dev/index.ts has, generalised to (project, env).
func TestStack_GoldForm(t *testing.T) {
	arts, br := EmitPulumiStack("demoshop", "dev", goldManifest())
	if br != nil {
		t.Fatalf("EmitPulumiStack refused the gold manifest: %s", br.Explanation)
	}
	prog := artByPath(t, arts, "gen/demoshop/infra/index.ts")
	s := string(prog.Bytes)

	// (0) The program is callable: an exported program() factory, @pulumi/docker import.
	for _, want := range []string{
		`import * as docker from "@pulumi/docker"`,
		`export function program()`,
	} {
		mustContain(t, s, want, "program shape")
	}

	// (1) the server router carries priority=1000 to SUPERSEDE the *-dev wildcard placeholder.
	mustContain(t, s, `"traefik.http.routers.demoshop-dev.priority"`, "router priority key")
	mustContain(t, s, `value: "1000"`, "priority=1000")

	// (2) Network.External=true ⇒ ATTACH to the external net (networksAdvanced name=traefik_default),
	//     NEVER create it (no new docker.Network).
	mustContain(t, s, `networksAdvanced: [{ name: "traefik_default" }]`, "external network attach")
	if strings.Contains(s, "new docker.Network") {
		t.Fatalf("external network must NOT be created (no new docker.Network):\n%s", s)
	}

	// (3) the COMPLETE Traefik label set on the server: Host rule on <stack>.sagedesk.fr,
	//     websecure, tls, certresolver=le, priority, loadbalancer server port.
	for _, want := range []string{
		`{ label: "traefik.enable", value: "true" }`,
		"traefik.http.routers.demoshop-dev.rule",
		"Host(`demoshop-dev.sagedesk.fr`)",
		`"traefik.http.routers.demoshop-dev.entrypoints", value: "websecure"`,
		`"traefik.http.routers.demoshop-dev.tls", value: "true"`,
		`"traefik.http.routers.demoshop-dev.tls.certresolver", value: "le"`,
		`"traefik.http.services.demoshop-dev.loadbalancer.server.port", value: "80"`,
	} {
		mustContain(t, s, want, "traefik labels")
	}

	// (4) env vars + volume mount + healthcheck.
	//     server: DATABASE_URL pointing the datastore by its container name <stack>-<db>:5432.
	mustContain(t, s, "DATABASE_URL=postgres://", "server DATABASE_URL env")
	mustContain(t, s, "@demoshop-dev-db:5432/", "DATABASE_URL points the datastore container")
	//     datastore: POSTGRES_* envs + pg_isready healthcheck + the volume mount.
	mustContain(t, s, "POSTGRES_DB=", "datastore POSTGRES_DB")
	mustContain(t, s, "POSTGRES_USER=", "datastore POSTGRES_USER")
	mustContain(t, s, "POSTGRES_PASSWORD=", "datastore POSTGRES_PASSWORD")
	mustContain(t, s, "pg_isready", "datastore healthcheck")
	mustContain(t, s, "healthcheck:", "datastore healthcheck block")
	mustContain(t, s, `containerPath: "/var/lib/postgresql/data"`, "volume mount path")
	mustContain(t, s, `new docker.Volume("demoshop-dev-pgdata"`, "per-stack volume")

	// (5) per-project×env naming: containers <project>-<env>-<service>, RemoteImage keepLocally.
	mustContain(t, s, `name: "demoshop-dev-app"`, "server container name")
	mustContain(t, s, `name: "demoshop-dev-db"`, "datastore container name")
	mustContain(t, s, "keepLocally: true", "RemoteImage keepLocally")
	mustContain(t, s, "new docker.RemoteImage", "RemoteImage per image")
}

// TestStack_Scaffold — EmitPulumiStack also emits the Pulumi scaffold so `pulumi up` boots:
// Pulumi.yaml (project name = <stack>, runtime nodejs) + package.json (the @pulumi deps).
// All under gen/<project>/infra/.
func TestStack_Scaffold(t *testing.T) {
	arts, br := EmitPulumiStack("demoshop", "dev", goldManifest())
	if br != nil {
		t.Fatalf("EmitPulumiStack refused: %s", br.Explanation)
	}
	yaml := artByPath(t, arts, "gen/demoshop/infra/Pulumi.yaml")
	ys := string(yaml.Bytes)
	mustContain(t, ys, "name: demoshop-dev", "Pulumi.yaml project name = stack")
	mustContain(t, ys, "runtime: nodejs", "Pulumi.yaml runtime nodejs")

	pkg := artByPath(t, arts, "gen/demoshop/infra/package.json")
	ps := string(pkg.Bytes)
	mustContain(t, ps, `"@pulumi/pulumi"`, "package.json @pulumi/pulumi dep")
	mustContain(t, ps, `"@pulumi/docker"`, "package.json @pulumi/docker dep")

	// the index.ts wires program() (the scaffold entrypoint calls the pure factory).
	idx := artByPath(t, arts, "gen/demoshop/infra/index.ts")
	mustContain(t, string(idx.Bytes), "program()", "index.ts calls program()")
}

// TestStack_FN02Pure — no emitted module carries a MODULE-SCOPE mutable binding (let/var at
// column 0): the FN02 purity mandate (ADR 0036/0040).
func TestStack_FN02Pure(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genManifest(t)
		project := rapid.StringMatching(`[a-z][a-z0-9]{0,7}`).Draw(t, "project")
		env := rapid.SampledFrom([]string{"dev", "prod"}).Draw(t, "env")
		arts, br := EmitPulumiStack(project, env, m)
		if br != nil {
			t.Fatalf("EmitPulumiStack refused: %s", br.Explanation)
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

// TestStack_IsolatedPerProjectEnv — two distinct (project, env) yield NON-overlapping
// container/volume/stack names (the isolation frontier). A name leak across stacks is a bug.
func TestStack_IsolatedPerProjectEnv(t *testing.T) {
	a, _ := EmitPulumiStack("alpha", "dev", goldManifest())
	b, _ := EmitPulumiStack("beta", "prod", goldManifest())
	as := allTSBytes(a)
	bs := allTSBytes(b)
	for _, want := range []string{"alpha-dev-app", "alpha-dev-db", "alpha-dev-pgdata"} {
		mustContain(t, as, want, "alpha names present")
		if strings.Contains(bs, want) {
			t.Fatalf("alpha name %q leaked into beta's program", want)
		}
	}
	for _, want := range []string{"beta-prod-app", "beta-prod-db", "beta-prod-pgdata"} {
		mustContain(t, bs, want, "beta names present")
		if strings.Contains(as, want) {
			t.Fatalf("beta name %q leaked into alpha's program", want)
		}
	}
}

// TestStack_ExternalNotCreated_InternalIsCreated — when External=false the program CREATES
// the network (new docker.Network); when External=true it only ATTACHES (no creation).
func TestStack_ExternalVsInternalNetwork(t *testing.T) {
	ext := goldManifest()
	ext.Network = Network{Name: "traefik_default", External: true}
	a, br := EmitPulumiStack("p", "dev", ext)
	if br != nil {
		t.Fatalf("refused external manifest: %s", br.Explanation)
	}
	if strings.Contains(allTSBytes(a), "new docker.Network") {
		t.Fatalf("external network must not be created")
	}

	internal := goldManifest()
	internal.Network = Network{Name: "p-dev-net", External: false}
	b, br := EmitPulumiStack("p", "dev", internal)
	if br != nil {
		t.Fatalf("refused internal manifest: %s", br.Explanation)
	}
	if !strings.Contains(allTSBytes(b), "new docker.Network") {
		t.Fatalf("a non-external network MUST be created (new docker.Network)")
	}
}

// TestStack_MalformedRefused — the honesty rule holds for the stack emitter too: an empty
// project/env or a malformed manifest is a typed BlockReason, never a partial render.
func TestStack_MalformedRefused(t *testing.T) {
	good := goldManifest()
	cases := []struct {
		project, env string
		m            StackManifest
	}{
		{"", "dev", good},
		{"p", "", good},
		{"p", "dev", StackManifest{App: "p", Services: []Service{{Name: "x", Role: "made-up", Image: "i"}}}},
		{"p", "dev", StackManifest{App: "p", Services: []Service{{Name: "db", Role: RoleDatastore, Image: "postgres"}}}}, // no server
	}
	for i, c := range cases {
		if _, br := EmitPulumiStack(c.project, c.env, c.m); br == nil {
			t.Fatalf("case %d: malformed input was NOT refused", i)
		}
	}
}

// --- test helpers ---

func artByPath(t *testing.T, arts []Artifact, path string) Artifact {
	t.Helper()
	for _, a := range arts {
		if a.Path == path {
			return a
		}
	}
	var got []string
	for _, a := range arts {
		got = append(got, a.Path)
	}
	t.Fatalf("artifact %q not emitted; got %v", path, got)
	return Artifact{}
}

func mustContain(t *testing.T, haystack, needle, what string) {
	t.Helper()
	if !strings.Contains(haystack, needle) {
		t.Fatalf("%s: missing %q\n--- emitted ---\n%s", what, needle, haystack)
	}
}

func allTSBytes(arts []Artifact) string {
	var b strings.Builder
	for _, a := range arts {
		if strings.HasSuffix(a.Path, ".ts") {
			b.Write(a.Bytes)
			b.WriteString("\n")
		}
	}
	return b.String()
}
