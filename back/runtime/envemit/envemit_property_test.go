// envemit_property_test.go — the DP04 BDD mirror (property ∀ N1, rapid),
// WRITTEN FIRST and red ("no non-test Go files in back/runtime/envemit"),
// then green. The laws it pins (ROADMAP-provisioning-deploy §DP04):
//
//  1. REPRODUCIBILITY — Emit(m) is a PURE function of Canonicalize(manifest):
//     the same manifest yields a byte-identical .env.example + start.sh +
//     start_with_rebuild.sh N times (×100 on the pinned Example, ×2 under ∀).
//  2. ZERO SECRET VALUES — the .env.example carries secret REFERENCES only
//     (<<from-secret-store>>, the S91 contract), never a value; the
//     deterministic gitleaks-like scan (secretstore.ScanEmission, S91 reused —
//     never an LLM) is green on every emission.
//  3. COHERENCE — every ${VAR} the DP03 compose references exists as a key of
//     the .env.example (no orphan env reference).
//  4. MERGE ORDER — the /data/dockers order global → bp-default → bp-secrets →
//     deploy-time is ENGRAVED as a pure emission template (MergeOrder()), the
//     layer sections render in that order, and the deploy-time layer OVERRIDES
//     the inherited APP_NAME (deploy.sh step 3 — last write wins): APP_NAME
//     appears exactly once, valued m.AppName.
//  5. SCRIPTS — start.sh is down → up and start_with_rebuild.sh is down →
//     build --no-cache → up (the deploy.sh generated templates, verbatim
//     conventions), both shebang'd and header-protected.
//  6. REFUSAL — an invalid manifest (the closed DP02 validation codes) yields
//     a BlockReason, never a guessed emission.
//  7. DRIFT — a hand-edited emitted file is detected: one flipped byte makes
//     Drifted(output_hash, bytes) true (the gen/ protection, CLAUDE.md §9).
//  8. CONTENT ADDRESS — every artifact is double content-addressed:
//     SourceHash == stackmanifest.HashManifest(m) (S02 reused, never forked),
//     OutputHash == records.Hash(bytes); paths land below the line under
//     back/gen/<app>/; the targets are registered in this package's
//     targetOrder (the closed kind × target matrix stays enumerable).
//  9. FILE MODES — the /data/dockers §chmod discipline is a pure function:
//     Mode(.env*) == 0600, Mode(*.sh) == 0755.
//
// THE WALL: the emitter only READS the manifest AST and returns bytes — it
// writes no truth (no DB in this package at all). Secrets stay in the S91
// store (encrypted, project-scoped); the emission carries references only.
package envemit

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/composeemit"
	"github.com/steph-frtech/aidos/back/runtime/secretstore"
	"pgregory.net/rapid"
)

// genValidManifest draws a VALID StackManifest (the DP03 generator extended
// with connector scopes — the bp-secrets layer input): app name non-empty,
// 1..5 uniquely-named services with unique internal ports, roles/profiles
// inside their closed sets, service[0] forced role=server, volumes with
// env-var device references, the external reverse-proxy network.
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
		services = append(services, stackmanifest.Service{
			Name:         name,
			Role:         role,
			Image:        rapid.SampledFrom([]string{"", "node:22-alpine", "postgres:17-alpine", "valkey:8-alpine"}).Draw(t, fmt.Sprintf("svc_image_%d", i)),
			InternalPort: port,
			Profile:      profiles[rapid.IntRange(0, len(profiles)-1).Draw(t, fmt.Sprintf("svc_profile_%d", i))],
			Healthcheck:  rapid.SampledFrom([]string{"", "wget -q --spider http://localhost/health", "pg_isready -U app"}).Draw(t, fmt.Sprintf("svc_hc_%d", i)),
		})
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
	nScopes := rapid.IntRange(0, 3).Draw(t, "n_scopes")
	scopes := make([]string, 0, nScopes)
	seenScopes := map[string]bool{}
	for i := 0; i < nScopes; i++ {
		sc := rapid.StringMatching(`[a-z][a-z0-9]{0,7}:(read-only|read-write)`).
			Filter(func(s string) bool { return !seenScopes[s] }).
			Draw(t, fmt.Sprintf("scope_%d", i))
		seenScopes[sc] = true
		scopes = append(scopes, sc)
	}
	return stackmanifest.StackManifest{
		AppName:  app,
		Services: services,
		Volumes:  volumes,
		Network: stackmanifest.Network{
			Name:     "traefik_default",
			External: rapid.Bool().Draw(t, "net_external"),
		},
		ConnectorScopes: scopes,
	}
}

