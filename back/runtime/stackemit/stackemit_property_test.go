// stackemit_property_test.go — the DP05 BDD mirror (property ∀ N1, rapid),
// WRITTEN FIRST and red ("no non-test Go files in back/runtime/stackemit"),
// then green. THE CORNERSTONE MIRROR of the whole provisioning epic
// (ROADMAP-provisioning-deploy §DP05): same content-addressed phase → same
// bytes, on every machine. The laws it pins:
//
//  1. REPRODUCIBILITY — EmitStack(phase, manifest, …) is a PURE function of
//     the phase's content address: the same phase yields a byte-identical
//     5-artifact bundle {docker-compose.yml, .env.example, start.sh,
//     start_with_rebuild.sh, traefik.dynamic.yml} N times (×100 on the pinned
//     Example phase, ×2 under ∀) — same bytes, same output hashes, same
//     BundleHash.
//  2. INTERPRETER SIDECAR — the Go interpreter sidecar (ADR 0040 Décision 7)
//     appears in the emitted compose as a role=interpreter service, profile
//     core (no `profiles:` block — it always runs), joignable docker_internal;
//     its internal port is a key of the .env.example.
//  3. HAND-EDIT GATE — a hand-edited gen/ file BLOCKS the re-emission: one
//     flipped byte in any ledger-tracked artifact refuses the WHOLE bundle
//     with the closed code EMITTED_FILE_HAND_EDITED (fail-closed, FIRST drift
//     in sorted-path order); a faithful disk never refuses.
//  4. PHASE AUTHORITY (the wall) — an UNSTABLE phase refuses with
//     PHASE_NOT_STABLE (S23 reused, never forked); a manifest whose content
//     address is NOT pinned in the phase cut refuses (the phase is the
//     authoritative source — EmitStack never emits from an unpinned manifest).
//  5. COHERENCE — every ${VAR} referenced by the compose AND by the traefik
//     dynamic config exists as a key of the .env.example (DP03↔DP04↔DP05
//     crossed; envemit.ComposeEnvRefs reused).
//  6. ZERO SECRET VALUES — the deterministic gitleaks-like scan
//     (secretstore.ScanEmission, S91 reused verbatim — code, never an LLM) is
//     green over every artifact of every emission; fault-injection: a real
//     secret value planted in a copy makes the scanner red (the sensor fires).
//  7. DOUBLE CONTENT ADDRESSING — every artifact: SourceHash ==
//     stackmanifest.HashManifest(m) (S02 reused, never forked), OutputHash ==
//     records.Hash(bytes); Bundle.PhaseVersion == phase.Version() (S23/S02);
//     BundleHash is deterministic and moves when the manifest moves.
//  8. FILE MODES — envemit.Mode (the /data/dockers §chmod discipline) over
//     the bundle paths: .env.example 0600, *.sh 0755, *.yml 0644.
//  9. TARGETS — traefik-dynamic is registered in this package's closed
//     targetOrder (the kind × target matrix stays enumerable, additive).
//
// THE WALL: EmitStack only READS the phase + manifest AST and returns bytes —
// no DB, no I/O, no truth write. The phase (source) is authoritative; the
// emitted code is regenerable, never the reverse.
package stackemit

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/envemit"
	"github.com/steph-frtech/aidos/back/runtime/regen"
	"github.com/steph-frtech/aidos/back/runtime/secretstore"
	"pgregory.net/rapid"
)

// genValidManifest draws a VALID StackManifest (the DP04 generator reused
// verbatim): app name non-empty, 1..5 uniquely-named services with unique
// internal ports, roles/profiles inside their closed sets, service[0] forced
// role=server, volumes with env-var device references, connector scopes.
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

// mustEmit emits the bundle for a manifest pinned in its own minimal stable
// phase (PhaseFor — the S23 vacuously-stable one-constraint cut), failing the
// test on any refusal.
func mustEmit(t interface{ Fatalf(string, ...any) }, m stackmanifest.StackManifest) Bundle {
	phase, err := PhaseFor(m)
	if err != nil {
		t.Fatalf("PhaseFor(valid manifest) must not error: %v", err)
	}
	b, br := EmitStack(phase, m, nil, nil)
	if br != nil {
		t.Fatalf("EmitStack(stable phase, pinned manifest) must not refuse: %s", br.Code)
	}
	return b
}

