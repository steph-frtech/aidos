package honoemit

// pulumi_stack_app_test.go — le MIROIR de l'émission PAR PROJET, OPT-IN (déterminisme + anti-overwrite).
//
// EmitPulumiStackApp(project, env, manifest, opts) :
//   - opts ZÉRO ⇒ BYTE-IDENTIQUE à EmitPulumiStack (anti-overwrite §9 — les montages sont opt-in,
//     la sortie sans-données ne bouge pas, les tests honoemit existants restent verts) ;
//   - opts.DataDir set ⇒ EN PLUS de la topologie GOLD, les MONTAGES de données (schema/seed sur le
//     datastore, entities.json sur le serveur) + APP_NAME + image aidos-app:latest ;
//   - PURE, byte-stable de (project, env, Canonicalize(manifest), opts).

import (
	"strings"
	"testing"

	"pgregory.net/rapid"
)

// dataOpts is a representative non-zero opts (data dir + seed present + an app name).
func dataOpts() StackAppOpts {
	return StackAppOpts{DataDir: ".", AppName: "Demoshop", SeedPresent: true}
}

// TestStackApp_NoOpts_ByteIdenticalToStack — the anti-overwrite frontier: WITHOUT data opts,
// EmitPulumiStackApp is BYTE-IDENTICAL to EmitPulumiStack (path, bytes, both hashes). The opt-in
// data mounts NEVER perturb the proven no-data projection.
func TestStackApp_NoOpts_ByteIdenticalToStack(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genManifest(t)
		project := rapid.StringMatching(`[a-z][a-z0-9]{0,7}`).Draw(t, "project")
		env := rapid.SampledFrom([]string{"dev", "staging", "prod"}).Draw(t, "env")

		base, br := EmitPulumiStack(project, env, m)
		if br != nil {
			t.Fatalf("EmitPulumiStack refused a projectable manifest: %s", br.Explanation)
		}
		app, br := EmitPulumiStackApp(project, env, m, StackAppOpts{}) // ZERO opts
		if br != nil {
			t.Fatalf("EmitPulumiStackApp(zero) refused: %s", br.Explanation)
		}
		if len(base) != len(app) {
			t.Fatalf("artifact count diverged: %d vs %d", len(base), len(app))
		}
		for i := range base {
			if base[i].Path != app[i].Path {
				t.Fatalf("artifact %d path diverged: %q vs %q", i, base[i].Path, app[i].Path)
			}
			if string(base[i].Bytes) != string(app[i].Bytes) {
				t.Fatalf("artifact %q NOT byte-identical with zero opts (anti-overwrite breach)", base[i].Path)
			}
			if base[i].OutputHash != app[i].OutputHash || base[i].SourceHash != app[i].SourceHash {
				t.Fatalf("artifact %q hashes diverged with zero opts", base[i].Path)
			}
		}
	})
}

// TestStackApp_ByteStable — same (project, env, manifest, opts) → byte-identical artifacts, twice
// and under service-order permutation. The reproducibility mirror for the data-aware projection.
func TestStackApp_ByteStable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genManifest(t)
		project := rapid.StringMatching(`[a-z][a-z0-9]{0,7}`).Draw(t, "project")
		env := rapid.SampledFrom([]string{"dev", "prod"}).Draw(t, "env")
		opts := dataOpts()

		a1, br := EmitPulumiStackApp(project, env, m, opts)
		if br != nil {
			t.Fatalf("EmitPulumiStackApp refused: %s", br.Explanation)
		}
		m2 := m
		if len(m.Services) >= 2 {
			sv := append([]Service(nil), m.Services...)
			sv[0], sv[len(sv)-1] = sv[len(sv)-1], sv[0]
			m2 = StackManifest{App: m.App, Services: sv, Volumes: m.Volumes, Network: m.Network}
		}
		a2, br := EmitPulumiStackApp(project, env, m2, opts)
		if br != nil {
			t.Fatalf("EmitPulumiStackApp(permuted) refused: %s", br.Explanation)
		}
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