// mustEmit emits a valid manifest or fails the test.
func mustEmit(t interface {
	Fatalf(format string, args ...interface{})
}, m stackmanifest.StackManifest) Bundle {
	b, br := Emit(m)
	if br != nil {
		t.Fatalf("valid manifest refused: %+v", br)
	}
	return b
}

// Law 1a — ∀ valid manifest: Emit is byte-identical across runs for the THREE
// artifacts (purity: no clock, no RNG, no map-order leak).
func TestProperty_EmitIsByteIdenticalForAllValidManifests(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		b1 := mustEmit(t, m)
		b2 := mustEmit(t, m)
		for i, pair := range [][2]composeemit.Artifact{
			{b1.EnvExample, b2.EnvExample},
			{b1.StartSh, b2.StartSh},
			{b1.StartWithRebuild, b2.StartWithRebuild},
		} {
			if !bytes.Equal(pair[0].Bytes, pair[1].Bytes) {
				t.Fatalf("artifact %d is not byte-identical", i)
			}
			if pair[0].OutputHash != pair[1].OutputHash {
				t.Fatalf("artifact %d output hashes diverge", i)
			}
		}
	})
}

// Law 1b — the pinned Example manifest emits byte-identically 100 times out
// of 100 (the DP04 reproducibility mirror: 100 %, not 99 %).
func TestExample_EmitIsByteIdentical100Times(t *testing.T) {
	ref := mustEmit(t, stackmanifest.Example())
	for i := 0; i < 100; i++ {
		b := mustEmit(t, stackmanifest.Example())
		if !bytes.Equal(b.EnvExample.Bytes, ref.EnvExample.Bytes) ||
			!bytes.Equal(b.StartSh.Bytes, ref.StartSh.Bytes) ||
			!bytes.Equal(b.StartWithRebuild.Bytes, ref.StartWithRebuild.Bytes) {
			t.Fatalf("run %d diverged from the reference emission", i)
		}
	}
}

// Law 2 — ∀ manifest: the .env.example carries ZERO secret values — the
// deterministic gitleaks-like scan (S91 secretstore.ScanEmission, code never
// LLM) is green; every secret key (the global PAT + one APP_SECRET_* per
// declared connector scope, named by secretstore.EnvVar — S91 reused) is
// valued EXACTLY the <<from-secret-store>> reference.
func TestProperty_EnvExampleHasZeroSecretValues(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		b := mustEmit(t, m)
		env := string(b.EnvExample.Bytes)
		if findings := secretstore.ScanEmission(env, nil); len(findings) != 0 {
			t.Fatalf("the secret scan found leaks in the .env.example: %v", findings)
		}
		if !strings.Contains(env, "GITHUB_PERSONAL_ACCESS_TOKEN="+SecretPlaceholder+"\n") {
			t.Fatalf("the global-layer PAT must be a secret REFERENCE, never a value")
		}
		for _, scope := range m.ConnectorScopes {
			want := secretstore.EnvVar(scope) + "=" + SecretPlaceholder + "\n"
			if !strings.Contains(env, want) {
				t.Fatalf("connector scope %q: secret reference %q missing in:\n%s", scope, want, env)
			}
		}
		// no line ever assigns a placeholder-free value to a *SECRET* key.
		for _, line := range strings.Split(env, "\n") {
			if strings.HasPrefix(line, "APP_SECRET_") && !strings.HasSuffix(line, "="+SecretPlaceholder) {
				t.Fatalf("a secret key carries a non-reference value: %q", line)
			}
		}
	})
}