// --- 1. REPRODUCIBILITY — the cornerstone: same phase → same bytes ---------

func TestProperty_EmitStack_ByteIdentical(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		b1 := mustEmit(t, m)
		b2 := mustEmit(t, m)
		a1, a2 := b1.Artifacts(), b2.Artifacts()
		if len(a1) != 5 || len(a2) != 5 {
			t.Fatalf("the DP05 bundle has exactly 5 artifacts, got %d/%d", len(a1), len(a2))
		}
		for i := range a1 {
			if a1[i].Path != a2[i].Path {
				t.Fatalf("artifact %d path drifted: %q vs %q", i, a1[i].Path, a2[i].Path)
			}
			if !bytes.Equal(a1[i].Bytes, a2[i].Bytes) {
				t.Fatalf("artifact %s is not byte-identical across emissions", a1[i].Path)
			}
			if a1[i].OutputHash != a2[i].OutputHash {
				t.Fatalf("artifact %s output_hash drifted", a1[i].Path)
			}
		}
		if b1.BundleHash != b2.BundleHash {
			t.Fatalf("BundleHash drifted across two emissions of the same phase")
		}
		if b1.PhaseVersion != b2.PhaseVersion {
			t.Fatalf("PhaseVersion drifted across two emissions of the same phase")
		}
	})
}

func TestProperty_Example_100Reemissions_ByteIdentical(t *testing.T) {
	m := stackmanifest.Example()
	first := mustEmit(t, m)
	for i := 0; i < 100; i++ {
		again := mustEmit(t, m)
		if again.BundleHash != first.BundleHash {
			t.Fatalf("re-emission %d: BundleHash drifted", i)
		}
		fa, aa := first.Artifacts(), again.Artifacts()
		for j := range fa {
			if !bytes.Equal(fa[j].Bytes, aa[j].Bytes) {
				t.Fatalf("re-emission %d: artifact %s not byte-identical", i, fa[j].Path)
			}
		}
	}
}

// --- 2. INTERPRETER SIDECAR (ADR 0040 Décision 7) ---------------------------

func TestProperty_InterpreterSidecar_AppearsCoreInCompose(t *testing.T) {
	m := stackmanifest.Example()
	svc, ok := InterpreterSidecar(m)
	if !ok {
		t.Fatal("the Example manifest declares the Go interpreter sidecar (ADR 0040 D7)")
	}
	if svc.Profile != stackmanifest.ProfileCore {
		t.Fatalf("the interpreter sidecar is profile core, got %q", svc.Profile)
	}
	b := mustEmit(t, m)
	compose := string(b.Compose.Bytes)
	if !strings.Contains(compose, "\n  "+svc.Name+":\n") {
		t.Fatalf("the compose must carry the interpreter service %q", svc.Name)
	}
	// docker_internal: it rides the shared network as ${APP_NAME}-interpreter.
	if !strings.Contains(compose, "container_name: ${APP_NAME}-"+svc.Name) {
		t.Fatal("the interpreter sidecar must be joignable docker_internal (container_name ${APP_NAME}-interpreter)")
	}
	// profile core ⇒ NO `profiles:` block inside the interpreter's service
	// block (core services always run — DP03 convention).
	block := composeServiceBlock(compose, svc.Name)
	if strings.Contains(block, "profiles:") {
		t.Fatal("a profile-core sidecar never renders a profiles: block (it always runs)")
	}
	// its internal port is a key of the .env.example (env coherence).
	keys := envemit.Keys(b.EnvExample.Bytes)
	want := strings.ToUpper(svc.Name) + "_PORT"
	found := false
	for _, k := range keys {
		if k == want {
			found = true
		}
	}
	if !found {
		t.Fatalf("the .env.example must carry the sidecar port key %s", want)
	}
}

// composeServiceBlock extracts one service's indented block from the rendered
// compose (a test-side helper — deterministic string slicing).
func composeServiceBlock(compose, name string) string {
	start := strings.Index(compose, "\n  "+name+":\n")
	if start < 0 {
		return ""
	}
	rest := compose[start+1:]
	end := strings.Index(rest[len("  "+name+":\n"):], "\n  ")
	if end < 0 {
		return rest
	}
	return rest[:len("  "+name+":\n")+end]
}