// TestStackApp_DataMounts — with data opts the program carries EXACTLY the GOLD demoshop mounts:
// the datastore mounts schema (01) + seed (02) into the initdb dir; the server mounts entities.json,
// carries ENTITIES_PATH + APP_NAME, and runs the aidos-app:latest image.
func TestStackApp_DataMounts(t *testing.T) {
	arts, br := EmitPulumiStackApp("demoshop", "dev", goldManifest(), dataOpts())
	if br != nil {
		t.Fatalf("EmitPulumiStackApp refused the gold manifest: %s", br.Explanation)
	}
	prog := artByPath(t, arts, "gen/demoshop/infra/index.ts")
	s := string(prog.Bytes)

	for _, want := range []string{
		// the host-dir binding the GOLD resolves at run-time.
		"const here = process.cwd();",
		// datastore initdb mounts (schema first, then seed).
		"${here}/schema.sql", "/docker-entrypoint-initdb.d/01-schema.sql",
		"${here}/seed.sql", "/docker-entrypoint-initdb.d/02-seed.sql",
		// the app entities mount + env.
		"${here}/entities.json", "/app/entities.json",
		"ENTITIES_PATH=/app/entities.json",
		"APP_NAME=Demoshop",
		// the generic app image, the gold priority + cert resolver.
		"aidos-app:latest",
		`value: "1000"`,
		`.tls.certresolver", value: "le"`,
	} {
		mustContain(t, s, want, "data-mount gold form")
	}
	// it still carries the proven topology (DATABASE_URL, healthcheck, external attach).
	mustContain(t, s, "DATABASE_URL=postgres://", "server DATABASE_URL env")
	mustContain(t, s, "pg_isready", "datastore healthcheck")
	mustContain(t, s, `networksAdvanced: [{ name: "traefik_default" }]`, "external network attach")
}

// TestStackApp_SeedAbsent_NoSeedMount — without SeedPresent the program mounts the schema but NOT a
// seed (no phantom 02-seed mount).
func TestStackApp_SeedAbsent_NoSeedMount(t *testing.T) {
	opts := StackAppOpts{DataDir: ".", AppName: "Demoshop", SeedPresent: false}
	arts, br := EmitPulumiStackApp("demoshop", "dev", goldManifest(), opts)
	if br != nil {
		t.Fatalf("EmitPulumiStackApp refused: %s", br.Explanation)
	}
	s := string(artByPath(t, arts, "gen/demoshop/infra/index.ts").Bytes)
	mustContain(t, s, "/docker-entrypoint-initdb.d/01-schema.sql", "schema mount present")
	if strings.Contains(s, "02-seed.sql") {
		t.Fatalf("a seed mount appeared though SeedPresent=false:\n%s", s)
	}
}

// TestStackApp_AppNameDefaultsToProject — an empty AppName defaults to the project name (the GOLD
// title-cased it; here we keep the project name verbatim — still per-project, never a constant).
func TestStackApp_AppNameDefaultsToProject(t *testing.T) {
	opts := StackAppOpts{DataDir: "."}
	arts, _ := EmitPulumiStackApp("shopx", "dev", goldManifest(), opts)
	s := string(artByPath(t, arts, "gen/shopx/infra/index.ts").Bytes)
	mustContain(t, s, "APP_NAME=shopx", "APP_NAME defaults to project")
}

// TestStackApp_FN02Pure — the data-aware program carries no module-scope mutable binding (FN02). The
// `here` const is fine (a const inside program()); a top-level let/var would be the breach.
func TestStackApp_FN02Pure(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genManifest(t)
		project := rapid.StringMatching(`[a-z][a-z0-9]{0,7}`).Draw(t, "project")
		env := rapid.SampledFrom([]string{"dev", "prod"}).Draw(t, "env")
		arts, br := EmitPulumiStackApp(project, env, m, dataOpts())
		if br != nil {
			t.Fatalf("EmitPulumiStackApp refused: %s", br.Explanation)
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

// TestStackApp_MalformedRefused — the honesty rule holds with data opts too: an empty project/env or
// a malformed manifest is a typed BlockReason, never a partial render.
func TestStackApp_MalformedRefused(t *testing.T) {
	good := goldManifest()
	opts := dataOpts()
	cases := []struct {
		project, env string
		m            StackManifest
	}{
		{"", "dev", good},
		{"p", "", good},
		{"p", "dev", StackManifest{App: "p", Services: []Service{{Name: "db", Role: RoleDatastore, Image: "postgres"}}}}, // no server
	}
	for i, c := range cases {
		if _, br := EmitPulumiStackApp(c.project, c.env, c.m, opts); br == nil {
			t.Fatalf("case %d: malformed input was NOT refused", i)
		}
	}
}