// Law 3 — ∀ manifest: COHERENCE with DP03 — every ${VAR} referenced by the
// emitted docker-compose.yml exists as a key of the .env.example.
func TestProperty_AllComposeRefsExistInEnvExample(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		compose, br := composeemit.Emit(m)
		if br != nil {
			t.Fatalf("valid manifest refused by composeemit: %+v", br)
		}
		b := mustEmit(t, m)
		keys := map[string]bool{}
		for _, k := range Keys(b.EnvExample.Bytes) {
			keys[k] = true
		}
		for _, ref := range ComposeEnvRefs(compose.Bytes) {
			if !keys[ref] {
				t.Fatalf("compose references ${%s} but the .env.example has no such key.\nkeys: %v", ref, Keys(b.EnvExample.Bytes))
			}
		}
	})
}

// Law 4 — the /data/dockers merge order is ENGRAVED: MergeOrder() is exactly
// global → bp-default → bp-secrets → deploy-time; ∀ manifest the layer
// sections render in that order and the deploy-time APP_NAME OVERRIDES the
// inherited one (exactly one APP_NAME key, valued m.AppName — deploy.sh
// step 3, last write wins).
func TestProperty_MergeOrderIsEngravedAndDeployTimeOverrides(t *testing.T) {
	want := []Layer{LayerGlobal, LayerBoilerplateDefault, LayerBoilerplateSecrets, LayerDeployTime}
	got := MergeOrder()
	if len(got) != len(want) {
		t.Fatalf("MergeOrder() = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("MergeOrder()[%d] = %q, want %q", i, got[i], want[i])
		}
	}
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		b := mustEmit(t, m)
		env := string(b.EnvExample.Bytes)
		last := -1
		for _, l := range want {
			idx := strings.Index(env, "# --- "+string(l)+" ")
			if idx < 0 {
				t.Fatalf("layer section %q missing in the .env.example", l)
			}
			if idx < last {
				t.Fatalf("layer %q renders out of merge order", l)
			}
			last = idx
		}
		if got := strings.Count(env, "\nAPP_NAME="); got != 1 {
			t.Fatalf("APP_NAME must appear exactly once (last write wins), got %d", got)
		}
		if !strings.Contains(env, "\nAPP_NAME="+m.AppName+"\n") {
			t.Fatalf("the deploy-time layer must value APP_NAME=%s", m.AppName)
		}
	})
}

// Law 5 — ∀ manifest: the scripts are the deploy.sh generated templates —
// start.sh = down → up ; start_with_rebuild.sh = down → build --no-cache →
// up — both shebang'd, header-protected, cd-relative.
func TestProperty_ScriptsAreTheDataDockersTemplates(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		b := mustEmit(t, m)
		start := string(b.StartSh.Bytes)
		rebuild := string(b.StartWithRebuild.Bytes)
		for name, s := range map[string]string{"start.sh": start, "start_with_rebuild.sh": rebuild} {
			if !strings.HasPrefix(s, "#!/usr/bin/env bash\n") {
				t.Fatalf("%s must start with the bash shebang", name)
			}
			if !strings.Contains(s, `cd "$(dirname "$0")"`) {
				t.Fatalf("%s must cd into the deployment directory", name)
			}
			down := strings.Index(s, "docker compose down")
			up := strings.Index(s, "docker compose up -d")
			if down < 0 || up < 0 || down > up {
				t.Fatalf("%s must run down BEFORE up", name)
			}
		}
		if strings.Contains(start, "--no-cache") {
			t.Fatalf("start.sh must NOT rebuild")
		}
		build := strings.Index(rebuild, "docker compose build --no-cache")
		if build < 0 ||
			build < strings.Index(rebuild, "docker compose down") ||
			build > strings.Index(rebuild, "docker compose up -d") {
			t.Fatalf("start_with_rebuild.sh must run down → build --no-cache → up")
		}
	})
}