// --- 3. HAND-EDIT GATE — EMITTED_FILE_HAND_EDITED ---------------------------

func TestProperty_HandEdit_BlocksReemission(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		b := mustEmit(t, m)
		arts := b.Artifacts()
		// Build the ledger + faithful disk from the first emission.
		ledger := make([]regen.LedgerEntry, 0, len(arts))
		disk := make([]regen.DiskFile, 0, len(arts))
		for _, a := range arts {
			ledger = append(ledger, regen.LedgerEntry{Path: a.Path, SourceHash: a.SourceHash, OutputHash: a.OutputHash})
			cp := make([]byte, len(a.Bytes))
			copy(cp, a.Bytes)
			disk = append(disk, regen.DiskFile{Path: a.Path, Bytes: cp})
		}
		phase, err := PhaseFor(m)
		if err != nil {
			t.Fatalf("PhaseFor: %v", err)
		}
		// Faithful disk → re-emission allowed, byte-identical.
		again, br := EmitStack(phase, m, ledger, disk)
		if br != nil {
			t.Fatalf("a faithful disk must not refuse: %s", br.Code)
		}
		if again.BundleHash != b.BundleHash {
			t.Fatal("re-emission over a faithful disk is byte-identical")
		}
		// Flip ONE byte of one tracked file → the WHOLE bundle refuses.
		i := rapid.IntRange(0, len(disk)-1).Draw(t, "drift_file")
		j := rapid.IntRange(0, len(disk[i].Bytes)-1).Draw(t, "drift_byte")
		disk[i].Bytes[j] ^= 0x01
		_, br = EmitStack(phase, m, ledger, disk)
		if br == nil {
			t.Fatal("a hand-edited gen/ file must block the re-emission")
		}
		if br.Code != blockreason.CodeEmittedFileHandEdited {
			t.Fatalf("the closed code is EMITTED_FILE_HAND_EDITED, got %s", br.Code)
		}
	})
}

// --- 4. PHASE AUTHORITY — stable + pinned, or refused -----------------------

func TestProperty_UnstablePhase_Refused(t *testing.T) {
	m := stackmanifest.Example()
	phase, err := PhaseFor(m)
	if err != nil {
		t.Fatalf("PhaseFor: %v", err)
	}
	phase.Stable = false
	phase.Reasons = []string{"checkout.fixture"}
	_, br := EmitStack(phase, m, nil, nil)
	if br == nil || br.Code != blockreason.CodePhaseNotStable {
		t.Fatalf("an unstable phase refuses with PHASE_NOT_STABLE, got %v", br)
	}
}

func TestProperty_ManifestNotInPhase_Refused(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		other := stackmanifest.Example()
		if m.AppName == other.AppName {
			m.AppName = m.AppName + "x"
		}
		// A phase pinning a DIFFERENT manifest: the drawn manifest is unpinned.
		phase, err := PhaseFor(other)
		if err != nil {
			t.Fatalf("PhaseFor: %v", err)
		}
		_, br := EmitStack(phase, m, nil, nil)
		if br == nil {
			t.Fatal("a manifest not pinned in the phase cut must refuse (the phase is authoritative)")
		}
		if br.Code != blockreason.CodeOutOfScope {
			t.Fatalf("an unpinned manifest refuses OUT_OF_SCOPE, got %s", br.Code)
		}
	})
}

// --- 5. COHERENCE — every ${VAR} of compose + traefik ∈ env keys ------------

func TestProperty_Coherence_AllRefsHaveKeys(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		b := mustEmit(t, m)
		keys := map[string]bool{}
		for _, k := range envemit.Keys(b.EnvExample.Bytes) {
			keys[k] = true
		}
		for _, src := range [][]byte{b.Compose.Bytes, b.TraefikDynamic.Bytes} {
			for _, ref := range envemit.ComposeEnvRefs(src) {
				if !keys[ref] {
					t.Fatalf("reference ${%s} has no key in the .env.example", ref)
				}
			}
		}
	})
}

// --- 6. ZERO SECRET VALUES + scanner fault-injection ------------------------

func TestProperty_ZeroSecretValues_ScanGreen(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		b := mustEmit(t, m)
		for _, a := range b.Artifacts() {
			if findings := secretstore.ScanEmission(string(a.Bytes), nil); len(findings) != 0 {
				t.Fatalf("artifact %s leaks: %v", a.Path, findings[0])
			}
		}
	})
}

func TestFaultInjection_ScannerFires_OnRealValue(t *testing.T) {
	m := stackmanifest.Example()
	b := mustEmit(t, m)
	leakedValue := "sup3r-s3cret-value-87231"
	planted := string(b.EnvExample.Bytes) + "GITHUB_PERSONAL_ACCESS_TOKEN=" + leakedValue + "\n"
	if findings := secretstore.ScanEmission(planted, []string{leakedValue}); len(findings) == 0 {
		t.Fatal("the scanner must fire on a planted real secret value (a sensor that never fires is dead)")
	}
}

// --- 7. DOUBLE CONTENT ADDRESSING -------------------------------------------

func TestProperty_DoubleContentAddressing(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifest(t)
		phase, err := PhaseFor(m)
		if err != nil {
			t.Fatalf("PhaseFor: %v", err)
		}
		b := mustEmit(t, m)
		srcHash, err := stackmanifest.HashManifest(m)
		if err != nil {
			t.Fatalf("HashManifest: %v", err)
		}
		phaseVersion, err := phase.Version()
		if err != nil {
			t.Fatalf("phase.Version: %v", err)
		}
		if b.PhaseVersion != phaseVersion {
			t.Fatalf("Bundle.PhaseVersion must equal the S23 phase content address")
		}
		if b.SourceHash != srcHash {
			t.Fatalf("Bundle.SourceHash must equal stackmanifest.HashManifest (S02, never forked)")
		}
		for _, a := range b.Artifacts() {
			if a.SourceHash != srcHash {
				t.Fatalf("artifact %s: source_hash != HashManifest", a.Path)
			}
			if a.OutputHash != records.Hash(a.Bytes) {
				t.Fatalf("artifact %s: output_hash != records.Hash(bytes)", a.Path)
			}
			if !a.Protected {
				t.Fatalf("artifact %s must be header-protected (gen/ is never hand-edited)", a.Path)
			}
			if !strings.HasPrefix(a.Path, "back/gen/"+m.AppName+"/") {
				t.Fatalf("artifact %s must land below the line under back/gen/<app>/", a.Path)
			}
		}
	})
}

func TestProperty_BundleHash_MovesWithManifest(t *testing.T) {
	m := stackmanifest.Example()
	b1 := mustEmit(t, m)
	m2 := m
	m2.AppName = "betashop"
	b2 := mustEmit(t, m2)
	if b1.BundleHash == b2.BundleHash {
		t.Fatal("a different manifest yields a different BundleHash")
	}
}

// --- 8. FILE MODES + 9. TARGETS ---------------------------------------------

func TestProperty_Modes_And_Targets(t *testing.T) {
	m := stackmanifest.Example()
	b := mustEmit(t, m)
	if mode := envemit.Mode(b.EnvExample.Path); mode != 0o600 {
		t.Fatalf(".env.example is 0600, got %o", mode)
	}
	for _, sh := range []string{b.StartSh.Path, b.StartWithRebuild.Path} {
		if mode := envemit.Mode(sh); mode != 0o755 {
			t.Fatalf("%s is 0755, got %o", sh, envemit.Mode(sh))
		}
	}
	for _, yml := range []string{b.Compose.Path, b.TraefikDynamic.Path} {
		if mode := envemit.Mode(yml); mode != 0o644 {
			t.Fatalf("%s is 0644, got %o", yml, envemit.Mode(yml))
		}
	}
	targets := Targets()
	if len(targets) != 1 || targets[0] != TargetTraefikDynamic {
		t.Fatalf("stackemit owns the closed additive target [traefik-dynamic], got %v", targets)
	}
	if b.TraefikDynamic.Target != TargetTraefikDynamic {
		t.Fatalf("the traefik artifact carries its declared target, got %q", b.TraefikDynamic.Target)
	}
}