// Law 6 — ∀ broken manifest: the emitter refuses with a BlockReason (the
// DP02 closed validation codes), never a guessed emission.
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
		b, br := Emit(m)
		if br == nil {
			t.Fatalf("broken manifest was emitted anyway")
		}
		if len(b.EnvExample.Bytes) != 0 || len(b.StartSh.Bytes) != 0 || len(b.StartWithRebuild.Bytes) != 0 {
			t.Fatalf("a refused emission must carry no bytes")
		}
		if br.Explanation == "" || len(br.HowToFix) == 0 {
			t.Fatalf("BlockReason must be actionable (explanation + how_to_fix)")
		}
	})
}

// Law 7 — ∀ manifest: ONE flipped byte on any of the three artifacts is
// detected as drift (a hand-edited gen/ file is rejected, CLAUDE.md §9).
func TestProperty_HandEditIsDetectedAsDrift(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		b := mustEmit(t, m)
		arts := []composeemit.Artifact{b.EnvExample, b.StartSh, b.StartWithRebuild}
		a := arts[rapid.IntRange(0, len(arts)-1).Draw(t, "which")]
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

// Law 8 — ∀ manifest: every artifact is double content-addressed — SourceHash
// IS stackmanifest.HashManifest(m) (S02 reused, never forked), OutputHash IS
// records.Hash(bytes); the protected header carries the marker + source hash;
// the paths land below the line under back/gen/<app>/; the targets are
// registered in this package's closed targetOrder.
func TestProperty_ArtifactsAreContentAddressedAndProtected(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		b := mustEmit(t, m)
		wantSource, err := stackmanifest.HashManifest(m)
		if err != nil {
			t.Fatalf("HashManifest: %v", err)
		}
		wantPaths := map[string]string{
			b.EnvExample.Path:       "back/gen/" + m.AppName + "/.env.example",
			b.StartSh.Path:          "back/gen/" + m.AppName + "/start.sh",
			b.StartWithRebuild.Path: "back/gen/" + m.AppName + "/start_with_rebuild.sh",
		}
		for got, want := range wantPaths {
			if got != want {
				t.Fatalf("projection path %q is not below the line (%q)", got, want)
			}
		}
		for _, a := range []composeemit.Artifact{b.EnvExample, b.StartSh, b.StartWithRebuild} {
			if a.SourceHash != wantSource {
				t.Fatalf("source_hash %s != stackmanifest.HashManifest %s", a.SourceHash, wantSource)
			}
			if a.OutputHash != records.Hash(a.Bytes) {
				t.Fatalf("output_hash is not records.Hash(bytes)")
			}
			if !strings.Contains(string(a.Bytes), "# CODE GENERATED BY AIDOS — DO NOT EDIT. source: "+wantSource+"\n") {
				t.Fatalf("protected header missing in %s", a.Path)
			}
			if !a.Protected {
				t.Fatalf("the artifact must be protected (gen/ is never hand-edited)")
			}
		}
		if b.EnvExample.Target != TargetEnvExample {
			t.Fatalf("env target %q is not the additive TargetEnvExample", b.EnvExample.Target)
		}
		if b.StartSh.Target != TargetStartScripts || b.StartWithRebuild.Target != TargetStartScripts {
			t.Fatalf("script targets must be the additive TargetStartScripts")
		}
		ts := Targets()
		if len(ts) != 2 || ts[0] != TargetEnvExample || ts[1] != TargetStartScripts {
			t.Fatalf("the targets must be registered in the closed targetOrder, got %v", ts)
		}
	})
}

// Law 9 — the /data/dockers §chmod discipline is a PURE function of the path:
// .env files are 0600 (secrets-adjacent, even the example), scripts are 0755.
func TestMode_ChmodDisciplineIsPure(t *testing.T) {
	cases := map[string]uint32{
		"back/gen/alphashop/.env.example":          0o600,
		"back/gen/alphashop/start.sh":              0o755,
		"back/gen/alphashop/start_with_rebuild.sh": 0o755,
		"back/gen/alphashop/docker-compose.yml":    0o644,
	}
	for path, want := range cases {
		if got := uint32(Mode(path).Perm()); got != want {
			t.Fatalf("Mode(%q) = %o, want %o", path, got, want)
		}
	}
}
